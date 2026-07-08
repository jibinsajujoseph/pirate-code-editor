# Akumen Code — Pirate Command Center

Akumen Code is a pirate-themed, browser-based coding workspace designed for live coding assessments. Ye be lookin' at a multi-file editor, a reusable execution sandbox, and streamed terminal output for Python and JavaScript.

## Features & Scope

- **Frontend:** React + TypeScript with a pirate-themed UI, complete with a file tree, Monaco editor, toolbar, and output panel.
- **Backend:** FastAPI with Docker-managed runtime containers to run code safely.
- **Efficient Sandbox:** One reusable container per language per session.
- **Live Output:** Execution output is streamed live over WebSocket.
- **Multi-file Support:** Workspaces for both `.py` and `.js` projects.

## Execution Flow (Phase 4)

The active editor tab serves as the entry file when you press the Run button.

Before each run, the frontend sends a full workspace snapshot to the backend. The backend then syncs only the files with the same language as the selected entry file into the runtime container before executing it. This ensures that file creation, renaming, and deletion actions are consistent while still reusing the same container for fast execution.

## Editor Security & Restrictions (Phase 5)

To prevent foul play during assessments:
- Monaco suggestions and hover assistance are disabled.
- Standard copy, cut, paste, contextmenu, dragstart, and drop events are blocked.
- `Ctrl/Cmd + C`, `Ctrl/Cmd + X`, and `Ctrl/Cmd + V` shortcuts are disabled.

*Note: This is a deterrence measure, not foolproof security. Screenshots, OCR, manual typing, browser extensions, or DevTools can still bypass these controls.*

If the Monaco editor fails to initialize, the app does not fall back to a plain text area, keeping the editor unavailable until reloaded. This avoids silently enabling copy/paste in an unguarded input.

## Session Lifecycle (Phase 6)

The backend acts as the source of truth for session expiry, enforcing:
- **Hard Expiry:** At the configured `expires_at` timestamp.
- **Idle Timeout:** After a configurable window of inactivity.
- **Disconnect Cleanup:** Following a grace period if the WebSocket connection is lost.

The frontend maintains the session via periodic heartbeats, attempts to reconnect after transient drops, switches the editor and file tree into read-only mode once the session ends, and warns the user during the final five minutes of the session.

## Local Development

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Docker Images

```bash
docker build -t akumen-python -f backend/docker/Dockerfile.python backend/docker
docker build -t akumen-node -f backend/docker/Dockerfile.node backend/docker
```

### Sandbox Smoke Test

```bash
bash backend/test_sandbox.sh
```
