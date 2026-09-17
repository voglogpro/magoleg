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
import smtplib
import socket
import sqlite3
import ssl
import time
import warnings
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import quote, urlsplit

from aiohttp import ClientError, ClientSession, ClientTimeout, TCPConnector, web
from PIL import Image, ImageOps, UnidentifiedImageError

LOGGER = logging.getLogger("gshop.store")
MAX_JSON = 256 * 1024
MAX_UPLOAD = 8 * 1024 * 1024
# Phone cameras shoot 48-50 MP; the shop should not have to shrink a photo by hand, so the
# ceiling only has to stay under Pillow's decompression-bomb guard. Big files are decoded at a
# reduced scale (draft) and stored downscaled, so memory does not grow with the source photo.
MAX_PIXELS = 80_000_000
SESSION_AGE = 8 * 60 * 60
SESSION_IDLE = 60 * 60
REMEMBER_SESSION_AGE = 14 * 24 * 60 * 60
REMEMBER_SESSION_IDLE = 7 * 24 * 60 * 60
COOKIE_NAME = "gpartner_admin"
# Shoppers return in weeks, not hours: a short owner session would only teach
# them to retype a password on a phone, without protecting the shop's data.
ACCOUNT_COOKIE = "gpartner_account"
ACCOUNT_SESSION_AGE = 60 * 24 * 60 * 60
ACCOUNT_SESSION_IDLE = 30 * 24 * 60 * 60
ACCOUNT_SESSIONS_PER_CUSTOMER = 6
MEDIA_NAME = re.compile(r"[a-f0-9]{32}\.webp\Z")
STATIC_PRODUCT_IMAGE = re.compile(r"/products/kugoo-(?:current|2026|bike-heroes)/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)\Z")
# Версия восстановления входит в ключ вместе с хешем манифеста: правка самой логики
# обязана прогнаться заново, даже когда список товаров не менялся. Иначе карточка,
# записанная прежней версией, навсегда остаётся со старыми путями к фотографиям.
RESTORE_REVISION = "2"
# Поля манифеста поставки, которых нет в карточке товара: они управляют восстановлением.
MANIFEST_ONLY_FIELDS = frozenset({"photo_files", "replace_photos"})
PRODUCT_ID = re.compile(r"[a-f0-9]{32}\Z")
# Домены магазина. Покупатель после оплаты возвращается на тот адрес, который открыл,
# даже если PUBLIC_ORIGIN в хостинге ещё не заполнен.
STORE_HOSTS = ("g-partner.store", "g-partner.ru")
# Идентификаторы витрины Т-Банка для рассрочки и кредита. Это не секреты: банк
# ждёт их в открытом запросе на создание заявки. Секретный пароль терминала
# по-прежнему живёт только в переменных окружения.
TBANK_SHOP_ID = "8879c474-d8e0-4f1b-b7fe-628b5d7f6a07"
TBANK_SHOWCASE_ID = "563f8b7f-91e8-47f3-9776-f18e7d663707"
# У банка два рабочих домена; часть сетей резолвит только один, поэтому пробуем оба
# по очереди. TBANK_API_URL и TBANK_CREDIT_URL_ENV позволяют задать адрес вручную.
TBANK_INIT_URLS = ("https://securepay.tinkoff.ru/v2/Init", "https://securepay.tbank.ru/v2/Init")
TBANK_CREDIT_URLS = ("https://forma.tinkoff.ru/api/partners/v2/orders/create",
                     "https://forma.tbank.ru/api/partners/v2/orders/create")
TBANK_CREDIT_URL = TBANK_CREDIT_URLS[0]
TBANK_TIMEOUT = 20
# Сюда кладут корневые сертификаты, которых нет в системе (например, корень Минцифры).
EXTRA_CA_DIR = Path(os.getenv("EXTRA_CA_DIR", str(Path(__file__).parent / "certs")))
# Официальное API СДЭК v2: серверный прокси даёт список ПВЗ без публичного ключа виджета.
CDEK_API = "https://api.cdek.ru/v2"
CDEK_TIMEOUT = 8
CDEK_POINTS_LIMIT = 30
# Токен живёт около часа; берём запас, чтобы не отправить запрос с истекающим токеном.
CDEK_TOKEN_SKEW = 120
SBP_NOTIFICATION_PATH = "/api/payments/tbank/notification"
CREDIT_NOTIFICATION_PATH = "/api/payments/tbank/credit-notification"
# Статусы заявки на рассрочку: договор подписан — заказ оплачен, отказ — заказ отменён.
# Минимальные суммы платежа: СБП — 10 ₽ по правилам банка, карта принимает и 1 ₽
# (этого хватает для проверочного заказа), рассрочка — порог программы банка.
MIN_SBP_KOPECKS = 1000
MIN_CARD_KOPECKS = 100
DEFAULT_CREDIT_MIN = Decimal("3000")
CREDIT_SIGNED_STATUSES = ("signed", "completed", "issued")
CREDIT_FAILED_STATUSES = ("rejected", "canceled", "cancelled", "expired", "declined")
SCRYPT_N, SCRYPT_R, SCRYPT_P = 32768, 8, 3
DEFAULT_SETTINGS: dict[str, Any] = {
    "shop_name": "G-Partner", "phone": "+7 (988) 414-87-54",
    "telegram": "@GpartnerStore", "telegram_channel": "", "address": "", "hours": "", "delivery": "",
    "payment": "", "legal_name": "", "legal_details": "", "warranty": "",
    "inquiries_enabled": False,
    "delivery_origin": "", "delivery_schedule": "", "return_address": "",
    "privacy_document": "", "consent_document": "", "offer_document": "", "returns_document": "",
    "contacts_document": "",
    # Способы расчёта. "on" публикуется как рабочий, поэтому включается только вместе
    # с реквизитами продавца: покупатель не должен видеть оплату, которой ещё нет.
    "payment_sbp": "on", "payment_card": "on", "payment_dolyame": "off",
    "payment_installment": "on", "payment_credit": "on",
    "payment_invoice": "off", "payment_on_delivery": "off",
    "payment_provider": "Т-Бизнес", "payment_installment_partner": "Т-Банк", "payment_receipt": "",
    # Публичный ключ виджета СДЭК: с ним карта пунктов выдачи открывается прямо в корзине.
    "cdek_widget_key": "",
    # Служебное поле: «on», когда заданы ключи API СДЭК и список пунктов реально работает.
    "cdek_points": "",
}
PAYMENT_STATUS_FIELDS = ("payment_sbp", "payment_card", "payment_dolyame", "payment_installment", "payment_credit", "payment_invoice", "payment_on_delivery")
PAYMENT_STATUSES = ("off", "preparing", "on")
PAYMENT_LABELS = {
    "payment_sbp": "оплаты через СБП", "payment_card": "оплаты картой", "payment_dolyame": "оплаты Долями",
    "payment_installment": "рассрочки", "payment_credit": "кредита",
    "payment_invoice": "счёта для организаций", "payment_on_delivery": "оплаты при получении",
}
PRODUCT_CATEGORIES = ("kick-scooter", "scooter", "e-bike", "atv", "parts", "accessories")
# Shop-picked audiences a shopper can browse by; the owner ticks them per product.
PRODUCT_TAGS = ("waterproof", "heavy-rider", "two-up", "courier", "women", "beginner", "teen")
PRODUCT_BADGES = ("hit", "best-price", "value")
# A card carries a small gallery; the first photo is the cover shown in catalogue listings.
MAX_PHOTOS = 8
ORDER_ACCEPTED_TEXT = (
    "Ваш заказ принят! Сборка и отправка товара со склада производителя занимает до 3 рабочих дней. "
    "Как только посылка будет передана в транспортную службу, в этом заказе появится трек-номер для отслеживания."
)
ORDER_STATUSES = ("new", "awaiting_payment", "paid", "processing", "shipped", "completed",
                  "cancelled", "contacted", "closed")
PRODUCT_FIELDS = {
    "name", "description", "category", "license", "license_verified", "price", "old_price",
    "stock_status", "range_km", "speed_kmh", "power_w", "weight_kg", "cargo_l",
    "payload_kg", "drive",
    "image_url", "images", "published", "featured", "tags", "badge",
}
# «required» и «not-required» остаются от прежних карточек: категорию прав владелец уточняет сам.
PRODUCT_LICENSES = ("a", "m", "not-required", "required", "unknown")
# Мощность указывается на один мотор; полный привод удваивает её в характеристиках.
PRODUCT_DRIVES = ("single", "dual", "unknown")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def catalog_product_key(value: str) -> str:
    """Match owner-entered model names despite case, punctuation and Latin/Cyrillic C."""
    normalized = value.casefold().replace("ё", "е").replace("с", "c")
    return re.sub(r"[^a-zа-я0-9]+", "", normalized)


# Покупателю хватает восьми символов (нижняя граница OWASP); вход в кабинет
# владельца по-прежнему требует длинного пароля — см. OWNER_PASSWORD_MIN.
CUSTOMER_PASSWORD_MIN = 8
OWNER_PASSWORD_MIN = 12


def hash_password(password: str) -> str:
    """Generate an OWASP-listed scrypt hash, with a random 128-bit salt."""
    if not isinstance(password, str) or not CUSTOMER_PASSWORD_MIN <= len(password) <= 256:
        raise ValueError(f"Password must contain {CUSTOMER_PASSWORD_MIN} to 256 characters")
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
    def __init__(self, status: int, message: str, retry_after: int | None = None, detail: str = ""):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after
        # Техническая причина от банка: показывается только владельцу в проверке оплаты.
        self.detail = detail


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


