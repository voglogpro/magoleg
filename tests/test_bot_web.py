import tempfile
import unittest
from pathlib import Path

from aiohttp.test_utils import TestClient, TestServer

from index import create_dispatcher, create_web_app, get_mini_app_url


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


class WebAppTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        public_dir = Path(self.temp_dir.name)
        (public_dir / "index.html").write_text(
            "<!doctype html><title>Magoleg test</title>",
            encoding="utf-8",
        )
        (public_dir / "assets").mkdir()
        (public_dir / "assets" / "app.js").write_text(
            "console.log('ok')",
            encoding="utf-8",
        )
        self.client = TestClient(TestServer(create_web_app(public_dir)))
        await self.client.start_server()

    async def asyncTearDown(self) -> None:
        await self.client.close()
        self.temp_dir.cleanup()

    async def test_health_endpoint(self) -> None:
        response = await self.client.get("/health")
        self.assertEqual(response.status, 200)
        self.assertEqual((await response.json())["status"], "ok")

    async def test_spa_fallback_and_static_asset(self) -> None:
        page = await self.client.get("/catalog/demo")
        self.assertEqual(page.status, 200)
        self.assertIn("text/html", page.headers["Content-Type"])

        asset = await self.client.get("/assets/app.js")
        self.assertEqual(asset.status, 200)

        missing = await self.client.get("/assets/missing.js")
        self.assertEqual(missing.status, 404)


if __name__ == "__main__":
    unittest.main()
