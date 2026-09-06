"""Integration tests use an isolated SQLite directory, never production data."""

import asyncio
import io
import json
import os
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from aiohttp import CookieJar, FormData, web
from aiohttp.test_utils import TestClient, TestServer
from PIL import Image, PngImagePlugin

from store_api import (ACCOUNT_COOKIE, COOKIE_NAME, MAX_UPLOAD, STORE_KEY, hash_password, setup_store,
                       valid_phone, verify_password)

TEST_PASSWORD = "isolated-test-password-only"
CUSTOMER_PASSWORD = "isolated-customer-password"


class PasswordTests(unittest.TestCase):
    def test_phone_requires_seven_to_fifteen_ascii_digits(self):
        for phone in ("1234567", "+123456789012345", "+7 (999) 111-22-33"):
            self.assertTrue(valid_phone(phone), phone)
        for phone in ("-------", "( ) - -", "123456", "1234567890123456", "١٢٣٤٥٦٧", "++1234567", "123+4567"):
            self.assertFalse(valid_phone(phone), phone)

    def test_salted_scrypt_password_and_failure(self):
        encoded = hash_password(TEST_PASSWORD)
        self.assertTrue(encoded.startswith("scrypt$32768$8$3$"))
        self.assertTrue(verify_password(TEST_PASSWORD, encoded))
        self.assertFalse(verify_password("wrong", encoded))
        self.assertFalse(verify_password(TEST_PASSWORD, "broken"))
        self.assertNotEqual(encoded, hash_password(TEST_PASSWORD))
        with self.assertRaises(ValueError):
            hash_password("short")


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
        self.client.app[STORE_KEY].allowed_origin = "https://shop.example"
        response = await self.client.post("/api/admin/login", json={
            "username": "test-owner", "password": TEST_PASSWORD,
        }, headers={"Origin": "https://shop.example"})
        self.assertEqual(response.status, 200)
        self.assertTrue(response.cookies[COOKIE_NAME]["secure"])

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

    async def test_json_format_and_body_limits(self):
        await self.login()
        response = await self.client.post("/api/admin/products", data="{}", headers=self.headers)
        await self.assert_error(response, 415)
        response = await self.client.post("/api/admin/products", data="broken", headers={
            **self.headers, "Content-Type": "application/json",
        })
        await self.assert_error(response, 400)
        response = await self.client.post("/api/admin/products", json={"name": "a" * 70000}, headers=self.headers)
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

    async def test_settings_validation_and_inquiry_readiness(self):
        await self.login()
        response = await self.client.put("/api/admin/settings", json={"inquiries_enabled": True}, headers=self.headers)
        await self.assert_error(response, 400)
        for values in ({"telegram": "javascript:alert(1)"}, {"phone": "<script>"}, {"unknown": "x"}, {"city": "Сочи"}, {"shop_name": ""}):
            response = await self.client.put("/api/admin/settings", json=values, headers=self.headers)
            await self.assert_error(response, 400)
        await self.enable_inquiries()
        response = await self.client.get("/api/settings")
        self.assertEqual((await response.json())["settings"]["telegram"], "@test_store")

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
            "city": "Краснодар", "items": [{"product_id": product["id"], "quantity": 2}], "consent": True,
        }, headers={"Origin": self.origin})
        self.assertEqual(response.status, 201, await response.text())
        receipt = (await response.json())["inquiry"]
        self.assertEqual(receipt["total"], 140000.5)
        self.assertNotIn("contact", receipt)
        listing = await self.client.get("/api/admin/inquiries")
        inquiry = (await listing.json())["inquiries"][0]
        self.assertEqual(inquiry["items"][0]["price"], 70000.25)
        self.assertEqual(inquiry["contact"], "+7 999 111 22 33")
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
        await self.assert_error(await self.client.post("/api/inquiries", json={**payload, "city": "Москва", "items": [
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
                 "city": "Казань", "items": [{"product_id": product["id"], "quantity": 1}], "consent": True}
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


if __name__ == "__main__":
    unittest.main()
