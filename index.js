'use strict';

const { Bot, InlineKeyboard } = require('grammy');

function getMiniAppUrl(rawUrl) {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function createBot(token, miniAppUrl = process.env.MINI_APP_URL) {
  if (!token) {
    throw new Error('BOT_TOKEN is required. Add it to BotHost secrets.');
  }

  const bot = new Bot(token);
  const storefrontUrl = getMiniAppUrl(miniAppUrl);

  const sendStorefront = async (ctx) => {
    const text = storefrontUrl
      ? 'Маголег — электроскутеры для работы в Большом Сочи. Сейчас открыт демонстрационный каталог: цены, наличие и условия являются заглушками.'
      : 'Маголег готов к подключению Mini App. Укажите HTTPS-адрес магазина в переменной MINI_APP_URL на BotHost.';

    const keyboard = storefrontUrl
      ? new InlineKeyboard().webApp('Открыть магазин', storefrontUrl)
      : undefined;

    await ctx.reply(text, keyboard ? { reply_markup: keyboard } : undefined);
  };

  bot.command('start', sendStorefront);
  bot.command('catalog', sendStorefront);
  bot.command('help', (ctx) => ctx.reply('Команды: /start — открыть магазин, /catalog — показать каталог.'));

  bot.catch((error) => {
    console.error('Telegram bot update failed:', error.error?.message ?? error.message);
  });

  return bot;
}

async function startBot() {
  const bot = createBot(process.env.BOT_TOKEN);

  const stop = () => bot.stop();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log('Magoleg bot is starting in long-polling mode.');
  await bot.start({ allowed_updates: ['message'] });
}

if (require.main === module) {
  startBot().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { createBot, getMiniAppUrl, startBot };
