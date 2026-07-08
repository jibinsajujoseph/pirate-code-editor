"""
In-memory session store.
Maps session_id → Session dataclass.
No database — v1 scope. Sessions are lost on backend restart.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import uuid


SessionStatus = str


def utc_now() -> datetime:
    """Return the current UTC timestamp."""
    return datetime.now(timezone.utc)


@dataclass
class Session:
    """Represents a sandbox session and its lifecycle state."""
    session_id: str
    language: str
    created_at: datetime
    expires_at: datetime
    last_activity_at: datetime
    status: SessionStatus = "active"
    container_ids: dict[str, str] = field(default_factory=dict)
    files: dict[str, str] = field(default_factory=dict)  # filename → content
    active_connection_count: int = 0
    disconnect_deadline: datetime | None = None
    ended_at: datetime | None = None
    ended_reason: str | None = None

    @property
    def container_id(self) -> str:
        """Return the primary container ID for compatibility with earlier phases."""
        return self.container_ids.get(self.language, "")


# Global session store
_sessions: dict[str, Session] = {}


def create_session(
    language: str,
    expires_at: datetime,
    container_ids: dict[str, str],
) -> Session:
    """Create and store a new session."""
    now = utc_now()
    session_id = str(uuid.uuid4())
    session = Session(
        session_id=session_id,
        language=language,
        created_at=now,
        expires_at=expires_at,
        last_activity_at=now,
        container_ids=dict(container_ids),
        files={},
    )
    _sessions[session_id] = session
    return session


def get_session(session_id: str) -> Session | None:
    """Look up a session by ID. Returns None if not found."""
    return _sessions.get(session_id)


def delete_session(session_id: str) -> Session | None:
    """Remove a session from the store. Returns the removed session or None."""
    return _sessions.pop(session_id, None)


def list_sessions() -> list[Session]:
    """Return all sessions, including ended tombstones."""
    return list(_sessions.values())


def list_active_sessions() -> list[Session]:
    """Return currently active sessions."""
    return [session for session in _sessions.values() if session.status == "active"]


def touch_session(session_id: str) -> bool:
    """Mark a session as recently active."""
    session = _sessions.get(session_id)
    if session is None or session.status != "active":
        return False
    session.last_activity_at = utc_now()
    return True


def update_session_file(session_id: str, filename: str, content: str) -> bool:
    """Track a file write in the session. Returns False if session not found."""
    session = _sessions.get(session_id)
    if session is None:
        return False
    session.files[filename] = content
    touch_session(session_id)
    return True


def replace_session_files(session_id: str, files: dict[str, str]) -> bool:
    """Replace the session workspace snapshot. Returns False if session not found."""
    session = _sessions.get(session_id)
    if session is None:
        return False
    session.files = dict(files)
    touch_session(session_id)
    return True


def set_session_container(session_id: str, language: str, container_id: str) -> bool:
    """Attach or update the runtime container for a specific language."""
    session = _sessions.get(session_id)
    if session is None:
        return False
    session.container_ids[language] = container_id
    touch_session(session_id)
    return True


def clear_session_containers(session_id: str) -> bool:
    """Remove all tracked runtime container IDs for a session."""
    session = _sessions.get(session_id)
    if session is None:
        return False
    session.container_ids = {}
    return True


def mark_session_connected(session_id: str) -> bool:
    """Record an active websocket connection for a session."""
    session = _sessions.get(session_id)
    if session is None or session.status != "active":
        return False
    session.active_connection_count += 1
    session.disconnect_deadline = None
    session.last_activity_at = utc_now()
    return True


def mark_session_disconnected(session_id: str, grace_seconds: int) -> bool:
    """Start the disconnect grace timer when the last websocket disconnects."""
    session = _sessions.get(session_id)
    if session is None:
        return False

    session.active_connection_count = max(0, session.active_connection_count - 1)
    if session.status == "active" and session.active_connection_count == 0:
        session.disconnect_deadline = utc_now() + timedelta(seconds=grace_seconds)
    return True


def end_session(session_id: str, reason: str) -> Session | None:
    """Mark a session as ended. Returns the session, or None if not found."""
    session = _sessions.get(session_id)
    if session is None:
        return None

    if session.status == "ended":
        return session

    now = utc_now()
    session.status = "ended"
    session.ended_reason = reason
    session.ended_at = now
    session.disconnect_deadline = None
    session.active_connection_count = 0
    session.last_activity_at = now
    return session
