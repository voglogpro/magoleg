"""Exercise the built Linux image with an isolated BotHost-style Git bindmount.

No bot token or owner password is supplied. The temporary checkout contains only
committed files. Real /app/data is never mounted or modified. The exact unique
test container is removed in finally, even if a readiness/assertion check fails.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


def command(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(arguments, check=False, text=True, capture_output=True, timeout=90)
    if check and result.returncode:
        raise RuntimeError(f"{' '.join(arguments[:2])} failed: {result.stderr.strip() or result.stdout.strip()}")
    return result


def check(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def get(base: str, path: str) -> tuple[int, dict[str, str], bytes]:
    try:
        with urllib.request.urlopen(base + path, timeout=3) as response:
            return response.status, dict(response.headers.items()), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers.items()), error.read()


def wait_ready(container: str) -> str:
    binding = command("docker", "port", container, "8000/tcp").stdout.strip()
    check(bool(re.fullmatch(r"127\.0\.0\.1:\d+", binding)), "Unexpected Docker port binding.")
    base = f"http://{binding}"
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        running = command("docker", "inspect", "--format", "{{.State.Running}}", container).stdout.strip()
        check(running == "true", "Container exited before becoming healthy.")
        try:
            status, _, body = get(base, "/health")
            if status == 200 and json.loads(body).get("status") == "ok":
                return base
        except (OSError, ValueError):
            pass
        time.sleep(0.5)
    raise RuntimeError("Container health check did not pass within 60 seconds.")


def inspect_runtime(container: str, marker: str, *, create: bool) -> None:
    # Check the *service* process, not docker exec's default user (image bootstrap
    # begins as root). The diagnostic itself explicitly runs as the service UID.
    source = """
import os, sqlite3, sys
from pathlib import Path
status = Path('/proc/1/status').read_text()
uids = next(line.split()[1:] for line in status.splitlines() if line.startswith('Uid:'))
assert uids == ['10001'] * 4, f'Service retained unexpected UIDs: {uids}'
assert os.geteuid() == 10001
assert Path('/proc/1/cwd').resolve() == Path('/opt/magoleg/runtime')
assert b'/opt/magoleg/runtime/main.py' in Path('/proc/1/cmdline').read_bytes()
assert Path('/app/main.py').is_file(), 'Git checkout is not mounted at /app'
database = Path('/app/data/store.sqlite3')
assert database.is_file() and database.stat().st_uid == 10001
assert Path('/app/data/uploads').is_dir()
with sqlite3.connect(database) as connection:
    assert connection.execute('PRAGMA journal_mode').fetchone()[0] == 'wal'
    if sys.argv[2] == 'create':
        connection.execute('INSERT INTO meta(key,value) VALUES(?,?)', ('ci_persistence_marker', sys.argv[1]))
    else:
        row = connection.execute('SELECT value FROM meta WHERE key=?', ('ci_persistence_marker',)).fetchone()
        assert row == (sys.argv[1],), 'SQLite contents did not survive container recreation'
print('Runtime UID, image-owned entrypoint and persistent SQLite checks passed.')
"""
    result = command("docker", "exec", "--user", "10001", container, "python", "-c", source,
                     marker, "create" if create else "verify")
    print(result.stdout, end="", flush=True)


def inspect_http(base: str) -> None:
    status, _, body = get(base, "/")
    check(status == 200 and b'id="root"' in body, "Built storefront HTML was not served.")
    scripts = re.findall(r'src="(/assets/[^"\s]+\.js)"', body.decode())
    check(bool(scripts), "Built frontend module was not referenced by HTML.")
    for script in scripts:
        script_status, _, source = get(base, script)
        check(script_status == 200 and len(source) > 100, "Built frontend asset was not served.")
    status, _, body = get(base, "/api/products")
    check(status == 200 and json.loads(body) == {"products": []}, "Fresh catalog was not empty.")
    for path in ("/api/admin/session", "/api/admin/products", "/api/admin/settings", "/api/admin/inquiries"):
        status, _, body = get(base, path)
        check(status in (401, 503) and isinstance(json.loads(body).get("error"), str),
              f"Protected endpoint was accessible without login: {path}")
    status, headers, body = get(base, "/admin")
    check(status == 200 and headers.get("X-Frame-Options") == "DENY", "Owner page frame protection missing.")
    check(b"telegram-web-app.js" not in body, "Owner page unexpectedly loads the Telegram SDK.")
    print("Built frontend and unauthenticated admin protection checks passed.", flush=True)


def main(image: str) -> None:
    check(os.name == "posix", "Run this smoke check on a Linux Docker runner.")
    repository = Path(__file__).resolve().parents[1]
    marker = secrets.token_hex(12)
    container = f"gpartner-ci-smoke-{marker}"
    # A git archive matches the checked-out revision without copying local secrets,
    # ignored data directories, node_modules or any other existing store storage.
    mount = Path(tempfile.mkdtemp(prefix="gpartner-ci-mount-", dir=os.getenv("RUNNER_TEMP")))
    with subprocess.Popen(["git", "archive", "--format=tar", "HEAD"], cwd=repository,
                          stdout=subprocess.PIPE) as process:
        with tarfile.open(fileobj=process.stdout, mode="r|") as archive:
            archive.extractall(mount, filter="data")
        check(process.wait(timeout=30) == 0, "Could not prepare committed Git bindmount.")
    check((mount / "main.py").is_file() and not (mount / "data").exists(),
          "Smoke bindmount must be source-only, without an existing data directory.")
    # mkdtemp defaults to 0700 under the runner UID. Match a real Git checkout:
    # UID10001 must be able to traverse /app to access its privately-owned data.
    mount.chmod(0o755)
    try:
        for generation in (1, 2):
            command("docker", "run", "--detach", "--name", container,
                    "--publish", "127.0.0.1::8000", "--mount", f"type=bind,source={mount},target=/app",
                    "--env", "WEB_ONLY=true", "--env", "PORT=8000", "--env", "DATA_DIR=/app/data",
                    "--env", "BOT_TOKEN=", "--env", "ADMIN_PASSWORD=", "--env", "ADMIN_PASSWORD_HASH=", image)
            base = wait_ready(container)
            inspect_http(base)
            inspect_runtime(container, marker, create=generation == 1)
            print(f"Container generation {generation} passed.", flush=True)
            if generation == 1:
                print(command("docker", "logs", container, check=False).stderr, end="", flush=True)
                command("docker", "stop", "--time", "10", container)
                command("docker", "rm", container)
        print("Linux image smoke passed: restart preserved the test data.", flush=True)
    finally:
        # Only our unpredictable, namespaced container is targeted; never docker
        # prune, wildcard removal, broad chown or recursive host-data deletion.
        logs = command("docker", "logs", container, check=False)
        print(logs.stdout, end="", flush=True)
        print(logs.stderr, end="", flush=True)
        command("docker", "rm", "--force", container, check=False)
        # UID10001 owns the private test database, so do not recursively delete it
        # as the runner or weaken permissions. GitHub disposes RUNNER_TEMP after
        # the job; on a local runner this isolated path is printed for its owner.
        print(f"Isolated smoke mount (runner-managed cleanup): {mount}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="gpartner:test")
    main(parser.parse_args().image)
