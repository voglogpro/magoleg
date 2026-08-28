# Маголег

Telegram Mini App магазина электроскутеров для курьеров Большого Сочи.

Текущая версия — UI-only mock: каталог, карточка товара, дополнения, корзина и
checkout-заглушка. Внешние API, персональные данные, реальные цены и реквизиты
продавца не используются.

## Запуск

Требуется Node.js 24+ и pnpm 10.

```bash
pnpm install
pnpm dev
```

Запуск Telegram-бота через совместимую с BotHost точку входа:

```bash
BOT_TOKEN=... MINI_APP_URL=https://... pnpm start
```

В корне присутствуют обе точки входа, которые может потребовать конфигурация хостинга: `main.js` и `index.js`.

Проверки:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Структура

- `apps/mini-app` — React/Vite Mini App.
- `docs/design-system.md` — визуальные токены и ограничения mock-версии.
- `docs/hosting.md` — зафиксированная схема размещения с BotHost для Telegram-бота.
- `.env.example` — только имена будущих настроек, без секретов.

## Mock-граница

Следующие функции намеренно не подключены: backend API, Telegram initData auth,
Яндекс Карты, Яндекс Доставка, FinanceProvider, CRM и Telegram-уведомления.
Интерфейс не заявляется как production-ready до контрактной интеграции и тестов.
