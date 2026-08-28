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


LOGGER = logging.getLogger("gshop.bot")
PROJECT_DIR = Path(__file__).resolve().parent


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
                "GShop by OleGShop — электроскутеры для работы в Большом Сочи. "
                "Сейчас открыт демонстрационный каталог: цены, наличие "
                "и условия являются заглушками."
            )
        else:
            keyboard = None
            text = (
                "GShop готов к подключению Mini App. Укажите HTTPS-адрес "
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

    async def storefront(request: web.Request) -> web.StreamResponse:
        relative_path = request.match_info.get("path", "")
        if relative_path:
            candidate = (public_dir / relative_path).resolve()
            if public_dir not in candidate.parents:
                raise web.HTTPNotFound()
            if candidate.is_file():
                return web.FileResponse(candidate)
            if Path(relative_path).suffix:
                raise web.HTTPNotFound()

        return web.FileResponse(index_file)

    app = web.Application()
    app.router.add_get("/health", health)
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
