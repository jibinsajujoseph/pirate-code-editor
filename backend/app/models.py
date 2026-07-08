"""
Pydantic models for API request/response payloads.
"""

from pydantic import BaseModel, Field


# ── Requests ───────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    """Create a new sandbox session."""
    language: str = Field(
        ...,
        pattern=r"^(python|javascript)$",
        description="Language runtime: 'python' or 'javascript'"
    )
    duration_minutes: int = Field(
        default=60,
        ge=1,
        le=180,
        description="Session duration in minutes (1–180)"
    )


class WriteFileRequest(BaseModel):
    """Write or update a file in the session workspace."""
    filename: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Filename with extension, e.g. 'main.py'"
    )
    content: str = Field(
        ...,
        description="File content to write"
    )


class WorkspaceFilePayload(BaseModel):
    """A single workspace file snapshot from the frontend."""
    filename: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Filename with extension, e.g. 'main.py'"
    )
    content: str = Field(
        ...,
        description="Full file content"
    )


class SyncWorkspaceRequest(BaseModel):
    """Replace the session workspace snapshot before execution."""
    entry_filename: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="The selected file that will be executed for this run"
    )
    files: list[WorkspaceFilePayload] = Field(
        default_factory=list,
        description="Complete current workspace state from the editor"
    )


class ExecuteRequest(BaseModel):
    """Execute a file in the session's container."""
    filename: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Filename to execute, e.g. 'main.py'"
    )


# ── Responses ──────────────────────────────────────────

class CreateSessionResponse(BaseModel):
    """Returned after session creation."""
    session_id: str
    language: str
    expires_at: str  # ISO 8601 timestamp
    container_id: str
    status: str
    idle_timeout_minutes: int
    disconnect_grace_seconds: int
    warning_threshold_minutes: int


class WriteFileResponse(BaseModel):
    """Returned after writing a file."""
    filename: str
    message: str


class SyncWorkspaceResponse(BaseModel):
    """Returned after syncing the workspace for a language-aware run."""
    entry_filename: str
    language: str
    synced_files: list[str]
    message: str


class ExecuteResponse(BaseModel):
    """Returned after executing a file."""
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool


class SessionInfoResponse(BaseModel):
    """Session metadata."""
    session_id: str
    language: str
    container_id: str
    status: str
    created_at: str
    expires_at: str
    last_activity_at: str
    files: list[str]
    ended_at: str | None = None
    ended_reason: str | None = None
    disconnect_deadline: str | None = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    docker_connected: bool
    images_available: dict[str, bool]
