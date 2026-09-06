"""Real HTTP upload/import round trip against an isolated local CRM, never the live shop."""

import asyncio
import os
import tempfile
import unittest
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestServer

from scripts import import_catalog as importer
from store_api import setup_store


class ImportRoundTripTests(unittest.IsolatedAsyncioTestCase):
    async def test_eight_photos_are_uploaded_and_second_import_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "DATA_DIR": directory, "ADMIN_USERNAME": "test-photo-owner",
            "ADMIN_PASSWORD": "local-photo-test-password", "ADMIN_PASSWORD_HASH": "",
            "COOKIE_SECURE": "false", "PUBLIC_ORIGIN": "", "MINI_APP_URL": "",
        }):
            app = web.Application()
            setup_store(app)
            async with TestServer(app) as server:
                site = str(server.make_url("/")).rstrip("/")
                def round_trip():
                    opener = urllib.request.build_opener(
                        urllib.request.HTTPCookieProcessor(CookieJar()), importer.NoRedirect())
                    session = importer.call(opener, f"{site}/api/admin/login", {
                        "username": "test-photo-owner", "password": "local-photo-test-password"})
                    manifest = Path(__file__).resolve().parents[1] / "docs/catalog-kugoo.json"
                    prepared = importer.load_catalog(manifest)
                    first = importer.import_products(opener, site, prepared, session["csrfToken"])
                    second = importer.import_products(opener, site, prepared, session["csrfToken"])
                    cards = importer.call(opener, f"{site}/api/admin/products")["products"]
                    for card in cards:
                        self.assertEqual(len(card["images"]), 2)
                        self.assertEqual(card["image_url"], card["images"][0])
                        self.assertFalse(card["published"])
                        for photo in card["images"]:
                            with opener.open(site + photo) as response:
                                self.assertEqual(response.headers.get_content_type(), "image/webp")
                                self.assertLess(len(response.read()), 500_000)
                    return first, second, cards
                first, second, cards = await asyncio.to_thread(round_trip)
                self.assertEqual(first, {"created": 4, "updated": 0, "skipped": 0})
                self.assertEqual(second, {"created": 0, "updated": 0, "skipped": 4})
                self.assertEqual(len(cards), 4)
                self.assertEqual(len(list((Path(directory) / "uploads").glob("*.webp"))), 8)


if __name__ == "__main__":
    unittest.main()
