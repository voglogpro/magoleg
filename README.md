# G-Partner

Адаптивный магазин электротранспорта для Большого Сочи: сайт, Telegram Mini App и кабинет владельца с реальной загрузкой товаров.

**[Руководство по решению и запуску на BotHost](docs/STORE-LAUNCH-2026.md)**

## Что работает

- Публикация товаров из CRM, фото, цена, наличие и характеристики.
- Поиск, фильтры типа/прав/цены/наличия, сортировка, страницы моделей.
- Избранное, сравнение до трёх моделей, корзина и гостевая заявка.
- Вход владельца `/admin`, черновики, редактирование, настройки магазина и заявки.
- SQLite и фотографии в постоянной папке; серверные сессии, CSRF, проверка загрузок.

Каталог изначально пуст: никаких выдуманных товаров, цен и гарантий. После публикации в CRM модель появляется на сайте. Приём заявок по умолчанию выключен: сначала владелец должен заполнить контакты и сведения о продавце. Онлайн-оплата, касса, автоматическая доставка и уведомления менеджеру не подключены.

## BotHost

Выбрать «Использовать собственный Dockerfile», ветку `main`. Корневые `main.py` и `index.py` сохранены. Бот и HTTP работают одним Python-процессом.

Задать секреты `BOT_TOKEN`, `MINI_APP_URL`, `PUBLIC_ORIGIN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (или `ADMIN_PASSWORD`). Пароль не хранится в GitHub. `python scripts/admin_password.py` позволяет безопасно получить хеш.

`DATA_DIR=/app/data` — постоянное хранилище BotHost. Проверить сохранение данных после пересборки до загрузки реального ассортимента. `COOKIE_SECURE=true`, HTTPS, порт из `PORT` (по умолчанию 8000). Проверка сервера: `/health`.

Статика собирается в `/opt/magoleg/public`, runtime в `/opt/magoleg/runtime`, чтобы монтирование исходников в `/app` не скрывало готовую сборку.

## Разработка и проверки

Node 24 LTS и Python 3.13 рекомендуются для совпадения с контейнером.

```sh
cd apps/mini-app
npm ci --ignore-scripts
npm test
npm run build
```

Из корня репозитория:

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests
```

Для локального сервера: `WEB_ONLY=true`, `COOKIE_SECURE=false`, `PUBLIC_ORIGIN=http://127.0.0.1:8000`, `STATIC_DIR=apps/mini-app/dist` и отдельная тестовая `DATA_DIR`, затем `python main.py`. `.env.example` — справочник переменных; автоматическая загрузка `.env` не выполняется. Vite dev проксирует API на порт 8000.

## Основные модули

- `src/StoreApp.tsx` внутри mini-app — разделение публичного сайта и CRM.
- `src/storefront/` — покупательские страницы, данные и сценарии.
- `src/admin/` — кабинет владельца.
- `src/components/StoreHero.tsx` — первый экран и GSAP motion по правилам HyperFrames.
- `store_api.py` — авторизация, SQLite, изображения и заявки.
- `scripts/backup_store.py` — консистентный backup базы и фото.
- `.github/workflows/verify.yml` — frontend/backend тесты и Docker build.

Старые `App.tsx`/`MobileStorefront.tsx` сохранены как предыдущие реализации, но не являются точкой входа. Прежние документы о mock-версии исторические; актуальное руководство — `docs/STORE-LAUNCH-2026.md`.
