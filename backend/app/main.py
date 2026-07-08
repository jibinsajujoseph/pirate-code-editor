"""
Akumen Code — Execution Sandbox API

FastAPI backend that manages isolated Docker containers for code execution.
Testable entirely via curl — no frontend dependency.

Routes:
  GET  /health                    — Docker connectivity check
  POST /sessions                  — Create session (spin up initial container)
  GET  /sessions/{id}             — Get session info
  POST /sessions/{id}/files       — Write/update a file in the matching runtime
  PUT  /sessions/{id}/workspace   — Sync the workspace snapshot for a run
  POST /sessions/{id}/execute     — Execute a file, return stdout/stderr
  DELETE /sessions/{id}           — Tear down container, clean up session
"""

import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
import json
import logging

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import containers
from . import sessions as session_store
from .config import Config
from .models import (
    CreateSessionRequest,
    CreateSessionResponse,
    ExecuteRequest,
    ExecuteResponse,
    HealthResponse,
    SessionInfoResponse,
    SyncWorkspaceRequest,
    SyncWorkspaceResponse,
    WriteFileRequest,
    WriteFileResponse,
)

# ── Logging setup ──────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Docker client (module-level singleton) ─────────────

_docker_client = None


def get_client():
    """Get or create the Docker client singleton."""
    global _docker_client
    if _docker_client is None:
        _docker_client = containers.get_docker_client()
    return _docker_client


