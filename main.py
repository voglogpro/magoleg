"""Primary BotHost entry point."""

import asyncio
import logging

from index import run_bot


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_bot())
