"""Portable bootstrap checks; no test changes real ownership or process UID."""

import importlib.util
import stat
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import call, patch

specification = importlib.util.spec_from_file_location(
    "container_start", Path(__file__).resolve().parents[1] / "scripts" / "container_start.py")
bootstrap = importlib.util.module_from_spec(specification)
specification.loader.exec_module(bootstrap)


class ContainerStartTests(unittest.TestCase):
    def test_only_explicit_storage_roots_are_accepted(self):
        self.assertEqual(str(bootstrap.validate_data_dir("/app/data")), "/app/data")
        self.assertEqual(str(bootstrap.validate_data_dir("/data/")), "/data")
        for location in ("", "/", "/app", "/app/data-other", "/data/../data", "data", "~", "/tmp/storage"):
            with self.subTest(location=location), self.assertRaises(bootstrap.StartupError):
                bootstrap.validate_data_dir(location)

    def test_symlinked_directory_is_rejected_before_open_or_chown(self):
        with patch.object(bootstrap.Path, "resolve", return_value=Path("/outside")), \
                patch.object(bootstrap.os, "open") as opened:
            with self.assertRaises(bootstrap.StartupError):
                bootstrap._open_data_directory(bootstrap.validate_data_dir("/app/data"))
            opened.assert_not_called()

    def test_regular_file_checks_reject_hardlinks_and_special_files(self):
        bootstrap.require_regular_file(SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_nlink=1))
        for mode, links in ((stat.S_IFREG, 2), (stat.S_IFLNK, 1), (stat.S_IFIFO, 1), (stat.S_IFDIR, 1)):
            with self.assertRaises(bootstrap.StartupError):
                bootstrap.require_regular_file(SimpleNamespace(st_mode=mode, st_nlink=links))

    def test_ownership_changes_are_allowlisted_not_recursive(self):
        photo = "a" * 32 + ".webp"
        with patch.object(bootstrap, "_harden_directory") as directory, \
                patch.object(bootstrap, "_harden_file") as regular, \
                patch.object(bootstrap.os, "listdir", return_value=[photo, "../secret", "unrelated.jpg", "folder"]):
            bootstrap.prepare_owned_storage(10, 11, 10001, 999)
            self.assertEqual(directory.call_args_list, [call(10, 10001, 999), call(11, 10001, 999)])
            self.assertEqual(regular.call_args_list, [
                call(10, "store.sqlite3", 10001, 999), call(10, "store.sqlite3-wal", 10001, 999),
                call(10, "store.sqlite3-shm", 10001, 999), call(11, photo, 10001, 999),
            ])

    def test_privileges_drop_groups_then_gid_then_uid(self):
        calls = []
        with patch.object(bootstrap.os, "setgroups", side_effect=lambda value: calls.append(("groups", value)), create=True), \
                patch.object(bootstrap.os, "setgid", side_effect=lambda value: calls.append(("gid", value)), create=True), \
                patch.object(bootstrap.os, "setuid", side_effect=lambda value: calls.append(("uid", value)), create=True), \
                patch.object(bootstrap.os, "getuid", return_value=10001, create=True), \
                patch.object(bootstrap.os, "geteuid", return_value=10001, create=True), \
                patch.object(bootstrap.os, "getgid", return_value=999, create=True):
            bootstrap.drop_privileges(10001, 999)
        self.assertEqual(calls, [("groups", []), ("gid", 999), ("uid", 10001)])

    def test_wrong_or_root_identity_is_rejected_before_syscalls(self):
        with patch.object(bootstrap.os, "setuid", create=True) as changed:
            for uid, gid in ((0, 0), (10001, 0), (123, 10001)):
                with self.assertRaises(bootstrap.StartupError):
                    bootstrap.drop_privileges(uid, gid)
            changed.assert_not_called()


if __name__ == "__main__":
    unittest.main()
