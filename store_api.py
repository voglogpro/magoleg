"""Persistent, same-origin store API and password-protected single-owner CRM.

Call ``setup_store(app)`` before registering the SPA fallback. Deploy one app
instance with DATA_DIR on a persistent volume. Secrets belong in environment
variables, never in a frontend bundle. There is deliberately no default password.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import io
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import time
import warnings
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlsplit

from aiohttp import web
from PIL import Image, ImageOps, UnidentifiedImageError

LOGGER = logging.getLogger("gshop.store")
MAX_JSON = 64 * 1024
MAX_UPLOAD = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000
SESSION_AGE = 8 * 60 * 60
SESSION_IDLE = 60 * 60
COOKIE_NAME = "gpartner_admin"
# Shoppers return in weeks, not hours: a short owner session would only teach
# them to retype a password on a phone, without protecting the shop's data.
ACCOUNT_COOKIE = "gpartner_account"
ACCOUNT_SESSION_AGE = 60 * 24 * 60 * 60
ACCOUNT_SESSION_IDLE = 30 * 24 * 60 * 60
ACCOUNT_SESSIONS_PER_CUSTOMER = 6
MEDIA_NAME = re.compile(r"[a-f0-9]{32}\.webp\Z")
PRODUCT_ID = re.compile(r"[a-f0-9]{32}\Z")
SCRYPT_N, SCRYPT_R, SCRYPT_P = 32768, 8, 3
DEFAULT_SETTINGS: dict[str, Any] = {
    "shop_name": "G-Partner", "phone": "",
    "telegram": "", "address": "", "hours": "", "delivery": "",
    "payment": "", "legal_name": "", "legal_details": "", "warranty": "",
    "inquiries_enabled": False,
}
PRODUCT_CATEGORIES = ("kick-scooter", "scooter", "e-bike", "parts", "accessories")
PRODUCT_FIELDS = {
    "name", "description", "category", "license", "license_verified", "price",
    "stock_status", "range_km", "speed_kmh", "power_w", "weight_kg",
    "image_url", "published", "featured",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def hash_password(password: str) -> str:
    """Generate an OWASP-listed scrypt hash, with a random 128-bit salt."""
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise ValueError("Password must contain 12 to 256 characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N,
                            r=SCRYPT_R, p=SCRYPT_P, dklen=32, maxmem=128 * 1024 * 1024)
    return "$".join(("scrypt", str(SCRYPT_N), str(SCRYPT_R), str(SCRYPT_P),
                     base64.b64encode(salt).decode(), base64.b64encode(digest).decode()))


def _parse_hash(encoded: str) -> tuple[bytes, bytes]:
    parts = encoded.split("$")
    if len(parts) != 6 or parts[:4] != ["scrypt", "32768", "8", "3"]:
        raise ValueError("Unsupported ADMIN_PASSWORD_HASH format")
    salt, digest = (base64.b64decode(value, validate=True) for value in parts[4:])
    if len(salt) != 16 or len(digest) != 32:
        raise ValueError("Invalid ADMIN_PASSWORD_HASH length")
    return salt, digest


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt, expected = _parse_hash(encoded)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N,
                                r=SCRYPT_R, p=SCRYPT_P, dklen=32, maxmem=128 * 1024 * 1024)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


class APIError(Exception):
    def __init__(self, status: int, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


def require(condition: bool, message: str, status: int = 400) -> None:
    if not condition:
        raise APIError(status, message)


def text_value(value: Any, label: str, maximum: int, minimum: int = 0) -> str:
    require(isinstance(value, str), f"{label}: ожидается текст.")
    value = value.strip()
    require(minimum <= len(value) <= maximum, f"{label}: допустимо от {minimum} до {maximum} символов.")
    require(not any(ord(char) < 32 and char not in "\n\r\t" for char in value),
            f"{label}: недопустимые символы.")
    return value


def boolean_value(value: Any, label: str) -> bool:
    require(type(value) is bool, f"{label}: ожидается логическое значение.")
    return value


def number_value(value: Any, label: str, maximum: float) -> float | None:
    if value is None:
        return None
    require(type(value) in (int, float) and 0 <= value <= maximum and math.isfinite(value),
            f"{label}: укажите число от 0 до {maximum:g}.")
    return float(value)


def valid_phone(value: str) -> bool:
    """Conservative display-format check; punctuation is not a phone number."""
    return (isinstance(value, str) and bool(re.fullmatch(r"[+0-9 ()-]{7,32}", value))
            and 7 <= sum("0" <= character <= "9" for character in value) <= 15
            and value.count("+") <= 1 and "+" not in value[1:])


def contact_identity(contact: str) -> str:
    """Normalized phone, email or Telegram name; empty when the contact is unusable."""
    if valid_phone(contact):
        return "".join(character for character in contact if character.isdigit())
    if (re.fullmatch(r"@?[A-Za-z][A-Za-z0-9_]{4,31}", contact)
            or re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", contact)):
        return contact.removeprefix("@").lower()
    return ""


async def read_json(request: web.Request) -> dict[str, Any]:
    require(request.content_type == "application/json", "Ожидается JSON.", 415)
    if request.content_length is not None:
        require(request.content_length <= MAX_JSON, "Слишком большой запрос.", 413)
    payload = bytearray()
    async for chunk in request.content.iter_chunked(8192):
        payload.extend(chunk)
        require(len(payload) <= MAX_JSON, "Слишком большой запрос.", 413)
    try:
        data = json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise APIError(400, "Некорректный JSON.") from None
    require(isinstance(data, dict), "Ожидается объект JSON.")
    return data


def origin_of(url: str) -> str | None:
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return None
        port = parsed.port
        host = parsed.hostname.lower()
        if ":" in host:
            host = f"[{host}]"
        suffix = f":{port}" if port and port != (443 if parsed.scheme == "https" else 80) else ""
        return f"{parsed.scheme}://{host}{suffix}"
    except ValueError:
        return None


class Store:
    def __init__(self) -> None:
        self.directory = Path(os.getenv("DATA_DIR", str(Path(__file__).parent / "data"))).resolve()
        self.uploads = self.directory / "uploads"
        self.database = self.directory / "store.sqlite3"
        self.username = os.getenv("ADMIN_USERNAME", "megaolegshop2000")
        self.password_hash = ""
        self.cookie_secure = os.getenv("COOKIE_SECURE", "true").lower() not in ("false", "0")
        self.allowed_origin = origin_of(os.getenv("PUBLIC_ORIGIN", "") or os.getenv("MINI_APP_URL", ""))
        self.hash_lock = asyncio.Semaphore(2)
        self.image_lock = asyncio.Semaphore(2)
        # Verified when a login names nobody, so a missing account costs the
        # same time as a wrong password and cannot be told apart.
        self.dummy_hash = ""

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        # A contended disk/backup must not pause Telegram's event loop for seconds.
        # Single-writer deployment keeps ordinary transactions brief; callers retry
        # after a bounded 100 ms lock wait instead of queueing behind a long writer.
        connection = sqlite3.connect(self.database, timeout=0.1)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    async def start(self, _: web.Application) -> None:
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.uploads.mkdir(exist_ok=True, mode=0o700)
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY, data TEXT NOT NULL,
                    published INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, csrf TEXT NOT NULL,
                    created_at REAL NOT NULL, last_seen REAL NOT NULL, expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS inquiries (
                    id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS rate_limits (
                    scope TEXT NOT NULL, peer TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL,
                    PRIMARY KEY(scope, peer, bucket)
                );
                CREATE TABLE IF NOT EXISTS inquiry_requests (
                    key_hash TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
                    response TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS customers (
                    id TEXT PRIMARY KEY, identity TEXT NOT NULL UNIQUE, contact TEXT NOT NULL,
                    name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS customer_sessions (
                    token_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL, csrf TEXT NOT NULL,
                    created_at REAL NOT NULL, last_seen REAL NOT NULL, expires_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS products_public ON products(published, updated_at);
                CREATE INDEX IF NOT EXISTS inquiries_created ON inquiries(created_at);
                CREATE INDEX IF NOT EXISTS inquiries_status_created ON inquiries(status, created_at, id);
                CREATE INDEX IF NOT EXISTS customer_sessions_owner ON customer_sessions(customer_id);
            """)
            # Inquiries predate accounts; older rows stay unlinked and owner-only.
            if "customer_id" not in {row["name"] for row in connection.execute("PRAGMA table_info(inquiries)")}:
                connection.execute("ALTER TABLE inquiries ADD COLUMN customer_id TEXT")
            if "city" not in {row["name"] for row in connection.execute("PRAGMA table_info(customers)")}:
                connection.execute("ALTER TABLE customers ADD COLUMN city TEXT NOT NULL DEFAULT ''")
            connection.execute("CREATE INDEX IF NOT EXISTS inquiries_customer ON inquiries(customer_id, created_at)")
            connection.execute("INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)",
                               (json.dumps(DEFAULT_SETTINGS, ensure_ascii=False),))
        if os.name != "nt":
            self.database.chmod(0o600)
        encoded = os.getenv("ADMIN_PASSWORD_HASH", "")
        if encoded:
            _parse_hash(encoded)  # Fail closed on an invalid operator configuration.
            self.password_hash = encoded
        elif os.getenv("ADMIN_PASSWORD"):
            self.password_hash = await asyncio.to_thread(hash_password, os.environ["ADMIN_PASSWORD"])
        else:
            LOGGER.warning("CRM login is disabled: configure ADMIN_PASSWORD_HASH or ADMIN_PASSWORD.")
        fingerprint = hashlib.sha256(f"{self.username}:{self.password_hash}".encode()).hexdigest()
        with self.connect() as connection:
            previous = connection.execute("SELECT value FROM meta WHERE key='auth_fingerprint'").fetchone()
            if not previous or previous["value"] != fingerprint:
                connection.execute("DELETE FROM sessions")
            connection.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('auth_fingerprint',?)", (fingerprint,))
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (time.time(),))
            connection.execute("DELETE FROM customer_sessions WHERE expires_at <= ?", (time.time(),))
        self.dummy_hash = await asyncio.to_thread(hash_password, secrets.token_urlsafe(32))

    def settings(self, connection: sqlite3.Connection | None = None) -> dict[str, Any]:
        if connection is None:
            with self.connect() as opened:
                return self.settings(opened)
        row = connection.execute("SELECT data FROM settings WHERE id=1").fetchone()
        stored = json.loads(row["data"])
        # Keys retired from DEFAULT_SETTINGS stop being served, even if a row still holds them.
        return {key: stored.get(key, default) for key, default in DEFAULT_SETTINGS.items()}

    def check_origin(self, request: web.Request) -> None:
        require(request.headers.get("Sec-Fetch-Site") != "cross-site", "Запрос с другого сайта запрещён.", 403)
        supplied = request.headers.get("Origin")
        if supplied is None:
            # Non-browser clients still need JSON plus the session's CSRF token.
            return
        expected = self.allowed_origin or origin_of(f"{'https' if self.cookie_secure else request.scheme}://{request.host}")
        try:
            parsed = urlsplit(supplied)
        except ValueError:
            raise APIError(403, "Запрос с другого сайта запрещён.") from None
        require(parsed.path in ("", "/") and not parsed.query and not parsed.fragment
                and origin_of(supplied) == expected, "Запрос с другого сайта запрещён.", 403)

    def rate_limit(self, request: web.Request, scope: str, maximum: int, period: int,
                   identity: str | None = None) -> None:
        # Do not trust client-controlled Forwarded/X-Forwarded-For headers.
        # Contact-based limits pass a normalized identity; only its digest is stored.
        peer = hashlib.sha256((identity if identity is not None else request.remote or "unknown").encode()).hexdigest()
        bucket = int(time.time()) // period
        with self.connect() as connection:
            connection.execute("DELETE FROM rate_limits WHERE scope=? AND bucket < ?", (scope, bucket - 1))
            connection.execute("""INSERT INTO rate_limits(scope,peer,bucket,count) VALUES(?,?,?,1)
                ON CONFLICT(scope,peer,bucket) DO UPDATE SET count=count+1""", (scope, peer, bucket))
            count = connection.execute("SELECT count FROM rate_limits WHERE scope=? AND peer=? AND bucket=?",
                                       (scope, peer, bucket)).fetchone()["count"]
        require(count <= maximum, "Слишком много попыток. Попробуйте позже.", 429)

    def session(self, request: web.Request) -> sqlite3.Row:
        require(bool(self.password_hash), "Вход в кабинет ещё не настроен.", 503)
        token = request.cookies.get(COOKIE_NAME, "")
        require(bool(re.fullmatch(r"[A-Za-z0-9_-]{43}", token)), "Войдите в кабинет.", 401)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        now = time.time()
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM sessions WHERE token_hash=?", (token_hash,)).fetchone()
            require(row is not None and row["expires_at"] > now and row["last_seen"] > now - SESSION_IDLE,
                    "Сессия истекла. Войдите снова.", 401)
            connection.execute("UPDATE sessions SET last_seen=? WHERE token_hash=?", (now, token_hash))
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            csrf = request.headers.get("X-CSRF-Token", "")
            require(hmac.compare_digest(csrf.encode(), row["csrf"].encode()), "Обновите страницу и повторите действие.", 403)
        return row

    def account(self, request: web.Request, required: bool = True, csrf: bool = True) -> sqlite3.Row | None:
        """Resolve the signed-in customer; ``required`` decides whether absence is an error."""
        token = request.cookies.get(ACCOUNT_COOKIE, "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            require(not required, "Войдите в аккаунт.", 401)
            return None
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        now = time.time()
        with self.connect() as connection:
            row = connection.execute("""SELECT s.token_hash, s.csrf, c.id, c.name, c.contact, c.city
                FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
                WHERE s.token_hash=? AND s.expires_at > ? AND s.last_seen > ?""",
                                     (token_hash, now, now - ACCOUNT_SESSION_IDLE)).fetchone()
            if row is None:
                require(not required, "Сессия истекла. Войдите снова.", 401)
                return None
            connection.execute("UPDATE customer_sessions SET last_seen=? WHERE token_hash=?", (now, token_hash))
        if csrf and request.method not in ("GET", "HEAD", "OPTIONS"):
            supplied = request.headers.get("X-CSRF-Token", "")
            require(hmac.compare_digest(supplied.encode(), row["csrf"].encode()),
                    "Обновите страницу и повторите действие.", 403)
        return row

    def open_account_session(self, customer_id: str, payload: dict[str, Any]) -> web.Response:
        token, csrf, now = secrets.token_urlsafe(32), secrets.token_urlsafe(32), time.time()
        with self.connect() as connection:
            connection.execute("DELETE FROM customer_sessions WHERE expires_at <= ? OR last_seen <= ?",
                               (now, now - ACCOUNT_SESSION_IDLE))
            connection.execute("""DELETE FROM customer_sessions WHERE token_hash IN (
                SELECT token_hash FROM customer_sessions WHERE customer_id=?
                ORDER BY created_at DESC LIMIT -1 OFFSET ?)""",
                               (customer_id, ACCOUNT_SESSIONS_PER_CUSTOMER - 1))
            connection.execute("INSERT INTO customer_sessions VALUES(?,?,?,?,?,?)",
                               (hashlib.sha256(token.encode()).hexdigest(), customer_id, csrf,
                                now, now, now + ACCOUNT_SESSION_AGE))
        response = web.json_response({**payload, "csrfToken": csrf})
        response.set_cookie(ACCOUNT_COOKIE, token, httponly=True, secure=self.cookie_secure,
                            samesite="Strict", path="/api", max_age=ACCOUNT_SESSION_AGE)
        return response

    async def matching_password(self, password: str, encoded: str) -> bool:
        async with self.hash_lock:
            return await asyncio.to_thread(verify_password, password, encoded or self.dummy_hash)

    def product(self, data: dict[str, Any], previous: dict[str, Any] | None = None) -> dict[str, Any]:
        require(not (set(data) - PRODUCT_FIELDS - {"id", "updated_at"}), "Неизвестные поля товара.")
        values = {
            "name": "", "description": "", "category": "scooter", "license": "unknown",
            "license_verified": False, "price": None, "stock_status": "preorder", "range_km": None,
            "speed_kmh": None, "power_w": None, "weight_kg": None, "image_url": "", "published": False,
            "featured": False, **(previous or {}), **{key: value for key, value in data.items() if key in PRODUCT_FIELDS},
        }
        for key, maximum in (("name", 160), ("description", 12000), ("image_url", 100)):
            values[key] = text_value(values[key], key, maximum)
        require(values["category"] in PRODUCT_CATEGORIES, "Неизвестная категория товара.")
        require(values["license"] in ("required", "not-required", "unknown"), "Неизвестное требование к правам.")
        require(values["stock_status"] in ("in-stock", "preorder", "out-of-stock"), "Неизвестный статус наличия.")
        for key in ("published", "featured", "license_verified"):
            values[key] = boolean_value(values[key], key)
        require(values["license"] == "unknown" or values["license_verified"],
                "Для указания требований к правам сначала подтвердите проверку документов модели.")
        for key, maximum in (("price", 100_000_000), ("range_km", 3000), ("speed_kmh", 500),
                             ("power_w", 500_000), ("weight_kg", 10_000)):
            values[key] = number_value(values[key], key, maximum)
        if values["price"] is not None:
            price = Decimal(str(values["price"]))
            require(price > 0 and price == price.quantize(Decimal(".01")), "Цена должна быть больше нуля, максимум два знака после запятой.")
        if values["image_url"]:
            filename = values["image_url"].removeprefix("/media/")
            require(values["image_url"].startswith("/media/") and bool(MEDIA_NAME.fullmatch(filename))
                    and (self.uploads / filename).is_file(), "Сначала загрузите изображение через кабинет.")
        if values["published"]:
            require(len(values["name"]) >= 2 and len(values["description"]) >= 10
                    and bool(values["image_url"]) and values["price"] is not None,
                    "Для публикации нужны название, описание (от 10 символов), фотография и цена.")
        values["id"] = previous["id"] if previous else secrets.token_hex(16)
        values["updated_at"] = now_iso()
        return values


STORE_KEY = web.AppKey("store", Store)
ADMIN_SESSION_KEY = web.RequestKey("admin_session", sqlite3.Row)


@web.middleware
async def store_middleware(request: web.Request, handler: Any) -> web.StreamResponse:
    if not request.path.startswith(("/api/", "/media/")):
        return await handler(request)
    try:
        store = request.app[STORE_KEY]
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            store.check_origin(request)
        if request.path.startswith("/api/admin/") and request.path != "/api/admin/login":
            request[ADMIN_SESSION_KEY] = store.session(request)
        response = await handler(request)
    except APIError as error:
        response = web.json_response({"error": str(error)}, status=error.status)
        if error.retry_after is not None or error.status == 429:
            response.headers["Retry-After"] = str(error.retry_after if error.retry_after is not None else 900)
    except web.HTTPException as error:
        response = web.json_response({"error": "Запрос не может быть обработан."}, status=error.status)
    except sqlite3.OperationalError as error:
        busy = getattr(error, "sqlite_errorcode", None) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED)
        busy = busy or "locked" in str(error).lower() or "busy" in str(error).lower()
        LOGGER.warning("Store database is busy" if busy else "Store database operation failed")
        response = web.json_response({"error": "Хранилище занято. Повторите действие через секунду." if busy
                                      else "Хранилище временно недоступно. Повторите позже."}, status=503)
        response.headers["Retry-After"] = "1" if busy else "5"
    except (sqlite3.Error, OSError):
        LOGGER.error("Store storage operation failed")
        response = web.json_response({"error": "Хранилище временно недоступно. Повторите позже."}, status=503)
    except Exception:
        # Never log request bodies, cookies, contact information, or credentials.
        LOGGER.error("Store request failed unexpectedly")
        response = web.json_response({"error": "Не удалось выполнить запрос. Повторите позже."}, status=500)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


