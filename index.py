"""Telegram bot implementation for BotHost."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from urllib.parse import urlparse

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from aiohttp import web
from seo_pages import (
    GUIDES,
    product_path,
    public_catalog_data,
    public_origin,
    render_catalog,
    render_guide,
    render_guides_index,
    render_llms,
    render_merchant_feed,
    render_product,
    render_sitemap,
    render_spa_shell,
)
from store_api import STORE_KEY, setup_store


LOGGER = logging.getLogger("gshop.bot")
PROJECT_DIR = Path(__file__).resolve().parent


@web.middleware
async def security_headers(request: web.Request, handler):
    caught = None
    try:
        response = await handler(request)
    except web.HTTPException as error:
        response = error
        caught = error
    admin = request.path == "/admin" or request.path.startswith("/admin/")
    frame_ancestors = "'none'" if admin else "'self' https://web.telegram.org"
    script_sources = "'self'" if admin else "'self' https://telegram.org"
    response.headers["Content-Security-Policy"] = (
        f"default-src 'self'; script-src {script_sources}; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; "
        f"object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors {frame_ancestors}"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if admin:
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers["Cache-Control"] = "no-store"
    elif not Path(request.path).suffix and not request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    if caught is not None:
        raise caught
    return response


def get_mini_app_url(raw_url: str | None) -> str | None:
    """Return a valid HTTPS Mini App URL or None for an unfinished setup."""
    if not raw_url:
        return None

    parsed = urlparse(raw_url.strip())
    if parsed.scheme != "https" or not parsed.netloc:
        return None

    return raw_url.strip()


def create_dispatcher(mini_app_url: str | None) -> Dispatcher:
    """Create a dispatcher without starting network requests."""
    dispatcher = Dispatcher()
    router = Router(name="storefront")
    storefront_url = get_mini_app_url(mini_app_url)

    async def send_storefront(message: Message) -> None:
        if storefront_url:
            keyboard = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="Открыть магазин",
                            web_app=WebAppInfo(url=storefront_url),
                        )
                    ]
                ]
            )
            text = (
                "G-Partner — магазин электротранспорта с доставкой по всей России. "
                "Откройте каталог, сравните модели и выберите подходящий вариант."
            )
        else:
            keyboard = None
            text = (
                "G-Partner готов к подключению Mini App. Укажите HTTPS-адрес "
                "магазина в переменной MINI_APP_URL на BotHost."
            )

        await message.answer(text, reply_markup=keyboard)

    router.message.register(send_storefront, Command("start"))
    router.message.register(send_storefront, Command("catalog"))

    async def send_help(message: Message) -> None:
        await message.answer(
            "Команды: /start — открыть магазин, /catalog — показать каталог."
        )

    router.message.register(send_help, Command("help"))
    dispatcher.include_router(router)
    return dispatcher


def create_web_app(static_dir: Path | None = None) -> web.Application:
    """Create the HTTP app that serves the built Telegram Mini App."""
    configured_dir = static_dir or Path(
        os.getenv("STATIC_DIR", str(PROJECT_DIR / "public"))
    )
    public_dir = configured_dir.resolve()
    index_file = public_dir / "index.html"
    if not index_file.is_file():
        raise RuntimeError(
            f"Mini App build is missing: {index_file}. Build the Docker image first."
        )

    async def health(_: web.Request) -> web.Response:
        return web.json_response({"status": "ok", "service": "gshop"})

    def catalogue(request: web.Request):
        store = request.app[STORE_KEY]
        with store.connect() as connection:
            return store.public_products(connection), store.settings(connection)

    async def seo_catalogue(request: web.Request) -> web.Response:
        products, settings = catalogue(request)
        return web.Response(
            text=render_catalog(products, settings, public_origin()),
            content_type="text/html",
        )

    async def seo_product(request: web.Request) -> web.Response:
        store = request.app[STORE_KEY]
        product = store.public_product(request.match_info["product_id"])
        if product is None:
            raise web.HTTPNotFound(text="Товар не найден", content_type="text/plain")
        canonical = product_path(product)
        if request.path != canonical:
            raise web.HTTPMovedPermanently(location=canonical)
        return web.Response(
            text=render_product(product, store.settings(), public_origin()),
            content_type="text/html",
        )

    async def seo_guides(request: web.Request) -> web.Response:
        products, settings = catalogue(request)
        return web.Response(
            text=render_guides_index(products, settings, public_origin()),
            content_type="text/html",
        )

    async def seo_guide(request: web.Request) -> web.Response:
        slug = request.match_info["slug"]
        if slug not in GUIDES:
            raise web.HTTPNotFound(text="Материал не найден", content_type="text/plain")
        products, settings = catalogue(request)
        page = render_guide(slug, products, settings, public_origin())
        assert page is not None
        return web.Response(text=page, content_type="text/html")

    async def sitemap(request: web.Request) -> web.Response:
        products, _ = catalogue(request)
        return web.Response(
            text=render_sitemap(products, public_origin()),
            content_type="application/xml",
            headers={"Cache-Control": "public, max-age=900"},
        )

    async def robots(_: web.Request) -> web.Response:
        body = f"User-agent: *\nAllow: /\n\nSitemap: {public_origin()}/sitemap.xml\n"
        return web.Response(text=body, content_type="text/plain")

    async def llms(request: web.Request) -> web.Response:
        products, settings = catalogue(request)
        return web.Response(
            text=render_llms(products, settings, public_origin()),
            content_type="text/plain",
            headers={"Cache-Control": "public, max-age=900"},
        )

    async def ai_products(request: web.Request) -> web.Response:
        products, settings = catalogue(request)
        return web.json_response(
            public_catalog_data(products, settings, public_origin()),
            headers={"Cache-Control": "public, max-age=900"},
        )

    async def merchant_feed(request: web.Request) -> web.Response:
        products, settings = catalogue(request)
        return web.Response(
            text=render_merchant_feed(products, settings, public_origin()),
            content_type="application/xml",
            headers={"Cache-Control": "public, max-age=900"},
        )

    async def storefront(request: web.Request) -> web.StreamResponse:
        relative_path = request.match_info.get("path", "")
        if relative_path == "admin" or relative_path.startswith("admin/"):
            # The owner login page does not execute any third-party scripts.
            html = index_file.read_text(encoding="utf-8").replace(
                '<script defer src="https://telegram.org/js/telegram-web-app.js"></script>', ""
            )
            return web.Response(text=html, content_type="text/html")
        if relative_path:
            candidate = (public_dir / relative_path).resolve()
            if public_dir not in candidate.parents:
                raise web.HTTPNotFound()
            if candidate.is_file():
                return web.FileResponse(candidate)
            if Path(relative_path).suffix:
                raise web.HTTPNotFound()

        products, settings = catalogue(request)
        response = web.Response(
            text=render_spa_shell(
                index_file.read_text(encoding="utf-8"),
                products,
                settings,
                public_origin(),
            ),
            content_type="text/html",
        )
        if relative_path:
            response.headers["X-Robots-Tag"] = "noindex, follow"
        return response

    app = web.Application(middlewares=[security_headers])
    app.router.add_get("/health", health)
    setup_store(app)
    app.router.add_get("/catalog", seo_catalogue)
    app.router.add_get("/catalog/{product_id}/{slug}", seo_product)
    app.router.add_get("/guides", seo_guides)
    app.router.add_get("/guides/{slug}", seo_guide)
    app.router.add_get("/sitemap.xml", sitemap)
    app.router.add_get("/robots.txt", robots)
    app.router.add_get("/llms.txt", llms)
    app.router.add_get("/ai/products.json", ai_products)
    app.router.add_get("/merchant-feed.xml", merchant_feed)
    app.router.add_get("/{path:.*}", storefront)
    return app


async def start_web_server() -> web.AppRunner:
    """Start the Mini App server on the port provided by BotHost."""
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    runner = web.AppRunner(create_web_app(), access_log=LOGGER)
    await runner.setup()
    await web.TCPSite(runner, host=host, port=port).start()
    LOGGER.info("Mini App is listening on http://%s:%s", host, port)
    return runner


async def run_bot() -> None:
    """Start the BotHost long-polling process."""
    if os.getenv("WEB_ONLY", "false").lower() == "true":
        import asyncio
        web_runner = await start_web_server()
        try:
            await asyncio.Event().wait()
        finally:
            await web_runner.cleanup()
        return
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("BOT_TOKEN is required. Add it to BotHost secrets.")

    bot = Bot(token=token)
    dispatcher = create_dispatcher(os.getenv("MINI_APP_URL"))
    web_runner = await start_web_server()

    LOGGER.info("Telegram bot is starting in long-polling mode")
    try:
        await dispatcher.start_polling(
            bot,
            allowed_updates=dispatcher.resolve_used_update_types(),
        )
    finally:
        await web_runner.cleanup()
        await bot.session.close()


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_bot())
