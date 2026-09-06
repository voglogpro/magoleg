"""Generate a salted owner-password hash without shell history exposure."""
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store_api import hash_password

if __name__ == "__main__":
    password = getpass.getpass("Owner password (12+ characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    try:
        encoded = hash_password(password)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    print("Set ADMIN_PASSWORD_HASH in the hosting secrets (do not commit it):")
    print(encoded)