def _payment_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def tbank_token(payload: dict[str, Any], password: str) -> str:
    """T-Bank signs primitive root fields only; nested Receipt/DATA never enter the token."""
    signed = {key: value for key, value in payload.items()
              if key != "Token" and value is not None and not isinstance(value, (dict, list))}
    signed["Password"] = password
    source = "".join(_payment_value(signed[key]) for key in sorted(signed))
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _payment_configured() -> bool:
    return bool(os.getenv("TBANK_TERMINAL_KEY", "").strip() and os.getenv("TBANK_PASSWORD", "").strip())


def _credit_configured() -> bool:
    return bool(tbank_shop_id() and tbank_showcase_id())


def tbank_shop_id() -> str:
    """Пустая переменная хостинга не отключает рассрочку: остаются идентификаторы из кода."""
    return os.getenv("TBANK_SHOP_ID", "").strip() or TBANK_SHOP_ID


def tbank_showcase_id() -> str:
    return os.getenv("TBANK_SHOWCASE_ID", "").strip() or TBANK_SHOWCASE_ID


# HTTPS_PROXY/HTTP_PROXY из переменных окружения учитываются (trust_env): часть
# хостингов выпускает исходящие соединения только через прокси.
def outbound_urls(variable: str, defaults: tuple[str, ...]) -> tuple[str, ...]:
    """Адрес из переменной хостинга важнее наших умолчаний."""
    override = os.getenv(variable, "").strip()
    return (override,) if override.startswith("https://") else defaults


def extra_ca_paths() -> list[Path]:
    """Дополнительные корневые сертификаты: у Т-Банка они выпущены Минцифры."""
    paths = []
    configured = os.getenv("EXTRA_CA_BUNDLE", "").strip()
    if configured:
        paths.append(Path(configured))
    paths.extend(sorted(EXTRA_CA_DIR.glob("*.pem")) + sorted(EXTRA_CA_DIR.glob("*.crt")))
    return [path for path in paths if path.is_file()]


def outbound_ssl() -> ssl.SSLContext | None:
    """Системные корни плюс наши: без корня Минцифры TLS до банка не проходит."""
    inline = os.getenv("EXTRA_CA_PEM", "").strip()
    paths = extra_ca_paths()
    if not inline and not paths:
        return None
    context = ssl.create_default_context()
    for path in paths:
        try:
            context.load_verify_locations(cafile=str(path))
        except (OSError, ssl.SSLError):
            LOGGER.warning("Extra CA bundle is unusable: %s", path.name)
    if inline:
        try:
            context.load_verify_locations(cadata=inline)
        except (TypeError, ValueError, ssl.SSLError):
            LOGGER.warning("EXTRA_CA_PEM is not a valid PEM certificate")
    return context


@asynccontextmanager
async def outbound_session(total: float = TBANK_TIMEOUT):
    """Исходящий запрос: прокси из окружения, IPv4 и доверенные корни хостинга."""
    ipv6 = os.getenv("OUTBOUND_IPV6", "").strip().lower() in ("1", "true", "yes", "on")
    context = outbound_ssl()
    options: dict[str, Any] = {} if ipv6 else {"family": socket.AF_INET}
    if context is not None:
        options["ssl"] = context
    connector = TCPConnector(**options) if options else None
    try:
        async with ClientSession(timeout=ClientTimeout(total=total), trust_env=True,
                                 connector=connector) as client:
            yield client
    finally:
        if connector is not None and not connector.closed:
            await connector.close()


async def bank_request(urls: tuple[str, ...], payload: dict[str, Any], message: str) -> tuple[int, Any]:
    """Запрос к банку по всем известным адресам: ответ первого, который отозвался."""
    failure = ""
    for url in urls:
        try:
            async with outbound_session() as client:
                async with client.post(url, json=payload) as response:
                    return response.status, await response.json(content_type=None)
        except (ClientError, OSError, asyncio.TimeoutError, ValueError) as error:
            # Это не отказ банка, а недоступная сеть: DNS, блокировка исходящих или TLS.
            failure = f"{urlsplit(url).hostname} — {network_error(error)}"
            LOGGER.warning("T-Bank unreachable at %s", failure)
    raise APIError(502, message, detail=failure)


def network_error(error: BaseException) -> str:
    """Класс и текст сетевой ошибки: по ним видно, что это — DNS, блокировка или TLS."""
    text = str(error).strip()
    if isinstance(error, asyncio.TimeoutError) and not text:
        text = "истекло время ожидания ответа"
    return f"{type(error).__name__}: {text}"[:400]


def bank_error(status: int, result: Any) -> str:
    """Короткая причина отказа банка для журнала и для проверки оплаты владельцем."""
    if not isinstance(result, dict):
        return f"HTTP {status}: банк вернул неожиданный ответ."
    parts = [str(result.get(key, "")).strip() for key in ("ErrorCode", "Message", "Details", "message", "errorMessage")]
    text = " ".join(part for part in parts if part and part != "0")
    return (text or f"HTTP {status}: банк отклонил запрос.")[:400]


def payment_return_urls(origin: str, order_id: str, webhook_path: str) -> dict[str, str]:
    """Ссылки, которые получает банк: успех, отказ и серверное уведомление."""
    urls = {
        "success": f"{origin}/#order-success?order={order_id}",
        "fail": f"{origin}/#cart?payment=failed&order={order_id}",
        "webhook": f"{origin}{webhook_path}",
    }
    secret = os.getenv("TBANK_CREDIT_WEBHOOK_SECRET", "").strip()
    if secret and webhook_path == CREDIT_NOTIFICATION_PATH:
        urls["webhook"] = f"{urls['webhook']}?key={quote(secret, safe='')}"
    return urls


async def init_tbank_payment(inquiry: dict[str, Any], origin: str) -> dict[str, str]:
    terminal = os.getenv("TBANK_TERMINAL_KEY", "").strip()
    password = os.getenv("TBANK_PASSWORD", "").strip()
    require(terminal and password, "Онлайн-оплата ещё не настроена магазином.", 503)
    amount = int((Decimal(str(inquiry["total"])) * 100).quantize(Decimal("1")))
    if inquiry["payment_method"] == "card":
        require(amount >= MIN_CARD_KOPECKS, "Минимальная сумма оплаты картой — 1 рубль.")
    else:
        require(amount >= MIN_SBP_KOPECKS, "Минимальная сумма оплаты через СБП — 10 рублей.")
    urls = payment_return_urls(origin, inquiry["id"], SBP_NOTIFICATION_PATH)
    payload: dict[str, Any] = {
        "TerminalKey": terminal,
        "Amount": amount,
        "OrderId": inquiry["id"],
        "Description": f"Заказ G-Partner №{inquiry['id'][:8]}",
        "PayType": "O",
        "Language": "ru",
        "NotificationURL": urls["webhook"],
        "SuccessURL": urls["success"],
        "FailURL": urls["fail"],
    }
    taxation = os.getenv("TBANK_TAXATION", "").strip()
    if taxation:
        tax = os.getenv("TBANK_ITEM_TAX", "none").strip() or "none"
        receipt: dict[str, Any] = {
            "Taxation": taxation,
            "Items": [{
                "Name": item["name"][:128],
                "Price": int((Decimal(str(item["price"])) * 100).quantize(Decimal("1"))),
                "Quantity": item["quantity"],
                "Amount": int((Decimal(str(item["price"])) * item["quantity"] * 100).quantize(Decimal("1"))),
                "PaymentMethod": "full_prepayment",
                "PaymentObject": "commodity",
                "Tax": tax,
            } for item in inquiry["items"]],
        }
        if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", inquiry["contact"]):
            receipt["Email"] = inquiry["contact"]
        elif valid_phone(inquiry["contact"]):
            receipt["Phone"] = inquiry["contact"]
        payload["Receipt"] = receipt
    payload["Token"] = tbank_token(payload, password)
    status, result = await bank_request(outbound_urls("TBANK_API_URL", TBANK_INIT_URLS), payload,
                                        "Т-Банк временно не ответил. Повторите оплату через несколько минут.")
    payment_url = result.get("PaymentURL") if isinstance(result, dict) else None
    payment_ok = (isinstance(result, dict) and result.get("Success") is True
                  and isinstance(payment_url, str) and payment_url.startswith("https://")
                  and origin_of(payment_url) is not None)
    if not (status == 200 and payment_ok):
        LOGGER.warning("T-Bank Init rejected order %s: %s", inquiry["id"][:8], bank_error(status, result))
        raise APIError(502, "Т-Банк не смог создать оплату. Повторите попытку или свяжитесь с магазином.",
                       detail=bank_error(status, result))
    return {"payment_id": str(result.get("PaymentId", "")), "payment_url": payment_url}


