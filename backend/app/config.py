"""
Configuration for the Akumen Code execution sandbox.
All values are environment-driven with sensible defaults.
"""

import os


class Config:
    """Sandbox configuration — override via environment variables."""

    LANGUAGE_EXTENSION_MAP: dict[str, str] = {
        "python": ".py",
        "javascript": ".js",
    }

    # Docker image names (must be pre-built)
    PYTHON_IMAGE: str = os.getenv("AKUMEN_PYTHON_IMAGE", "akumen-python")
    NODE_IMAGE: str = os.getenv("AKUMEN_NODE_IMAGE", "akumen-node")

    # Container resource limits
    CPU_LIMIT: float = float(os.getenv("AKUMEN_CPU_LIMIT", "0.5"))
    MEMORY_LIMIT: str = os.getenv("AKUMEN_MEMORY_LIMIT", "256m")
    PIDS_LIMIT: int = int(os.getenv("AKUMEN_PIDS_LIMIT", "64"))

    # Per-run wall-clock execution timeout (seconds).
    # This kills the *process* if it hangs — independent of the session-level timeout.
    EXEC_TIMEOUT: int = int(os.getenv("AKUMEN_EXEC_TIMEOUT", "10"))

    # Default session duration (minutes) — can be overridden per session at creation time
    DEFAULT_SESSION_DURATION: int = int(os.getenv("AKUMEN_DEFAULT_SESSION_DURATION", "60"))

    # Session lifecycle controls
    IDLE_TIMEOUT_MINUTES: int = int(os.getenv("AKUMEN_IDLE_TIMEOUT_MINUTES", "20"))
    DISCONNECT_GRACE_SECONDS: int = int(os.getenv("AKUMEN_DISCONNECT_GRACE_SECONDS", "20"))
    SESSION_CLEANUP_INTERVAL_SECONDS: int = int(
        os.getenv("AKUMEN_SESSION_CLEANUP_INTERVAL_SECONDS", "5")
    )
    TIMER_WARNING_MINUTES: int = int(os.getenv("AKUMEN_TIMER_WARNING_MINUTES", "5"))

    # Container label prefix for easy identification and cleanup
    CONTAINER_LABEL: str = "akumen-sandbox"

    @classmethod
    def image_for_language(cls, language: str) -> str:
        """Return the Docker image name for a given language."""
        mapping = {
            "python": cls.PYTHON_IMAGE,
            "javascript": cls.NODE_IMAGE,
        }
        image = mapping.get(language)
        if image is None:
            raise ValueError(f"Unsupported language: {language}")
        return image

    @classmethod
    def command_for_language(cls, language: str, filename: str) -> list[str]:
        """Return the execution command for a given language and file."""
        mapping = {
            "python": ["python3", f"/workspace/{filename}"],
            "javascript": ["node", f"/workspace/{filename}"],
        }
        cmd = mapping.get(language)
        if cmd is None:
            raise ValueError(f"Unsupported language: {language}")
        return cmd

    @classmethod
    def language_for_filename(cls, filename: str) -> str:
        """Infer the runtime language from a supported filename extension."""
        for language, extension in cls.LANGUAGE_EXTENSION_MAP.items():
            if filename.endswith(extension):
                return language
        supported = ", ".join(cls.LANGUAGE_EXTENSION_MAP.values())
        raise ValueError(
            f"Unsupported file extension for '{filename}'. Use one of: {supported}"
        )

    @classmethod
    def extension_for_language(cls, language: str) -> str:
        """Return the file extension handled by a language runtime."""
        extension = cls.LANGUAGE_EXTENSION_MAP.get(language)
        if extension is None:
            raise ValueError(f"Unsupported language: {language}")
        return extension
