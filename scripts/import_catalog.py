#!/usr/bin/env python3
"""Create CRM product cards from a JSON file, so a batch of models is not typed on a phone.

    python scripts/import_catalog.py https://your-shop.example docs/catalog-kugoo.json

The owner password is asked interactively and never stored. Cards arrive unpublished and
without photos: upload a photo in the CRM, check the card, then publish it there. Running the
script twice is safe — a model whose name already exists in the CRM is skipped, not duplicated.
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


def call(opener: urllib.request.OpenerDirector, url: str, payload=None, csrf: str = ""):
    headers = {"Accept": "application/json"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if csrf:
        headers["X-CSRF-Token"] = csrf
    request = urllib.request.Request(url, data=body, headers=headers)
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Загрузить карточки товаров в CRM магазина.")
    parser.add_argument("site", help="Адрес магазина, например https://shop.example")
    parser.add_argument("file", help="JSON-файл со списком товаров")
    parser.add_argument("--username", default="", help="Логин владельца (по умолчанию спросим)")
    arguments = parser.parse_args()

    site = arguments.site.rstrip("/")
    products = json.loads(open(arguments.file, encoding="utf-8").read())
    if not isinstance(products, list):
        raise SystemExit("Ожидается JSON-массив товаров.")

    username = arguments.username or input("Логин владельца: ").strip()
    password = getpass.getpass("Пароль владельца: ")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    session = call(opener, f"{site}/api/admin/login", {"username": username, "password": password})
    csrf = session["csrfToken"]

    existing = {item["name"] for item in call(opener, f"{site}/api/admin/products")["products"]}
    created = skipped = 0
    for product in products:
        if product.get("name") in existing:
            print(f"— пропущен, уже есть: {product['name']}")
            skipped += 1
            continue
        call(opener, f"{site}/api/admin/products", product, csrf)
        print(f"+ добавлен: {product['name']}")
        created += 1
    print(f"\nГотово: добавлено {created}, пропущено {skipped}.")
    print("Дальше в CRM: загрузите фотографию каждой карточки и нажмите «Опубликовать».")
    return 0


if __name__ == "__main__":
    sys.exit(main())