def open_admin_session(store: Store, payload: dict[str, Any]) -> web.Response:
    token, csrf, now = secrets.token_urlsafe(32), secrets.token_urlsafe(32), time.time()
    with store.connect() as connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ? OR last_seen <= ?", (now, now - SESSION_IDLE))
        connection.execute("""DELETE FROM sessions WHERE token_hash IN (
            SELECT token_hash FROM sessions ORDER BY created_at DESC LIMIT -1 OFFSET 4)""")
        connection.execute("INSERT INTO sessions VALUES(?,?,?,?,?,?)",
                           (hashlib.sha256(token.encode()).hexdigest(), store.username, csrf, now, now, now + SESSION_AGE))
    response = web.json_response({**payload, "csrfToken": csrf})
    response.set_cookie(COOKIE_NAME, token, httponly=True, secure=store.cookie_secure,
                        samesite="Strict", path="/api/admin", max_age=SESSION_AGE)
    return response


async def owner_password_ok(store: Store, username: str, password: str) -> bool:
    if store.hash_lock.locked():
        raise APIError(429, "Сейчас выполняется вход. Повторите через несколько секунд.", retry_after=2)
    matches = await store.matching_password(password, store.password_hash)
    return matches and hmac.compare_digest(username.encode(), store.username.encode())


