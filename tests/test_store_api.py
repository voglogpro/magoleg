"""Integration tests use an isolated SQLite directory, never production data."""

import asyncio
import io
import json
import os
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from aiohttp import CookieJar, FormData, web
from aiohttp.test_utils import TestClient, TestServer
from PIL import Image, PngImagePlugin

import store_api
from store_api import (ACCOUNT_COOKIE, ACCOUNT_SESSION_AGE, COOKIE_NAME, CREDIT_NOTIFICATION_PATH,
                       MAX_UPLOAD, STORE_KEY, APIError, hash_password, init_tbank_credit,
                       init_tbank_payment, payment_return_urls, return_origin, setup_store,
                       tbank_token, valid_phone, verify_password)

TEST_PASSWORD = "isolated-test-password-only"
CUSTOMER_PASSWORD = "isolated-customer-password"


class PasswordTests(unittest.TestCase):
    def test_phone_requires_seven_to_fifteen_ascii_digits(self):
        for phone in ("1234567", "+123456789012345", "+7 (999) 111-22-33"):
            self.assertTrue(valid_phone(phone), phone)
        for phone in ("-------", "( ) - -", "123456", "1234567890123456", "١٢٣٤٥٦٧", "++1234567", "123+4567"):
            self.assertFalse(valid_phone(phone), phone)

    def test_tbank_token_matches_official_root_fields_algorithm(self):
        payload = {
            "TerminalKey": "MerchantTerminalKey", "Amount": 19200, "OrderId": "00000",
            "Description": "Подарочная карта на 1000 рублей",
            "DATA": {"Email": "a@test.com"}, "Receipt": {"Items": []},
        }
        self.assertEqual(
            tbank_token(payload, "11111111111111"),
            "72dd466f8ace0a37a1f740ce5fb78101712bc0665d91a8108c7c8a0ccd426db2",
        )

    def test_salted_scrypt_password_and_failure(self):
        encoded = hash_password(TEST_PASSWORD)
        self.assertTrue(encoded.startswith("scrypt$32768$8$3$"))
        self.assertTrue(verify_password(TEST_PASSWORD, encoded))
        self.assertFalse(verify_password("wrong", encoded))
        self.assertFalse(verify_password(TEST_PASSWORD, "broken"))
        self.assertNotEqual(encoded, hash_password(TEST_PASSWORD))
        with self.assertRaises(ValueError):
            hash_password("short")


def fake_request(host, scheme="https", forwarded=None):
    request = MagicMock()
    request.host = host
    request.scheme = scheme
    request.headers = {"X-Forwarded-Proto": forwarded} if forwarded else {}
    return request


class FakeResponse:
    def __init__(self, payload, status=200):
        self.payload, self.status = payload, status

    async def json(self, content_type=None):
        return self.payload


class FakeSession:
    """Заменяет сетевой вызов банка: запрос сохраняется, ответ задаётся тестом."""

    def __init__(self, payload, captured):
        self.payload, self.captured = payload, captured

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def post(self, url, json=None):
        self.captured["url"], self.captured["json"] = url, json
        return FakeSession._Response(FakeResponse(self.payload))

    class _Response:
        def __init__(self, response):
            self.response = response

        async def __aenter__(self):
            return self.response

        async def __aexit__(self, *args):
            return False


class OnlinePaymentTests(unittest.IsolatedAsyncioTestCase):
    order = {"id": "b" * 32, "name": "Customer", "contact": "buyer@example.com", "total": 1.0,
             "payment_method": "card", "items": [{"name": "Тестовый товар", "price": 1.0, "quantity": 1}]}

    async def test_card_accepts_a_one_rouble_test_order(self):
        captured = {}
        session = FakeSession({"Success": True, "PaymentURL": "https://securepay.tinkoff.ru/x", "PaymentId": "42"}, captured)
        with patch.dict(os.environ, {"TBANK_TERMINAL_KEY": "TinkoffTest", "TBANK_PASSWORD": "secret", "TBANK_TAXATION": ""}), \
                patch("store_api.ClientSession", session):
            payment = await init_tbank_payment(self.order, "https://g-partner.store")
        self.assertEqual(payment["payment_url"], "https://securepay.tinkoff.ru/x")
        self.assertEqual(captured["json"]["Amount"], 100)
        self.assertEqual(captured["json"]["NotificationURL"], "https://g-partner.store/api/payments/tbank/notification")
        self.assertTrue(captured["json"]["SuccessURL"].startswith("https://g-partner.store/#order-success"))

    async def test_sbp_keeps_the_ten_rouble_floor_of_the_bank(self):
        with patch.dict(os.environ, {"TBANK_TERMINAL_KEY": "TinkoffTest", "TBANK_PASSWORD": "secret"}):
            with self.assertRaises(APIError) as failure:
                await init_tbank_payment({**self.order, "payment_method": "sbp"}, "https://g-partner.store")
        self.assertIn("10 рублей", str(failure.exception))

    async def test_installment_explains_the_programme_minimum(self):
        with patch.dict(os.environ, {"TBANK_CREDIT_MIN": ""}):
            with self.assertRaises(APIError) as failure:
                await init_tbank_credit({**self.order, "payment_method": "installment"}, "https://g-partner.store")
        self.assertIn("3000", str(failure.exception).replace(" ", "").replace("\u202f", ""))

    async def test_installment_sends_the_showcase_identifiers_and_return_links(self):
        captured = {}
        session = FakeSession({"id": "credit-9", "link": "https://forma.tinkoff.ru/order/9"}, captured)
        with patch("store_api.ClientSession", session):
            payment = await init_tbank_credit({**self.order, "payment_method": "installment", "total": 45000.0},
                                              "https://g-partner.store")
        self.assertEqual(payment, {"payment_id": "credit-9", "payment_url": "https://forma.tinkoff.ru/order/9"})
        self.assertEqual(captured["json"]["shopId"], "8879c474-d8e0-4f1b-b7fe-628b5d7f6a07")
        self.assertEqual(captured["json"]["showcaseId"], "563f8b7f-91e8-47f3-9776-f18e7d663707")
        self.assertEqual(captured["json"]["sum"], 45000.0)
        self.assertEqual(captured["json"]["webhookURL"], f"https://g-partner.store{CREDIT_NOTIFICATION_PATH}")


class ReturnOriginTests(unittest.TestCase):
    def test_own_domain_is_accepted_when_public_origin_is_not_configured(self):
        with patch.dict(os.environ, {"PUBLIC_ORIGIN": "", "MINI_APP_URL": ""}):
            # Именно этот случай ломал оплату: хостинг без PUBLIC_ORIGIN.
            self.assertEqual(return_origin(fake_request("g-partner.store")), "https://g-partner.store")
            self.assertEqual(return_origin(fake_request("www.g-partner.ru")), "https://www.g-partner.ru")
            self.assertEqual(return_origin(fake_request("127.0.0.1:8000", scheme="http")), "http://127.0.0.1:8000")
            self.assertIsNone(return_origin(fake_request("evil.example")))

    def test_configured_origins_accept_a_list_and_block_a_forged_host(self):
        with patch.dict(os.environ, {"PUBLIC_ORIGIN": "https://a.example, https://b.example", "MINI_APP_URL": ""}):
            self.assertEqual(return_origin(fake_request("b.example")), "https://b.example")
            self.assertEqual(return_origin(fake_request("evil.example")), "https://a.example")
            self.assertEqual(return_origin(fake_request("a.example", scheme="http", forwarded="https")),
                             "https://a.example")

    def test_return_urls_carry_the_order_and_the_webhook_secret(self):
        with patch.dict(os.environ, {"TBANK_CREDIT_WEBHOOK_SECRET": "secret value"}):
            urls = payment_return_urls("https://g-partner.store", "a" * 32, CREDIT_NOTIFICATION_PATH)
        self.assertEqual(urls["success"], f"https://g-partner.store/#order-success?order={'a' * 32}")
        self.assertEqual(urls["fail"], f"https://g-partner.store/#cart?payment=failed&order={'a' * 32}")
        self.assertEqual(urls["webhook"], f"https://g-partner.store{CREDIT_NOTIFICATION_PATH}?key=secret%20value")


