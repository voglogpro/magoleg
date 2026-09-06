"""Importer safety tests: no production credentials or network access."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import import_catalog as importer


class CatalogImportTests(unittest.TestCase):
    def test_shipped_catalog_has_two_photos_per_model_and_original_prices(self):
        path = Path(__file__).resolve().parents[1] / "docs/catalog-kugoo.json"
        cards = importer.load_catalog(path)
        self.assertEqual([card[0]["price"] for card in cards], [72990, 77990, 94900, 32900])
        for product, photos in cards:
            self.assertEqual(len(photos), 2)
            self.assertNotIn("photo_files", product)
            self.assertFalse(product["published"])
            self.assertFalse(product["license_verified"])
            self.assertEqual(product["license"], "unknown")

    def test_rejects_missing_images_duplicate_names_and_invalid_collections(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "cards.json"
            invalid = [
                {}, ["not a card"], [{"name": ""}],
                [{"name": "A"}, {"name": "A"}],
                [{"name": "A", "photo_files": "image.png"}],
                [{"name": "A", "photo_files": ["absent.png"]}],
                [{"name": "A", "photo_files": ["x.png"] * 9}],
            ]
            for value in invalid:
                file.write_text(json.dumps(value), encoding="utf-8")
                with self.subTest(value=value), self.assertRaises(ValueError):
                    importer.load_catalog(file)

    @patch.object(importer, "upload_photo", return_value="/media/new.webp")
    @patch.object(importer, "call")
    def test_empty_existing_gallery_updates_only_images(self, call, upload):
        call.side_effect = [{"products": [{"id": "abc", "name": "A", "images": []}]}, {"product": {}}]
        counts = importer.import_products(None, "https://shop.example",
            [({"name": "A", "price": 1, "published": False}, [Path("photo.png")])], "csrf")
        self.assertEqual(counts, {"created": 0, "updated": 1, "skipped": 0})
        self.assertEqual(call.call_args.args[2], {"images": ["/media/new.webp"]})
        self.assertEqual(call.call_args.kwargs, {"method": "PUT"})

    @patch.object(importer, "upload_photo")
    @patch.object(importer, "call")
    def test_existing_galleries_and_legacy_cover_are_preserved(self, call, upload):
        for photos in ({"images": ["/media/owner.webp"]}, {"image_url": "/media/owner.webp"}):
            call.reset_mock()
            call.return_value = {"products": [{"id": "abc", "name": "A", **photos}]}
            counts = importer.import_products(None, "https://shop.example",
                [({"name": "A"}, [Path("photo.png")])], "csrf")
            self.assertEqual(counts["skipped"], 1)
            self.assertEqual(call.call_count, 1)
        upload.assert_not_called()

    @patch.object(importer, "upload_photo", side_effect=["/media/front.webp", "/media/side.webp"])
    @patch.object(importer, "call")
    def test_new_card_uses_ordered_gallery_and_defaults_to_draft(self, call, upload):
        call.side_effect = [{"products": []}, {"product": {"id": "abc", "name": "A"}}]
        importer.import_products(None, "https://shop.example",
            [({"name": "A", "price": 72990}, [Path("front.png"), Path("side.png")])], "csrf")
        payload = call.call_args.args[2]
        self.assertEqual(payload["images"], ["/media/front.webp", "/media/side.webp"])
        self.assertEqual(payload["image_url"], "/media/front.webp")
        self.assertFalse(payload["published"])

    @patch.object(importer, "upload_photo")
    @patch.object(importer, "call")
    def test_ambiguous_existing_names_are_not_overwritten(self, call, upload):
        call.return_value = {"products": [{"id": "a", "name": "A"}, {"id": "b", "name": "A"}]}
        with self.assertRaises(ValueError):
            importer.import_products(None, "https://shop.example", [({"name": "A"}, [])], "csrf")
        upload.assert_not_called()

    @patch.object(importer, "upload_photo", return_value="/media/new.webp")
    @patch.object(importer, "call")
    def test_explicit_replacement_still_does_not_change_metadata(self, call, upload):
        call.side_effect = [{"products": [{"id": "a", "name": "A", "images": ["old"]}]}, {}]
        importer.import_products(None, "https://shop.example", [({"name": "A", "price": 1}, [Path("x.png")])],
                                 "csrf", replace_photos=True)
        self.assertEqual(call.call_args.args[2], {"images": ["/media/new.webp"]})

    @patch.object(importer, "call")
    def test_multipart_has_file_field_and_csrf(self, call):
        call.return_value = {"image_url": "/media/new.webp"}
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "фотография.png"
            file.write_bytes(b"test-file-bytes")
            self.assertEqual(importer.upload_photo(None, "https://shop.example", file, "csrf"), "/media/new.webp")
        self.assertIn(b'name="file"; filename="photo.png"', call.call_args.args[2])
        self.assertIn(b"test-file-bytes", call.call_args.args[2])
        self.assertEqual(call.call_args.args[3], "csrf")
        self.assertTrue(call.call_args.kwargs["content_type"].startswith("multipart/form-data; boundary="))


if __name__ == "__main__":
    unittest.main()