class SessionSocketManager:
    """Tracks websocket connections per session for broadcasts and cleanup."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(session_id, set()).add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        sockets = self._connections.get(session_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            self._connections.pop(session_id, None)

    async def send_json(self, websocket: WebSocket, payload: dict) -> None:
        await websocket.send_json(payload)

    async def broadcast_json(self, session_id: str, payload: dict) -> None:
        sockets = list(self._connections.get(session_id, set()))
        stale: list[WebSocket] = []
        for websocket in sockets:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)

        for websocket in stale:
            self.disconnect(session_id, websocket)

    async def close_session(self, session_id: str, code: int = 1000) -> None:
        sockets = list(self._connections.get(session_id, set()))
        for websocket in sockets:
            with suppress(Exception):
                await websocket.close(code=code)
            self.disconnect(session_id, websocket)


socket_manager = SessionSocketManager()


def session_end_message(reason: str) -> str:
    """Translate internal end reasons into user-facing messages."""
    messages = {
        "expired": "The session time limit expired.",
        "idle_timeout": "The session ended early because it was idle too long.",
        "disconnect_timeout": "The session ended because the connection was lost for too long.",
        "manual_delete": "The session was closed.",
    }
    return messages.get(reason, "The session has ended.")


def validate_filename(filename: str) -> None:
    """Reject paths and dotfiles so workspace writes stay inside /workspace."""
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(
            status_code=400,
            detail="Invalid filename — no paths or dotfiles",
        )


def language_for_filename(filename: str) -> str:
    """Infer a supported runtime language for a filename or raise a 400."""
    validate_filename(filename)
    try:
        return Config.language_for_filename(filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def session_state_payload(session: session_store.Session) -> dict:
    """Build a websocket payload that mirrors current server session state."""
    return {
        "type": "session_state",
        "session_id": session.session_id,
        "status": session.status,
        "expires_at": session.expires_at.isoformat(),
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "ended_reason": session.ended_reason,
        "server_time": session_store.utc_now().isoformat(),
        "warning_threshold_minutes": Config.TIMER_WARNING_MINUTES,
    }


def session_ended_payload(session: session_store.Session) -> dict:
    """Build the terminal lifecycle message for a finished session."""
    return {
        "type": "session_ended",
        "reason": session.ended_reason,
        "message": session_end_message(session.ended_reason or ""),
        "ended_at": session.ended_at.isoformat() if session.ended_at else session_store.utc_now().isoformat(),
        "expires_at": session.expires_at.isoformat(),
    }


def require_session(session_id: str) -> session_store.Session:
    """Fetch a session or raise 404."""
    session = session_store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def require_active_session(session_id: str) -> session_store.Session:
    """Fetch an active session or raise 404/410."""
    session = require_session(session_id)
    if session.status != "active":
        detail = session_end_message(session.ended_reason or "")
        raise HTTPException(status_code=410, detail=detail)
    return session


def ensure_session_container(session_id: str, language: str) -> str:
    """Create the runtime container for a language on first use, then reuse it."""
    session = require_active_session(session_id)
    existing_container_id = session.container_ids.get(language)
    if existing_container_id:
        return existing_container_id

    try:
        client = get_client()
        container_id = containers.create_container(client, language)
    except Exception as exc:
        logger.error("Failed to create %s container for session %s: %s", language, session_id, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create {language} container: {exc}",
        ) from exc

    session_store.set_session_container(session_id, language, container_id)
    logger.info(
        "Attached %s runtime to session %s (%s)",
        language,
        session_id,
        container_id[:12],
    )
    return container_id


def sync_workspace_for_language(session_id: str, language: str) -> list[str]:
    """Mirror the current same-language workspace into the matching runtime container."""
    session = require_active_session(session_id)
    container_id = ensure_session_container(session_id, language)
    try:
        client = get_client()
        synced_files = containers.sync_workspace_files(
            client,
            container_id,
            session.files,
            language,
        )
    except Exception as exc:
        logger.error(
            "Failed to sync %s workspace for session %s: %s",
            language,
            session_id,
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync {language} workspace: {exc}",
        ) from exc

    session_store.touch_session(session_id)
    return synced_files


async def end_session(session_id: str, reason: str) -> session_store.Session | None:
    """End a session, tear down containers, and notify connected clients."""
    session = session_store.get_session(session_id)
    if session is None:
        return None

    if session.status != "ended":
        session = session_store.end_session(session_id, reason)
        if session is None:
            return None

        try:
            client = get_client()
            for container_id in set(session.container_ids.values()):
                containers.destroy_container(client, container_id)
        except Exception as exc:
            logger.error("Failed to destroy containers while ending session %s: %s", session_id, exc)
        session_store.clear_session_containers(session_id)

        logger.info("Session ended: %s (%s)", session_id, reason)

    await socket_manager.broadcast_json(session_id, session_ended_payload(session))
    await socket_manager.close_session(session_id)
    return session


async def session_cleanup_loop() -> None:
    """Background sweeper that enforces session expiry, idle timeout, and disconnect grace."""
    while True:
        await asyncio.sleep(Config.SESSION_CLEANUP_INTERVAL_SECONDS)
        now = session_store.utc_now()
        for session in session_store.list_active_sessions():
            try:
                if session.expires_at <= now:
                    await end_session(session.session_id, "expired")
                    continue

                if session.disconnect_deadline is not None and session.disconnect_deadline <= now:
                    await end_session(session.session_id, "disconnect_timeout")
                    continue

                idle_deadline = session.last_activity_at + timedelta(minutes=Config.IDLE_TIMEOUT_MINUTES)
                if idle_deadline <= now:
                    await end_session(session.session_id, "idle_timeout")
            except Exception as exc:
                logger.error("Session cleanup failed for %s: %s", session.session_id, exc)


# ── App lifecycle ──────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify Docker. Shutdown: destroy all containers."""
    logger.info("Starting Akumen Code sandbox backend...")
    try:
        client = get_client()
        logger.info("Docker daemon connected successfully.")

        for lang, image in [("python", Config.PYTHON_IMAGE), ("javascript", Config.NODE_IMAGE)]:
            available = containers.check_image_available(client, image)
            status = "✓ found" if available else "✗ NOT FOUND"
            logger.info("  Image '%s' (%s): %s", image, lang, status)
            if not available:
                logger.warning(
                    "  Image '%s' not found. Build it with: "
                    "docker build -t %s -f backend/docker/Dockerfile.%s backend/docker/",
                    image, image, "python" if lang == "python" else "node",
                )
    except Exception as e:
        logger.error("Docker daemon not available: %s", e)
        logger.error("The backend will start but container operations will fail.")

    cleanup_task = asyncio.create_task(session_cleanup_loop())
    app.state.cleanup_task = cleanup_task

    yield

    cleanup_task.cancel()
    with suppress(asyncio.CancelledError):
        await cleanup_task

    logger.info("Shutting down — cleaning up containers...")
    try:
        client = get_client()
        count = containers.cleanup_all_containers(client)
        logger.info("Cleaned up %d container(s).", count)
    except Exception as e:
        logger.error("Error during shutdown cleanup: %s", e)


