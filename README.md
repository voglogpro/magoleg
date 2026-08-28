# GShop by OleGShop

Telegram Mini App магазина электроскутеров для курьеров Большого Сочи.

Текущая версия — UI-only mock: каталог, карточка товара, дополнения, корзина и
checkout-заглушка. Внешние API, персональные данные, реальные цены и реквизиты
продавца не используются.

## Запуск

Для Mini App требуется Node.js 20.19+.

```bash
cd apps/mini-app
npm install
npm run dev
```

Установка и запуск Telegram-бота через Python-точку входа для BotHost:

```bash
python -m pip install -r requirements.txt
python main.py
```

В корне присутствуют обе Python-точки входа, которые может потребовать конфигурация хостинга: `main.py` и `index.py`. Значения `BOT_TOKEN` и `MINI_APP_URL` задаются через секреты/переменные окружения BotHost.

Для Bothost рекомендуется выбрать стек `Dockerfile`: корневой `Dockerfile` явно устанавливает Python-зависимости и запускает `python main.py`, поэтому Node.js не участвует в запуске бота.

Dockerfile также собирает React Mini App и помещает его в `/app/public`. Python-процесс одновременно запускает Telegram long polling и HTTP-сервер на `0.0.0.0:$PORT`. Проверка доступности: `GET /health`.

Проверки Python-части: `python -m unittest discover -s tests`.

Проверки:

```bash
npm run typecheck
npm test
npm run build
```

## Структура

- `apps/mini-app` — React/Vite Mini App.
- `main.py`, `index.py`, `requirements.txt` — изолированный Python-бот в корне для автодетекта BotHost.
- `docs/design-system.md` — визуальные токены и ограничения mock-версии.
- `docs/hosting.md` — зафиксированная схема размещения с BotHost для Telegram-бота.
- `.env.example` — только имена будущих настроек, без секретов.

## Mock-граница

Следующие функции намеренно не подключены: backend API, Telegram initData auth,
Яндекс Карты, Яндекс Доставка, FinanceProvider, CRM и Telegram-уведомления.
Интерфейс не заявляется как production-ready до контрактной интеграции и тестов.
