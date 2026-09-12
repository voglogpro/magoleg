import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aiohttp.test_utils import TestClient, TestServer

from index import create_dispatcher, create_web_app, get_mini_app_url
from seo_pages import product_path, public_origin
from store_api import STORE_KEY


class BotConfigurationTests(unittest.TestCase):
    def test_only_https_mini_app_urls_are_accepted(self) -> None:
        self.assertIsNone(get_mini_app_url("http://example.com"))
        self.assertEqual(
            get_mini_app_url("https://example.com/store"),
            "https://example.com/store",
        )

    def test_message_handlers_are_registered(self) -> None:
        dispatcher = create_dispatcher("https://example.com/store")
        self.assertEqual(dispatcher.resolve_used_update_types(), ["message"])

    def test_public_origin_rejects_insecure_or_credentialed_hosts(self) -> None:
        with patch.dict(os.environ, {"PUBLIC_ORIGIN": "http://attacker.example"}):
            self.assertEqual(public_origin(), "https://g-partner.ru")
        with patch.dict(os.environ, {"PUBLIC_ORIGIN": "https://user@example.com"}):
            self.assertEqual(public_origin(), "https://g-partner.ru")
        with patch.dict(os.environ, {"PUBLIC_ORIGIN": "http://127.0.0.1:8000"}):
            self.assertEqual(public_origin(), "http://127.0.0.1:8000")


class WebAppTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        public_dir = Path(self.temp_dir.name)
        self.environment = patch.dict(os.environ, {"DATA_DIR": str(public_dir / "store"), "ADMIN_PASSWORD": "", "ADMIN_PASSWORD_HASH": ""})
        self.environment.start()
        (public_dir / "index.html").write_text(
            '<!doctype html><html lang="ru"><head><title>Magoleg test</title>'
            '<script defer src="https://telegram.org/js/telegram-web-app.js"></script>'
            '</head><body><div id="root"></div></body></html>',
            encoding="utf-8",
        )
        (public_dir / "assets").mkdir()
        (public_dir / "assets" / "app.js").write_text(
            "console.log('ok')",
            encoding="utf-8",
        )
        self.client = TestClient(TestServer(create_web_app(public_dir)))
        await self.client.start_server()

    def add_product(self) -> dict:
        product = {
            "id": "a" * 32,
            "name": "Kugoo Тест </script><script>alert(1)</script>",
            "description": "Тестовая модель для дальних поездок.",
            "category": "e-bike",
            "license": "unknown",
            "license_verified": False,
            "price": 123499,
            "stock_status": "in-stock",
            "range_km": 85,
            "speed_kmh": 45,
            "power_w": 1000,
            "weight_kg": 38,
            "cargo_l": 20,
            "payload_kg": 150,
            "drive": "single",
            "image_url": "/products/kugoo-current/test.webp",
            "images": ["/products/kugoo-current/test.webp"],
            "published": True,
            "featured": True,
            "tags": ["courier"],
            "badge": "",
            "updated_at": "2026-09-12T10:00:00+00:00",
        }
        store = self.client.app[STORE_KEY]
        with store.connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO products(id,data,published,updated_at) VALUES(?,?,1,?)",
                (product["id"], json.dumps(product, ensure_ascii=False), product["updated_at"]),
            )
        return product

    async def asyncTearDown(self) -> None:
        await self.client.close()
        self.environment.stop()
        self.temp_dir.cleanup()

    async def test_health_endpoint(self) -> None:
        response = await self.client.get("/health")
        self.assertEqual(response.status, 200)
        self.assertEqual((await response.json())["status"], "ok")

    async def test_admin_has_no_third_party_script_and_cannot_be_framed(self) -> None:
        response = await self.client.get("/admin")
        self.assertEqual(response.status, 200)
        self.assertNotIn("telegram.org", await response.text())
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        public = await self.client.get("/")
        self.assertIn("https://web.telegram.org", public.headers["Content-Security-Policy"])
        self.assertNotIn("X-Frame-Options", public.headers)

    async def test_spa_fallback_and_static_asset(self) -> None:
        page = await self.client.get("/catalog/demo")
        self.assertEqual(page.status, 200)
        self.assertIn("text/html", page.headers["Content-Type"])

        asset = await self.client.get("/assets/app.js")
        self.assertEqual(asset.status, 200)

        missing = await self.client.get("/assets/missing.js")
        self.assertEqual(missing.status, 404)

    async def test_root_has_visible_server_rendered_discovery_content(self) -> None:
        response = await self.client.get("/")
        page = await response.text()
        self.assertEqual(response.status, 200)
        self.assertIn("Электротранспорт G-Partner", page)
        self.assertIn('href="/catalog"', page)
        self.assertIn('rel="canonical" href="https://g-partner.ru/"', page)
        self.assertIn('type="application/ld+json"', page)

    async def test_public_catalogue_product_and_guides_are_rendered(self) -> None:
        product = self.add_product()
        path = product_path(product)

        catalogue = await self.client.get("/catalog")
        catalogue_html = await catalogue.text()
        self.assertEqual(catalogue.status, 200)
        self.assertIn(path, catalogue_html)
        self.assertIn("123 499 ₽", catalogue_html)
        self.assertIn('"@type":"ItemList"', catalogue_html)

        detail = await self.client.get(path)
        detail_html = await detail.text()
        self.assertEqual(detail.status, 200)
        self.assertIn("Запас хода", detail_html)
        self.assertIn("85 км", detail_html)
        self.assertIn('"@type":"Product"', detail_html)
        self.assertIn("https://schema.org/InStock", detail_html)
        self.assertNotIn("</script><script>alert(1)</script>", detail_html)

        redirect = await self.client.get(
            f'/catalog/{product["id"]}/wrong-slug', allow_redirects=False
        )
        self.assertEqual(redirect.status, 301)
        self.assertEqual(redirect.headers["Location"], path)

        guide = await self.client.get("/guides/elektrotransport-dlya-kurerov")
        guide_html = await guide.text()
        self.assertEqual(guide.status, 200)
        self.assertIn("Практические критерии", guide_html)
        self.assertIn(path, guide_html)
        self.assertIn("не является независимым рейтингом", guide_html)

    async def test_discovery_feeds_use_the_public_catalogue(self) -> None:
        product = self.add_product()
        path = product_path(product)

        robots = await self.client.get("/robots.txt")
        self.assertIn("Sitemap: https://g-partner.ru/sitemap.xml", await robots.text())

        sitemap = await self.client.get("/sitemap.xml")
        sitemap_xml = await sitemap.text()
        self.assertIn(f"https://g-partner.ru{path}", sitemap_xml)
        self.assertIn("<lastmod>2026-09-12</lastmod>", sitemap_xml)

        llms = await self.client.get("/llms.txt")
        llms_text = await llms.text()
        self.assertIn(f"https://g-partner.ru{path}", llms_text)
        self.assertNotIn("demo", llms_text.lower())

        machine = await self.client.get("/ai/products.json")
        machine_data = await machine.json()
        selected = next(item for item in machine_data["products"] if item["id"] == product["id"])
        self.assertEqual(selected["price"], 123499)
        self.assertEqual(selected["url"], f"https://g-partner.ru{path}")

        merchant = await self.client.get("/merchant-feed.xml")
        merchant_xml = await merchant.text()
        self.assertIn("<g:price>123499.00 RUB</g:price>", merchant_xml)
        self.assertIn("<g:availability>in_stock</g:availability>", merchant_xml)


if __name__ == "__main__":
    unittest.main()
