"""Восстановление каталога поставки. Работает на временной базе, рабочие данные не трогает."""

import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from store_api import Store

MANIFEST = Path(__file__).resolve().parent.parent / "docs" / "catalog-kugoo-current.json"


class CatalogRestoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.environment = patch.dict(os.environ, {"DATA_DIR": self.directory.name})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def store(self, cards):
        """Магазин с подложенным манифестом поставки на временной базе."""
        manifest = Path(tempfile.mkdtemp(dir=self.directory.name)) / "catalog-kugoo-current.json"
        manifest.write_text(json.dumps(cards, ensure_ascii=False), encoding="utf-8")
        store = Store()
        asyncio.run(store.start(None))
        with store.connect() as connection:
            store.restore_catalog(connection, manifest)
        return store

    @staticmethod
    def card(photos):
        return {
            "name": "Электросамокат Kugoo G2 Max", "category": "kick-scooter", "price": 51900,
            "description": "Описание модели для проверки восстановления каталога.",
            "photo_files": [f"../apps/mini-app/public/products/kugoo-current/{name}" for name in photos],
        }

    def products(self, store):
        with store.connect() as connection:
            return [json.loads(row["data"]) for row in connection.execute("SELECT data FROM products")]

    def test_manifest_photos_exist_on_disk(self):
        """Манифест не должен ссылаться на файлы, которых нет: иначе в карточке битая картинка."""
        public = MANIFEST.resolve().parent.parent / "apps" / "mini-app" / "public"
        missing = [name for card in json.loads(MANIFEST.read_text(encoding="utf-8"))
                   for name in card.get("photo_files", [])
                   if not (public / name.removeprefix("../apps/mini-app/public").lstrip("/")).is_file()]
        self.assertEqual(missing, [], "В манифесте есть ссылки на отсутствующие фотографии")

    def test_renamed_supply_photos_replace_the_previous_gallery(self):
        store = self.store([self.card(["g2-max-front.jpg", "g2-max-side.jpg"])])
        self.assertEqual(self.products(store)[0]["images"], ["/products/kugoo-current/g2-max-front.jpg",
                                                             "/products/kugoo-current/g2-max-side.jpg"])
        # Переименование файлов поставки обязано доехать до карточки, иначе ссылка ведёт в никуда.
        renewed = self.store([self.card(["g2-max-front.webp", "g2-max-side.webp"])])
        product = self.products(renewed)[0]
        self.assertEqual(product["images"], ["/products/kugoo-current/g2-max-front.webp",
                                             "/products/kugoo-current/g2-max-side.webp"])
        self.assertEqual(product["image_url"], "/products/kugoo-current/g2-max-front.webp")

    def test_owner_uploaded_photos_survive_restoration(self):
        store = self.store([self.card(["g2-max-front.jpg"])])
        # Снимок владельца должен лежать в uploads: сервер не принимает ссылку на пустоту.
        store.uploads.mkdir(parents=True, exist_ok=True)
        (store.uploads / ("a" * 32 + ".webp")).write_bytes(b"webp")
        with store.connect() as connection:
            row = connection.execute("SELECT id,data FROM products").fetchone()
            data = json.loads(row["data"])
            data["images"] = ["/media/" + "a" * 32 + ".webp"]
            data["image_url"] = data["images"][0]
            connection.execute("UPDATE products SET data=? WHERE id=?", (json.dumps(data, ensure_ascii=False), row["id"]))
        renewed = self.store([self.card(["g2-max-front.webp"])])
        product = self.products(renewed)[0]
        self.assertEqual(product["images"], ["/media/" + "a" * 32 + ".webp"])


if __name__ == "__main__":
    unittest.main()
