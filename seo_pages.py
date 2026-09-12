"""Public, server-rendered catalogue pages and machine-readable discovery feeds.

These pages deliberately contain the same products, prices and availability as
the storefront API.  They are ordinary pages for people as well as crawlers —
there is no user-agent detection or hidden search-engine-only copy.
"""

from __future__ import annotations

import html
import json
import os
import re
import unicodedata
from typing import Any
from urllib.parse import urlsplit
from xml.sax.saxutils import escape as xml_escape


DEFAULT_ORIGIN = "https://g-partner.ru"
CATEGORY_LABELS = {
    "kick-scooter": "Электросамокат",
    "scooter": "Электроскутер",
    "e-bike": "Электровелосипед",
    "atv": "Квадроцикл",
    "parts": "Запчасть",
    "accessories": "Аксессуар",
}
STOCK_LABELS = {
    "in-stock": "В наличии",
    "preorder": "Под заказ",
    "out-of-stock": "Нет в наличии",
}
SCHEMA_AVAILABILITY = {
    "in-stock": "https://schema.org/InStock",
    "preorder": "https://schema.org/PreOrder",
    "out-of-stock": "https://schema.org/OutOfStock",
}
GUIDES = {
    "elektrovelosipedy-dlya-skautov": {
        "title": "Лучшие электровелосипеды для скаутов: критерии и модели",
        "description": (
            "Как выбрать электровелосипед для длинных выездов: запас хода, "
            "вес, грузоподъёмность и подходящие модели из каталога G-Partner."
        ),
        "heading": "Как выбрать электровелосипед для скаутов",
    },
    "elektrotransport-dlya-kurerov": {
        "title": "Электротранспорт для курьеров: критерии и модели",
        "description": (
            "Практический выбор электротранспорта для курьерской работы: "
            "дальность, грузоподъёмность, вес и актуальные предложения."
        ),
        "heading": "Электротранспорт для курьерской работы",
    },
    "elektrovelosipedy-s-bolshim-zapasom-hoda": {
        "title": "Электровелосипеды с большим запасом хода",
        "description": (
            "Сравнение дальнобойных электровелосипедов по заявленному запасу "
            "хода, мощности, весу, цене и наличию."
        ),
        "heading": "Электровелосипеды с большим запасом хода",
    },
}


def public_origin() -> str:
    """Use only an explicitly configured HTTPS origin, never a request Host."""
    value = os.getenv("PUBLIC_ORIGIN", "").strip().rstrip("/")
    try:
        parsed = urlsplit(value)
    except ValueError:
        return DEFAULT_ORIGIN
    local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        (parsed.scheme == "https" or local_http)
        and parsed.netloc
        and not parsed.username
        and not parsed.password
        and not parsed.path
        and not parsed.query
        and not parsed.fragment
    ):
        return value
    return DEFAULT_ORIGIN


def slugify(value: str) -> str:
    transliteration = str.maketrans({
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e",
        "ё": "e", "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k",
        "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
        "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
        "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "",
        "э": "e", "ю": "yu", "я": "ya",
    })
    normalized = unicodedata.normalize("NFKD", value.casefold().translate(transliteration))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-") or "model"


def product_path(product: dict[str, Any]) -> str:
    return f"/catalog/{product['id']}/{slugify(str(product.get('name', 'model')))}"


