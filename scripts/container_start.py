"""Linux-only container bootstrap for BotHost's persistent /app/data mount.

Root is used only to repair ownership of this application's allowlisted storage.
The bot and HTTP server always execute as UID 10001, from image-owned /opt code.
No shell, recursive chown, source-directory writes, or user-controlled executable.
"""

from __future__ import annotations

import os
import re
import secrets
import stat
import sys
from pathlib import Path, PurePosixPath
from typing import Any

ALLOWED_DATA_DIRS = frozenset(("/app/data", "/data"))
SERVICE_UID = 10001
RUNTIME = Path("/opt/magoleg/runtime")
SQLITE_FILES = ("store.sqlite3", "store.sqlite3-wal", "store.sqlite3-shm")
PHOTO_NAME = re.compile(r"[a-f0-9]{32}\.webp\Z")


class StartupError(RuntimeError):
    """Configuration or storage cannot be made safe without operator action."""


def validate_data_dir(raw: str) -> PurePosixPath:
    # Deliberately do not expand variables, ~, .., or arbitrary custom paths while
    # privileged. A trailing slash is harmless; every other spelling is explicit.
    candidate = raw.rstrip("/")
    if candidate not in ALLOWED_DATA_DIRS:
        raise StartupError("Container DATA_DIR must be exactly /app/data (BotHost) or /data (external volume).")
    return PurePosixPath(candidate)


def require_regular_file(details: Any) -> None:
    if not stat.S_ISREG(details.st_mode) or details.st_nlink != 1:
        raise StartupError("Refusing storage file that is not a regular, single-link file.")


def _directory_flags() -> int:
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def _open_data_directory(location: PurePosixPath) -> int:
    path = Path(str(location))
    if path.resolve(strict=False) != path:
        raise StartupError("DATA_DIR or its parent is a symbolic link. Use a real mounted directory.")
    descriptor = os.open("/", _directory_flags())
    try:
        components = location.parts[1:]
        for index, component in enumerate(components):
            if index == len(components) - 1:
                try:
                    os.mkdir(component, mode=0o700, dir_fd=descriptor)
                except FileExistsError:
                    pass
            child = os.open(component, _directory_flags(), dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _open_uploads(data_fd: int) -> int:
    try:
        os.mkdir("uploads", mode=0o700, dir_fd=data_fd)
    except FileExistsError:
        pass
    return os.open("uploads", _directory_flags(), dir_fd=data_fd)


def _harden_directory(descriptor: int, uid: int, gid: int) -> None:
    if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
        raise StartupError("Storage is not a directory.")
    os.fchown(descriptor, uid, gid)
    os.fchmod(descriptor, 0o700)


def _open_existing_file(directory_fd: int, filename: str, *, writable: bool = False) -> int | None:
    try:
        descriptor = os.open(filename, (os.O_RDWR if writable else os.O_RDONLY)
                             | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    except FileNotFoundError:
        return None
    try:
        # O_NOFOLLOW blocks symlinks; this also blocks device/FIFO/hardlink tricks.
        require_regular_file(os.fstat(descriptor))
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _harden_file(directory_fd: int, filename: str, uid: int, gid: int) -> None:
    descriptor = _open_existing_file(directory_fd, filename)
    if descriptor is not None:
        try:
            os.fchown(descriptor, uid, gid)
            os.fchmod(descriptor, 0o600)
        finally:
            os.close(descriptor)


def prepare_owned_storage(data_fd: int, uploads_fd: int, uid: int, gid: int) -> None:
    """Only these two directories and exact app-owned filenames are changed."""
    _harden_directory(data_fd, uid, gid)
    _harden_directory(uploads_fd, uid, gid)
    for filename in SQLITE_FILES:
        _harden_file(data_fd, filename, uid, gid)
    for filename in os.listdir(uploads_fd):
        if PHOTO_NAME.fullmatch(filename):
            _harden_file(uploads_fd, filename, uid, gid)


def drop_privileges(uid: int, gid: int) -> None:
    if uid != SERVICE_UID or gid <= 0:
        raise StartupError("The gpartner account must have UID 10001 and a non-root group.")
    os.setgroups([])
    os.setgid(gid)
    os.setuid(uid)
    if os.getuid() != uid or os.geteuid() != uid or os.getgid() != gid:
        raise StartupError("Could not permanently drop container privileges.")


def _probe_writable(directory_fd: int) -> None:
    filename = f".gpartner-write-check-{secrets.token_hex(12)}"
    descriptor = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=directory_fd)
    try:
        os.write(descriptor, b"ok")
    finally:
        os.close(descriptor)
        os.unlink(filename, dir_fd=directory_fd)


def check_writable_storage(data_fd: int, uploads_fd: int) -> None:
    _probe_writable(data_fd)
    _probe_writable(uploads_fd)
    for filename in SQLITE_FILES:
        descriptor = _open_existing_file(data_fd, filename, writable=True)
        if descriptor is not None:
            os.close(descriptor)


def main() -> None:
    if os.name != "posix":
        raise StartupError("This bootstrap is Linux-container only. For local development run python main.py.")
    location = validate_data_dir(os.getenv("DATA_DIR", "/app/data"))
    entrypoint = RUNTIME / "main.py"
    if not entrypoint.is_file():
        raise StartupError("Image runtime /opt/magoleg/runtime/main.py is missing. Rebuild the Docker image.")
    os.umask(0o077)
    os.environ["DATA_DIR"] = str(location)
    data_fd = _open_data_directory(location)
    uploads_fd = None
    try:
        uploads_fd = _open_uploads(data_fd)
        if os.geteuid() == 0:
            import pwd

            account = pwd.getpwnam("gpartner")
            if account.pw_uid != SERVICE_UID or account.pw_gid <= 0:
                raise StartupError("Image account gpartner must have UID 10001 and a non-root group.")
            prepare_owned_storage(data_fd, uploads_fd, account.pw_uid, account.pw_gid)
            drop_privileges(account.pw_uid, account.pw_gid)
        elif os.geteuid() != SERVICE_UID:
            raise StartupError("Start the container as root for bootstrap or as gpartner UID 10001.")
        check_writable_storage(data_fd, uploads_fd)
    finally:
        if uploads_fd is not None:
            os.close(uploads_fd)
        os.close(data_fd)
    os.chdir(RUNTIME)
    # Ignore PYTHONPATH/PYTHONHOME and user site packages; code comes from /opt,
    # not BotHost's /app source bindmount. The service process is already non-root.
    os.execv(sys.executable, [sys.executable, "-E", "-s", "-B", "-u", str(entrypoint)])


if __name__ == "__main__":
    try:
        main()
    except (StartupError, OSError, KeyError, RuntimeError) as error:
        print(f"Container startup refused: {error}", file=sys.stderr)
        raise SystemExit(1) from None
