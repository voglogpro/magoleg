"""Create a consistent SQLite snapshot plus photos. Keep backups off the host."""
import argparse
from contextlib import closing
import os
import sqlite3
import tarfile
import tempfile
from pathlib import Path


def backup(data_dir: Path, destination: Path) -> None:
    data_dir, destination = data_dir.resolve(), destination.resolve()
    if destination.exists():
        raise ValueError("Backup destination already exists; choose a new filename.")
    if destination == data_dir or data_dir in destination.parents:
        raise ValueError("Store backups outside DATA_DIR.")
    database = data_dir / "store.sqlite3"
    if not database.is_file():
        raise ValueError("No store.sqlite3 in DATA_DIR.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gpartner-backup-") as temporary:
        snapshot = Path(temporary) / "store.sqlite3"
        with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(snapshot)) as target:
                source.backup(target)
        # Exclusive creation prevents accidental overwrite of an existing backup.
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            with tarfile.open(fileobj=output, mode="w:gz") as archive:
                archive.add(snapshot, arcname="store.sqlite3")
                uploads = data_dir / "uploads"
                if uploads.is_dir():
                    for photograph in uploads.glob("*.webp"):
                        if photograph.is_file() and not photograph.is_symlink():
                            archive.add(photograph, arcname=f"uploads/{photograph.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--data-dir", type=Path, default=Path(os.getenv("DATA_DIR", "data")))
    arguments = parser.parse_args()
    try:
        backup(arguments.data_dir, arguments.destination)
    except (ValueError, OSError, sqlite3.Error) as error:
        raise SystemExit(str(error)) from error
    print(f"Backup created: {arguments.destination.resolve()}")
    print("Contains customer data. Restrict access and move a copy off the hosting server.")