app = FastAPI(
    title="Akumen Code Sandbox",
    description="Isolated code execution sandbox API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_origin_regex=r"^http://localhost:\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ─────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check Docker connectivity and image availability."""
    try:
        client = get_client()
        docker_ok = True
    except Exception:
        docker_ok = False
        return HealthResponse(
            status="unhealthy",
            docker_connected=False,
            images_available={},
        )

    images = {
        "python": containers.check_image_available(client, Config.PYTHON_IMAGE),
        "javascript": containers.check_image_available(client, Config.NODE_IMAGE),
    }

    status = "healthy" if docker_ok and all(images.values()) else "degraded"
    return HealthResponse(
        status=status,
        docker_connected=docker_ok,
        images_available=images,
    )


@app.post("/sessions", response_model=CreateSessionResponse, status_code=201)
async def create_session(req: CreateSessionRequest):
    """Create a new sandbox session with an initial runtime container."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=req.duration_minutes)

    try:
        client = get_client()
        container_id = containers.create_container(client, req.language)
    except Exception as e:
        logger.error("Failed to create container: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to create container: {e}")

    session = session_store.create_session(
        language=req.language,
        expires_at=expires_at,
        container_ids={req.language: container_id},
    )

    logger.info(
        "Session created: %s (language=%s, expires=%s)",
        session.session_id,
        req.language,
        expires_at.isoformat(),
    )

    return CreateSessionResponse(
        session_id=session.session_id,
        language=session.language,
        expires_at=expires_at.isoformat(),
        container_id=container_id[:12],
        status=session.status,
        idle_timeout_minutes=Config.IDLE_TIMEOUT_MINUTES,
        disconnect_grace_seconds=Config.DISCONNECT_GRACE_SECONDS,
        warning_threshold_minutes=Config.TIMER_WARNING_MINUTES,
    )


@app.get("/sessions/{session_id}", response_model=SessionInfoResponse)
async def get_session(session_id: str):
    """Get session metadata."""
    session = require_session(session_id)

    return SessionInfoResponse(
        session_id=session.session_id,
        language=session.language,
        container_id=session.container_id[:12] if session.container_id else "",
        status=session.status,
        created_at=session.created_at.isoformat(),
        expires_at=session.expires_at.isoformat(),
        last_activity_at=session.last_activity_at.isoformat(),
        files=list(session.files.keys()),
        ended_at=session.ended_at.isoformat() if session.ended_at else None,
        ended_reason=session.ended_reason,
        disconnect_deadline=(
            session.disconnect_deadline.isoformat()
            if session.disconnect_deadline
            else None
        ),
    )


@app.post("/sessions/{session_id}/files", response_model=WriteFileResponse)
async def write_file(session_id: str, req: WriteFileRequest):
    """Write or update a file in the matching runtime container."""
    require_active_session(session_id)
    language = language_for_filename(req.filename)
    container_id = ensure_session_container(session_id, language)

    try:
        client = get_client()
        containers.write_file_to_container(
            client, container_id, req.filename, req.content
        )
    except Exception as e:
        logger.error("Failed to write file: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to write file: {e}")

    session_store.update_session_file(session_id, req.filename, req.content)

    return WriteFileResponse(
        filename=req.filename,
        message=f"File '{req.filename}' written successfully",
    )


@app.put("/sessions/{session_id}/workspace", response_model=SyncWorkspaceResponse)
async def sync_workspace(session_id: str, req: SyncWorkspaceRequest):
    """
    Replace the server-side workspace snapshot for a run.

    Phase 4 convention: the selected editor tab is the entry file. We sync the
    complete workspace snapshot from the frontend, then mirror only the files
    with the same language as the entry file into that runtime container.
    """
    require_active_session(session_id)

    workspace: dict[str, str] = {}
    for file in req.files:
        language_for_filename(file.filename)
        workspace[file.filename] = file.content

    if req.entry_filename not in workspace:
        raise HTTPException(
            status_code=400,
            detail="The entry file must be included in the workspace payload.",
        )

    entry_language = language_for_filename(req.entry_filename)
    session_store.replace_session_files(session_id, workspace)
    synced_files = sync_workspace_for_language(session_id, entry_language)

    return SyncWorkspaceResponse(
        entry_filename=req.entry_filename,
        language=entry_language,
        synced_files=synced_files,
        message=(
            f"Synced {len(synced_files)} {entry_language} file(s) for entry "
            f"'{req.entry_filename}'."
        ),
    )


@app.post("/sessions/{session_id}/execute", response_model=ExecuteResponse)
async def execute_file(session_id: str, req: ExecuteRequest):
    """Execute a file in the matching runtime container and return the output."""
    session = require_active_session(session_id)

    if req.filename not in session.files:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File '{req.filename}' not found in session. "
                "Write it first via POST /sessions/{id}/files."
            ),
        )

    language = language_for_filename(req.filename)
    sync_workspace_for_language(session_id, language)

    try:
        client = get_client()
        result = containers.execute_file(
            client,
            ensure_session_container(session_id, language),
            req.filename,
            language,
        )
    except Exception as e:
        logger.error("Execution failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Execution failed: {e}")

    session_store.touch_session(session_id)
    return ExecuteResponse(
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        timed_out=result.timed_out,
    )


@app.delete("/sessions/{session_id}", status_code=200)
async def delete_session(session_id: str):
    """Tear down all runtime containers and remove the session."""
    session = require_session(session_id)
    if session.status == "active":
        session = await end_session(session_id, "manual_delete")

    session_store.delete_session(session_id)
    logger.info("Session destroyed: %s", session_id)
    return {"message": "Session destroyed", "session_id": session_id}


@app.websocket("/sessions/{session_id}/ws")
async def session_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming execution output and lifecycle state.
    Expects JSON messages like {"action": "run", "filename": "main.py"}.
    """
    await socket_manager.connect(session_id, websocket)
    session = session_store.get_session(session_id)
    if session is None:
        await socket_manager.send_json(websocket, {"type": "error", "data": "Session not found."})
        await websocket.close(code=1008)
        socket_manager.disconnect(session_id, websocket)
        return

    if session.status != "active":
        await socket_manager.send_json(websocket, session_ended_payload(session))
        await websocket.close(code=1000)
        socket_manager.disconnect(session_id, websocket)
        return

    session_store.mark_session_connected(session_id)
    await socket_manager.send_json(websocket, session_state_payload(session))

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            action = msg.get("action")

            if action == "ping":
                session_store.touch_session(session_id)
                await socket_manager.send_json(
                    websocket,
                    {
                        "type": "pong",
                        "server_time": session_store.utc_now().isoformat(),
                    },
                )
                continue

            if action != "run":
                continue

            active_session = require_active_session(session_id)
            filename = msg.get("filename")
            if not filename or filename not in active_session.files:
                await socket_manager.send_json(
                    websocket,
                    {"type": "error", "data": f"File '{filename}' not found.\n"},
                )
                continue

            try:
                language = language_for_filename(filename)
                sync_workspace_for_language(session_id, language)
                session_store.touch_session(session_id)
                client = get_client()
                async for chunk in containers.execute_file_stream(
                    client,
                    ensure_session_container(session_id, language),
                    filename,
                    language,
                ):
                    await socket_manager.send_json(websocket, chunk)
            except HTTPException as exc:
                await socket_manager.send_json(
                    websocket,
                    {"type": "error", "data": f"{exc.detail}\n"},
                )
                await socket_manager.send_json(websocket, {"type": "exit", "code": -1})
            except Exception as e:
                logger.error("Docker streaming execution failed: %s", e)
                await socket_manager.send_json(
                    websocket,
                    {"type": "error", "data": f"Execution failed: {e}\n"},
                )
                await socket_manager.send_json(websocket, {"type": "exit", "code": -1})
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    finally:
        socket_manager.disconnect(session_id, websocket)
        session_store.mark_session_disconnected(
            session_id,
            Config.DISCONNECT_GRACE_SECONDS,
        )
