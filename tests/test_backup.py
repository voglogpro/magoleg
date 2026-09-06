import sqlite3
import tarfile
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from scripts.backup_store import backup


class BackupTests(unittest.TestCase):
    def test_consistent_snapshot_and_images_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            (data / "uploads").mkdir(parents=True)
            with closing(sqlite3.connect(data / "store.sqlite3")) as db:
                db.execute("CREATE TABLE test (value TEXT)")
                db.execute("INSERT INTO test VALUES ('saved')")
                db.commit()
            (data / "uploads" / "photo.webp").write_bytes(b"test fixture")
            target = root / "backup.tar.gz"
            backup(data, target)
            with tarfile.open(target) as archive:
                self.assertEqual(set(archive.getnames()), {"store.sqlite3", "uploads/photo.webp"})
            with self.assertRaises(ValueError):
                backup(data, target)
            with self.assertRaises(ValueError):
                backup(data, data / "invalid.tar.gz")