async def init_tbank_credit(inquiry: dict[str, Any], origin: str) -> dict[str, str]:
    """Заявка на рассрочку или кредит Т-Банка: покупатель заполняет форму банка и возвращается к нам."""
    shop, showcase = tbank_shop_id(), tbank_showcase_id()
    require(bool(shop and showcase), "Рассрочка ещё не настроена магазином.", 503)
    total = Decimal(str(inquiry["total"])).quantize(Decimal(".01"))
    minimum = DEFAULT_CREDIT_MIN
    configured = os.getenv("TBANK_CREDIT_MIN", "").strip()
    if re.fullmatch(r"[0-9]{1,9}([.,][0-9]{1,2})?", configured or ""):
        minimum = Decimal(configured.replace(",", "."))
    require(total >= minimum,
            f"Рассрочка и кредит доступны для заказов от {minimum:.0f} ₽. "
            "Для меньшей суммы выберите оплату картой или через СБП.")
    urls = payment_return_urls(origin, inquiry["id"], CREDIT_NOTIFICATION_PATH)
    payload: dict[str, Any] = {
        "shopId": shop,
        "showcaseId": showcase,
        "sum": float(total),
        "orderNumber": inquiry["id"],
        "description": f"Заказ G-Partner №{inquiry['id'][:8]}",
        "items": [{
            "name": item["name"][:128],
            "price": float(Decimal(str(item["price"])).quantize(Decimal(".01"))),
            "quantity": item["quantity"],
        } for item in inquiry["items"]],
        "successURL": urls["success"],
        "failURL": urls["fail"],
        "webhookURL": urls["webhook"],
    }
    promo = os.getenv("TBANK_CREDIT_PROMO" if inquiry["payment_method"] == "credit"
                      else "TBANK_INSTALLMENT_PROMO", "").strip()
    if promo:
        payload["promoCode"] = promo
    values: dict[str, Any] = {"contact": {"fio": {"lastName": inquiry["name"][:64]}}}
    if valid_phone(inquiry["contact"]):
        values["contact"]["mobilePhone"] = "+" + "".join(c for c in inquiry["contact"] if c.isdigit())
    elif re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", inquiry["contact"]):
        values["contact"]["email"] = inquiry["contact"]
    payload["values"] = values
    status, result = await bank_request(outbound_urls("TBANK_CREDIT_API_URL", TBANK_CREDIT_URLS), payload,
                                        "Т-Банк временно не ответил. Повторите оформление через несколько минут.")
    link = result.get("link") if isinstance(result, dict) else None
    if not (status < 400 and isinstance(link, str) and link.startswith("https://")
            and origin_of(link) is not None):
        LOGGER.warning("T-Bank credit rejected order %s: %s", inquiry["id"][:8], bank_error(status, result))
        raise APIError(502, "Т-Банк не смог открыть заявку на рассрочку. Повторите попытку или свяжитесь с магазином.",
                       detail=bank_error(status, result))
    return {"payment_id": str(result.get("id", "")), "payment_url": link}


# Токен СДЭК кэшируется в памяти процесса: секреты не логируются и наружу не отдаются.
_CDEK_TOKEN: dict[str, Any] = {"value": "", "expires": 0.0}
_CDEK_TOKEN_LOCK = asyncio.Lock()


def cdek_credentials() -> tuple[str, str]:
    return os.getenv("CDEK_CLIENT_ID", "").strip(), os.getenv("CDEK_CLIENT_SECRET", "").strip()


async def cdek_token(client: ClientSession) -> str:
    """client_credentials по документации СДЭК; повторные запросы берут токен из кэша."""
    client_id, client_secret = cdek_credentials()
    async with _CDEK_TOKEN_LOCK:
        if _CDEK_TOKEN["value"] and _CDEK_TOKEN["expires"] > time.time():
            return str(_CDEK_TOKEN["value"])
        async with client.post(f"{CDEK_API}/oauth/token?parameters", data={
            "grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret,
        }) as response:
            result = await response.json(content_type=None)
        token = result.get("access_token") if isinstance(result, dict) else None
        if response.status != 200 or not isinstance(token, str) or not token:
            LOGGER.warning("CDEK token rejected: HTTP %s", response.status)
            return ""
        lifetime = result.get("expires_in")
        lifetime = int(lifetime) if isinstance(lifetime, (int, float, str)) and str(lifetime).isdigit() else 3600
        _CDEK_TOKEN["value"] = token
        _CDEK_TOKEN["expires"] = time.time() + max(lifetime - CDEK_TOKEN_SKEW, 60)
        return token


def cdek_point(office: Any) -> dict[str, Any] | None:
    """Оставляем покупателю только понятные поля: код, адрес, часы работы и ориентир."""
    if not isinstance(office, dict):
        return None
    code = str(office.get("code") or "").strip()
    location = office.get("location") if isinstance(office.get("location"), dict) else {}
    address = str(location.get("address_full") or location.get("address") or "").strip()
    if not code or not address:
        return None
    point: dict[str, Any] = {
        "code": code,
        "name": str(office.get("name") or "").strip()[:160],
        "address": address[:240],
        "city": str(location.get("city") or "").strip()[:120],
        "work_time": str(office.get("work_time") or "").strip()[:160],
        "note": str(office.get("note") or "").strip()[:200],
        "nearest_station": str(office.get("nearest_station") or "").strip()[:160],
    }
    for source, target in (("latitude", "latitude"), ("longitude", "longitude")):
        value = location.get(source)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            point[target] = float(value)
    return point


async def cdek_offices(city: str) -> tuple[list[dict[str, Any]], str]:
    """Возвращает пункты выдачи и человеческую причину отказа: заказ из-за СДЭК не падает."""
    client_id, client_secret = cdek_credentials()
    if not (client_id and client_secret):
        return [], "Список пунктов выдачи пока не подключён — укажите код или адрес ПВЗ вручную."
    params = {"city": city, "type": "PVZ", "country_code": "RU", "is_handout": "true", "size": "200"}
    try:
        async with outbound_session(CDEK_TIMEOUT) as client:
            token = await cdek_token(client)
            if not token:
                return [], "СДЭК не отвечает. Укажите код или адрес пункта выдачи вручную."
            async with client.get(f"{CDEK_API}/deliverypoints", params=params,
                                  headers={"Authorization": f"Bearer {token}"}) as response:
                result = await response.json(content_type=None)
    except (ClientError, OSError, asyncio.TimeoutError, ValueError) as error:
        LOGGER.warning("CDEK deliverypoints failed: %s", type(error).__name__)
        return [], "СДЭК не отвечает. Укажите код или адрес пункта выдачи вручную."
    if response.status != 200 or not isinstance(result, list):
        LOGGER.warning("CDEK deliverypoints rejected: HTTP %s", response.status)
        return [], "СДЭК не отвечает. Укажите код или адрес пункта выдачи вручную."
    points = [point for point in (cdek_point(office) for office in result) if point]
    if not points:
        return [], "В этом городе пунктов выдачи СДЭК не нашлось — проверьте название города."
    return points, ""


def _send_email(contact: str, subject: str, text: str) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM", "").strip()
    if not host or not sender:
        return
    port = int(os.getenv("SMTP_PORT", "465"))
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = sender, contact, subject
    message.set_content(text)
    factory = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP
    with factory(host, port, timeout=10) as server:
        if port != 465 and os.getenv("SMTP_STARTTLS", "true").lower() not in ("0", "false"):
            server.starttls()
        username, password = os.getenv("SMTP_USERNAME", ""), os.getenv("SMTP_PASSWORD", "")
        if username:
            server.login(username, password)
        server.send_message(message)


async def notify_customer(inquiry: dict[str, Any], subject: str, text: str) -> None:
    contact = inquiry.get("contact", "")
    try:
        if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", contact):
            await asyncio.to_thread(_send_email, contact, subject, text)
        elif valid_phone(contact) and os.getenv("SMS_WEBHOOK_URL", "").strip():
            phone = "+" + "".join(character for character in contact if character.isdigit())
            async with ClientSession(timeout=ClientTimeout(total=8), trust_env=True) as client:
                async with client.post(os.environ["SMS_WEBHOOK_URL"], json={"to": phone, "text": text}) as response:
                    if response.status >= 400:
                        LOGGER.warning("SMS webhook returned %s", response.status)
    except (ClientError, OSError, ValueError, smtplib.SMTPException, asyncio.TimeoutError) as error:
        LOGGER.warning("Customer notification failed for order %s: %s", inquiry.get("id", ""), type(error).__name__)


def queue_customer_notification(inquiry: dict[str, Any], subject: str, text: str) -> None:
    task = asyncio.create_task(notify_customer(inquiry, subject, text))
    task.add_done_callback(lambda finished: finished.exception() if not finished.cancelled() else None)


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


def split_origins(raw: str) -> list[str]:
    """Принимает список адресов через запятую: магазин живёт на нескольких доменах."""
    origins: list[str] = []
    for chunk in raw.replace(";", ",").split(","):
        origin = origin_of(chunk.strip())
        if origin is None:
            continue
        # Банк возвращает покупателя только на https: http в настройке — опечатка,
        # из-за которой ломаются уведомления. Локальная разработка не трогается.
        parsed = urlsplit(origin)
        if parsed.scheme == "http" and not local_host(parsed.hostname or ""):
            origin = f"https://{parsed.netloc}"
        if origin not in origins:
            origins.append(origin)
    return origins


def local_host(host: str) -> bool:
    return host.lower() in ("localhost", "127.0.0.1", "::1", "[::1]")


def configured_origins() -> list[str]:
    return split_origins(f"{os.getenv('PUBLIC_ORIGIN', '')},{os.getenv('MINI_APP_URL', '')}")


def known_store_host(host: str) -> bool:
    """Свой домен магазина (или локальная разработка), которому можно вернуть покупателя."""
    host = host.lower().removeprefix("www.")
    return host in STORE_HOSTS or local_host(host)


