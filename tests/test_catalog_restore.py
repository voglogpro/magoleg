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
BIKES_MANIFEST = Path(__file__).resolve().parent.parent / "docs" / "catalog-kugoo-bikes-2026.json"


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
    def card(photos, **extra):
        return {
            "name": "Электросамокат Kugoo G2 Max", "category": "kick-scooter", "price": 51900,
            "description": "Описание модели для проверки восстановления каталога.",
            "photo_files": [f"../apps/mini-app/public/products/kugoo-current/{name}" for name in photos],
            **extra,
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

    def test_bike_manifest_has_a_grounded_cover_for_every_named_model(self):
        """Новая линейка должна целиком приехать с фирменной первой фотографией."""
        cards = json.loads(BIKES_MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(len(cards), 21)
        self.assertEqual(len({card["name"] for card in cards}), 21)
        self.assertTrue(all(card["photo_files"][0].startswith(
            "../apps/mini-app/public/products/kugoo-bike-heroes/") for card in cards))
        public = BIKES_MANIFEST.resolve().parent.parent / "apps" / "mini-app" / "public"
        missing = [card["photo_files"][0] for card in cards
                   if not (public / card["photo_files"][0].removeprefix(
                       "../apps/mini-app/public").lstrip("/")).is_file()]
        self.assertEqual(missing, [])

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

    def upload_owner_photo(self, store):
        """Подменить галерею карточки снимком из кабинета владельца."""
        # Снимок владельца должен лежать в uploads: сервер не принимает ссылку на пустоту.
        store.uploads.mkdir(parents=True, exist_ok=True)
        (store.uploads / ("a" * 32 + ".webp")).write_bytes(b"webp")
        with store.connect() as connection:
            row = connection.execute("SELECT id,data FROM products").fetchone()
            data = json.loads(row["data"])
            data["images"] = ["/media/" + "a" * 32 + ".webp"]
            data["image_url"] = data["images"][0]
            connection.execute("UPDATE products SET data=? WHERE id=?", (json.dumps(data, ensure_ascii=False), row["id"]))
        return data["images"][0]

    def test_owner_uploaded_photos_survive_restoration(self):
        store = self.store([self.card(["g2-max-front.jpg"])])
        uploaded = self.upload_owner_photo(store)
        renewed = self.store([self.card(["g2-max-front.webp"])])
        self.assertEqual(self.products(renewed)[0]["images"], [uploaded])

    def test_replace_photos_flag_returns_the_card_to_the_supply_gallery(self):
        """Замена фона по просьбе владельца обязана дойти и до карточки со снимком из кабинета."""
        store = self.store([self.card(["g2-max-front.jpg"])])
        self.upload_owner_photo(store)
        renewed = self.store([self.card(["g2-max-front.webp"], replace_photos=True)])
        product = self.products(renewed)[0]
        self.assertEqual(product["images"], ["/products/kugoo-current/g2-max-front.webp"])
        self.assertEqual(product["image_url"], "/products/kugoo-current/g2-max-front.webp")

    def test_owner_name_case_and_punctuation_do_not_create_a_duplicate(self):
        store = self.store([self.card(["g2-max-front.webp"],
                                      name="Электровелосипед Kugoo U5 800w 60v 45ah")])
        renewed = self.store([self.card(["g2-max-front.webp"],
                                        name="Электровелосипед KUGOO U5 800W 60V 45Ah")])
        self.assertEqual(len(self.products(renewed)), 1)


if __name__ == "__main__":
    unittest.main()