async def admin_login(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    require(bool(store.password_hash), "Вход в кабинет ещё не настроен.", 503)
    store.rate_limit(request, "login", 8, 900)
    data = await read_json(request)
    username = text_value(data.get("username"), "Логин", 100, 1)
    password = data.get("password")
    require(isinstance(password, str) and 1 <= len(password) <= 256, "Некорректные данные входа.", 401)
    require(await owner_password_ok(store, username, password), "Неверный логин или пароль.", 401)
    return open_admin_session(store, {"username": store.username})


async def admin_session(request: web.Request) -> web.Response:
    session = request[ADMIN_SESSION_KEY]
    return web.json_response({"csrfToken": session["csrf"], "username": session["username"]})


async def admin_logout(request: web.Request) -> web.Response:
    with request.app[STORE_KEY].connect() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash=?", (request[ADMIN_SESSION_KEY]["token_hash"],))
    response = web.json_response({"ok": True})
    response.del_cookie(COOKIE_NAME, path="/api/admin", secure=request.app[STORE_KEY].cookie_secure,
                        httponly=True, samesite="Strict")
    return response


def account_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {"account": {"name": row["name"], "contact": row["contact"], "city": row["city"]}}


async def account_state(request: web.Request) -> web.Response:
    row = request.app[STORE_KEY].account(request, required=False)
    if row is None:
        return web.json_response({"account": None})
    return web.json_response({**account_payload(row), "csrfToken": row["csrf"]})


async def account_register(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    store.rate_limit(request, "account-register", 5, 3600)
    data = await read_json(request)
    require(not (set(data) - {"name", "contact", "city", "password", "consent"}), "Неизвестные поля регистрации.")
    require(data.get("consent") is True, "Нужно согласие на обработку данных для создания аккаунта.")
    name = text_value(data.get("name"), "Имя", 100, 2)
    contact = text_value(data.get("contact"), "Контакт", 150, 5)
    city = text_value(data.get("city", ""), "Город", 80, 2)
    identity = contact_identity(contact)
    require(bool(identity), "Укажите телефон, email или имя пользователя Telegram.")
    password = data.get("password")
    require(isinstance(password, str) and 12 <= len(password) <= 256, "Пароль: от 12 до 256 символов.")
    store.rate_limit(request, "account-register-contact", 3, 3600, identity=identity)
    if store.hash_lock.locked():
        raise APIError(429, "Сейчас выполняется вход. Повторите через несколько секунд.", retry_after=2)
    async with store.hash_lock:
        encoded = await asyncio.to_thread(hash_password, password)
    customer_id = secrets.token_hex(16)
    with store.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        taken = connection.execute("SELECT 1 FROM customers WHERE identity=?", (identity,)).fetchone()
        require(taken is None, "Аккаунт с таким контактом уже существует. Войдите или используйте другой контакт.", 409)
        connection.execute("INSERT INTO customers(id,identity,contact,name,password_hash,created_at,city) VALUES(?,?,?,?,?,?,?)",
                           (customer_id, identity, contact, name, encoded, now_iso(), city))
    return store.open_account_session(customer_id, {"role": "customer",
                                                    "account": {"name": name, "contact": contact, "city": city}})


async def account_login(request: web.Request) -> web.Response:
    """One door for everyone: the server decides whether these are the shop's credentials."""
    store = request.app[STORE_KEY]
    store.rate_limit(request, "account-login", 12, 900)
    data = await read_json(request)
    require(not (set(data) - {"contact", "password"}), "Неизвестные поля входа.")
    contact = text_value(data.get("contact"), "Логин", 150, 1)
    password = data.get("password")
    require(isinstance(password, str) and 1 <= len(password) <= 256, "Неверный логин или пароль.", 401)
    if store.password_hash and hmac.compare_digest(contact.encode(), store.username.encode()):
        require(await owner_password_ok(store, contact, password), "Неверный логин или пароль.", 401)
        return open_admin_session(store, {"role": "owner", "username": store.username})
    identity = contact_identity(contact)
    with store.connect() as connection:
        row = connection.execute("SELECT id, name, contact, city, password_hash FROM customers WHERE identity=?",
                                 (identity,)).fetchone() if identity else None
    require(await store.matching_password(password, row["password_hash"] if row else ""),
            "Неверный логин или пароль.", 401)
    assert row is not None  # A matching password proves the lookup found an account.
    return store.open_account_session(row["id"], {"role": "customer",
                                                  "account": {"name": row["name"], "contact": row["contact"],
                                                              "city": row["city"]}})


async def account_logout(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    row = store.account(request, required=False)
    if row is not None:
        with store.connect() as connection:
            connection.execute("DELETE FROM customer_sessions WHERE token_hash=?", (row["token_hash"],))
    response = web.json_response({"ok": True})
    response.del_cookie(ACCOUNT_COOKIE, path="/api", secure=store.cookie_secure, httponly=True, samesite="Strict")
    return response


async def account_inquiries(request: web.Request) -> web.Response:
    """Only inquiries sent while signed in: an account never adopts someone else's history."""
    store = request.app[STORE_KEY]
    row = store.account(request)
    with store.connect() as connection:
        rows = connection.execute("""SELECT data FROM inquiries WHERE customer_id=?
            ORDER BY created_at DESC, id LIMIT 100""", (row["id"],)).fetchall()
    inquiries = []
    for stored in rows:
        inquiry = json.loads(stored["data"])
        inquiries.append({key: inquiry.get(key, "") if key == "city" else inquiry[key]
                          for key in ("id", "status", "total", "created_at", "city", "items")})
    return web.json_response({"inquiries": inquiries})


async def list_products(request: web.Request) -> web.Response:
    public = request.path == "/api/products"
    with request.app[STORE_KEY].connect() as connection:
        rows = connection.execute("SELECT data FROM products WHERE published=1 ORDER BY updated_at DESC,id" if public
                                  else "SELECT data FROM products ORDER BY updated_at DESC,id").fetchall()
    products = [json.loads(row["data"]) for row in rows]
    return web.json_response({"products": products})


async def save_product(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    data = await read_json(request)
    with store.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        previous = None
        if request.method == "PUT":
            row = connection.execute("SELECT data FROM products WHERE id=?", (request.match_info["id"],)).fetchone()
            require(row is not None, "Товар не найден.", 404)
            previous = json.loads(row["data"])
        product = store.product(data, previous)
        connection.execute("INSERT OR REPLACE INTO products(id,data,published,updated_at) VALUES(?,?,?,?)",
                           (product["id"], json.dumps(product, ensure_ascii=False), int(product["published"]), product["updated_at"]))
    return web.json_response({"product": product}, status=201 if previous is None else 200)


async def delete_product(request: web.Request) -> web.Response:
    with request.app[STORE_KEY].connect() as connection:
        cursor = connection.execute("DELETE FROM products WHERE id=?", (request.match_info["id"],))
        require(cursor.rowcount == 1, "Товар не найден.", 404)
    # Photos are retained: existing inquiries may contain their immutable snapshots.
    return web.json_response({"ok": True})


def sanitize_image(payload: bytes) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(payload)) as source:
                require(source.format in ("JPEG", "PNG", "WEBP"), "Разрешены только JPEG, PNG и WebP.")
                require(source.width * source.height <= MAX_PIXELS and source.width >= 64 and source.height >= 64,
                        "Фото: минимум 64×64, максимум 20 мегапикселей.")
                require(not getattr(source, "is_animated", False), "Загрузите неподвижную фотографию.")
                source.verify()
            with Image.open(io.BytesIO(payload)) as source:
                corrected = ImageOps.exif_transpose(source)
                corrected.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
                converted = corrected.convert("RGBA" if "A" in corrected.getbands() else "RGB")
                # New image drops EXIF, ICC, comments and other client-supplied metadata.
                clean = Image.new(converted.mode, converted.size)
                clean.paste(converted)
                target = io.BytesIO()
                clean.save(target, "WEBP", quality=86, method=4)
                return target.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError,
            Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise APIError(400, "Файл не является корректной фотографией JPEG, PNG или WebP.") from None


async def upload_image(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    store.rate_limit(request, "upload", 40, 600)
    require(request.content_type == "multipart/form-data", "Ожидается файл фотографии.", 415)
    if request.content_length is not None:
        require(request.content_length <= MAX_UPLOAD + 64 * 1024, "Фото не должно превышать 8 МБ.", 413)
    try:
        reader = await request.multipart()
        field = await reader.next()
        require(field is not None and field.name == "file" and bool(field.filename), "Передайте фотографию в поле file.")
        require(field.headers.get("Content-Transfer-Encoding", "binary").lower() == "binary", "Неподдерживаемая кодировка файла.")
        payload = bytearray()
        while chunk := await field.read_chunk(64 * 1024):
            payload.extend(chunk)
            require(len(payload) <= MAX_UPLOAD, "Фото не должно превышать 8 МБ.", 413)
        # Reject extra fields without consuming attacker-controlled trailing bodies.
        require(await reader.next() is None, "Загружайте по одной фотографии.")
    except (ValueError, AssertionError):
        raise APIError(400, "Некорректный запрос загрузки.") from None
    async with store.image_lock:
        encoded = await asyncio.to_thread(sanitize_image, bytes(payload))
        filename = f"{secrets.token_hex(16)}.webp"
        await asyncio.to_thread((store.uploads / filename).write_bytes, encoded)
    return web.json_response({"image_url": f"/media/{filename}"}, status=201)


async def media(request: web.Request) -> web.StreamResponse:
    filename = request.match_info["filename"]
    require(bool(MEDIA_NAME.fullmatch(filename)), "Изображение не найдено.", 404)
    store = request.app[STORE_KEY]
    path = (store.uploads / filename).resolve()
    require(path.parent == store.uploads and path.is_file(), "Изображение не найдено.", 404)
    return web.FileResponse(path, headers={"Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable"})


async def get_settings(request: web.Request) -> web.Response:
    return web.json_response({"settings": request.app[STORE_KEY].settings()})


def settings_ready(settings: dict[str, Any]) -> bool:
    return bool(settings["legal_name"] and settings["legal_details"]
                and (valid_phone(settings["phone"]) or settings["telegram"]))


async def save_settings(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    data = await read_json(request)
    require(not (set(data) - set(DEFAULT_SETTINGS)), "Неизвестные настройки магазина.")
    settings = store.settings()
    for key, value in data.items():
        if key == "inquiries_enabled":
            settings[key] = boolean_value(value, "Приём заявок")
        else:
            maximum = 8000 if key in ("legal_details", "delivery", "payment", "warranty") else 500
            settings[key] = text_value(value, key, maximum, 1 if key == "shop_name" else 0)
    if settings["phone"]:
        require(valid_phone(settings["phone"]), "Укажите корректный телефон магазина (от 7 до 15 цифр).")
    if settings["telegram"]:
        handle = settings["telegram"].removeprefix("https://t.me/").removeprefix("@").rstrip("/")
        require(bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{4,31}", handle)), "Telegram: укажите @username или ссылку https://t.me/username.")
        settings["telegram"] = f"@{handle}"
    require(not settings["inquiries_enabled"] or settings_ready(settings),
            "Для приёма заявок заполните название продавца, реквизиты и телефон или Telegram.")
    with store.connect() as connection:
        connection.execute("UPDATE settings SET data=? WHERE id=1", (json.dumps(settings, ensure_ascii=False),))
    return web.json_response({"settings": settings})


def inquiry_request_key(request: web.Request, data: dict[str, Any]) -> tuple[str, str] | None:
    supplied = request.headers.get("Idempotency-Key")
    if supplied is None:
        return None
    require(len(request.headers.getall("Idempotency-Key", [])) == 1
            and bool(re.fullmatch(r"[A-Za-z0-9._:-]{16,128}", supplied)),
            "Некорректный идентификатор заявки. Обновите страницу.")
    try:
        canonical = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (ValueError, TypeError):
        raise APIError(400, "Некорректные данные заявки.") from None
    return hashlib.sha256(supplied.encode()).hexdigest(), hashlib.sha256(canonical.encode()).hexdigest()


def replay_inquiry(connection: sqlite3.Connection, key: tuple[str, str] | None) -> web.Response | None:
    if key is None:
        return None
    row = connection.execute("SELECT request_hash,response FROM inquiry_requests WHERE key_hash=?", (key[0],)).fetchone()
    if row is None:
        return None
    require(hmac.compare_digest(row["request_hash"], key[1]),
            "Эта заявка уже отправлена с другими данными. Начните новую заявку.", 409)
    return web.json_response(json.loads(row["response"]), status=201, headers={"Idempotency-Replayed": "true"})


async def create_inquiry(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    data = await read_json(request)
    request_key = inquiry_request_key(request, data)
    if request_key is not None:
        with store.connect() as connection:
            replay = replay_inquiry(connection, request_key)
        if replay is not None:
            return replay
    # Behind BotHost many customers share one proxy IP. Keep a broad peer ceiling
    # and a separate per-contact limit instead of denying the sixth real customer.
    store.rate_limit(request, "inquiry-peer", 60, 600)
    require(not (set(data) - {"name", "contact", "city", "message", "items", "consent"}), "Неизвестные поля заявки.")
    require(data.get("consent") is True, "Нужно согласие на обработку данных для ответа на заявку.")
    name = text_value(data.get("name"), "Имя", 100, 2)
    contact = text_value(data.get("contact"), "Контакт", 150, 5)
    message = text_value(data.get("message", ""), "Комментарий", 3000)
    city = text_value(data.get("city", ""), "Город доставки", 80)
    require(valid_phone(contact) or
            bool(re.fullmatch(r"@?[A-Za-z][A-Za-z0-9_]{4,31}", contact)) or
            bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", contact)),
            "Укажите телефон, email или имя пользователя Telegram.")
    normalized_contact = ("".join(character for character in contact if character.isdigit())
                          if valid_phone(contact)
                          else contact.removeprefix("@").lower())
    store.rate_limit(request, "inquiry-contact", 5, 600, identity=normalized_contact)
    # Linking is a convenience, not a privilege: the middleware already refuses
    # cross-site writes, so a missing CSRF token must not lose a real inquiry.
    customer = store.account(request, required=False, csrf=False)
    requested = data.get("items", [])
    require(isinstance(requested, list) and len(requested) <= 30, "В заявке допускается не больше 30 моделей.")
    require(bool(requested) or len(message) >= 10, "Выберите товар или опишите вопрос (от 10 символов).")
    require(not requested or len(city) >= 2, "Укажите город доставки — магазин отправляет заказы по России.")
    with store.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        # The second check is inside the write transaction: concurrent retries
        # cannot both pass the read-only lookup and create separate inquiries.
        replay = replay_inquiry(connection, request_key)
        if replay is not None:
            return replay
        settings = store.settings(connection)
        require(settings["inquiries_enabled"] and settings_ready(settings),
                "Приём заявок пока не открыт. Контакты магазина доступны в разделе «Контакты».", 503)
        items, seen, total = [], set(), Decimal(0)
        for item in requested:
            require(isinstance(item, dict) and set(item) == {"product_id", "quantity"}, "Некорректная позиция заявки.")
            product_id, quantity = item["product_id"], item["quantity"]
            require(isinstance(product_id, str) and bool(PRODUCT_ID.fullmatch(product_id)) and product_id not in seen,
                    "Некорректная или повторяющаяся модель в заявке.")
            require(type(quantity) is int and 1 <= quantity <= 20, "Количество должно быть от 1 до 20.")
            seen.add(product_id)
            row = connection.execute("SELECT data FROM products WHERE id=? AND published=1", (product_id,)).fetchone()
            require(row is not None, "Один из товаров больше не опубликован. Обновите корзину.", 409)
            product = json.loads(row["data"])
            require(product["stock_status"] != "out-of-stock", "Один из товаров отсутствует. Обновите корзину.", 409)
            total += Decimal(str(product["price"])) * quantity
            items.append({"product_id": product_id, "name": product["name"], "price": product["price"],
                          "quantity": quantity, "image_url": product["image_url"]})
        timestamp = now_iso()
        inquiry = {"id": secrets.token_hex(16), "name": name, "contact": contact, "city": city, "message": message,
                   "items": items, "total": float(total.quantize(Decimal(".01"))), "status": "new",
                   "created_at": timestamp, "updated_at": timestamp, "consent_at": timestamp}
        connection.execute("INSERT INTO inquiries(id,data,status,created_at,updated_at,customer_id) VALUES(?,?,?,?,?,?)",
                           (inquiry["id"], json.dumps(inquiry, ensure_ascii=False), "new", timestamp, timestamp,
                            customer["id"] if customer is not None else None))
        receipt = {"inquiry": {"id": inquiry["id"], "total": inquiry["total"], "status": "new"}}
        if request_key is not None:
            connection.execute("INSERT INTO inquiry_requests(key_hash,request_hash,response,created_at) VALUES(?,?,?,?)",
                               (request_key[0], request_key[1], json.dumps(receipt), time.time()))
    # Do not echo personal data in the public response.
    return web.json_response(receipt, status=201)


async def list_inquiries(request: web.Request) -> web.Response:
    require(not (set(request.query) - {"page", "page_size", "status"}), "Неизвестные параметры списка заявок.")
    for key in ("page", "page_size", "status"):
        require(len(request.query.getall(key, [])) <= 1, "Параметры списка заявок не должны повторяться.")
    page_raw, size_raw = request.query.get("page", "1"), request.query.get("page_size", "50")
    require(bool(re.fullmatch(r"[0-9]{1,7}", page_raw)) and bool(re.fullmatch(r"[0-9]{1,3}", size_raw)),
            "Номер страницы и размер страницы должны быть целыми числами.")
    page, page_size = int(page_raw), int(size_raw)
    require(page >= 1 and 1 <= page_size <= 100, "Номер страницы — от 1, размер страницы — от 1 до 100.")
    status = request.query.get("status", "all")
    require(status in ("all", "new", "contacted", "closed"), "Неизвестный статус заявки.")
    where = "" if status == "all" else " WHERE status=?"
    parameters: tuple[Any, ...] = () if status == "all" else (status,)
    with request.app[STORE_KEY].connect() as connection:
        connection.execute("BEGIN")
        total = connection.execute("SELECT count(*) FROM inquiries" + where, parameters).fetchone()[0]
        rows = connection.execute("SELECT data FROM inquiries" + where +
                                  " ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
                                  (*parameters, page_size, (page - 1) * page_size)).fetchall()
    return web.json_response({"inquiries": [json.loads(row["data"]) for row in rows],
                              "total": total, "page": page, "page_size": page_size,
                              "total_pages": (total + page_size - 1) // page_size})


async def update_inquiry(request: web.Request) -> web.Response:
    data = await read_json(request)
    require(set(data) == {"status"} and data["status"] in ("new", "contacted", "closed"), "Неизвестный статус заявки.")
    with request.app[STORE_KEY].connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT data FROM inquiries WHERE id=?", (request.match_info["id"],)).fetchone()
        require(row is not None, "Заявка не найдена.", 404)
        inquiry = json.loads(row["data"])
        inquiry.update(status=data["status"], updated_at=now_iso())
        connection.execute("UPDATE inquiries SET data=?,status=?,updated_at=? WHERE id=?",
                           (json.dumps(inquiry, ensure_ascii=False), inquiry["status"], inquiry["updated_at"], inquiry["id"]))
    return web.json_response({"inquiry": inquiry})


async def api_not_found(_: web.Request) -> web.Response:
    raise APIError(404, "Метод API не найден.")


def setup_store(app: web.Application) -> None:
    """Install API routes and startup hook before the frontend catchall."""
    store = Store()
    app[STORE_KEY] = store
    app.middlewares.append(store_middleware)
    app.on_startup.append(store.start)
    app.router.add_get("/api/products", list_products)
    app.router.add_get("/api/settings", get_settings)
    app.router.add_post("/api/inquiries", create_inquiry)
    app.router.add_get("/api/account", account_state)
    app.router.add_post("/api/account/register", account_register)
    app.router.add_post("/api/account/login", account_login)
    app.router.add_post("/api/account/logout", account_logout)
    app.router.add_get("/api/account/inquiries", account_inquiries)
    app.router.add_post("/api/admin/login", admin_login)
    app.router.add_get("/api/admin/session", admin_session)
    app.router.add_post("/api/admin/logout", admin_logout)
    app.router.add_get("/api/admin/products", list_products)
    app.router.add_post("/api/admin/products", save_product)
    app.router.add_put("/api/admin/products/{id}", save_product)
    app.router.add_delete("/api/admin/products/{id}", delete_product)
    app.router.add_post("/api/admin/upload", upload_image)
    app.router.add_get("/api/admin/settings", get_settings)
    app.router.add_put("/api/admin/settings", save_settings)
    app.router.add_get("/api/admin/inquiries", list_inquiries)
    app.router.add_patch("/api/admin/inquiries/{id}", update_inquiry)
    app.router.add_get("/media/{filename}", media)
    app.router.add_route("*", "/api/{tail:.*}", api_not_found)
    app.router.add_route("*", "/media/{tail:.*}", api_not_found)