def request_origin(request: web.Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower()
    scheme = forwarded if forwarded in ("http", "https") else request.scheme
    return origin_of(f"{scheme}://{request.host}")


def return_origin(request: web.Request) -> str | None:
    """Адрес, на который банк вернёт покупателя: тот же домен, который он открыл.

    Host из запроса принимается только для собственных доменов магазина, поэтому
    подменённый заголовок не может увести уведомление банка на чужой сайт.
    """
    origins = configured_origins()
    current = request_origin(request)
    if current is not None and (current in origins or known_store_host(urlsplit(current).hostname or "")):
        return current
    return origins[0] if origins else None


class Store:
    def __init__(self) -> None:
        self.directory = Path(os.getenv("DATA_DIR", str(Path(__file__).parent / "data"))).resolve()
        self.uploads = self.directory / "uploads"
        self.database = self.directory / "store.sqlite3"
        self.username = os.getenv("ADMIN_USERNAME", "megaolegshop2000")
        self.password_hash = ""
        self.cookie_secure = os.getenv("COOKIE_SECURE", "true").lower() not in ("false", "0")
        # Магазин открыт на нескольких доменах, поэтому PUBLIC_ORIGIN принимает список
        # адресов через запятую; пустое значение оставляет прежнюю проверку по Host.
        self.allowed_origins = configured_origins()
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
                    created_at REAL NOT NULL, last_seen REAL NOT NULL, expires_at REAL NOT NULL,
                    remembered INTEGER NOT NULL DEFAULT 1
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
            # Отметка «оставаться в системе» появилась позже самих сессий. Прежние сессии
            # покупатель открывал этой отметкой по умолчанию, поэтому им ставим её же.
            if "remembered" not in {row["name"] for row in connection.execute("PRAGMA table_info(customer_sessions)")}:
                connection.execute("ALTER TABLE customer_sessions ADD COLUMN remembered INTEGER NOT NULL DEFAULT 1")
            connection.execute("CREATE INDEX IF NOT EXISTS inquiries_customer ON inquiries(customer_id, created_at)")
            connection.execute("INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)",
                               (json.dumps(DEFAULT_SETTINGS, ensure_ascii=False),))
            # One-time launch migration: fill only values that the owner has not
            # already configured. Later CRM changes remain authoritative.
            launch_key = "launch-contacts-payments-2026-09-13"
            if connection.execute("SELECT 1 FROM meta WHERE key=?", (launch_key,)).fetchone() is None:
                row = connection.execute("SELECT data FROM settings WHERE id=1").fetchone()
                launch = json.loads(row["data"])
                for key, value in {
                    "phone": "+7 (988) 414-87-54", "telegram": "@GpartnerStore",
                    "payment_provider": "Т-Бизнес", "payment_installment_partner": "Т-Банк",
                }.items():
                    if not launch.get(key):
                        launch[key] = value
                for key in ("payment_dolyame", "payment_installment", "payment_credit"):
                    if launch.get(key, "off") == "off":
                        launch[key] = "preparing"
                connection.execute("UPDATE settings SET data=? WHERE id=1", (json.dumps(launch, ensure_ascii=False),))
                connection.execute("INSERT INTO meta(key,value) VALUES(?,?)", (launch_key, now_iso()))
            # Банковская карта больше не предлагается: расчёт принимается через СБП,
            # Долями, рассрочку или кредит. Миграция исправляет и уже настроенные базы.
            no_card_key = "disable-card-payments-2026-09-13"
            if connection.execute("SELECT 1 FROM meta WHERE key=?", (no_card_key,)).fetchone() is None:
                row = connection.execute("SELECT data FROM settings WHERE id=1").fetchone()
                payment_settings = json.loads(row["data"])
                payment_settings["payment_card"] = "off"
                connection.execute("UPDATE settings SET data=? WHERE id=1", (json.dumps(payment_settings, ensure_ascii=False),))
                connection.execute("INSERT INTO meta(key,value) VALUES(?,?)", (no_card_key, now_iso()))
            # Карта, рассрочка и кредит Т-Банка включены: оплата проходит через
            # подключённый терминал и витрину банка. Владелец может отключить любой
            # способ в CRM — миграция срабатывает один раз.
            tbank_key = "enable-tbank-card-and-credit-2026-09-17"
            if connection.execute("SELECT 1 FROM meta WHERE key=?", (tbank_key,)).fetchone() is None:
                row = connection.execute("SELECT data FROM settings WHERE id=1").fetchone()
                payment_settings = json.loads(row["data"])
                for key in ("payment_card", "payment_installment", "payment_credit"):
                    payment_settings[key] = "on"
                connection.execute("UPDATE settings SET data=? WHERE id=1", (json.dumps(payment_settings, ensure_ascii=False),))
                connection.execute("INSERT INTO meta(key,value) VALUES(?,?)", (tbank_key, now_iso()))
            # «Долями» временно выключено по всему сайту. Поле настройки остаётся в
            # схеме, чтобы позднее включить его только для корзин дешевле 30 000 ₽.
            no_dolyame_key = "disable-dolyame-2026-09-14"
            if connection.execute("SELECT 1 FROM meta WHERE key=?", (no_dolyame_key,)).fetchone() is None:
                row = connection.execute("SELECT data FROM settings WHERE id=1").fetchone()
                payment_settings = json.loads(row["data"])
                payment_settings["payment_dolyame"] = "off"
                connection.execute("UPDATE settings SET data=? WHERE id=1", (json.dumps(payment_settings, ensure_ascii=False),))
                connection.execute("INSERT INTO meta(key,value) VALUES(?,?)", (no_dolyame_key, now_iso()))
            self.restore_catalog(connection)
            self.restore_catalog(
                connection,
                Path(__file__).with_name("catalog-kugoo-bikes-2026.json"),
                version_key="catalog-kugoo-bikes-2026-version",
            )
        if os.name != "nt":
            self.database.chmod(0o600)
        encoded = os.getenv("ADMIN_PASSWORD_HASH", "")
        if encoded:
            _parse_hash(encoded)  # Fail closed on an invalid operator configuration.
            self.password_hash = encoded
        elif os.getenv("ADMIN_PASSWORD"):
            # Кабинет владельца открывает весь магазин: короткий пароль сюда не пускаем.
            if len(os.environ["ADMIN_PASSWORD"]) < OWNER_PASSWORD_MIN:
                raise ValueError(f"ADMIN_PASSWORD must contain at least {OWNER_PASSWORD_MIN} characters")
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

    def restore_catalog(self, connection: sqlite3.Connection, manifest: Path | None = None,
                        *, version_key: str = "catalog-kugoo-current-version") -> None:
        """Restore the versioned public catalogue after a BotHost database loss.

        This deliberately makes new researched models *preorder* cards. Existing cards keep
        their owner-managed stock, publication state and uploaded gallery.
        """
        manifest = manifest or Path(__file__).with_name("catalog-kugoo-current.json")
        if not manifest.is_file():
            return
        raw = manifest.read_bytes()
        version = f"{hashlib.sha256(raw).hexdigest()}:{RESTORE_REVISION}"
        key = version_key
        seen = connection.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        if seen and seen["value"] == version:
            return
        try:
            cards = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            LOGGER.error("Current catalogue manifest is invalid; restoration skipped.")
            return
        if not isinstance(cards, list):
            LOGGER.error("Current catalogue manifest must contain a list; restoration skipped.")
            return
        for source in cards:
            if not isinstance(source, dict) or not isinstance(source.get("name"), str):
                LOGGER.error("Current catalogue contains an invalid product; restoration skipped.")
                return
        for source in cards:
            name = source["name"]
            expected = catalog_product_key(name)
            matches = [row for row in connection.execute("SELECT id,data FROM products").fetchall()
                       if catalog_product_key(json.loads(row["data"]).get("name", "")) == expected]
            if len(matches) > 1:
                LOGGER.warning("Catalogue restoration skipped duplicate product: %s", name)
                continue
            card = {key: value for key, value in source.items() if key not in MANIFEST_ONLY_FIELDS}
            files = source.get("photo_files", [])
            images = [value.removeprefix("../apps/mini-app/public") for value in files if isinstance(value, str)]
            if not all(STATIC_PRODUCT_IMAGE.fullmatch(value) for value in images):
                LOGGER.warning("Catalogue restoration skipped invalid static image path: %s", name)
                continue
            if matches:
                # Data research may age, operational owner choices must not be overwritten.
                previous = json.loads(matches[0]["data"])
                card.pop("published", None)
                card.pop("stock_status", None)
                card.pop("image_url", None)
                # Фотографии поставки переезжают вместе с манифестом: иначе переименованный
                # файл оставляет в карточке битую ссылку. Снимки, загруженные владельцем
                # через CRM, остаются нетронутыми — они лежат в /media и здесь не совпадут.
                # Флаг replace_photos — отдельная просьба владельца пересобрать галерею модели
                # (например, заменить фон на фирменную сцену); он снимается сразу после выкладки.
                stored = previous.get("images") or []
                own = bool(stored) and all(STATIC_PRODUCT_IMAGE.fullmatch(value) for value in stored)
                if images and (own or source.get("replace_photos")):
                    card.update(images=images, image_url=images[0])
                product = self.product(card, previous)
                connection.execute("UPDATE products SET data=?,published=?,updated_at=? WHERE id=?",
                                   (json.dumps(product, ensure_ascii=False), int(product["published"]),
                                    product["updated_at"], product["id"]))
            else:
                card.update(images=images, image_url=images[0] if images else "", published=True,
                            stock_status="preorder")
                product = self.product(card)
                connection.execute("INSERT INTO products(id,data,published,updated_at) VALUES(?,?,?,?)",
                                   (product["id"], json.dumps(product, ensure_ascii=False), 1, product["updated_at"]))
        connection.execute("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", (key, version))

    def settings(self, connection: sqlite3.Connection | None = None) -> dict[str, Any]:
        if connection is None:
            with self.connect() as opened:
                return self.settings(opened)
        row = connection.execute("SELECT data FROM settings WHERE id=1").fetchone()
        stored = json.loads(row["data"])
        # Keys retired from DEFAULT_SETTINGS stop being served, even if a row still holds them.
        settings = {key: stored.get(key, default) for key, default in DEFAULT_SETTINGS.items()}
        # Ключ виджета можно задать и переменной хостинга: витрина берёт его, пока поле CRM пусто.
        settings["cdek_widget_key"] = settings["cdek_widget_key"] or os.getenv("CDEK_WIDGET_API_KEY", "").strip()
        # Витрина не предлагает список пунктов, пока у магазина нет ключей API СДЭК:
        # кнопка, которая всё равно ничего не покажет, хуже её отсутствия.
        settings["cdek_points"] = "on" if all(cdek_credentials()) else ""
        return settings

    @staticmethod
    def _public_product(row: sqlite3.Row) -> dict[str, Any]:
        """Return a catalogue card with defaults used by every public surface."""
        product = {
            "tags": [], "badge": "", "old_price": None, "cargo_l": None, "payload_kg": None,
            "drive": "unknown", **json.loads(row["data"]),
        }
        # Cards saved before galleries existed carry their single photo as a
        # one-photo gallery. Keep API, HTML pages and feeds on the same shape.
        product.setdefault(
            "images", [product["image_url"]] if product.get("image_url") else []
        )
        return product

    def public_products(
        self, connection: sqlite3.Connection | None = None
    ) -> list[dict[str, Any]]:
        """Return all published products in the storefront's normal order."""
        if connection is None:
            with self.connect() as opened:
                return self.public_products(opened)
        rows = connection.execute(
            "SELECT data FROM products WHERE published=1 ORDER BY updated_at DESC,id"
        ).fetchall()
        return [self._public_product(row) for row in rows]

    def public_product(
        self, product_id: str, connection: sqlite3.Connection | None = None
    ) -> dict[str, Any] | None:
        """Return one published product, never exposing an unpublished card."""
        if connection is None:
            with self.connect() as opened:
                return self.public_product(product_id, opened)
        row = connection.execute(
            "SELECT data FROM products WHERE id=? AND published=1", (product_id,)
        ).fetchone()
        return self._public_product(row) if row else None

    def check_origin(self, request: web.Request) -> None:
        require(request.headers.get("Sec-Fetch-Site") != "cross-site", "Запрос с другого сайта запрещён.", 403)
        supplied = request.headers.get("Origin")
        if supplied is None:
            # Non-browser clients still need JSON plus the session's CSRF token.
            return
        expected = self.allowed_origins or [
            origin for origin in [origin_of(f"{'https' if self.cookie_secure else request.scheme}://{request.host}")]
            if origin is not None]
        try:
            parsed = urlsplit(supplied)
        except ValueError:
            raise APIError(403, "Запрос с другого сайта запрещён.") from None
        require(parsed.path in ("", "/") and not parsed.query and not parsed.fragment
                and origin_of(supplied) in expected, "Запрос с другого сайта запрещён.", 403)

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
            # Duration is server-issued and persisted, so old short sessions keep their policy.
            idle = REMEMBER_SESSION_IDLE if row and row["expires_at"] - row["created_at"] > SESSION_AGE + 1 else SESSION_IDLE
            require(row is not None and row["expires_at"] > now and row["last_seen"] > now - idle,
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
            row = connection.execute("""SELECT s.token_hash, s.csrf, s.remembered, c.id, c.name, c.contact, c.city
                FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
                WHERE s.token_hash=? AND s.expires_at > ? AND s.last_seen > ?""",
                                     (token_hash, now, now - ACCOUNT_SESSION_IDLE)).fetchone()
            if row is None:
                require(not required, "Сессия истекла. Войдите снова.", 401)
                return None
            # Срок сессии с отметкой «оставаться в системе» отсчитывается от последнего захода,
            # а не от входа: иначе покупателя выбрасывает ровно через два месяца, хотя он
            # заходит каждую неделю. На чужом устройстве отметки нет — там срок не продлевается.
            connection.execute(
                "UPDATE customer_sessions SET last_seen=?, expires_at=MAX(expires_at, ?) WHERE token_hash=?",
                (now, now + ACCOUNT_SESSION_AGE if row["remembered"] else 0, token_hash))
        if csrf and request.method not in ("GET", "HEAD", "OPTIONS"):
            supplied = request.headers.get("X-CSRF-Token", "")
            require(hmac.compare_digest(supplied.encode(), row["csrf"].encode()),
                    "Обновите страницу и повторите действие.", 403)
        return row

    def open_account_session(self, customer_id: str, payload: dict[str, Any], *, remember: bool = True) -> web.Response:
        token, csrf, now = secrets.token_urlsafe(32), secrets.token_urlsafe(32), time.time()
        with self.connect() as connection:
            connection.execute("DELETE FROM customer_sessions WHERE expires_at <= ? OR last_seen <= ?",
                               (now, now - ACCOUNT_SESSION_IDLE))
            connection.execute("""DELETE FROM customer_sessions WHERE token_hash IN (
                SELECT token_hash FROM customer_sessions WHERE customer_id=?
                ORDER BY created_at DESC LIMIT -1 OFFSET ?)""",
                               (customer_id, ACCOUNT_SESSIONS_PER_CUSTOMER - 1))
            connection.execute("""INSERT INTO customer_sessions
                (token_hash, customer_id, csrf, created_at, last_seen, expires_at, remembered)
                VALUES(?,?,?,?,?,?,?)""",
                               (hashlib.sha256(token.encode()).hexdigest(), customer_id, csrf,
                                now, now, now + (ACCOUNT_SESSION_AGE if remember else SESSION_AGE), int(remember)))
        response = web.json_response({**payload, "csrfToken": csrf})
        response.set_cookie(ACCOUNT_COOKIE, token, httponly=True, secure=self.cookie_secure,
                            samesite="Strict", path="/api", max_age=ACCOUNT_SESSION_AGE if remember else None)
        return response

    async def matching_password(self, password: str, encoded: str) -> bool:
        async with self.hash_lock:
            return await asyncio.to_thread(verify_password, password, encoded or self.dummy_hash)

    def product(self, data: dict[str, Any], previous: dict[str, Any] | None = None) -> dict[str, Any]:
        require(not (set(data) - PRODUCT_FIELDS - {"id", "updated_at"}), "Неизвестные поля товара.")
        values = {
            "name": "", "description": "", "category": "scooter", "license": "unknown",
            "license_verified": False, "price": None, "old_price": None, "stock_status": "preorder", "range_km": None,
            "speed_kmh": None, "power_w": None, "weight_kg": None, "cargo_l": None,
            "payload_kg": None, "drive": "unknown", "image_url": "", "images": [], "published": False,
            "featured": False, "tags": [], "badge": "",
            **(previous or {}), **{key: value for key, value in data.items() if key in PRODUCT_FIELDS},
        }
        for key, maximum in (("name", 160), ("description", 12000), ("image_url", 100)):
            values[key] = text_value(values[key], key, maximum)
        # A client that knows nothing of galleries still edits one photo; its value becomes the gallery.
        if "images" not in data and "image_url" in data:
            values["images"] = [values["image_url"]] if values["image_url"] else []
        require(values["category"] in PRODUCT_CATEGORIES, "Неизвестная категория товара.")
        require(values["license"] in PRODUCT_LICENSES, "Неизвестное требование к правам.")
        require(values["drive"] in PRODUCT_DRIVES, "Неизвестный привод: выберите один мотор, полный привод или «уточняется».")
        require(values["stock_status"] in ("in-stock", "preorder", "out-of-stock"), "Неизвестный статус наличия.")
        tags = values["tags"]
        require(isinstance(tags, list) and len(tags) <= len(PRODUCT_TAGS)
                and all(tag in PRODUCT_TAGS for tag in tags), "Неизвестная умная подборка.")
        values["tags"] = [tag for tag in PRODUCT_TAGS if tag in tags]
        require(values["badge"] in ("", *PRODUCT_BADGES), "Неизвестная отметка товара.")
        for key in ("published", "featured", "license_verified"):
            values[key] = boolean_value(values[key], key)
        require(values["license"] == "unknown" or values["license_verified"],
                "Для указания требований к правам сначала подтвердите проверку документов модели.")
        for key, maximum in (("price", 100_000_000), ("old_price", 100_000_000), ("range_km", 3000), ("speed_kmh", 500),
                             ("power_w", 500_000), ("weight_kg", 10_000), ("cargo_l", 1_000),
                             ("payload_kg", 2_000)):
            values[key] = number_value(values[key], key, maximum)
        if values["price"] is not None:
            price = Decimal(str(values["price"]))
            require(price > 0 and price == price.quantize(Decimal(".01")), "Цена должна быть больше нуля, максимум два знака после запятой.")
        if values["old_price"] is not None:
            old_price = Decimal(str(values["old_price"]))
            require(old_price > 0 and old_price == old_price.quantize(Decimal(".01")),
                    "Цена до скидки должна быть больше нуля, максимум два знака после запятой.")
            require(values["price"] is not None and old_price > Decimal(str(values["price"])),
                    "Цена до скидки должна быть выше текущей цены товара.")
        photos = values["images"]
        require(isinstance(photos, list) and len(photos) <= MAX_PHOTOS,
                f"Фотографий в карточке может быть не больше {MAX_PHOTOS}.")
        seen: list[str] = []
        for photo in photos:
            photo = text_value(photo, "Фото", 100)
            filename = photo.removeprefix("/media/")
            media_upload = photo.startswith("/media/") and bool(MEDIA_NAME.fullmatch(filename)) and (self.uploads / filename).is_file()
            require(media_upload or bool(STATIC_PRODUCT_IMAGE.fullmatch(photo)),
                    "Сначала загрузите изображение через кабинет.")
            if photo not in seen:
                seen.append(photo)
        values["images"] = seen
        # The cover is simply the first photo, so a card never shows an image the gallery lost.
        values["image_url"] = seen[0] if seen else ""
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


def open_admin_session(store: Store, payload: dict[str, Any], *, remember: bool = False) -> web.Response:
    token, csrf, now = secrets.token_urlsafe(32), secrets.token_urlsafe(32), time.time()
    with store.connect() as connection:
        connection.execute("""DELETE FROM sessions WHERE expires_at <= ? OR last_seen <= ? -
            CASE WHEN expires_at - created_at > ? THEN ? ELSE ? END""",
                           (now, now, SESSION_AGE + 1, REMEMBER_SESSION_IDLE, SESSION_IDLE))
        connection.execute("""DELETE FROM sessions WHERE token_hash IN (
            SELECT token_hash FROM sessions ORDER BY created_at DESC LIMIT -1 OFFSET 4)""")
        connection.execute("INSERT INTO sessions VALUES(?,?,?,?,?,?)",
                           (hashlib.sha256(token.encode()).hexdigest(), store.username, csrf, now, now,
                            now + (REMEMBER_SESSION_AGE if remember else SESSION_AGE)))
    response = web.json_response({**payload, "csrfToken": csrf})
    response.set_cookie(COOKIE_NAME, token, httponly=True, secure=store.cookie_secure,
                        samesite="Strict", path="/api/admin", max_age=REMEMBER_SESSION_AGE if remember else None)
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
    remember = data.get("remember", False)
    require(isinstance(remember, bool), "Некорректная настройка сохранения входа.")
    password = data.get("password")
    require(isinstance(password, str) and 1 <= len(password) <= 256, "Некорректные данные входа.", 401)
    require(await owner_password_ok(store, username, password), "Неверный логин или пароль.", 401)
    return open_admin_session(store, {"username": store.username}, remember=remember)


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
    return {"account": {"id": row["id"], "name": row["name"], "contact": row["contact"], "city": row["city"]}}


async def account_state(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    row = store.account(request, required=False)
    if row is None:
        return web.json_response({"account": None})
    response = web.json_response({**account_payload(row), "csrfToken": row["csrf"]})
    if row["remembered"]:
        # Продлевать сессию в базе мало: браузер выкинет саму куку ровно через её max_age.
        # Каждое открытие витрины отодвигает и её, поэтому постоянный покупатель не выходит.
        response.set_cookie(ACCOUNT_COOKIE, request.cookies[ACCOUNT_COOKIE], httponly=True,
                            secure=store.cookie_secure, samesite="Strict", path="/api",
                            max_age=ACCOUNT_SESSION_AGE)
    return response


async def account_register(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    store.rate_limit(request, "account-register", 5, 3600)
    data = await read_json(request)
    require(not (set(data) - {"name", "contact", "city", "password", "consent", "remember"}), "Неизвестные поля регистрации.")
    remember = data.get("remember", True)
    require(isinstance(remember, bool), "Некорректная настройка сохранения входа.")
    require(data.get("consent") is True, "Нужно согласие на обработку данных для создания аккаунта.")
    name = text_value(data.get("name"), "Имя", 100, 2)
    contact = text_value(data.get("contact"), "Контакт", 150, 5)
    city = text_value(data.get("city", ""), "Город", 80, 2)
    identity = contact_identity(contact)
    require(bool(identity), "Укажите телефон, email или имя пользователя Telegram.")
    password = data.get("password")
    require(isinstance(password, str) and CUSTOMER_PASSWORD_MIN <= len(password) <= 256,
            f"Пароль: от {CUSTOMER_PASSWORD_MIN} до 256 символов.")
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
                                                    "account": {"name": name, "contact": contact, "city": city}}, remember=remember)


async def account_login(request: web.Request) -> web.Response:
    """One door for everyone: the server decides whether these are the shop's credentials."""
    store = request.app[STORE_KEY]
    store.rate_limit(request, "account-login", 12, 900)
    data = await read_json(request)
    require(not (set(data) - {"contact", "password", "remember"}), "Неизвестные поля входа.")
    remember = data.get("remember", True)
    require(isinstance(remember, bool), "Некорректная настройка сохранения входа.")
    contact = text_value(data.get("contact"), "Логин", 150, 1)
    password = data.get("password")
    require(isinstance(password, str) and 1 <= len(password) <= 256, "Неверный логин или пароль.", 401)
    if store.password_hash and hmac.compare_digest(contact.encode(), store.username.encode()):
        require(await owner_password_ok(store, contact, password), "Неверный логин или пароль.", 401)
        return open_admin_session(store, {"role": "owner", "username": store.username}, remember=remember)
    identity = contact_identity(contact)
    with store.connect() as connection:
        row = connection.execute("SELECT id, name, contact, city, password_hash FROM customers WHERE identity=?",
                                 (identity,)).fetchone() if identity else None
    require(await store.matching_password(password, row["password_hash"] if row else ""),
            "Неверный логин или пароль.", 401)
    assert row is not None  # A matching password proves the lookup found an account.
    return store.open_account_session(row["id"], {"role": "customer",
                                                  "account": {"name": row["name"], "contact": row["contact"],
                                                              "city": row["city"]}}, remember=remember)


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
        inquiries.append({
            "id": inquiry["id"], "status": inquiry["status"], "total": inquiry["total"],
            "created_at": inquiry["created_at"], "updated_at": inquiry.get("updated_at", ""),
            "paid_at": inquiry.get("paid_at", ""), "city": inquiry.get("city", ""),
            "tracking_number": inquiry.get("tracking_number", ""), "items": inquiry["items"],
        })
    return web.json_response({"inquiries": inquiries})


async def list_products(request: web.Request) -> web.Response:
    public = request.path == "/api/products"
    store = request.app[STORE_KEY]
    if public:
        products = store.public_products()
    else:
        with store.connect() as connection:
            rows = connection.execute(
                "SELECT data FROM products ORDER BY updated_at DESC,id"
            ).fetchall()
        products = [store._public_product(row) for row in rows]
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
                require(source.width >= 64 and source.height >= 64, "Фото слишком маленькое: нужно хотя бы 64×64 точки.")
                require(source.width * source.height <= MAX_PIXELS, "Фотография слишком большая даже для камеры телефона.")
                require(not getattr(source, "is_animated", False), "Загрузите неподвижную фотографию.")
                source.verify()
            with Image.open(io.BytesIO(payload)) as source:
                source.draft("RGB", (2000, 2000))  # JPEG decodes at 1/2-1/8 scale: large photos cost little memory.
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


def payment_blockers(settings: dict[str, Any]) -> list[str]:
    """Что мешает объявить способ оплаты рабочим. Пустой список — можно публиковать «Доступно»."""
    missing = []
    if any(settings[key] == "on" for key in ("payment_dolyame", "payment_installment", "payment_credit")) \
            and not settings["payment_installment_partner"]:
        missing.append("банк-партнёр для Долями, рассрочки или кредита")
    return missing


async def save_settings(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    data = await read_json(request)
    require(not (set(data) - set(DEFAULT_SETTINGS)), "Неизвестные настройки магазина.")
    settings = store.settings()
    for key, value in data.items():
        if key == "inquiries_enabled":
            settings[key] = boolean_value(value, "Приём заявок")
        elif key in PAYMENT_STATUS_FIELDS:
            status = text_value(value, key, 20, 1)
            require(status in PAYMENT_STATUSES, f"Статус {PAYMENT_LABELS[key]}: выберите «не подключено», «готовим» или «доступно».")
            settings[key] = status
        else:
            maximum = 12000 if key.endswith("_document") else 8000 if key in ("legal_details", "delivery", "payment", "warranty", "delivery_schedule", "payment_receipt") else 500
            settings[key] = text_value(value, key, maximum, 1 if key == "shop_name" else 0)
    if settings["delivery_schedule"]:
        require(bool(settings["delivery_origin"]), "Укажите фактический город и адрес отправления для оценок доставки.")
        seen_cities: set[str] = set()
        for number, line in enumerate(settings["delivery_schedule"].splitlines(), 1):
            if not line.strip():
                continue
            parts = [part.strip() for part in line.split(";")]
            require(len(parts) == 4, f"Доставка, строка {number}: нужны город; срок от; срок до; стоимость.")
            city, lower, upper, cost = parts
            require(2 <= len(city) <= 80 and bool(re.fullmatch(r"[0-9]{1,2}", lower))
                    and bool(re.fullmatch(r"[0-9]{1,2}", upper)) and 1 <= len(cost) <= 150,
                    f"Доставка, строка {number}: проверьте город, сроки и стоимость.")
            require(1 <= int(lower) <= int(upper) <= 90, f"Доставка, строка {number}: сроки от 1 до 90 дней, по возрастанию.")
            city_key = " ".join(city.lower().replace("ё", "е").split())
            require(city_key not in seen_cities, f"Доставка: город {city} указан дважды.")
            seen_cities.add(city_key)
    if settings["phone"]:
        require(valid_phone(settings["phone"]), "Укажите корректный телефон магазина (от 7 до 15 цифр).")
    for field, title in (("telegram", "Telegram"), ("telegram_channel", "Telegram-канал")):
        if settings[field]:
            handle = settings[field].removeprefix("https://t.me/").removeprefix("@").rstrip("/")
            require(bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{4,31}", handle)),
                    f"{title}: укажите @username или ссылку https://t.me/username.")
            settings[field] = f"@{handle}"
    require(not settings["inquiries_enabled"] or settings_ready(settings),
            "Для приёма заявок заполните название продавца, реквизиты и телефон или Telegram.")
    if any(settings[field] == "on" for field in PAYMENT_STATUS_FIELDS):
        blockers = payment_blockers(settings)
        require(not blockers, "Прежде чем объявлять оплату доступной, заполните: " + ", ".join(blockers) + ".")
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
    response = json.loads(row["response"])
    require(not response.get("_pending"), "Оплата по этой заявке уже создаётся. Подождите несколько секунд.", 409)
    return web.json_response(response, status=201, headers={"Idempotency-Replayed": "true"})


async def create_inquiry(request: web.Request) -> web.Response:
    store = request.app[STORE_KEY]
    data = await read_json(request)
    request_key = inquiry_request_key(request, data)
    if request_key is not None:
        with store.connect() as connection:
            replay = replay_inquiry(connection, request_key)
        if replay is not None:
            return replay
    store.rate_limit(request, "inquiry-peer", 60, 600)
    require(not (set(data) - {"name", "contact", "city", "cdek_pvz", "payment_method", "message", "items", "consent"}), "Неизвестные поля заявки.")
    require(data.get("consent") is True, "Нужно согласие на обработку данных для ответа на заявку.")
    name = text_value(data.get("name"), "Имя", 100, 2)
    contact = text_value(data.get("contact"), "Контакт", 150, 5)
    message = text_value(data.get("message", ""), "Комментарий", 3000)
    city = text_value(data.get("city", ""), "Город доставки", 80)
    cdek_pvz = text_value(data.get("cdek_pvz", ""), "Пункт выдачи СДЭК", 300)
    payment_method = text_value(data.get("payment_method", "sbp"), "Способ оплаты", 24, 1)
    require(payment_method in ("sbp", "card", "installment", "credit"), "Выберите доступный способ оплаты.")
    require(valid_phone(contact) or
            bool(re.fullmatch(r"@?[A-Za-z][A-Za-z0-9_]{4,31}", contact)) or
            bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", contact)),
            "Укажите телефон, email или имя пользователя Telegram.")
    normalized_contact = ("".join(character for character in contact if character.isdigit())
                          if valid_phone(contact) else contact.removeprefix("@").lower())
    store.rate_limit(request, "inquiry-contact", 5, 600, identity=normalized_contact)
    customer = store.account(request, required=False, csrf=False)
    requested = data.get("items", [])
    require(isinstance(requested, list) and len(requested) <= 30, "В заявке допускается не больше 30 моделей.")
    require(bool(requested) or len(message) >= 10, "Выберите товар или опишите вопрос (от 10 символов).")
    require(not requested or len(city) >= 2, "Укажите город доставки — магазин отправляет заказы по России.")
    origin = return_origin(request)
    online_payment = bool(requested) and origin is not None and (
        (payment_method in ("sbp", "card") and _payment_configured())
        or (payment_method in ("installment", "credit") and _credit_configured()))
    require(not requested or payment_method not in ("sbp", "card") or not _payment_configured() or origin is not None,
            "Онлайн-оплата временно недоступна: магазин не настроил адрес возврата.", 503)
    with store.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        replay = replay_inquiry(connection, request_key)
        if replay is not None:
            return replay
        settings = store.settings(connection)
        require(settings["inquiries_enabled"] and settings_ready(settings),
                "Приём заявок пока не открыт. Контакты магазина доступны в разделе «Контакты».", 503)
        require(payment_method != "sbp" or settings["payment_sbp"] == "on",
                "Оплата через СБП временно недоступна.", 409)
        require(payment_method != "card" or settings["payment_card"] == "on",
                "Оплата картой временно недоступна.", 409)
        require(payment_method != "installment" or settings["payment_installment"] == "on",
                "Рассрочка временно недоступна.", 409)
        require(payment_method != "credit" or settings["payment_credit"] == "on",
                "Кредит временно недоступен.", 409)
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
            require(product["price"] is not None, "Для одного из товаров цена ещё не указана.", 409)
            total += Decimal(str(product["price"])) * quantity
            items.append({"product_id": product_id, "name": product["name"], "price": product["price"],
                          "quantity": quantity, "image_url": product["image_url"]})
        timestamp = now_iso()
        status = "awaiting_payment" if online_payment else "new"
        inquiry = {"id": secrets.token_hex(16), "name": name, "contact": contact, "city": city,
                   "cdek_pvz": cdek_pvz, "payment_method": payment_method, "payment_status": "",
                   "tracking_number": "", "message": message, "items": items,
                   "total": float(total.quantize(Decimal(".01"))), "status": status,
                   "created_at": timestamp, "updated_at": timestamp, "consent_at": timestamp}
        connection.execute("INSERT INTO inquiries(id,data,status,created_at,updated_at,customer_id) VALUES(?,?,?,?,?,?)",
                           (inquiry["id"], json.dumps(inquiry, ensure_ascii=False), status, timestamp, timestamp,
                            customer["id"] if customer is not None else None))
        if request_key is not None:
            connection.execute("INSERT INTO inquiry_requests(key_hash,request_hash,response,created_at) VALUES(?,?,?,?)",
                               (request_key[0], request_key[1], json.dumps({"_pending": True}), time.time()))
    payment_url = ""
    if online_payment:
        try:
            payment = (await init_tbank_payment(inquiry, origin or "") if payment_method in ("sbp", "card")
                       else await init_tbank_credit(inquiry, origin or ""))
        except APIError:
            with store.connect() as connection:
                connection.execute("DELETE FROM inquiries WHERE id=? AND status='awaiting_payment'", (inquiry["id"],))
                if request_key is not None:
                    connection.execute("DELETE FROM inquiry_requests WHERE key_hash=?", (request_key[0],))
            raise
        inquiry.update(payment_id=payment["payment_id"],
                       payment_status="NEW" if payment_method in ("sbp", "card") else "draft",
                       updated_at=now_iso())
        payment_url = payment["payment_url"]
        with store.connect() as connection:
            connection.execute("UPDATE inquiries SET data=?,updated_at=? WHERE id=?",
                               (json.dumps(inquiry, ensure_ascii=False), inquiry["updated_at"], inquiry["id"]))
    receipt = {"inquiry": {"id": inquiry["id"], "total": inquiry["total"], "status": inquiry["status"],
                           **({"payment_url": payment_url} if payment_url else {})}}
    if request_key is not None:
        with store.connect() as connection:
            connection.execute("UPDATE inquiry_requests SET response=? WHERE key_hash=?",
                               (json.dumps(receipt, ensure_ascii=False), request_key[0]))
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
    require(status == "all" or status in ORDER_STATUSES, "Неизвестный статус заявки.")
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
    require(bool(data) and not (set(data) - {"status", "tracking_number"}), "Передайте статус или трек-номер.")
    if "status" in data:
        require(data["status"] in ORDER_STATUSES, "Неизвестный статус заявки.")
    tracking_number = None
    if "tracking_number" in data:
        tracking_number = text_value(data["tracking_number"], "Трек-номер", 100)
    notify_tracking = False
    with request.app[STORE_KEY].connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT data FROM inquiries WHERE id=?", (request.match_info["id"],)).fetchone()
        require(row is not None, "Заявка не найдена.", 404)
        inquiry = json.loads(row["data"])
        if "status" in data:
            inquiry["status"] = data["status"]
        if tracking_number is not None:
            notify_tracking = bool(tracking_number and tracking_number != inquiry.get("tracking_number", ""))
            inquiry["tracking_number"] = tracking_number
            if notify_tracking and inquiry["status"] not in ("completed", "cancelled"):
                inquiry["status"] = "shipped"
        inquiry["updated_at"] = now_iso()
        connection.execute("UPDATE inquiries SET data=?,status=?,updated_at=? WHERE id=?",
                           (json.dumps(inquiry, ensure_ascii=False), inquiry["status"], inquiry["updated_at"], inquiry["id"]))
    if notify_tracking:
        queue_customer_notification(
            inquiry,
            f"Заказ G-Partner №{inquiry['id'][:8]} передан в доставку",
            f"Ваш заказ передан в транспортную службу. Трек-номер: {inquiry['tracking_number']}",
        )
    return web.json_response({"inquiry": inquiry})


async def order_status(request: web.Request) -> web.Response:
    order_id = request.match_info["id"]
    require(bool(PRODUCT_ID.fullmatch(order_id)), "Некорректный номер заказа.")
    with request.app[STORE_KEY].connect() as connection:
        row = connection.execute("SELECT data FROM inquiries WHERE id=?", (order_id,)).fetchone()
    require(row is not None, "Заказ не найден.", 404)
    inquiry = json.loads(row["data"])
    return web.json_response({
        "id": inquiry["id"], "total": inquiry["total"], "status": inquiry["status"],
        "tracking_number": inquiry.get("tracking_number", ""), "paid_at": inquiry.get("paid_at", ""),
    })


async def cdek_points(request: web.Request) -> web.Response:
    """Публичный прокси к СДЭК: витрина показывает список ПВЗ, даже если ключа виджета нет."""
    require(not (set(request.query) - {"city", "query"}), "Неизвестные параметры поиска пунктов выдачи.")
    for key in ("city", "query"):
        require(len(request.query.getall(key, [])) <= 1, "Параметры поиска не должны повторяться.")
    city = text_value(request.query.get("city", ""), "Город", 80)
    needle = text_value(request.query.get("query", ""), "Поиск", 80).lower()
    request.app[STORE_KEY].rate_limit(request, "cdek-points", 60, 600)
    if not city:
        return web.json_response({"points": [], "available": False,
                                  "reason": "Укажите город доставки — тогда покажем пункты выдачи."})
    points, reason = await cdek_offices(city)
    if reason:
        return web.json_response({"points": [], "available": False, "reason": reason})
    if needle:
        points = [point for point in points
                  if needle in point["address"].lower() or needle in point["code"].lower()]
        if not points:
            return web.json_response({"points": [], "available": True,
                                      "reason": "По этому адресу пунктов не нашлось — уточните улицу."})
    return web.json_response({"points": points[:CDEK_POINTS_LIMIT], "available": True, "reason": ""})


async def tbank_notification(request: web.Request) -> web.Response:
    data = await read_json(request)
    terminal, password = os.getenv("TBANK_TERMINAL_KEY", "").strip(), os.getenv("TBANK_PASSWORD", "").strip()
    require(terminal and password, "Платёжный терминал не настроен.", 503)
    token = data.get("Token")
    require(isinstance(token, str) and hmac.compare_digest(token, tbank_token(data, password)),
            "Некорректная подпись уведомления.", 403)
    require(data.get("TerminalKey") == terminal, "Уведомление другого терминала.", 403)
    order_id, status = data.get("OrderId"), data.get("Status")
    require(isinstance(order_id, str) and bool(PRODUCT_ID.fullmatch(order_id)), "Некорректный номер заказа.")
    require(isinstance(status, str) and len(status) <= 40, "Некорректный статус платежа.")
    paid_now = False
    with request.app[STORE_KEY].connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT data FROM inquiries WHERE id=?", (order_id,)).fetchone()
        require(row is not None, "Заказ не найден.", 404)
        inquiry = json.loads(row["data"])
        expected_amount = int((Decimal(str(inquiry["total"])) * 100).quantize(Decimal("1")))
        require(data.get("Amount") == expected_amount, "Сумма уведомления не совпадает с заказом.", 409)
        if inquiry.get("payment_id"):
            require(str(data.get("PaymentId", "")) == inquiry["payment_id"], "Платёж не совпадает с заказом.", 409)
        inquiry["payment_status"] = status
        if data.get("Success") is True and status == "CONFIRMED":
            paid_now = inquiry["status"] not in ("paid", "processing", "shipped", "completed")
            inquiry["status"] = "paid"
            inquiry["paid_at"] = inquiry.get("paid_at") or now_iso()
        inquiry["updated_at"] = now_iso()
        connection.execute("UPDATE inquiries SET data=?,status=?,updated_at=? WHERE id=?",
                           (json.dumps(inquiry, ensure_ascii=False), inquiry["status"], inquiry["updated_at"], inquiry["id"]))
    if paid_now:
        queue_customer_notification(inquiry, f"Заказ G-Partner №{order_id[:8]} оплачен", ORDER_ACCEPTED_TEXT)
    return web.Response(text="OK", content_type="text/plain")


async def reachability_check(title: str, urls: tuple[str, ...]) -> dict[str, Any]:
    """Доходит ли сервер магазина хотя бы до TCP+TLS банка: без этого оплата не пройдёт."""
    failures = []
    for url in urls:
        host = urlsplit(url).hostname or url
        try:
            async with outbound_session(8) as client:
                async with client.post(url, json={}) as response:
                    return {"title": title, "ok": True, "detail": f"{host} отвечает (HTTP {response.status})"}
        except (ClientError, OSError, asyncio.TimeoutError, ValueError) as error:
            failures.append(f"{host}: {network_error(error)}")
    detail = "нет соединения — " + "; ".join(failures)
    if any("certificate" in failure.lower() or "ssl" in failure.lower() for failure in failures):
        detail += (". Похоже на непроверенный сертификат: добавьте корневой сертификат Минцифры "
                   "в EXTRA_CA_PEM или в папку certs репозитория.")
    return {"title": title, "ok": False, "detail": detail}


async def payment_check(request: web.Request) -> web.Response:
    """Проверка настроек оплаты для владельца: что задано и что отвечает банк.

    Тестовый Init на 1 ₽ не создаёт заказ и никого не списывает — он лишь
    показывает, принимает ли банк ключ, пароль и адреса возврата.
    """
    store = request.app[STORE_KEY]
    settings = store.settings()
    terminal = os.getenv("TBANK_TERMINAL_KEY", "").strip()
    password = os.getenv("TBANK_PASSWORD", "").strip()
    origin = return_origin(request)
    raw_origin = os.getenv("PUBLIC_ORIGIN", "").strip()
    http_origin = raw_origin.lower().startswith("http://") and not local_host(urlsplit(raw_origin).hostname or "")
    checks: list[dict[str, Any]] = [
        {"title": "Адрес возврата покупателя (PUBLIC_ORIGIN)", "ok": origin is not None and not http_origin,
         "detail": (f"{origin} — в переменной задан http://, магазин исправил на https://; "
                    "поправьте её на хостинге" if http_origin else
                    origin or "Домен магазина не распознан: задайте PUBLIC_ORIGIN.")},
        {"title": "Ключ терминала (TBANK_TERMINAL_KEY)", "ok": bool(terminal),
         "detail": f"…{terminal[-4:]}" if terminal else "Переменная не задана на хостинге."},
        {"title": "Пароль терминала (TBANK_PASSWORD)", "ok": bool(password),
         "detail": "задан" if password else "Переменная не задана на хостинге."},
        {"title": "Витрина рассрочки и кредита", "ok": _credit_configured(),
         "detail": f"shop {tbank_shop_id()[:8]}…, showcase {tbank_showcase_id()[:8]}…"},
    ]
    for key, title in (("payment_sbp", "СБП"), ("payment_card", "Оплата картой"),
                       ("payment_installment", "Рассрочка"), ("payment_credit", "Кредит")):
        checks.append({"title": f"Способ «{title}» в CRM", "ok": settings[key] == "on",
                       "detail": {"on": "доступно покупателю", "preparing": "готовим подключение — покупатель не увидит",
                                  "off": "не подключено — покупатель не увидит"}[settings[key]]})
    checks.append(await reachability_check("Связь сервера с оплатой Т-Банка",
                                          outbound_urls("TBANK_API_URL", TBANK_INIT_URLS)))
    checks.append(await reachability_check("Связь сервера с витриной рассрочки",
                                          outbound_urls("TBANK_CREDIT_API_URL", TBANK_CREDIT_URLS)))
    urls = payment_return_urls(origin or "https://example.invalid", "0" * 32, SBP_NOTIFICATION_PATH)
    credit_urls = payment_return_urls(origin or "https://example.invalid", "0" * 32, CREDIT_NOTIFICATION_PATH)
    report: dict[str, Any] = {
        "checks": checks,
        "urls": {"notification": urls["webhook"], "credit_notification": credit_urls["webhook"],
                 "success": urls["success"].split("?")[0], "fail": urls["fail"].split("?")[0]},
        "bank": None,
    }
    if terminal and password and origin:
        # Чек банка требует контакт покупателя: для проверки берём телефон магазина.
        probe = {"id": secrets.token_hex(16), "name": "Проверка настроек",
                 "contact": settings["phone"] if valid_phone(settings["phone"]) else "check@g-partner.store",
                 "total": 1.0, "payment_method": "card",
                 "items": [{"name": "Проверка оплаты", "price": 1.0, "quantity": 1}]}
        try:
            payment = await init_tbank_payment(probe, origin)
            report["bank"] = {"ok": True, "message": "Банк принял тестовый платёж на 1 ₽ и вернул ссылку оплаты.",
                              "payment_url": payment["payment_url"]}
        except APIError as error:
            report["bank"] = {"ok": False, "message": str(error), "detail": error.detail}
    return web.json_response(report)


async def tbank_credit_notification(request: web.Request) -> web.Response:
    """Уведомление Т-Банка по заявке на рассрочку или кредит.

    Подписи у этого API нет, поэтому уведомление принимается только когда совпал
    и номер заказа, и выданный банком идентификатор заявки, а при заданном
    TBANK_CREDIT_WEBHOOK_SECRET — ещё и секрет в адресе уведомления.
    """
    require(_credit_configured(), "Рассрочка не настроена.", 503)
    secret = os.getenv("TBANK_CREDIT_WEBHOOK_SECRET", "").strip()
    if secret:
        supplied = request.query.get("key", "")
        require(hmac.compare_digest(supplied, secret), "Некорректный ключ уведомления.", 403)
    data = await read_json(request)
    order_id = data.get("orderNumber") or data.get("OrderNumber") or data.get("order_number")
    status = data.get("status") or data.get("Status")
    credit_id = str(data.get("id") or data.get("Id") or "")
    require(isinstance(order_id, str) and bool(PRODUCT_ID.fullmatch(order_id)), "Некорректный номер заказа.")
    require(isinstance(status, str) and len(status) <= 40, "Некорректный статус заявки.")
    normalized = status.strip().lower()
    paid_now = False
    with request.app[STORE_KEY].connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT data FROM inquiries WHERE id=?", (order_id,)).fetchone()
        require(row is not None, "Заказ не найден.", 404)
        inquiry = json.loads(row["data"])
        require(inquiry.get("payment_method") in ("installment", "credit"), "Заказ оформлен без рассрочки.", 409)
        require(bool(credit_id) and str(inquiry.get("payment_id", "")) == credit_id,
                "Заявка не совпадает с заказом.", 409)
        inquiry["payment_status"] = status.strip()[:40]
        if normalized in CREDIT_SIGNED_STATUSES:
            paid_now = inquiry["status"] not in ("paid", "processing", "shipped", "completed")
            inquiry["status"] = "paid"
            inquiry["paid_at"] = inquiry.get("paid_at") or now_iso()
        elif normalized in CREDIT_FAILED_STATUSES and inquiry["status"] == "awaiting_payment":
            inquiry["status"] = "cancelled"
        inquiry["updated_at"] = now_iso()
        connection.execute("UPDATE inquiries SET data=?,status=?,updated_at=? WHERE id=?",
                           (json.dumps(inquiry, ensure_ascii=False), inquiry["status"],
                            inquiry["updated_at"], inquiry["id"]))
    if paid_now:
        queue_customer_notification(inquiry, f"Заказ G-Partner №{order_id[:8]} оформлен в рассрочку",
                                    ORDER_ACCEPTED_TEXT)
    return web.Response(text="OK", content_type="text/plain")


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
    app.router.add_get("/api/orders/{id}", order_status)
    app.router.add_get("/api/cdek/points", cdek_points)
    app.router.add_post(SBP_NOTIFICATION_PATH, tbank_notification)
    app.router.add_post(CREDIT_NOTIFICATION_PATH, tbank_credit_notification)
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
    app.router.add_post("/api/admin/payment-check", payment_check)
    app.router.add_put("/api/admin/settings", save_settings)
    app.router.add_get("/api/admin/inquiries", list_inquiries)
    app.router.add_patch("/api/admin/inquiries/{id}", update_inquiry)
    app.router.add_get("/media/{filename}", media)
    from customer_crm import setup as setup_customer_crm
    setup_customer_crm(app)
    app.router.add_route("*", "/api/{tail:.*}", api_not_found)
    app.router.add_route("*", "/media/{tail:.*}", api_not_found)