def _e(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _json_script(value: Any) -> str:
    # Prevent a product description from closing the script element.
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def _money(value: Any) -> str:
    if value is None:
        return "Цена по запросу"
    number = float(value)
    rendered = f"{number:,.2f}" if not number.is_integer() else f"{number:,.0f}"
    return rendered.replace(",", " ") + " ₽"


def _number(value: Any, unit: str, prefix: str = "") -> str:
    if value is None:
        return "Уточняется"
    number = float(value)
    rendered = f"{number:g}"
    return f"{prefix}{rendered} {unit}".strip()


def _safe_image(value: Any) -> str:
    path = str(value or "")
    return path if path.startswith(("/media/", "/products/")) and ".." not in path else ""


def _absolute(origin: str, path: str) -> str:
    return f"{origin}{path}" if path.startswith("/") else path


def _product_brand(product: dict[str, Any]) -> str | None:
    """Publish a manufacturer only when the model name actually identifies it."""
    return "Kugoo" if re.search(r"\bkugoo\b", str(product.get("name", "")), re.IGNORECASE) else None


def _verification_meta() -> str:
    tags = []
    for env_name, meta_name in (
        ("GOOGLE_SITE_VERIFICATION", "google-site-verification"),
        ("YANDEX_VERIFICATION", "yandex-verification"),
    ):
        value = os.getenv(env_name, "").strip()
        if value and len(value) <= 256 and not any(ord(char) < 32 for char in value):
            tags.append(f'<meta name="{meta_name}" content="{_e(value)}">')
    return "".join(tags)


_STYLE = """
:root{color-scheme:dark;--bg:#0b0d10;--panel:#15191e;--line:#2a3037;--text:#f5f6f8;--muted:#aeb4bd;--orange:#ff6b00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Inter,Arial,sans-serif}a{color:inherit}img{max-width:100%;height:auto}header,footer{background:#090b0d}header .wrap,footer .wrap{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 0}.wrap{width:min(1120px,calc(100% - 32px));margin:auto}.brand{color:#fff;font-size:21px;font-weight:800;text-decoration:none}.brand span{color:var(--orange)}nav{display:flex;flex-wrap:wrap;gap:18px}nav a{color:#dadddf;text-decoration:none}nav a:hover,.text-link{color:#ff9145}.hero{padding:64px 0 34px}.eyebrow{color:#ff9145;font-size:13px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}h1{max-width:900px;margin:.15em 0;font-size:clamp(34px,6vw,64px);line-height:1.03}h2{margin-top:36px;line-height:1.15}.lead{max-width:820px;color:#c8cdd3;font-size:19px}.note{padding:16px 18px;border-left:3px solid var(--orange);background:#11151a;color:#c8cdd3}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:18px;margin:26px 0 54px}.card{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--panel)}.card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#20252b}.card-body{padding:18px}.card h2,.card h3{margin:0 0 8px;font-size:20px}.meta{color:var(--muted);font-size:14px}.price{display:block;margin:12px 0;color:#fff;font-size:21px}.stock{color:#ffad73}.button{display:inline-block;padding:11px 16px;border-radius:10px;background:var(--orange);color:#111;font-weight:800;text-decoration:none}.breadcrumbs{padding-top:26px;color:var(--muted);font-size:14px}.breadcrumbs a{color:#d8dce1}.product{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.85fr);gap:36px;padding:30px 0 55px}.product-photo{overflow:hidden;border-radius:20px;background:#171b20}.product-photo img{display:block;width:100%}.specs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin:24px 0;background:var(--line);border:1px solid var(--line)}.specs div{padding:13px;background:var(--panel)}.specs dt{color:var(--muted);font-size:13px}.specs dd{margin:2px 0 0}.article{max-width:820px;padding:14px 0 55px}.article h1{font-size:clamp(34px,5vw,54px)}.article li{margin:9px 0}.article .grid{max-width:1120px}.guides{display:grid;gap:14px;margin:28px 0 55px}.guide{display:block;padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--panel);text-decoration:none}.guide strong{display:block;font-size:20px}.guide span{color:var(--muted)}footer{margin-top:36px}footer .wrap{align-items:flex-start;padding:30px 0;color:var(--muted)}footer nav{max-width:650px}@media(max-width:700px){header .wrap,footer .wrap{align-items:flex-start;flex-direction:column}.hero{padding-top:42px}.product{grid-template-columns:1fr}.specs{grid-template-columns:1fr}}
"""


def _organization(settings: dict[str, Any], origin: str) -> dict[str, Any]:
    data: dict[str, Any] = {
        "@type": "Organization", "@id": f"{origin}/#organization",
        "name": settings.get("shop_name") or "G-Partner", "url": origin,
    }
    if settings.get("phone"):
        data["telephone"] = settings["phone"]
    if settings.get("address"):
        data["address"] = {"@type": "PostalAddress", "streetAddress": settings["address"], "addressCountry": "RU"}
    return data


def _breadcrumbs(origin: str, items: list[tuple[str, str]]) -> tuple[str, dict[str, Any]]:
    visible = ['<a href="/">Главная</a>']
    structured = [{"@type": "ListItem", "position": 1, "name": "Главная", "item": f"{origin}/"}]
    for position, (name, path) in enumerate(items, 2):
        visible.append(f'<a href="{_e(path)}">{_e(name)}</a>')
        structured.append({"@type": "ListItem", "position": position, "name": name, "item": f"{origin}{path}"})
    return " <span>›</span> ".join(visible), {"@type": "BreadcrumbList", "itemListElement": structured}


def _page(
    *, title: str, description: str, canonical_path: str, body: str,
    settings: dict[str, Any], origin: str, structured: list[dict[str, Any]],
) -> str:
    shop = str(settings.get("shop_name") or "G-Partner")
    graph = [_organization(settings, origin), *structured]
    canonical = f"{origin}{canonical_path}"
    return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(title)}</title><meta name="description" content="{_e(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="{_e(canonical)}"><meta property="og:type" content="website"><meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="{_e(shop)}"><meta property="og:title" content="{_e(title)}"><meta property="og:description" content="{_e(description)}"><meta property="og:url" content="{_e(canonical)}">
{_verification_meta()}<style>{_STYLE}</style><script type="application/ld+json">{_json_script({"@context": "https://schema.org", "@graph": graph})}</script></head>
<body><header><div class="wrap"><a class="brand" href="/">G<span>•</span>PARTNER</a><nav aria-label="Основное меню"><a href="/catalog">Каталог</a><a href="/guides">Гайды</a><a href="/#delivery">Доставка</a><a href="/#contact">Контакты</a></nav></div></header>
<main>{body}</main><footer><div class="wrap"><div><strong>{_e(shop)}</strong><br>Электротранспорт с доставкой по России</div><nav aria-label="Полезные материалы"><a href="/guides/elektrovelosipedy-dlya-skautov">Для скаутов</a><a href="/guides/elektrotransport-dlya-kurerov">Для курьеров</a><a href="/guides/elektrovelosipedy-s-bolshim-zapasom-hoda">Большой запас хода</a><a href="/llms.txt">Данные для ИИ</a></nav></div></footer></body></html>'''


def _product_schema(product: dict[str, Any], settings: dict[str, Any], origin: str) -> dict[str, Any]:
    path = product_path(product)
    images = [_absolute(origin, image) for image in map(_safe_image, product.get("images") or []) if image]
    data: dict[str, Any] = {
        "@type": "Product", "@id": f"{origin}{path}#product", "name": product.get("name", ""),
        "description": product.get("description") or f"{CATEGORY_LABELS.get(product.get('category'), 'Электротранспорт')} {product.get('name', '')}",
        "url": f"{origin}{path}",
        "category": CATEGORY_LABELS.get(product.get("category"), "Электротранспорт"),
        "sku": product.get("id", ""),
    }
    brand = _product_brand(product)
    if brand:
        data["brand"] = {"@type": "Brand", "name": brand}
    if images:
        data["image"] = images
    properties = []
    for name, key, unit in (
        ("Запас хода", "range_km", "км"), ("Максимальная скорость", "speed_kmh", "км/ч"),
        ("Мощность мотора", "power_w", "Вт"), ("Вес", "weight_kg", "кг"),
        ("Грузоподъёмность", "payload_kg", "кг"), ("Объём багажника", "cargo_l", "л"),
    ):
        if product.get(key) is not None:
            properties.append({"@type": "PropertyValue", "name": name, "value": product[key], "unitText": unit})
    if properties:
        data["additionalProperty"] = properties
    if product.get("price") is not None:
        data["offers"] = {
            "@type": "Offer", "url": f"{origin}{path}", "priceCurrency": "RUB",
            "price": product["price"], "availability": SCHEMA_AVAILABILITY.get(product.get("stock_status"), "https://schema.org/LimitedAvailability"),
            "itemCondition": "https://schema.org/NewCondition", "seller": {"@id": f"{origin}/#organization"},
        }
    return data


def _card(product: dict[str, Any], origin: str) -> str:
    image = _safe_image(product.get("image_url"))
    image_html = f'<img src="{_e(image)}" alt="{_e(product.get("name", ""))}" loading="lazy">' if image else ""
    specs = []
    if product.get("range_km") is not None:
        specs.append(f'до {_number(product["range_km"], "км")}')
    if product.get("power_w") is not None:
        power = float(product["power_w"]) * (2 if product.get("drive") == "dual" else 1)
        specs.append(_number(power, "Вт"))
    return f'''<article class="card">{image_html}<div class="card-body"><p class="eyebrow">{_e(CATEGORY_LABELS.get(product.get("category"), "Электротранспорт"))}</p><h2><a href="{_e(product_path(product))}">{_e(product.get("name", "Модель"))}</a></h2><p class="meta">{_e(" · ".join(specs) or "Характеристики в карточке")}</p><strong class="price">{_e(_money(product.get("price")))}</strong><p class="stock">{_e(STOCK_LABELS.get(product.get("stock_status"), "Наличие уточняется"))}</p><a class="button" href="{_e(product_path(product))}">Характеристики</a></div></article>'''


def render_catalog(products: list[dict[str, Any]], settings: dict[str, Any], origin: str) -> str:
    title = "Каталог электротранспорта: цены и характеристики | G-Partner"
    description = "Электросамокаты, электроскутеры и электровелосипеды G-Partner: актуальные цены, наличие и характеристики моделей. Доставка по России."
    cards = "".join(_card(product, origin) for product in products)
    empty = "<p class=note>Опубликованных товаров пока нет. Каталог обновляется магазином.</p>" if not products else ""
    breadcrumb_html, breadcrumb_schema = _breadcrumbs(origin, [("Каталог", "/catalog")])
    item_list = {"@type": "ItemList", "name": "Каталог G-Partner", "numberOfItems": len(products), "itemListElement": [
        {"@type": "ListItem", "position": index, "url": f"{origin}{product_path(product)}", "name": product.get("name", "")}
        for index, product in enumerate(products, 1)
    ]}
    body = f'''<div class="wrap"><div class="breadcrumbs">{breadcrumb_html}</div><section class="hero"><p class="eyebrow">G-Partner</p><h1>Каталог электротранспорта</h1><p class="lead">Актуальные модели, цены, наличие и основные характеристики. Для фильтров, сравнения и заявки откройте <a class="text-link" href="/#catalog">интерактивный каталог</a>.</p></section>{empty}<section class="grid" aria-label="Товары">{cards}</section></div>'''
    return _page(title=title, description=description, canonical_path="/catalog", body=body, settings=settings, origin=origin, structured=[breadcrumb_schema, item_list])


def render_product(product: dict[str, Any], settings: dict[str, Any], origin: str) -> str:
    path = product_path(product)
    name = str(product.get("name") or "Электротранспорт")
    category = CATEGORY_LABELS.get(product.get("category"), "Электротранспорт")
    title = f"{name} — цена и характеристики | G-Partner"
    description = f"{category} {name}: {_money(product.get('price'))}, {STOCK_LABELS.get(product.get('stock_status'), 'наличие уточняется').lower()}. Запас хода, мощность, вес и доставка по России."
    breadcrumb_html, breadcrumb_schema = _breadcrumbs(origin, [("Каталог", "/catalog"), (name, path)])
    image = _safe_image(product.get("image_url"))
    image_html = f'<div class="product-photo"><img src="{_e(image)}" alt="{_e(name)}"></div>' if image else '<div class="product-photo"></div>'
    specs = [
        ("Запас хода", _number(product.get("range_km"), "км", "до ")),
        ("Максимальная скорость", _number(product.get("speed_kmh"), "км/ч")),
        ("Мощность", _number(product.get("power_w"), "Вт")),
        ("Вес", _number(product.get("weight_kg"), "кг")),
        ("Грузоподъёмность", _number(product.get("payload_kg"), "кг")),
        ("Багажник", _number(product.get("cargo_l"), "л") if product.get("cargo_l") != 0 else "Нет"),
    ]
    specs_html = "".join(f"<div><dt>{_e(label)}</dt><dd>{_e(value)}</dd></div>" for label, value in specs)
    text = product.get("description") or "Описание модели уточняется у магазина."
    body = f'''<div class="wrap"><div class="breadcrumbs">{breadcrumb_html}</div><article class="product">{image_html}<div><p class="eyebrow">{_e(category)}</p><h1>{_e(name)}</h1><strong class="price">{_e(_money(product.get("price")))}</strong><p class="stock">{_e(STOCK_LABELS.get(product.get("stock_status"), "Наличие уточняется"))}</p><dl class="specs">{specs_html}</dl><a class="button" href="/#product/{_e(product['id'])}">Открыть в магазине</a></div><section><h2>О модели</h2><p>{_e(text)}</p><p class="note">Наличие, комплектацию и итоговые условия подтвердит магазин. Реальный запас хода зависит от нагрузки, погоды, рельефа и режима движения. Требования к управлению проверяйте по документам конкретной модели.</p></section></article></div>'''
    return _page(title=title, description=description, canonical_path=path, body=body, settings=settings, origin=origin, structured=[breadcrumb_schema, _product_schema(product, settings, origin)])


def _stock_rank(product: dict[str, Any]) -> int:
    return {"in-stock": 0, "preorder": 1, "out-of-stock": 2}.get(product.get("stock_status"), 3)


def guide_products(slug: str, products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    vehicles = [product for product in products if product.get("category") in {"e-bike", "scooter", "kick-scooter"}]
    if slug == "elektrovelosipedy-dlya-skautov":
        candidates = [product for product in vehicles if product.get("category") == "e-bike"]
        key = lambda item: ("courier" not in item.get("tags", []), _stock_rank(item), -(item.get("range_km") or 0), -(item.get("payload_kg") or 0), item.get("price") is None, item.get("price") or 0)
    elif slug == "elektrotransport-dlya-kurerov":
        tagged = [product for product in vehicles if "courier" in product.get("tags", [])]
        candidates = tagged or vehicles
        key = lambda item: (_stock_rank(item), -(item.get("range_km") or 0), -(item.get("payload_kg") or 0), item.get("price") is None, item.get("price") or 0)
    else:
        bikes = [product for product in vehicles if product.get("category") == "e-bike"]
        long_range = [product for product in bikes if (product.get("range_km") or 0) >= 60]
        candidates = long_range or bikes
        key = lambda item: (_stock_rank(item), -(item.get("range_km") or 0), item.get("price") is None, item.get("price") or 0)
    return sorted(candidates, key=key)[:8]


def _guide_copy(slug: str) -> str:
    if slug == "elektrovelosipedy-dlya-skautov":
        return '''<p class="lead">Для скаутов, организаторов и выездных команд важна не максимальная цифра в одной характеристике, а предсказуемость на всём маршруте. Ниже — прозрачные критерии и модели, отобранные из действующего каталога.</p><h2>На что смотреть</h2><ol><li><strong>Запас хода.</strong> Считайте маршрут туда и обратно с резервом на ветер, холод, рельеф и дополнительный груз.</li><li><strong>Вес велосипеда.</strong> Его придётся закатывать, переносить через препятствия или грузить в транспорт.</li><li><strong>Грузоподъёмность и багаж.</strong> Учитывайте вес райдера, рюкзака и оборудования вместе.</li><li><strong>Ремонтопригодность.</strong> Перед выездом уточните тип колёс, тормозов и доступность расходников.</li></ol>'''
    if slug == "elektrotransport-dlya-kurerov":
        return '''<p class="lead">Для ежедневной доставки обычно важнее простой, понятный запас хода и удобство с грузом, чем пиковая скорость. Подборка строится по отметке магазина «Для курьеров», наличию, дальности и грузоподъёмности.</p><h2>Практические критерии</h2><ol><li><strong>Рабочий пробег.</strong> Планируйте смену с запасом и возможностью подзарядки.</li><li><strong>Полезная нагрузка.</strong> Сложите вес райдера, сумки, крепления и заказа.</li><li><strong>Вес и габариты.</strong> Они важны у лестниц, лифтов и при хранении.</li><li><strong>Сервис.</strong> До покупки уточните обслуживание батареи, тормозов и колёс.</li></ol>'''
    return '''<p class="lead">Заявленный запас хода помогает сравнивать модели, но не является обещанием фактического пробега. Подборка ниже показывает электровелосипеды от 60 км по данным карточек; если таких моделей нет, выводятся самые дальнобойные из опубликованных.</p><h2>Почему реальный пробег отличается</h2><p>На результат влияют масса райдера и груза, температура, ветер, подъёмы, давление в шинах, скорость и выбранный режим помощи. Для регулярного длинного маршрута оставляйте резерв и заранее определите место зарядки.</p>'''


def render_guides_index(products: list[dict[str, Any]], settings: dict[str, Any], origin: str) -> str:
    breadcrumb_html, breadcrumb_schema = _breadcrumbs(origin, [("Гайды", "/guides")])
    links = "".join(f'<a class="guide" href="/guides/{_e(slug)}"><strong>{_e(info["title"])}</strong><span>{_e(info["description"])}</span></a>' for slug, info in GUIDES.items())
    body = f'''<div class="wrap"><div class="breadcrumbs">{breadcrumb_html}</div><section class="hero"><p class="eyebrow">База знаний G-Partner</p><h1>Как выбрать электротранспорт</h1><p class="lead">Практические материалы, связанные с актуальными моделями каталога. Критерии отбора указаны открыто, цены и наличие берутся из CRM магазина.</p></section><section class="guides">{links}</section></div>'''
    item_list = {"@type": "ItemList", "name": "Гайды G-Partner", "itemListElement": [
        {"@type": "ListItem", "position": index, "name": info["title"], "url": f"{origin}/guides/{slug}"}
        for index, (slug, info) in enumerate(GUIDES.items(), 1)
    ]}
    return _page(title="Гайды по выбору электротранспорта | G-Partner", description="Практические гайды G-Partner по выбору электровелосипедов, транспорта для курьеров и моделей с большим запасом хода.", canonical_path="/guides", body=body, settings=settings, origin=origin, structured=[breadcrumb_schema, item_list])


def render_guide(slug: str, products: list[dict[str, Any]], settings: dict[str, Any], origin: str) -> str | None:
    info = GUIDES.get(slug)
    if info is None:
        return None
    selected = guide_products(slug, products)
    cards = "".join(_card(product, origin) for product in selected)
    empty = '<p class="note">Подходящих опубликованных моделей сейчас нет. Вернитесь позже или откройте весь каталог.</p>' if not selected else ""
    path = f"/guides/{slug}"
    breadcrumb_html, breadcrumb_schema = _breadcrumbs(origin, [("Гайды", "/guides"), (info["heading"], path)])
    body = f'''<div class="wrap"><div class="breadcrumbs">{breadcrumb_html}</div><article class="article"><p class="eyebrow">Гайд G-Partner</p><h1>{_e(info["heading"])}</h1>{_guide_copy(slug)}<p class="note">Подборка не является независимым рейтингом или гарантией пригодности. Она автоматически построена по указанным характеристикам опубликованных товаров G-Partner. Цена и наличие могут измениться; магазин подтвердит их перед заказом.</p><h2>Подходящие модели из текущего каталога</h2></article>{empty}<section class="grid" aria-label="Подходящие модели">{cards}</section></div>'''
    article = {
        "@type": "Article", "@id": f"{origin}{path}#article", "headline": info["heading"],
        "description": info["description"], "inLanguage": "ru-RU", "mainEntityOfPage": f"{origin}{path}",
        "author": {"@id": f"{origin}/#organization"}, "publisher": {"@id": f"{origin}/#organization"},
    }
    item_list = {"@type": "ItemList", "name": "Подходящие модели", "numberOfItems": len(selected), "itemListElement": [
        {"@type": "ListItem", "position": index, "url": f"{origin}{product_path(product)}", "name": product.get("name", "")}
        for index, product in enumerate(selected, 1)
    ]}
    return _page(title=f'{info["title"]} | G-Partner', description=info["description"], canonical_path=path, body=body, settings=settings, origin=origin, structured=[breadcrumb_schema, article, item_list])


def render_spa_shell(template: str, products: list[dict[str, Any]], settings: dict[str, Any], origin: str) -> str:
    """Add useful initial HTML which React replaces after it starts."""
    top = products[:8]
    cards = "".join(_card(product, origin) for product in top)
    fallback = f'''<main class="seo-home-fallback"><div class="wrap"><section class="hero"><p class="eyebrow">Магазин электротранспорта</p><h1>Электротранспорт G-Partner с доставкой по России</h1><p class="lead">Сравните электросамокаты, электроскутеры и электровелосипеды по цене, запасу хода и мощности.</p><p><a class="button" href="/catalog">Открыть каталог</a> <a class="text-link" href="/guides">Гайды по выбору</a></p></section><section class="grid" aria-label="Модели каталога">{cards}</section></div></main>'''
    if '<div id="root"></div>' in template:
        template = template.replace('<div id="root"></div>', f'<div id="root">{fallback}</div>', 1)
    elif '<div id="root"><!--SEO_CONTENT--></div>' in template:
        template = template.replace('<div id="root"><!--SEO_CONTENT--></div>', f'<div id="root">{fallback}</div>', 1)
    elif "</body>" in template:
        template = template.replace("</body>", fallback + "</body>", 1)
    graph = {"@context": "https://schema.org", "@graph": [
        _organization(settings, origin),
        {"@type": "WebSite", "@id": f"{origin}/#website", "url": f"{origin}/", "name": settings.get("shop_name") or "G-Partner", "publisher": {"@id": f"{origin}/#organization"}},
    ]}
    head = f'<link rel="canonical" href="{origin}/"><meta name="robots" content="index,follow,max-image-preview:large">{_verification_meta()}<style>{_STYLE}</style><script type="application/ld+json">{_json_script(graph)}</script>'
    return template.replace("</head>", head + "</head>", 1) if "</head>" in template else head + template


def render_sitemap(products: list[dict[str, Any]], origin: str) -> str:
    paths: list[tuple[str, str | None]] = [("/", None), ("/catalog", None), ("/guides", None)]
    paths.extend((f"/guides/{slug}", None) for slug in GUIDES)
    for product in products:
        updated = str(product.get("updated_at") or "")
        lastmod = updated[:10] if re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", updated) else None
        paths.append((product_path(product), lastmod))
    entries = "".join(f"<url><loc>{xml_escape(origin + path)}</loc>{f'<lastmod>{lastmod}</lastmod>' if lastmod else ''}</url>" for path, lastmod in paths)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</urlset>'


def public_catalog_data(products: list[dict[str, Any]], settings: dict[str, Any], origin: str) -> dict[str, Any]:
    allowed = ("id", "name", "description", "category", "price", "stock_status", "range_km", "speed_kmh", "power_w", "weight_kg", "cargo_l", "payload_kg", "drive", "image_url", "images", "tags", "updated_at")
    return {
        "store": {"name": settings.get("shop_name") or "G-Partner", "url": origin, "currency": "RUB", "country": "RU"},
        "catalog_url": f"{origin}/catalog", "products": [
            {**{key: product.get(key) for key in allowed}, "url": f"{origin}{product_path(product)}"}
            for product in products
        ],
    }


def render_llms(products: list[dict[str, Any]], settings: dict[str, Any], origin: str) -> str:
    lines = [
        f'# {settings.get("shop_name") or "G-Partner"}', "",
        "> Российский интернет-магазин электротранспорта: электровелосипеды, электросамокаты, электроскутеры, квадроциклы, запчасти и аксессуары.", "",
        "## Основные страницы", "",
        f"- [Каталог]({origin}/catalog): опубликованные товары, актуальные цены, наличие и характеристики.",
        f"- [Гайды]({origin}/guides): открытые критерии выбора и подборки из текущего каталога.",
        f"- [Каталог JSON]({origin}/ai/products.json): те же опубликованные данные в машиночитаемом виде.",
        f"- [Товарный XML-фид]({origin}/merchant-feed.xml): цены и наличие для товарных систем.", "",
        "## Важное о данных", "",
        "- Валюта цен — российский рубль (RUB).",
        "- Цена и наличие берутся из CRM магазина и могут измениться; окончательные условия подтверждает магазин.",
        "- Указанный запас хода зависит от нагрузки, погоды, рельефа и режима движения.",
        "- Требования к управлению следует проверять по документам конкретной модели.", "",
        "## Опубликованные товары", "",
    ]
    for product in products:
        specs = [
            _money(product.get("price")), STOCK_LABELS.get(product.get("stock_status"), "Наличие уточняется"),
            f"запас хода {_number(product.get('range_km'), 'км', 'до ')}",
            f"мощность {_number(product.get('power_w'), 'Вт')}",
        ]
        lines.append(f'- [{product.get("name", "Модель")}]({origin}{product_path(product)}): ' + "; ".join(specs) + ".")
    if not products:
        lines.append("- Опубликованных товаров сейчас нет.")
    return "\n".join(lines) + "\n"


def render_merchant_feed(products: list[dict[str, Any]], settings: dict[str, Any], origin: str) -> str:
    items = []
    availability = {"in-stock": "in_stock", "preorder": "preorder", "out-of-stock": "out_of_stock"}
    for product in products:
        if product.get("price") is None or not _safe_image(product.get("image_url")):
            continue
        description = str(product.get("description") or f'{CATEGORY_LABELS.get(product.get("category"), "Электротранспорт")} {product.get("name", "")}')
        values = {
            "id": product.get("id", ""), "title": product.get("name", ""), "description": description[:5000],
            "link": f"{origin}{product_path(product)}", "image_link": _absolute(origin, _safe_image(product.get("image_url"))),
            "availability": availability.get(product.get("stock_status"), "out_of_stock"),
            "price": f'{float(product["price"]):.2f} RUB', "condition": "new", "identifier_exists": "no",
        }
        brand = _product_brand(product)
        if brand:
            values["brand"] = brand
        tags = "".join(f"<g:{key}>{xml_escape(str(value))}</g:{key}>" for key, value in values.items())
        items.append(f"<item>{tags}</item>")
    title = str(settings.get("shop_name") or "G-Partner")
    return f'''<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>{xml_escape(title)}</title><link>{xml_escape(origin)}</link><description>Каталог электротранспорта G-Partner</description>{''.join(items)}</channel></rss>'''