class StoreAPITests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_hash = hash_password(TEST_PASSWORD)

    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.environment = patch.dict(os.environ, {
            "DATA_DIR": self.directory.name, "ADMIN_USERNAME": "test-owner",
            "ADMIN_PASSWORD_HASH": self.test_hash, "ADMIN_PASSWORD": "",
            "COOKIE_SECURE": "false", "PUBLIC_ORIGIN": "", "MINI_APP_URL": "",
        })
        self.environment.start()
        self.client = await self.make_client()
        self.csrf = ""

    async def make_client(self):
        app = web.Application()
        setup_store(app)
        client = TestClient(TestServer(app), cookie_jar=CookieJar(unsafe=True))
        await client.start_server()
        return client

    async def asyncTearDown(self):
        await self.client.close()
        self.environment.stop()
        self.directory.cleanup()

    @property
    def origin(self):
        return str(self.client.make_url("/")).rstrip("/")

    @property
    def headers(self):
        return {"Origin": self.origin, "X-CSRF-Token": self.csrf}

    async def login(self):
        response = await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD,
        }, headers={"Origin": self.origin})
        self.assertEqual(response.status, 200, await response.text())
        self.csrf = (await response.json())["csrfToken"]
        return response

    async def upload(self):
        buffer = io.BytesIO()
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("untrusted", "private location metadata")
        Image.new("RGB", (128, 96), (35, 40, 46)).save(buffer, "PNG", pnginfo=metadata)
        body = FormData()
        body.add_field("file", buffer.getvalue(), filename="client-name.png", content_type="image/png")
        response = await self.client.post("/api/admin/upload", data=body, headers=self.headers)
        self.assertEqual(response.status, 201, await response.text())
        return (await response.json())["image_url"]

    async def test_delivery_estimates_and_documents_round_trip(self):
        await self.login()
        update = {"delivery_origin": "Тестовый склад", "delivery_schedule": "Москва; 3; 5; По тарифу ТК",
                  "return_address": "Тестовый адрес возврата", "offer_document": "Тестовая редакция договора"}
        response = await self.client.put("/api/admin/settings", json=update, headers=self.headers)
        self.assertEqual(response.status, 200, await response.text())
        public = await self.client.get("/api/settings")
        saved = (await public.json())["settings"]
        for key, value in update.items():
            self.assertEqual(saved[key], value)
        for schedule in ("Москва; 5; 3; ТК", "Москва; 1; 91; ТК", "Москва; 1; 2;",
                         "Москва; 1; 2; ТК\nмосква; 3; 4; ТК", "Москва; завтра; 5; ТК"):
            response = await self.client.put("/api/admin/settings", json={"delivery_schedule": schedule}, headers=self.headers)
            self.assertEqual(response.status, 400, await response.text())
        response = await self.client.put("/api/admin/settings", json={"delivery_origin": ""}, headers=self.headers)
        self.assertEqual(response.status, 400)

    async def test_payment_cannot_be_announced_before_the_seller_is_identified(self):
        await self.login()
        public = await self.client.get("/api/settings")
        defaults = (await public.json())["settings"]
        # Оплата Т-Банка работает: СБП, карта, рассрочка и кредит. «Долями» выключено.
        self.assertEqual(defaults["payment_sbp"], "on")
        self.assertEqual(defaults["payment_card"], "on")
        self.assertEqual(defaults["payment_dolyame"], "off")
        self.assertEqual(defaults["payment_installment"], "on")
        self.assertEqual(defaults["payment_credit"], "on")
        self.assertEqual(defaults["payment_on_delivery"], "off")
        for values in ({"payment_card": "yes"}, {"payment_invoice": ""}, {"payment_sbp": "включено"}):
            response = await self.client.put("/api/admin/settings", json=values, headers=self.headers)
            await self.assert_error(response, 400)
        # Владелец сам решает, показывать ли карту: оба положения сохраняются.
        for status in ("off", "on"):
            response = await self.client.put("/api/admin/settings", json={"payment_card": status}, headers=self.headers)
            self.assertEqual(response.status, 200, await response.text())
            saved = (await (await self.client.get("/api/settings")).json())["settings"]
            self.assertEqual(saved["payment_card"], status)

    async def test_drive_payload_and_licence_categories_round_trip(self):
        await self.login()
        response = await self.client.post("/api/admin/products", json={
            "name": "Полноприводная модель", "drive": "dual", "power_w": 1100,
            "weight_kg": 37, "payload_kg": 135, "cargo_l": 0,
            "license": "m", "license_verified": True,
        }, headers=self.headers)
        self.assertEqual(response.status, 201, await response.text())
        product = (await response.json())["product"]
        self.assertEqual(product["drive"], "dual")
        self.assertEqual(product["payload_kg"], 135)
        self.assertEqual(product["license"], "m")
        # Ноль литров сохраняется как осознанное «багажника нет», а не как пустое значение.
        self.assertEqual(product["cargo_l"], 0)
        for values in ({"drive": "awd"}, {"license": "b"}, {"payload_kg": 5000}, {"payload_kg": -1}):
            response = await self.client.post("/api/admin/products", json={"name": "Проверка", **values}, headers=self.headers)
            await self.assert_error(response, 400)
        # Категория прав без подтверждённых документов не публикуется.
        response = await self.client.post("/api/admin/products", json={"name": "Без документов", "license": "a"}, headers=self.headers)
        await self.assert_error(response, 400)

    async def test_teen_theme_requires_explicit_product_tag(self):
        await self.login()
        response = await self.client.post("/api/admin/products", json={"name": "Тестовая серия", "tags": ["teen"]}, headers=self.headers)
        self.assertEqual(response.status, 201, await response.text())
        self.assertEqual((await response.json())["product"]["tags"], ["teen"])

    async def published_product(self, **changes):
        image_url = await self.upload()
        values = {"name": "Real scooter", "description": "Verified model information.",
                  "category": "scooter", "price": 50000.50, "image_url": image_url,
                  "published": True, "stock_status": "in-stock", **changes}
        response = await self.client.post("/api/admin/products", json=values, headers=self.headers)
        self.assertEqual(response.status, 201, await response.text())
        return (await response.json())["product"]

    async def enable_inquiries(self):
        response = await self.client.put("/api/admin/settings", json={
            "legal_name": "Test seller", "legal_details": "Test legal information",
            "telegram": "https://t.me/test_store", "inquiries_enabled": True,
        }, headers=self.headers)
        self.assertEqual(response.status, 200, await response.text())

    async def assert_error(self, response, status):
        self.assertEqual(response.status, status, await response.text())
        self.assertIsInstance((await response.json())["error"], str)

    async def test_public_catalog_starts_empty_and_admin_requires_session(self):
        response = await self.client.get("/api/products")
        self.assertEqual(await response.json(), {"products": []})
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        await self.assert_error(await self.client.get("/api/admin/products"), 401)
        await self.assert_error(await self.client.get("/api/admin/inquiries"), 401)
        await self.assert_error(await self.client.get("/api/admin/settings"), 401)

    async def test_login_cookie_session_csrf_and_logout(self):
        response = await self.login()
        cookie = response.cookies[COOKIE_NAME]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Strict")
        self.assertEqual(cookie["path"], "/api/admin")
        session = await self.client.get("/api/admin/session")
        self.assertEqual((await session.json())["csrfToken"], self.csrf)
        await self.assert_error(await self.client.post("/api/admin/products", json={}), 403)
        await self.assert_error(await self.client.post("/api/admin/logout", headers={"X-CSRF-Token": "wrong"}), 403)
        logout = await self.client.post("/api/admin/logout", headers=self.headers)
        self.assertEqual(logout.status, 200)
        await self.assert_error(await self.client.get("/api/admin/session"), 401)

    async def test_secure_cookie_default_and_origin_configuration(self):
        self.client.app[STORE_KEY].cookie_secure = True
        self.client.app[STORE_KEY].allowed_origins = ["https://shop.example", "https://shop.store"]
        response = await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD,
        }, headers={"Origin": "https://shop.example"})
        self.assertEqual(response.status, 200)
        self.assertTrue(response.cookies[COOKIE_NAME]["secure"])
        # Магазин работает на двух доменах: второй адрес тоже свой, а чужой — нет.
        second = await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD,
        }, headers={"Origin": "https://shop.store"})
        self.assertEqual(second.status, 200)
        await self.assert_error(await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD,
        }, headers={"Origin": "https://evil.example"}), 403)

    async def test_cross_origin_and_cross_site_mutations_are_rejected(self):
        await self.login()
        for headers in ({"Origin": "https://evil.example"}, {"Sec-Fetch-Site": "cross-site"},
                        {"Origin": "null"}, {"Origin": "http://[malformed"}):
            response = await self.client.post("/api/admin/products", json={},
                                              headers={**self.headers, **headers})
            await self.assert_error(response, 403)

    async def test_login_wrong_credentials_and_persistent_rate_limit(self):
        for index in range(8):
            response = await self.client.post("/api/admin/login", json={
                "username": "test-owner", "password": "wrong-password",
            }, headers={"X-Forwarded-For": f"192.0.2.{index}"})
            await self.assert_error(response, 401)
        await self.client.close()
        self.client = await self.make_client()
        response = await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD,
        }, headers={"X-Forwarded-For": "192.0.2.200"})
        await self.assert_error(response, 429)
        self.assertIn("Retry-After", response.headers)

    async def test_no_default_password_fails_closed(self):
        await self.client.close()
        with patch.dict(os.environ, {"ADMIN_PASSWORD_HASH": "", "ADMIN_PASSWORD": ""}):
            self.client = await self.make_client()
        await self.assert_error(await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD,
        }), 503)
        response = await self.client.get("/api/products")
        self.assertEqual(response.status, 200)

    async def test_draft_hiding_publication_validation_and_unpublish(self):
        await self.login()
        created = await self.client.post("/api/admin/products", json={"name": "Draft"}, headers=self.headers)
        draft = (await created.json())["product"]
        self.assertFalse(draft["published"])
        public = await self.client.get("/api/products")
        self.assertEqual((await public.json())["products"], [])
        listing = await self.client.get("/api/admin/products")
        self.assertEqual(len((await listing.json())["products"]), 1)
        incomplete = await self.client.put(f"/api/admin/products/{draft['id']}", json={"published": True}, headers=self.headers)
        await self.assert_error(incomplete, 400)
        product = await self.published_product()
        public = await self.client.get("/api/products")
        self.assertEqual([item["id"] for item in (await public.json())["products"]], [product["id"]])
        await self.client.put(f"/api/admin/products/{product['id']}", json={"published": False}, headers=self.headers)
        public = await self.client.get("/api/products")
        self.assertEqual((await public.json())["products"], [])

    async def test_product_validation_and_no_mass_assignment(self):
        await self.login()
        cases = [{"price": -1}, {"price": True}, {"price": "100"}, {"price": 1.001}, {"price": 10 ** 300},
                 {"old_price": -1}, {"old_price": 1.001}, {"price": 50000, "old_price": 50000}, {"old_price": 60000},
                 {"category": "car"}, {"range_km": 50000}, {"stock_status": "fake"},
                 {"license": "not-required"}, {"published": "false"}, {"unknown_field": 1},
                 {"image_url": "https://evil.example/photo.png"}, {"image_url": "/media/../secret"},
                 {"name": "a\u0000b"}, {"description": "a" * 12001}]
        for values in cases:
            with self.subTest(values=list(values)):
                response = await self.client.post("/api/admin/products", json=values, headers=self.headers)
                await self.assert_error(response, 400)
        response = await self.client.post("/api/admin/products", json={
            "license": "required", "license_verified": True,
        }, headers=self.headers)
        self.assertEqual(response.status, 201)

    async def test_discount_price_is_managed_in_crm_and_published(self):
        await self.login()
        product = await self.published_product(price=49900, old_price=59900)
        self.assertEqual(product["old_price"], 59900)
        public = await self.client.get("/api/products")
        self.assertEqual((await public.json())["products"][0]["old_price"], 59900)

    async def test_atv_category_persists_for_admin_and_public_catalog_without_license_claim(self):
        await self.login()
        response = await self.client.post("/api/admin/products", json={
            "name": "Quad draft", "category": "atv",
        }, headers=self.headers)
        self.assertEqual(response.status, 201, await response.text())
        draft = (await response.json())["product"]
        self.assertEqual(draft["category"], "atv")
        self.assertEqual(draft["license"], "unknown")
        self.assertFalse(draft["license_verified"])
        listing = await self.client.get("/api/admin/products")
        self.assertEqual((await listing.json())["products"][0]["category"], "atv")
        image_url = await self.upload()
        response = await self.client.put(f"/api/admin/products/{draft['id']}", json={
            "description": "Documented quad specifications.", "image_url": image_url,
            "price": 75000, "published": True,
        }, headers=self.headers)
        self.assertEqual(response.status, 200, await response.text())
        public = await self.client.get("/api/products")
        product = (await public.json())["products"][0]
        self.assertEqual(product["category"], "atv")
        self.assertEqual(product["license"], "unknown")
        self.assertFalse(product["license_verified"])
        unchecked = await self.client.put(f"/api/admin/products/{draft['id']}", json={
            "license": "not-required",
        }, headers=self.headers)
        await self.assert_error(unchecked, 400)

    async def test_json_format_and_body_limits(self):
        await self.login()
        response = await self.client.post("/api/admin/products", data="{}", headers=self.headers)
        await self.assert_error(response, 415)
        response = await self.client.post("/api/admin/products", data="broken", headers={
            **self.headers, "Content-Type": "application/json",
        })
        await self.assert_error(response, 400)
        response = await self.client.post("/api/admin/products", json={"name": "a" * (256 * 1024 + 1)}, headers=self.headers)
        await self.assert_error(response, 413)
        response = await self.client.post("/api/admin/products", json=[], headers=self.headers)
        await self.assert_error(response, 400)

    async def test_photo_upload_reencodes_metadata_and_controlled_media_path(self):
        await self.login()
        image_url = await self.upload()
        response = await self.client.get(image_url)
        self.assertEqual(response.headers["Content-Type"], "image/webp")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        with Image.open(io.BytesIO(await response.read())) as photo:
            self.assertEqual(photo.format, "WEBP")
            self.assertEqual(photo.size, (128, 96))
            self.assertNotIn("untrusted", photo.info)
            self.assertNotIn("exif", photo.info)
        for path in ("/media/store.sqlite3", "/media/%2e%2e%2fstore.sqlite3", "/media/" + "a" * 32 + ".webp"):
            await self.assert_error(await self.client.get(path), 404)

    async def test_product_gallery_keeps_its_order_and_derives_the_catalogue_cover(self):
        await self.login()
        first, second = await self.upload(), await self.upload()
        created = await self.client.post("/api/admin/products", json={
            "name": "Gallery model", "description": "Several photos of one model.",
            "category": "scooter", "price": 50000, "images": [second, first, second],
        }, headers=self.headers)
        self.assertEqual(created.status, 201, await created.text())
        product = (await created.json())["product"]
        self.assertEqual(product["images"], [second, first])  # duplicates dropped, order kept
        self.assertEqual(product["image_url"], second)
        # A card saved before galleries existed still reads back as a one-photo gallery.
        legacy = await self.client.post("/api/admin/products", json={
            "name": "Legacy model", "description": "Saved by an older client.",
            "category": "scooter", "price": 40000, "image_url": first,
        }, headers=self.headers)
        self.assertEqual((await legacy.json())["product"]["images"], [first])
        missing = await self.client.post("/api/admin/products", json={
            "name": "Ghost photo", "description": "Points at a file nobody uploaded.",
            "category": "scooter", "images": ["/media/" + "a" * 32 + ".webp"],
        }, headers=self.headers)
        await self.assert_error(missing, 400)

    async def test_upload_fits_a_phone_camera_photo_instead_of_refusing_it(self):
        await self.login()
        buffer = io.BytesIO()
        # 24 megapixels: what a current phone shoots, and more than the old ceiling allowed.
        Image.new("RGB", (6000, 4000), (200, 60, 10)).save(buffer, "JPEG", quality=60)
        body = FormData()
        body.add_field("file", buffer.getvalue(), filename="phone.jpg", content_type="image/jpeg")
        response = await self.client.post("/api/admin/upload", data=body, headers=self.headers)
        self.assertEqual(response.status, 201, await response.text())
        stored = await self.client.get((await response.json())["image_url"])
        with Image.open(io.BytesIO(await stored.read())) as photo:
            self.assertEqual(photo.size, (2000, 1333))

    async def test_upload_rejects_script_spoofed_mime_small_and_oversized_files(self):
        await self.login()
        tiny = io.BytesIO()
        Image.new("RGB", (16, 16)).save(tiny, "PNG")
        for payload, expected in ((b"<svg><script>alert(1)</script></svg>", 400),
                                  (tiny.getvalue(), 400), (b"a" * (MAX_UPLOAD + 1), 413)):
            body = FormData()
            body.add_field("file", io.BytesIO(payload), filename="safe.png", content_type="image/png")
            response = await self.client.post("/api/admin/upload", data=body, headers=self.headers)
            await self.assert_error(response, expected)

    async def test_product_settings_and_session_survive_restart(self):
        await self.login()
        product = await self.published_product()
        await self.client.put("/api/admin/settings", json={"warranty": "Stored warranty"}, headers=self.headers)
        cookie = self.client.session.cookie_jar.filter_cookies(self.client.make_url("/api/admin/session"))[COOKIE_NAME].value
        await self.client.close()
        self.client = await self.make_client()
        response = await self.client.get("/api/products")
        self.assertEqual((await response.json())["products"][0]["id"], product["id"])
        response = await self.client.get("/api/settings")
        self.assertEqual((await response.json())["settings"]["warranty"], "Stored warranty")
        response = await self.client.get("/api/admin/session", headers={"Cookie": f"{COOKIE_NAME}={cookie}"})
        self.assertEqual(response.status, 200)

    async def test_password_rotation_revokes_sessions(self):
        await self.login()
        cookie = self.client.session.cookie_jar.filter_cookies(self.client.make_url("/api/admin/session"))[COOKIE_NAME].value
        await self.client.close()
        new_hash = await asyncio.to_thread(hash_password, "another-test-password-only")
        with patch.dict(os.environ, {"ADMIN_PASSWORD_HASH": new_hash}):
            self.client = await self.make_client()
        await self.assert_error(await self.client.get("/api/admin/session", headers={"Cookie": f"{COOKIE_NAME}={cookie}"}), 401)

    async def test_expired_idle_session_is_rejected(self):
        await self.login()
        with self.client.app[STORE_KEY].connect() as connection:
            connection.execute("UPDATE sessions SET last_seen=?", (time.time() - 4000,))
        await self.assert_error(await self.client.get("/api/admin/session"), 401)

    async def test_remembered_owner_session_persists_and_survives_cleanup(self):
        response = await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD, "remember": True,
        }, headers={"Origin": self.origin})
        self.assertEqual(response.status, 200, await response.text())
        cookie = response.cookies[COOKIE_NAME]
        self.assertEqual(int(cookie["max-age"]), 14 * 86400)
        self.assertTrue(cookie["httponly"])
        token = cookie.value
        store = self.client.app[STORE_KEY]
        with store.connect() as connection:
            # Simulate closing the browser for two days, preserving the issued duration.
            connection.execute("UPDATE sessions SET created_at=created_at-172800, expires_at=expires_at-172800, last_seen=last_seen-172800")
        await self.login()  # A fresh short login must not prune the remembered device.
        self.client.session.cookie_jar.clear()
        self.client.session.cookie_jar.update_cookies({COOKIE_NAME: token})
        response = await self.client.get("/api/admin/session")
        self.assertEqual(response.status, 200, await response.text())
        csrf = (await response.json())["csrfToken"]
        logout = await self.client.post("/api/admin/logout", headers={"Origin": self.origin, "X-CSRF-Token": csrf})
        self.assertEqual(logout.status, 200)
        self.client.session.cookie_jar.update_cookies({COOKIE_NAME: token})
        await self.assert_error(await self.client.get("/api/admin/session"), 401)

    async def test_remembered_session_still_has_idle_and_absolute_expiry(self):
        for column, expired in (("last_seen", time.time() - 8 * 86400), ("expires_at", time.time() - 1)):
            login = await self.client.post("/api/admin/login", json={
                "username": "test-owner", "password": TEST_PASSWORD, "remember": True,
            }, headers={"Origin": self.origin})
            self.assertEqual(login.status, 200)
            with self.client.app[STORE_KEY].connect() as connection:
                connection.execute(f"UPDATE sessions SET {column}=?", (expired,))
            await self.assert_error(await self.client.get("/api/admin/session"), 401)

    async def test_shared_device_login_has_no_persistent_cookie(self):
        response = await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD, "remember": False,
        }, headers={"Origin": self.origin})
        self.assertEqual(response.status, 200)
        self.assertFalse(response.cookies[COOKIE_NAME]["max-age"])
        self.assertFalse(response.cookies[COOKIE_NAME]["expires"])
        await self.assert_error(await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD, "remember": "true",
        }, headers={"Origin": self.origin}), 400)

    async def test_registration_remember_choice_and_owner_shared_entry(self):
        for remember in (True, False):
            response = await self.client.post("/api/account/register", json={
                "name": "Photo customer", "contact": f"customer-{remember}@example.com",
                "city": "Сочи", "password": CUSTOMER_PASSWORD, "consent": True, "remember": remember,
            }, headers={"Origin": self.origin})
            self.assertEqual(response.status, 200, await response.text())
            cookie = response.cookies[ACCOUNT_COOKIE]
            self.assertEqual(cookie["max-age"], str(60 * 86400) if remember else "")
            account = await self.client.get("/api/account")
            self.assertEqual((await account.json())["account"]["name"], "Photo customer")
        owner = await self.client.post("/api/account/login", json={
            "contact": "test-owner", "password": TEST_PASSWORD, "remember": True,
        }, headers={"Origin": self.origin})
        self.assertEqual(owner.status, 200, await owner.text())
        self.assertEqual(int(owner.cookies[COOKIE_NAME]["max-age"]), 14 * 86400)

    async def test_settings_validation_and_inquiry_readiness(self):
        await self.login()
        response = await self.client.put("/api/admin/settings", json={"inquiries_enabled": True}, headers=self.headers)
        await self.assert_error(response, 400)
        for values in ({"telegram": "javascript:alert(1)"}, {"phone": "<script>"}, {"unknown": "x"},
                       {"city": "Сочи"}, {"shop_name": ""}, {"telegram_channel": "не канал"}):
            response = await self.client.put("/api/admin/settings", json=values, headers=self.headers)
            await self.assert_error(response, 400)
        await self.enable_inquiries()
        response = await self.client.get("/api/settings")
        self.assertEqual((await response.json())["settings"]["telegram"], "@test_store")
        # Канал со скидками нормализуется так же, как контактный Telegram.
        response = await self.client.put("/api/admin/settings",
                                         json={"telegram_channel": "https://t.me/test_channel"}, headers=self.headers)
        self.assertEqual(response.status, 200, await response.text())
        saved = (await (await self.client.get("/api/settings")).json())["settings"]
        self.assertEqual(saved["telegram_channel"], "@test_channel")

    async def test_punctuation_phone_cannot_enable_inquiries_or_be_customer_contact(self):
        await self.login()
        response = await self.client.put("/api/admin/settings", json={
            "phone": "-------", "legal_name": "Seller", "legal_details": "Test legal", "inquiries_enabled": True,
        }, headers=self.headers)
        await self.assert_error(response, 400)
        await self.enable_inquiries()
        payload = {"name": "Customer", "contact": "-------", "message": "Please help me choose.",
                   "items": [], "consent": True}
        await self.assert_error(await self.client.post("/api/inquiries", json=payload), 400)
        for phone in ("1234567", "+123456789012345"):
            response = await self.client.put("/api/admin/settings", json={"phone": phone}, headers=self.headers)
            self.assertEqual(response.status, 200, await response.text())
            response = await self.client.post("/api/inquiries", json={**payload, "contact": phone})
            self.assertEqual(response.status, 201, await response.text())

    async def test_inquiry_estimate_uses_current_server_price_not_cart(self):
        await self.login()
        product = await self.published_product()
        await self.enable_inquiries()
        await self.client.put(f"/api/admin/products/{product['id']}", json={"price": 70000.25}, headers=self.headers)
        response = await self.client.post("/api/inquiries", json={
            "name": "Customer", "contact": "+7 999 111 22 33", "message": "Please confirm stock.",
            "city": "Краснодар", "cdek_pvz": "KSD123, ул. Тестовая, 1",
            "items": [{"product_id": product["id"], "quantity": 2}], "consent": True,
        }, headers={"Origin": self.origin})
        self.assertEqual(response.status, 201, await response.text())
        receipt = (await response.json())["inquiry"]
        self.assertEqual(receipt["total"], 140000.5)
        self.assertNotIn("contact", receipt)
        listing = await self.client.get("/api/admin/inquiries")
        inquiry = (await listing.json())["inquiries"][0]
        self.assertEqual(inquiry["items"][0]["price"], 70000.25)
        self.assertEqual(inquiry["contact"], "+7 999 111 22 33")
        self.assertEqual(inquiry["cdek_pvz"], "KSD123, ул. Тестовая, 1")
        self.assertEqual(inquiry["payment_method"], "sbp")
        self.assertIn("consent_at", inquiry)
        response = await self.client.patch(f"/api/admin/inquiries/{inquiry['id']}", json={"status": "contacted"}, headers=self.headers)
        self.assertEqual((await response.json())["inquiry"]["status"], "contacted")
        await self.client.delete(f"/api/admin/products/{product['id']}", headers=self.headers)
        listing = await self.client.get("/api/admin/inquiries")
        self.assertEqual((await listing.json())["inquiries"][0]["items"][0]["name"], product["name"])

    async def test_disabled_inquiries_no_consent_and_price_tampering(self):
        payload = {"name": "Customer", "contact": "@customer", "message": "Please help me choose.",
                   "items": [], "consent": True}
        await self.assert_error(await self.client.post("/api/inquiries", json=payload), 503)
        await self.login()
        await self.enable_inquiries()
        await self.assert_error(await self.client.post("/api/inquiries", json={**payload, "consent": False}), 400)
        await self.assert_error(await self.client.post("/api/inquiries", json={**payload, "total": 1}), 400)
        await self.assert_error(await self.client.post("/api/inquiries", json={**payload, "items": [
            {"product_id": "a" * 32, "quantity": 1, "price": 1},
        ]}), 400)
        await self.assert_error(await self.client.post("/api/inquiries", json={**payload, "city": "Москва", "cdek_pvz": "MSK123", "items": [
            {"product_id": "a" * 32, "quantity": 1},
        ]}), 409)
        # A cart without a destination cannot be quoted for a country-wide shop.
        product = await self.published_product()
        await self.assert_error(await self.client.post("/api/inquiries", json={
            **payload, "items": [{"product_id": product["id"], "quantity": 1}],
        }), 400)

    async def test_public_inquiry_rate_limit(self):
        for _ in range(60):
            response = await self.client.post("/api/inquiries", json={})
            await self.assert_error(response, 400)
        response = await self.client.post("/api/inquiries", json={})
        await self.assert_error(response, 429)

    async def test_public_inquiries_distinguish_customers_behind_shared_proxy(self):
        await self.login()
        await self.enable_inquiries()
        payload = {"name": "Customer", "contact": "@customer_a", "message": "Please help choose a model.",
                   "items": [], "consent": True}
        for suffix in "abcdefg":
            response = await self.client.post("/api/inquiries", json={**payload, "contact": f"@customer_{suffix}"})
            self.assertEqual(response.status, 201, await response.text())
        # The same identity (case/@ normalized) still has only five attempts.
        for _ in range(4):
            response = await self.client.post("/api/inquiries", json={**payload, "contact": "CUSTOMER_A"})
            self.assertEqual(response.status, 201, await response.text())
        await self.assert_error(await self.client.post("/api/inquiries", json=payload), 429)

    async def test_idempotent_inquiry_replay_survives_restart_and_checks_body(self):
        await self.login()
        await self.enable_inquiries()
        payload = {"name": "Customer", "contact": "@customer", "message": "Please help choose a model.",
                   "items": [], "consent": True}
        headers = {"Idempotency-Key": "test-client-request-123456789"}
        first = await self.client.post("/api/inquiries", json=payload, headers=headers)
        self.assertEqual(first.status, 201)
        receipt = await first.json()
        # Reordering JSON keys is the same request; retries do not spend the lead quota.
        for _ in range(7):
            replay = await self.client.post("/api/inquiries", json=dict(reversed(list(payload.items()))), headers=headers)
            self.assertEqual(replay.status, 201)
            self.assertEqual(await replay.json(), receipt)
            self.assertEqual(replay.headers["Idempotency-Replayed"], "true")
        conflict = await self.client.post("/api/inquiries", json={**payload, "name": "Different"}, headers=headers)
        await self.assert_error(conflict, 409)
        with self.client.app[STORE_KEY].connect() as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM inquiries").fetchone()[0], 1)
        await self.client.close()
        self.client = await self.make_client()
        replay = await self.client.post("/api/inquiries", json=payload, headers=headers)
        self.assertEqual(await replay.json(), receipt)

    async def test_concurrent_inquiry_retry_creates_one_record_and_invalid_key_is_rejected(self):
        await self.login()
        await self.enable_inquiries()
        payload = {"name": "Customer", "contact": "@customer", "message": "Please help choose a model.",
                   "items": [], "consent": True}
        headers = {"Idempotency-Key": "concurrent-client-request-123456"}
        first, second = await asyncio.gather(
            self.client.post("/api/inquiries", json=payload, headers=headers),
            self.client.post("/api/inquiries", json=payload, headers=headers),
        )
        self.assertEqual(first.status, 201)
        self.assertEqual(second.status, 201)
        self.assertEqual(await first.json(), await second.json())
        for key in ("short", "a" * 129, "request with spaces and unsafe characters"):
            await self.assert_error(await self.client.post("/api/inquiries", json=payload,
                                    headers={"Idempotency-Key": key}), 400)

    async def test_locked_database_returns_retryable_response_without_long_stall(self):
        with self.client.app[STORE_KEY].connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            started = time.monotonic()
            response = await self.client.post("/api/admin/login", json={
                "username": "test-owner", "password": TEST_PASSWORD,
            })
            self.assertLess(time.monotonic() - started, 1.5)
            await self.assert_error(response, 503)
            self.assertEqual(response.headers["Retry-After"], "1")

    async def test_concurrent_password_checks_are_bounded_without_unlimited_queue(self):
        semaphore = self.client.app[STORE_KEY].hash_lock
        await semaphore.acquire()
        await semaphore.acquire()
        try:
            response = await self.client.post("/api/admin/login", json={
                "username": "test-owner", "password": TEST_PASSWORD,
            })
            await self.assert_error(response, 429)
            self.assertEqual(response.headers["Retry-After"], "2")
        finally:
            semaphore.release()
            semaphore.release()

    async def test_unknown_routes_return_json_and_sql_injection_does_not_match(self):
        await self.login()
        await self.assert_error(await self.client.get("/api/not-a-route"), 404)
        response = await self.client.delete("/api/admin/products/'%20OR%201=1--", headers=self.headers)
        await self.assert_error(response, 404)

    async def test_inquiry_pagination_can_reach_oldest_new_record_beyond_first_thousand(self):
        await self.login()
        rows, expected_counts = [], {"new": 0, "contacted": 0, "closed": 0}
        for number in range(1005):
            status = ("new", "contacted", "closed")[number % 3]
            timestamp = (datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=number)).isoformat()
            inquiry = {"id": f"{number:032x}", "name": "Pagination test", "contact": "@fixture_test",
                       "message": "Test only", "items": [], "total": 0, "status": status,
                       "created_at": timestamp, "updated_at": timestamp, "consent_at": timestamp}
            rows.append((inquiry["id"], json.dumps(inquiry), status, timestamp, timestamp))
            expected_counts[status] += 1
        with self.client.app[STORE_KEY].connect() as connection:
            connection.executemany("INSERT INTO inquiries(id,data,status,created_at,updated_at) VALUES(?,?,?,?,?)", rows)
        response = await self.client.get("/api/admin/inquiries")
        first = await response.json()
        self.assertEqual((first["total"], first["page"], first["page_size"], first["total_pages"]), (1005, 1, 50, 21))
        self.assertEqual(len(first["inquiries"]), 50)
        response = await self.client.get("/api/admin/inquiries?page=21")
        last = await response.json()
        self.assertEqual(len(last["inquiries"]), 5)
        self.assertEqual(last["inquiries"][-1]["id"], "0" * 32)
        self.assertEqual(last["inquiries"][-1]["status"], "new")
        for status, expected in expected_counts.items():
            response = await self.client.get(f"/api/admin/inquiries?status={status}&page_size=100&page=4")
            filtered = await response.json()
            self.assertEqual(filtered["total"], expected)
            self.assertEqual(filtered["total_pages"], 4)
            self.assertEqual(len(filtered["inquiries"]), 35)
            self.assertTrue(all(item["status"] == status for item in filtered["inquiries"]))
            if status == "new":
                self.assertEqual(filtered["inquiries"][-1]["id"], "0" * 32)
        response = await self.client.get("/api/admin/inquiries?page=999")
        self.assertEqual((await response.json())["inquiries"], [])

    async def test_inquiry_pagination_empty_and_invalid_queries(self):
        await self.login()
        response = await self.client.get("/api/admin/inquiries?status=new")
        self.assertEqual(await response.json(), {"inquiries": [], "total": 0, "page": 1,
                                                "page_size": 50, "total_pages": 0})
        for query in ("page=0", "page=-1", "page=1.5", "page=abc", "page=", "page=99999999999999",
                      "page_size=0", "page_size=101", "page_size=-1", "page_size=1.5",
                      "status=invalid", "status=NEW", "page=1&page=2", "other=1"):
            with self.subTest(query=query):
                await self.assert_error(await self.client.get(f"/api/admin/inquiries?{query}"), 400)

    async def register(self, contact="+7 999 111 22 33", password=CUSTOMER_PASSWORD, name="Customer", city="Москва"):
        response = await self.client.post("/api/account/register", json={
            "name": name, "contact": contact, "city": city, "password": password, "consent": True,
        }, headers={"Origin": self.origin})
        return response

    async def test_customer_crm_cart_preferences_and_access(self):
        await self.assert_error(await self.client.get('/api/admin/customers'), 401)
        await self.assert_error(await self.client.get('/api/account/cart'), 401)
        await self.assert_error(await self.client.get('/api/admin/analytics'), 401)
        await self.register(contact='shopper@example.com', name='Покупатель')
        state = await (await self.client.get('/api/account')).json()
        headers = {'Origin': self.origin, 'X-CSRF-Token': state['csrfToken']}
        with self.client.server.app[STORE_KEY].connect() as db:
            db.execute('INSERT INTO products VALUES(?,?,1,?)', ('test-model', json.dumps({'id': 'test-model', 'name': 'Test model', 'price': 1000}), '2026-09-12'))
        items = [{'product_id': 'test-model', 'quantity': 2}]
        await self.assert_error(await self.client.post('/api/account/cart', json={'items': items}, headers={'Origin': self.origin}), 403)
        saved = await self.client.post('/api/account/cart', json={'items': items}, headers=headers)
        self.assertEqual(saved.status, 200, await saved.text())
        self.assertEqual((await (await self.client.get('/api/account/cart')).json())['items'], items)
        prefs = await (await self.client.get('/api/account/preferences')).json()
        self.assertEqual(prefs['email'], 'shopper@example.com')
        self.assertFalse(prefs['marketing'])
        response = await self.client.post('/api/account/preferences', json={'email': 'shopper@example.com', 'marketing': True}, headers=headers)
        self.assertEqual(response.status, 200, await response.text())
        self.assertTrue((await response.json())['marketing'])
        await self.login()
        owners = await (await self.client.get('/api/admin/customers?q=покупатель')).json()
        self.assertEqual(owners['total'], 1)
        self.assertEqual(owners['customers'][0]['cart'][0]['name'], 'Test model')
        self.assertNotIn('password_hash', owners['customers'][0])
        response = await self.client.post('/api/account/preferences', json={'email': 'shopper@example.com', 'marketing': False}, headers=headers)
        self.assertFalse((await response.json())['marketing'])
        with self.client.server.app[STORE_KEY].connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM customer_consent_log').fetchone()[0], 2)
        await self.client.post('/api/account/logout', headers=headers)
        await self.register(contact='second@example.com')
        self.assertEqual((await (await self.client.get('/api/account/cart')).json())['items'], [])

    async def test_customer_crm_metrika_duration_daily_and_cache(self):
        await self.assert_error(await self.client.get('/api/admin/analytics'), 401)
        await self.login()
        upstream = MagicMock()
        queries = []

        def report_response(url, *, params, allow_redirects):
            self.assertEqual(url, 'https://api-metrika.yandex.net/stat/v1/data')
            self.assertFalse(allow_redirects)
            queries.append(params)
            totals = [100, 80, 240, 15, 125]
            if params.get('filters'):
                self.assertEqual(params['filters'], 'ym:s:visitDuration>60')
                totals = [25, 20]
            response = MagicMock(status=200)
            response.json = AsyncMock(return_value={'totals': totals, 'data': [], 'sampled': False})
            context = MagicMock()
            context.__aenter__ = AsyncMock(return_value=response)
            context.__aexit__ = AsyncMock(return_value=False)
            return context

        upstream.get.side_effect = report_response
        with patch.dict(os.environ, {'YANDEX_METRIKA_TOKEN': 'isolated-fake-token'}), patch('customer_crm.ClientSession') as client_session:
            client_session.return_value.__aenter__.return_value = upstream
            result = await (await self.client.get('/api/admin/analytics?days=30')).json()
            self.assertTrue(result['connected'])
            self.assertEqual(result['engaged']['totals'], [25, 20])
            self.assertEqual(result['totals']['totals'][4], 125)
            self.assertEqual(len(queries), 5)
            daily = next(q for q in queries if q.get('dimensions') == 'ym:s:date')
            self.assertEqual(daily['sort'], 'ym:s:date')
            self.assertEqual(daily['limit'], '30')
            self.assertEqual((datetime.fromisoformat(daily['date2']) - datetime.fromisoformat(daily['date1'])).days, 29)
            cached = await (await self.client.get('/api/admin/analytics?days=30')).json()
            self.assertEqual(cached, result)
            self.assertEqual(len(queries), 5)
            self.assertNotIn('isolated-fake-token', json.dumps(result))
            upstream.get.side_effect = ValueError('isolated-fake-token upstream failure')
            failed = await (await self.client.get('/api/admin/analytics?days=7')).json()
            self.assertFalse(failed['connected'])
            self.assertNotIn('isolated-fake-token', json.dumps(failed))

    async def test_customer_crm_validation_and_disconnected_metrics(self):
        await self.register()
        state = await (await self.client.get('/api/account')).json()
        headers = {'Origin': self.origin, 'X-CSRF-Token': state['csrfToken']}
        for body in ({'items': [{'product_id': 'x', 'quantity': True}]}, {'items': [], 'customer_id': 'another'}, {'items': 'wrong'}):
            await self.assert_error(await self.client.post('/api/account/cart', json=body, headers=headers), 400)
        for body in ({'email': '', 'marketing': True}, {'email': 'not email', 'marketing': False}, {'email': 'x@example.com', 'marketing': 'yes'}):
            await self.assert_error(await self.client.post('/api/account/preferences', json=body, headers=headers), 400)
        await self.login()
        with patch.dict(os.environ, {'YANDEX_METRIKA_TOKEN': ''}):
            result = await (await self.client.get('/api/admin/analytics')).json()
        self.assertFalse(result['connected'])
        self.assertEqual(result['counter'], 112522333)
        self.assertEqual(result['local']['customers'], 1)
        await self.assert_error(await self.client.get('/api/admin/analytics?days=999'), 400)

    async def test_account_registration_creates_a_session_and_normalizes_the_contact(self):
        response = await self.register()
        self.assertEqual(response.status, 200, await response.text())
        body = await response.json()
        self.assertEqual(body["role"], "customer")
        self.assertEqual(body["account"], {"name": "Customer", "contact": "+7 999 111 22 33", "city": "Москва"})
        cookie = response.cookies[ACCOUNT_COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Strict")
        self.assertEqual(cookie["path"], "/api")
        state = await self.client.get("/api/account")
        self.assertEqual((await state.json())["account"]["name"], "Customer")
        # The same number written differently is the same person, not a second account.
        await self.assert_error(await self.register(contact="+79991112233"), 409)
        await self.assert_error(await self.register(contact="+7 999 111 22 33", password="short"), 400)
        await self.assert_error(await self.client.post("/api/account/register", json={
            "name": "No consent", "contact": "user@example.com", "password": CUSTOMER_PASSWORD,
        }, headers={"Origin": self.origin}), 400)

    async def test_a_remembered_customer_session_slides_instead_of_expiring_on_a_fixed_date(self):
        """Покупатель, который заходит в магазин, не должен выпадать из аккаунта по сроку входа."""
        await self.register()
        store = self.client.app[STORE_KEY]
        with store.connect() as connection:
            opened = connection.execute("SELECT expires_at FROM customer_sessions").fetchone()["expires_at"]
            # Отматываем сессию почти к концу срока: так выглядит покупатель спустя два месяца.
            connection.execute("UPDATE customer_sessions SET expires_at=?", (time.time() + 60,))
        state = await self.client.get("/api/account")
        self.assertEqual((await state.json())["account"]["name"], "Customer")
        with store.connect() as connection:
            renewed = connection.execute("SELECT expires_at FROM customer_sessions").fetchone()["expires_at"]
        self.assertGreater(renewed, opened - 5)
        # Браузер выкидывает саму куку по её сроку, поэтому витрина продлевает и её.
        self.assertEqual(int(state.cookies[ACCOUNT_COOKIE]["max-age"]), ACCOUNT_SESSION_AGE)

    async def test_a_session_without_the_remember_mark_keeps_its_original_deadline(self):
        """На чужом устройстве отметки нет: срок сессии не должен продлеваться заходами."""
        response = await self.client.post("/api/account/register", json={
            "name": "Guest", "contact": "guest@example.com", "city": "Москва",
            "password": CUSTOMER_PASSWORD, "consent": True, "remember": False,
        }, headers={"Origin": self.origin})
        self.assertEqual(response.status, 200, await response.text())
        self.assertIsNone(response.cookies[ACCOUNT_COOKIE]["max-age"] or None)
        store = self.client.app[STORE_KEY]
        with store.connect() as connection:
            opened = connection.execute("SELECT expires_at FROM customer_sessions").fetchone()["expires_at"]
        state = await self.client.get("/api/account")
        self.assertEqual((await state.json())["account"]["name"], "Guest")
        with store.connect() as connection:
            self.assertEqual(connection.execute("SELECT expires_at FROM customer_sessions").fetchone()["expires_at"], opened)
        self.assertNotIn(ACCOUNT_COOKIE, state.cookies)

    async def test_one_form_signs_in_customers_and_the_owner_separately(self):
        await self.register()
        logout = await self.client.post("/api/account/logout", headers={
            "Origin": self.origin, "X-CSRF-Token": (await (await self.client.get("/api/account")).json())["csrfToken"],
        })
        self.assertEqual(logout.status, 200, await logout.text())
        self.assertIsNone((await (await self.client.get("/api/account")).json())["account"])
        for password in (CUSTOMER_PASSWORD + "x", TEST_PASSWORD):
            await self.assert_error(await self.client.post("/api/account/login", json={
                "contact": "+7 999 111 22 33", "password": password,
            }, headers={"Origin": self.origin}), 401)
        await self.assert_error(await self.client.post("/api/account/login", json={
            "contact": "nobody@example.com", "password": CUSTOMER_PASSWORD,
        }, headers={"Origin": self.origin}), 401)
        customer = await self.client.post("/api/account/login", json={
            "contact": "+79991112233", "password": CUSTOMER_PASSWORD,
        }, headers={"Origin": self.origin})
        self.assertEqual((await customer.json())["account"], {"name": "Customer", "contact": "+7 999 111 22 33", "city": "Москва"})
        # Owner credentials open the CRM through the very same form.
        owner = await self.client.post("/api/account/login", json={
            "contact": "test-owner", "password": TEST_PASSWORD,
        }, headers={"Origin": self.origin})
        self.assertEqual(owner.status, 200, await owner.text())
        self.assertEqual((await owner.json())["role"], "owner")
        self.assertEqual(owner.cookies[COOKIE_NAME]["path"], "/api/admin")
        self.assertEqual((await (await self.client.get("/api/admin/session")).json())["username"], "test-owner")
        await self.assert_error(await self.client.post("/api/account/login", json={
            "contact": "test-owner", "password": CUSTOMER_PASSWORD,
        }, headers={"Origin": self.origin}), 401)

    async def test_history_holds_only_inquiries_sent_while_signed_in(self):
        await self.login()
        product = await self.published_product()
        await self.enable_inquiries()
        order = {"name": "Customer", "contact": "+7 999 111 22 33", "message": "Please confirm stock.",
                 "city": "Казань", "cdek_pvz": "KZN456, ул. Тестовая, 2",
                 "items": [{"product_id": product["id"], "quantity": 1}], "consent": True}
        anonymous = await self.client.post("/api/inquiries", json=order, headers={"Origin": self.origin})
        self.assertEqual(anonymous.status, 201, await anonymous.text())
        await self.assert_error(await self.client.get("/api/account/inquiries"), 401)
        await self.register()
        signed_in = await self.client.post("/api/inquiries", json={**order, "message": "Second question here."},
                                           headers={"Origin": self.origin})
        self.assertEqual(signed_in.status, 201, await signed_in.text())
        history = await self.client.get("/api/account/inquiries")
        inquiries = (await history.json())["inquiries"]
        self.assertEqual([inquiry["id"] for inquiry in inquiries], [(await signed_in.json())["inquiry"]["id"]])
        self.assertEqual(inquiries[0]["items"][0]["name"], product["name"])
        self.assertEqual(inquiries[0]["city"], "Казань")
        self.assertNotIn("contact", inquiries[0])
        owner_view = await self.client.get("/api/admin/inquiries")
        self.assertEqual((await owner_view.json())["inquiries"][0]["city"], "Казань")
        # A second person registering with the same details starts with an empty history.
        await self.client.post("/api/account/logout", headers={
            "Origin": self.origin, "X-CSRF-Token": (await (await self.client.get("/api/account")).json())["csrfToken"],
        })
        await self.register(contact="other@example.com", name="Other")
        self.assertEqual((await (await self.client.get("/api/account/inquiries")).json())["inquiries"], [])

    async def test_account_session_survives_restart_and_rejects_forged_tokens(self):
        await self.register()
        await self.client.close()
        self.client = await self.make_client()
        self.client.session.cookie_jar.update_cookies({ACCOUNT_COOKIE: "forged-token-value"})
        await self.assert_error(await self.client.get("/api/account/inquiries"), 401)


    async def test_installment_order_opens_a_bank_form_and_the_webhook_confirms_it(self):
        await self.login()
        product = await self.published_product()
        await self.enable_inquiries()
        response = await self.client.put("/api/admin/settings", json={"payment_installment": "on"}, headers=self.headers)
        self.assertEqual(response.status, 200, await response.text())
        link = "https://forma.tinkoff.ru/order/test"
        with patch("store_api.init_tbank_credit", AsyncMock(return_value={"payment_id": "credit-1", "payment_url": link})) as credit:
            order = await self.client.post("/api/inquiries", json={
                "name": "Customer", "contact": "+7 999 111 22 33", "message": "",
                "city": "Сочи", "cdek_pvz": "SCH1, ул. Тестовая, 3", "payment_method": "installment",
                "items": [{"product_id": product["id"], "quantity": 1}], "consent": True,
            }, headers={"Origin": self.origin})
        self.assertEqual(order.status, 201, await order.text())
        receipt = (await order.json())["inquiry"]
        self.assertEqual(receipt["payment_url"], link)
        self.assertEqual(receipt["status"], "awaiting_payment")
        self.assertTrue(credit.await_args.args[1].startswith("http"))
        # Чужая заявка банка не должна закрывать заказ.
        await self.assert_error(await self.client.post(CREDIT_NOTIFICATION_PATH, json={
            "orderNumber": receipt["id"], "id": "other", "status": "signed",
        }), 409)
        confirmed = await self.client.post(CREDIT_NOTIFICATION_PATH, json={
            "orderNumber": receipt["id"], "id": "credit-1", "status": "signed",
        })
        self.assertEqual(confirmed.status, 200, await confirmed.text())
        inquiry = (await (await self.client.get("/api/admin/inquiries")).json())["inquiries"][0]
        self.assertEqual(inquiry["status"], "paid")
        self.assertEqual(inquiry["payment_status"], "signed")

    async def test_credit_webhook_checks_the_secret_key_when_it_is_configured(self):
        with patch.dict(os.environ, {"TBANK_CREDIT_WEBHOOK_SECRET": "webhook-secret"}):
            await self.assert_error(await self.client.post(CREDIT_NOTIFICATION_PATH, json={
                "orderNumber": "a" * 32, "id": "credit-1", "status": "signed",
            }), 403)
            await self.assert_error(await self.client.post(
                f"{CREDIT_NOTIFICATION_PATH}?key=webhook-secret",
                json={"orderNumber": "a" * 32, "id": "credit-1", "status": "signed"}), 404)

    async def test_customer_password_accepts_eight_characters(self):
        response = await self.client.post("/api/account/register", json={
            "name": "Customer", "contact": "short@example.com", "city": "Сочи",
            "password": "12345678", "consent": True,
        }, headers={"Origin": self.origin})
        self.assertEqual(response.status, 200, await response.text())
        await self.assert_error(await self.client.post("/api/account/register", json={
            "name": "Customer", "contact": "tiny@example.com", "city": "Сочи",
            "password": "1234567", "consent": True,
        }, headers={"Origin": self.origin}), 400)

    async def test_payment_check_reports_missing_keys_and_asks_the_bank(self):
        await self.login()
        with patch.dict(os.environ, {"TBANK_TERMINAL_KEY": "", "TBANK_PASSWORD": ""}):
            report = await (await self.client.post("/api/admin/payment-check", headers=self.headers)).json()
        titles = {check["title"]: check for check in report["checks"]}
        self.assertFalse(titles["Ключ терминала (TBANK_TERMINAL_KEY)"]["ok"])
        self.assertIsNone(report["bank"])
        self.assertTrue(report["urls"]["notification"].endswith("/api/payments/tbank/notification"))
        captured = {}
        session = FakeSession({"Success": True, "PaymentURL": "https://securepay.tinkoff.ru/x", "PaymentId": "1"}, captured)
        with patch.dict(os.environ, {"TBANK_TERMINAL_KEY": "TinkoffTest", "TBANK_PASSWORD": "secret"}), \
                patch("store_api.ClientSession", session):
            report = await (await self.client.post("/api/admin/payment-check", headers=self.headers)).json()
        self.assertTrue(report["bank"]["ok"], report["bank"])
        self.assertEqual(captured["json"]["Amount"], 100)
        # Отказ банка возвращается владельцу с технической причиной.
        refusal = FakeSession({"Success": False, "ErrorCode": "9999", "Message": "Неверный токен"}, {})
        with patch.dict(os.environ, {"TBANK_TERMINAL_KEY": "TinkoffTest", "TBANK_PASSWORD": "secret"}), \
                patch("store_api.ClientSession", refusal):
            report = await (await self.client.post("/api/admin/payment-check", headers=self.headers)).json()
        self.assertFalse(report["bank"]["ok"])
        self.assertIn("Неверный токен", report["bank"]["detail"])
        await self.assert_error(await self.client.post("/api/admin/payment-check"), 403)

    async def test_order_goes_through_without_a_pickup_point(self):
        await self.login()
        product = await self.published_product()
        await self.enable_inquiries()
        response = await self.client.post("/api/inquiries", json={
            "name": "Customer", "contact": "+7 999 111 22 33", "message": "",
            "city": "Краснодар", "cdek_pvz": "", "payment_method": "sbp",
            "items": [{"product_id": product["id"], "quantity": 1}], "consent": True,
        }, headers={"Origin": self.origin})
        self.assertEqual(response.status, 201, await response.text())
        inquiry = (await (await self.client.get("/api/admin/inquiries")).json())["inquiries"][0]
        self.assertEqual(inquiry["cdek_pvz"], "")
        # Город по-прежнему обязателен: без него заказ отправлять некуда.
        await self.assert_error(await self.client.post("/api/inquiries", json={
            "name": "Customer", "contact": "+7 999 111 22 44", "message": "",
            "city": "", "cdek_pvz": "", "payment_method": "sbp",
            "items": [{"product_id": product["id"], "quantity": 1}], "consent": True,
        }, headers={"Origin": self.origin}), 400)

    async def test_pickup_list_is_announced_only_with_cdek_keys(self):
        with patch.dict(os.environ, {"CDEK_CLIENT_ID": "", "CDEK_CLIENT_SECRET": ""}):
            settings = (await (await self.client.get("/api/settings")).json())["settings"]
        self.assertEqual(settings["cdek_points"], "")
        with patch.dict(os.environ, {"CDEK_CLIENT_ID": "account", "CDEK_CLIENT_SECRET": "secret"}):
            settings = (await (await self.client.get("/api/settings")).json())["settings"]
        self.assertEqual(settings["cdek_points"], "on")


class FakeCdekSession:
    """Сеть СДЭК в тестах: токен и список пунктов задаются тестом, запросы записываются."""

    def __init__(self, offices, token="test-token", token_status=200, points_status=200):
        self.offices, self.token, self.token_status, self.points_status = offices, token, token_status, points_status
        self.calls = []

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def post(self, url, data=None, json=None):
        self.calls.append(("post", url, data))
        return FakeSession._Response(FakeResponse({"access_token": self.token, "expires_in": 3600},
                                                  self.token_status))

    def get(self, url, params=None, headers=None):
        self.calls.append(("get", url, params))
        return FakeSession._Response(FakeResponse(self.offices, self.points_status))


class CdekPointsTests(unittest.IsolatedAsyncioTestCase):
    office = {"code": "SCH1", "name": "Сочи-1", "work_time": "Пн-Пт 10:00-19:00", "nearest_station": "Ривьера",
              "location": {"city": "Сочи", "address_full": "Сочи, ул. Тестовая, 3", "latitude": 43.6, "longitude": 39.7}}
    other = {"code": "SCH2", "location": {"city": "Сочи", "address_full": "Сочи, ул. Морская, 10"}}

    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.environment = patch.dict(os.environ, {"DATA_DIR": self.directory.name, "COOKIE_SECURE": "false",
                                                   "CDEK_CLIENT_ID": "client", "CDEK_CLIENT_SECRET": "secret"})
        self.environment.start()
        store_api._CDEK_TOKEN.update({"value": "", "expires": 0.0})
        app = web.Application()
        setup_store(app)
        self.client = TestClient(TestServer(app), cookie_jar=CookieJar(unsafe=True))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.environment.stop()
        self.directory.cleanup()
        store_api._CDEK_TOKEN.update({"value": "", "expires": 0.0})

    async def test_points_arrive_without_a_widget_key(self):
        session = FakeCdekSession([self.office, self.other])
        with patch("store_api.ClientSession", session):
            response = await self.client.get("/api/cdek/points?city=Сочи")
        self.assertEqual(response.status, 200)
        body = await response.json()
        self.assertTrue(body["available"])
        self.assertEqual(body["points"][0], {
            "code": "SCH1", "name": "Сочи-1", "address": "Сочи, ул. Тестовая, 3", "city": "Сочи",
            "work_time": "Пн-Пт 10:00-19:00", "note": "", "nearest_station": "Ривьера",
            "latitude": 43.6, "longitude": 39.7,
        })
        params = [call[2] for call in session.calls if call[0] == "get"][0]
        self.assertEqual(params["city"], "Сочи")
        self.assertEqual(params["type"], "PVZ")
        self.assertEqual(params["is_handout"], "true")
        # Секрет уходит только в запрос токена и не попадает в ответ покупателю.
        self.assertNotIn("secret", json.dumps(body, ensure_ascii=False))

    async def test_query_filters_by_street_and_code(self):
        session = FakeCdekSession([self.office, self.other])
        with patch("store_api.ClientSession", session):
            response = await self.client.get("/api/cdek/points?city=Сочи&query=МОРСКАЯ")
        body = await response.json()
        self.assertEqual([point["code"] for point in body["points"]], ["SCH2"])
        with patch("store_api.ClientSession", session):
            response = await self.client.get("/api/cdek/points?city=Сочи&query=sch1")
        self.assertEqual([point["code"] for point in (await response.json())["points"]], ["SCH1"])

    async def test_missing_credentials_answer_politely_instead_of_failing(self):
        with patch.dict(os.environ, {"CDEK_CLIENT_ID": "", "CDEK_CLIENT_SECRET": ""}):
            response = await self.client.get("/api/cdek/points?city=Сочи")
        self.assertEqual(response.status, 200)
        body = await response.json()
        self.assertEqual(body["points"], [])
        self.assertFalse(body["available"])
        self.assertTrue(body["reason"])

    async def test_broken_cdek_never_breaks_the_order_form(self):
        session = FakeCdekSession([], points_status=500)
        with patch("store_api.ClientSession", session):
            body = await (await self.client.get("/api/cdek/points?city=Сочи")).json()
        self.assertEqual((body["points"], body["available"]), ([], False))
        self.assertTrue(body["reason"])

    async def test_unknown_parameters_and_long_values_are_rejected(self):
        response = await self.client.get("/api/cdek/points?city=Сочи&limit=100")
        self.assertEqual(response.status, 400)
        response = await self.client.get("/api/cdek/points?city=Сочи&city=Москва")
        self.assertEqual(response.status, 400)
        response = await self.client.get("/api/cdek/points?city=" + "а" * 200)
        self.assertEqual(response.status, 400)


if __name__ == "__main__":
    unittest.main()
