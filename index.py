"""Telegram bot implementation for BotHost."""

from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo


LOGGER = logging.getLogger("magoleg.bot")


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
                "Маголег — электроскутеры для работы в Большом Сочи. "
                "Сейчас открыт демонстрационный каталог: цены, наличие "
                "и условия являются заглушками."
            )
        else:
            keyboard = None
            text = (
                "Маголег готов к подключению Mini App. Укажите HTTPS-адрес "
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


async def run_bot() -> None:
    """Start the BotHost long-polling process."""
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("BOT_TOKEN is required. Add it to BotHost secrets.")

    bot = Bot(token=token)
    dispatcher = create_dispatcher(os.getenv("MINI_APP_URL"))

    LOGGER.info("Magoleg bot is starting in long-polling mode")
    try:
        await dispatcher.start_polling(
            bot,
            allowed_updates=dispatcher.resolve_used_update_types(),
        )
    finally:
        await bot.session.close()


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_bot())
