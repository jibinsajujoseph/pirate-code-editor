"""
Docker container lifecycle manager for the Akumen Code sandbox.

Responsibilities:
- Create isolated containers with resource limits
- Write files into running containers
- Execute code inside containers with wall-clock timeout
- Tear down containers

All containers run with:
- network_mode="none"  (no network access)
- CPU, memory, and PID limits
- Non-root user (sandbox)
"""

import logging
import tarfile
import io
import threading
import asyncio
from dataclasses import dataclass

import docker
from docker.errors import DockerException, NotFound, APIError

from .config import Config

logger = logging.getLogger(__name__)


@dataclass
class ExecResult:
    """Result of executing a file inside a container."""
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool


def get_docker_client() -> docker.DockerClient:
    """Create a Docker client from environment. Raises if Docker is unavailable."""
    try:
        client = docker.from_env()
        client.ping()
        return client
    except DockerException as e:
        logger.error("Failed to connect to Docker daemon: %s", e)
        raise


def check_image_available(client: docker.DockerClient, image_name: str) -> bool:
    """Check if a Docker image exists locally."""
    try:
        client.images.get(image_name)
        return True
    except Exception:
        return False


def create_container(client: docker.DockerClient, language: str) -> str:
    """
    Spin up an isolated container for the given language.
    Returns the container ID.

    The container runs `sleep infinity` to stay alive — actual code
    execution happens via `docker exec` calls.
    """
    image = Config.image_for_language(language)
    nano_cpus = int(Config.CPU_LIMIT * 1_000_000_000)

    logger.info("Creating %s container (image=%s, cpu=%.1f, mem=%s, pids=%d)",
                language, image, Config.CPU_LIMIT, Config.MEMORY_LIMIT, Config.PIDS_LIMIT)

    container = client.containers.run(
        image=image,
        command=["sleep", "infinity"],
        detach=True,
        # Security constraints
        network_mode="none",
        nano_cpus=nano_cpus,
        mem_limit=Config.MEMORY_LIMIT,
        pids_limit=Config.PIDS_LIMIT,
        user="sandbox",
        # Labeling for easy identification and cleanup
        labels={
            "app": Config.CONTAINER_LABEL,
            "language": language,
        },
        # Auto-remove when stopped (belt-and-suspenders with force remove on teardown)
        auto_remove=False,
    )

    logger.info("Container created: %s (id=%s)", language, container.short_id)
    return container.id


def write_file_to_container(
    client: docker.DockerClient,
    container_id: str,
    filename: str,
    content: str,
) -> None:
    """
    Write a file into the container's /workspace directory.

    Uses the Docker put_archive API to write a tar stream into the container,
    which is more reliable than exec_run with stdin piping.
    """
    container = client.containers.get(container_id)

    # Build a tar archive containing the file
    tar_stream = io.BytesIO()
    file_data = content.encode("utf-8")

    with tarfile.open(fileobj=tar_stream, mode="w") as tar:
        info = tarfile.TarInfo(name=filename)
        info.size = len(file_data)
        info.uid = 1000  # sandbox user UID
        info.gid = 1000  # sandbox group GID
        tar.addfile(info, io.BytesIO(file_data))

    tar_stream.seek(0)
    container.put_archive("/workspace", tar_stream)
    logger.info("Wrote file '%s' (%d bytes) to container %s",
                filename, len(file_data), container.short_id)


def sync_workspace_files(
    client: docker.DockerClient,
    container_id: str,
    files: dict[str, str],
    language: str,
) -> list[str]:
    """
    Replace the container's files for a single runtime with the current workspace snapshot.

    Phase 4 uses the active editor tab as the entry file. Before running that file, we
    wipe and rewrite only the files for the matching language so create/rename/delete
    operations in the browser are reflected inside the reused container.
    """
    container = client.containers.get(container_id)
    extension = Config.extension_for_language(language)

    clear_result = container.exec_run(
        ["sh", "-lc", f"rm -f /workspace/*{extension}"],
        user="sandbox",
        workdir="/workspace",
    )
    if clear_result.exit_code != 0:
        error_text = clear_result.output.decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Failed to clear workspace files for {language}: {error_text}"
        )

    synced_files: list[str] = []
    for filename, content in files.items():
        if Config.language_for_filename(filename) != language:
            continue
        write_file_to_container(client, container_id, filename, content)
        synced_files.append(filename)

    return synced_files


