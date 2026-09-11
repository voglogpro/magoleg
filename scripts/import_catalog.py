#!/usr/bin/env python3
"""Create CRM product cards from a JSON file, so a batch of models is not typed on a phone.

    python scripts/import_catalog.py https://your-shop.example docs/catalog-kugoo.json

The owner password is asked interactively and never stored. Optional photo_files are uploaded
through the normal CRM API. Existing cards are preserved by default. ``--update-existing``
refreshes descriptive fields while keeping the shop's publication and stock status; galleries
are preserved unless ``--replace-photos`` is explicitly requested.
"""

from __future__ import annotations

import argparse
import getpass
import json
import secrets
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.parse import urlsplit, quote

IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
MAX_UPLOAD = 8 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do not forward owner credentials or CSRF tokens to a redirect target."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def call(opener: urllib.request.OpenerDirector, url: str, payload=None, csrf: str = "",
         *, method=None, content_type=None):
    parsed = urlsplit(url)
    headers = {"Accept": "application/json", "Origin": f"{parsed.scheme}://{parsed.netloc}"}
    body = None
    if payload is not None:
        headers["Content-Type"] = content_type or "application/json"
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if csrf:
        headers["X-CSRF-Token"] = csrf
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with opener.open(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail).get("error", detail)
        except ValueError:
            pass
        raise SystemExit(f"{url}: {error.code} {detail}") from None
    except urllib.error.URLError as error:
        raise SystemExit(f"{url}: сайт недоступен ({error.reason})") from None


def load_catalog(filename):
    manifest = Path(filename).resolve()
    products = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(products, list):
        raise ValueError("Ожидается JSON-массив товаров.")
    prepared, names = [], set()
    for item in products:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].strip():
            raise ValueError("Каждая карточка должна иметь название.")
        product = dict(item)
        name = product["name"]
        if name in names:
            raise ValueError(f"Повторное название в файле: {name}")
        names.add(name)
        photo_files = product.pop("photo_files", [])
        if not isinstance(photo_files, list) or len(photo_files) > 8:
            raise ValueError(f"{name}: нужно не больше 8 фотографий.")
        photos = []
        for value in photo_files:
            if not isinstance(value, str) or not value:
                raise ValueError(f"{name}: некорректный путь фотографии.")
            photo = (manifest.parent / value).resolve()
            if photo.suffix.lower() not in IMAGE_TYPES or not photo.is_file():
                raise ValueError(f"Нет фотографии JPEG, PNG или WebP: {photo}")
            if not 0 < photo.stat().st_size <= MAX_UPLOAD:
                raise ValueError(f"Фотография должна быть от 1 байта до 8 МБ: {photo}")
            photos.append(photo)
        if len(set(photos)) != len(photos):
            raise ValueError(f"{name}: одна фотография указана дважды.")
        prepared.append((product, photos))
    return prepared


def upload_photo(opener, site, path, csrf):
    # ASCII transport filename; the server validates actual bytes and generates its own name.
    boundary = "gpartner-" + secrets.token_hex(16)
    suffix = path.suffix.lower()
    data = path.read_bytes()
    if not 0 < len(data) <= MAX_UPLOAD:
        raise ValueError(f"Неверный размер фотографии: {path}")
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo{suffix}"\r\n'
        f'Content-Type: {IMAGE_TYPES[suffix]}\r\n\r\n'
    ).encode("ascii") + data + f"\r\n--{boundary}--\r\n".encode("ascii")
    result = call(opener, f"{site}/api/admin/upload", body, csrf,
                  content_type=f"multipart/form-data; boundary={boundary}")
    return result["image_url"]


def import_products(opener, site, prepared, csrf, *, replace_photos=False, update_existing=False):
    existing = {}
    for item in call(opener, f"{site}/api/admin/products")["products"]:
        existing.setdefault(item["name"], []).append(item)
    created = updated = skipped = 0
    for product, photos in prepared:
        name = product["name"]
        matches = existing.get(name, [])
        if len(matches) > 1:
            raise ValueError(f"В CRM несколько карточек «{name}». Выберите нужную вручную.")
        previous = matches[0] if matches else None
        has_photos = previous and (previous.get("images") or previous.get("image_url"))
        if previous:
            replace_gallery = bool(photos) and (replace_photos or not has_photos)
            if not update_existing and not replace_gallery:
                print(f"— сохранён без изменений: {name}")
                skipped += 1
                continue
            payload = {}
            if update_existing:
                # Availability and publication are owner decisions, not research data.
                payload.update({key: value for key, value in product.items()
                                if key not in {"published", "stock_status", "image_url", "images"}})
            if replace_gallery:
                payload["images"] = [upload_photo(opener, site, photo, csrf) for photo in photos]
            identifier = quote(str(previous["id"]), safe="")
            call(opener, f"{site}/api/admin/products/{identifier}", payload, csrf, method="PUT")
            changes = []
            if update_existing:
                changes.append("данные")
            if replace_gallery:
                changes.append(f"фото ({len(payload['images'])})")
            print(f"+ обновлены {' и '.join(changes)}: {name}")
            updated += 1
        else:
            images = [upload_photo(opener, site, photo, csrf) for photo in photos]
            payload = dict(product)
            payload.setdefault("published", False)
            if images:
                payload.update(images=images, image_url=images[0])
            result = call(opener, f"{site}/api/admin/products", payload, csrf)
            existing[name] = [result["product"]]
            print(f"+ добавлена карточка ({len(images)} фото): {name}")
            created += 1
    return {"created": created, "updated": updated, "skipped": skipped}


def main() -> int:
    parser = argparse.ArgumentParser(description="Загрузить карточки товаров в CRM магазина.")
    parser.add_argument("site", help="Адрес магазина, например https://shop.example")
    parser.add_argument("file", help="JSON-файл со списком товаров")
    parser.add_argument("--username", default="", help="Логин владельца (по умолчанию спросим)")
    parser.add_argument("--dry-run", action="store_true", help="Проверить локальные файлы без входа и записи в CRM")
    parser.add_argument("--replace-photos", action="store_true", help="Заменить уже заполненные галереи (остальные поля сохранить)")
    parser.add_argument("--update-existing", action="store_true",
                        help="Обновить цены и характеристики, сохранив наличие и публикацию")
    arguments = parser.parse_args()

    site = arguments.site.rstrip("/")
    parsed = urlsplit(site)
    if (parsed.scheme not in ("https", "http") or not parsed.netloc or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path):
        raise SystemExit("Нужен адрес магазина без пути, параметров и пароля.")
    if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise SystemExit("Для удалённого магазина требуется HTTPS.")
    products = load_catalog(arguments.file)
    if arguments.dry_run:
        for product, photos in products:
            print(f"{product['name']}: {product.get('price')} руб., {len(photos)} фото")
        print("Проверено локально. Запросы к CRM не отправлялись.")
        return 0

    username = arguments.username or input("Логин владельца: ").strip()
    password = getpass.getpass("Пароль владельца: ")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()), NoRedirect())
    session = call(opener, f"{site}/api/admin/login", {"username": username, "password": password})
    csrf = session["csrfToken"]

    counts = import_products(opener, site, products, csrf, replace_photos=arguments.replace_photos,
                             update_existing=arguments.update_existing)
    print(f"\nГотово: карточек добавлено {counts['created']}, галерей обновлено {counts['updated']}, сохранено {counts['skipped']}.")
    print("Проверьте комплектацию, характеристики и фотографии в CRM перед публикацией.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from None