def execute_file(
    client: docker.DockerClient,
    container_id: str,
    filename: str,
    language: str,
) -> ExecResult:
    """
    Execute a file inside the container with a wall-clock timeout.

    The timeout kills the *exec process* if it exceeds Config.EXEC_TIMEOUT seconds.
    This is independent of the session-level timeout.
    """
    container = client.containers.get(container_id)
    cmd = Config.command_for_language(language, filename)
    timeout = Config.EXEC_TIMEOUT
    timed_out = False

    logger.info("Executing '%s' in container %s (timeout=%ds)",
                filename, container.short_id, timeout)

    # Use exec_create + exec_start for more control over the exec instance
    exec_id = client.api.exec_create(
        container.id,
        cmd,
        stdout=True,
        stderr=True,
        user="sandbox",
        workdir="/workspace",
    )

    # Start the exec and capture output with a timeout
    # We use a thread + join(timeout) pattern because docker-py's exec_run
    # doesn't have a native wall-clock timeout for the exec itself.
    output_stdout = b""
    output_stderr = b""
    exit_code = -1

    def run_exec():
        nonlocal output_stdout, output_stderr, exit_code
        try:
            # Stream=False returns the full output at once
            output = client.api.exec_start(exec_id["Id"], stream=False, demux=True)
            # demux=True returns (stdout_bytes, stderr_bytes)
            if output:
                output_stdout = output[0] or b""
                output_stderr = output[1] or b""
            inspect = client.api.exec_inspect(exec_id["Id"])
            exit_code = inspect.get("ExitCode", -1)
        except Exception as e:
            logger.error("Exec error: %s", e)
            output_stderr = str(e).encode("utf-8")
            exit_code = -1

    exec_thread = threading.Thread(target=run_exec, daemon=True)
    exec_thread.start()
    exec_thread.join(timeout=timeout)

    if exec_thread.is_alive():
        # Execution exceeded wall-clock timeout — kill the exec process
        timed_out = True
        logger.warning("Execution of '%s' timed out after %ds in container %s",
                       filename, timeout, container.short_id)
        # Kill any running processes for this exec by sending a kill to the pid
        # The exec's PID can be found via exec_inspect
        try:
            inspect = client.api.exec_inspect(exec_id["Id"])
            pid = inspect.get("Pid", 0)
            if pid > 0:
                # Kill the process inside the container
                container.exec_run(f"kill -9 {pid}", user="root", detach=True)
        except Exception:
            pass
        # Wait a short time for thread cleanup
        exec_thread.join(timeout=2)

        return ExecResult(
            stdout=output_stdout.decode("utf-8", errors="replace"),
            stderr="Execution timed out after {} seconds.\n{}".format(
                timeout,
                output_stderr.decode("utf-8", errors="replace"),
            ),
            exit_code=-1,
            timed_out=True,
        )

    return ExecResult(
        stdout=output_stdout.decode("utf-8", errors="replace"),
        stderr=output_stderr.decode("utf-8", errors="replace"),
        exit_code=exit_code,
        timed_out=False,
    )


def destroy_container(client: docker.DockerClient, container_id: str) -> bool:
    """
    Force-remove a container. Returns True if removed, False if not found.
    """
    try:
        container = client.containers.get(container_id)
        container.remove(force=True)
        logger.info("Destroyed container %s", container.short_id)
        return True
    except NotFound:
        logger.warning("Container %s not found (already removed?)", container_id[:12])
        return False
    except APIError as e:
        logger.error("Error destroying container %s: %s", container_id[:12], e)
        return False


def cleanup_all_containers(client: docker.DockerClient) -> int:
    """
    Remove all containers with the akumen-sandbox label.
    Used on backend shutdown to prevent orphaned containers.
    Returns the number of containers removed.
    """
    count = 0
    try:
        containers = client.containers.list(
            all=True,
            filters={"label": f"app={Config.CONTAINER_LABEL}"},
        )
        for container in containers:
            try:
                container.remove(force=True)
                count += 1
                logger.info("Cleaned up orphaned container %s", container.short_id)
            except Exception as e:
                logger.error("Failed to clean up container %s: %s",
                             container.short_id, e)
    except Exception as e:
        logger.error("Error listing containers for cleanup: %s", e)
    return count

async def execute_file_stream(
    client: docker.DockerClient,
    container_id: str,
    filename: str,
    language: str,
):
    """
    Execute a file inside the container, yielding output chunks.
    Yields dicts with 'type' (stdout/stderr/info/error/exit) and 'data'/'code'.
    """
    container = client.containers.get(container_id)
    cmd = Config.command_for_language(language, filename)
    timeout = Config.EXEC_TIMEOUT

    logger.info("Streaming execution of '%s' in container %s (timeout=%ds)",
                filename, container.short_id, timeout)

    exec_id = client.api.exec_create(
        container.id,
        cmd,
        stdout=True,
        stderr=True,
        user="sandbox",
        workdir="/workspace",
    )

    # We use a blocking generator from docker-py, so we run it in a thread
    # and push to an asyncio queue to yield asynchronously.
    queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def run_exec():
        try:
            # stream=True, demux=True yields (stdout_chunk, stderr_chunk)
            output_stream = client.api.exec_start(exec_id["Id"], stream=True, demux=True)
            for chunk in output_stream:
                stdout_chunk, stderr_chunk = chunk
                if stdout_chunk:
                    loop.call_soon_threadsafe(queue.put_nowait, {"type": "stdout", "data": stdout_chunk.decode("utf-8", errors="replace")})
                if stderr_chunk:
                    loop.call_soon_threadsafe(queue.put_nowait, {"type": "stderr", "data": stderr_chunk.decode("utf-8", errors="replace")})
            
            inspect = client.api.exec_inspect(exec_id["Id"])
            exit_code = inspect.get("ExitCode", -1)
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "exit", "code": exit_code})
        except Exception as e:
            logger.error("Exec stream error: %s", e)
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "data": str(e)})
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "exit", "code": -1})

    exec_thread = threading.Thread(target=run_exec, daemon=True)
    exec_thread.start()

    # Wait for the thread to finish or timeout
    start_time = loop.time()
    while True:
        try:
            time_left = timeout - (loop.time() - start_time)
            if time_left <= 0:
                raise asyncio.TimeoutError()
            
            item = await asyncio.wait_for(queue.get(), timeout=0.5)
            yield item
            if item["type"] == "exit":
                break
        except asyncio.TimeoutError:
            if loop.time() - start_time >= timeout:
                logger.warning("Execution of '%s' timed out after %ds in container %s",
                               filename, timeout, container.short_id)
                # Kill the process
                try:
                    inspect = client.api.exec_inspect(exec_id["Id"])
                    pid = inspect.get("Pid", 0)
                    if pid > 0:
                        container.exec_run(f"kill -9 {pid}", user="root", detach=True)
                except Exception:
                    pass
                yield {"type": "stderr", "data": f"\nExecution timed out after {timeout} seconds.\n"}
                yield {"type": "exit", "code": -1}
                break
            continue
