# Фотографии Kugoo для G-Partner

Подготовлены 8 отдельных изображений, по два реальных исходных ракурса каждой модели. Обработка через **imagegen**: графитовая студия, матовый пол, мягкий оранжевый свет, без рекламных надписей, плашек и добавленных аксессуаров. Новый ракурс по одному снимку не выдумывался. Это обработанные изображения для оформления каталога, не новая предметная фотосъёмка: мелкие надписи и детали требуют сверки с реальной поставкой.

## Готовые файлы

Все PNG лежат в `apps/mini-app/public/products/kugoo-2026/`. Порядок ниже соответствует галерее; первый файл — обложка.

| Модель | Цена из задания | Первый ракурс | Второй ракурс |
| --- | ---: | --- | --- |
| Kugoo F3 PLUS | 72 990 ₽ | `f3-plus-front-v1.png` | `f3-plus-side-v1.png` |
| Kugoo Kirin V3 PRO MAX | 77 990 ₽ | `v3-pro-max-front-v1.png` | `v3-pro-max-rear-v1.png` |
| Kugoo WISH 01 SE | 94 900 ₽ | `wish-01-se-front-v1.png` | `wish-01-se-side-v1.png` |
| Kugoo Kirin M2+ NEW 2025 | 32 900 ₽ | `m2-plus-front-v1.png` | `m2-plus-side-v1.png` |

Ссылки на локальные файлы уже внесены в `docs/catalog-kugoo.json`. PNG — мастер-файлы; после загрузки штатный API сохраняет оптимизированные WebP в `/media/`. Не нужно подменять API-адреса фотографий прямыми PNG-ссылками: CRM управляет собственной галереей.

## Загрузка в CRM

Из корня репозитория:

```powershell
python scripts/import_catalog.py https://bot-1787936996-1241-kponamarev.bothost.tech docs/catalog-kugoo.json --dry-run
python scripts/import_catalog.py https://bot-1787936996-1241-kponamarev.bothost.tech docs/catalog-kugoo.json
```

Логин и действующий пароль вводятся интерактивно. Пароль не записывается в репозиторий. Удалённый сервер должен использовать HTTPS; перенаправления запросов с учётными данными запрещены.

Поведение импорта:

- Совпадение карточек по полному названию. Новые карточки этого файла создаются **неопубликованными**.
- Если карточка уже существует, заполняется только пустая галерея. Название, описание, цена, фильтры и статус публикации не меняются.
- Уже загруженные владельцем фотографии сохраняются. Для осознанной замены всех фото в совпадающих карточках есть отдельный флаг `--replace-photos`.
- При нескольких одинаковых названиях импорт останавливается и просит разобраться вручную.
- Все локальные пути и размеры проверяются до входа. Фото отправляются по одному через штатный `/api/admin/upload`; галерея меняется только после успешной загрузки всех её снимков.
- Повторный успешный импорт не создаёт карточки и фотографии повторно. При сетевом сбое между загрузкой фото и сохранением карточки на сервере могут остаться неиспользуемые файлы; существующая галерея при этом сохраняется.

Затем в кабинете нужно проверить комплектацию/характеристики и опубликовать нужные черновики. Само обновление GitHub или перезапуск BotHost **не импортирует** товары в рабочую БД.

На 06.09.2026 вход с ранее переданными данными был отклонён сообщением «Неверный логин или пароль». Рабочие товары не изменялись. Не сбрасывайте пароль ради импорта; используйте актуальный доступ владельца.

## Источники исходных фотографий

Фотографии найдены на страницах продавцов. Публичная доступность не подтверждает лицензию на коммерческое использование: перед публикацией стоит подтвердить разрешение у поставщика. Ссылки приведены для проверки модели и происхождения, а не как утверждение об авторстве магазина.

### Kugoo F3 PLUS

[Страница товара](https://kugoo-russia.ru/electrosamokaty/kugoo-f3-plus).

- [Исходник спереди](https://static.tildacdn.com/stor3162-3037-4035-b937-663764373131/95416263.jpg) → `f3-plus-front-v1.png`.
- [Исходник сбоку](https://static.tildacdn.com/stor6337-3466-4432-b861-393237333732/70365850.jpg) → `f3-plus-side-v1.png`.

### Kugoo Kirin V3 PRO MAX

[Страница товара](https://kugoostore.ru/elektrovelosiped-v3-pro-max-60v-28-6ah-800w).

- [Исходник спереди](https://kugoostore.ru/image/cache/catalog/produkts/elektrovelosiped-v3-pro-max-60v-286ah-800w-kgkv3promax-b-1500x1500.png) → `v3-pro-max-front-v1.png`.
- [Исходник сзади](https://kugoostore.ru/image/cache/catalog/produkts/elektrovelosiped-v3-pro-max-60v-286ah-800w-kgkv3promax-b-1-1500x1500.jpg) → `v3-pro-max-rear-v1.png`.

### Kugoo WISH 01 SE

[Страница товара](https://kugoo-russia.ru/elektropitbajki/kugoo-wish-01-se).

- [Исходник спереди](https://static.tildacdn.com/stor3839-3064-4734-b738-383661313636/9a431b18e0febff3e5f39d62676b0305.jpg) → `wish-01-se-front-v1.png`.
- [Исходник сбоку](https://static.tildacdn.com/stor3630-6539-4763-b931-336665316362/27bcc0ea6773b12c05a8b082abb215ed.jpg) → `wish-01-se-side-v1.png`.

### Kugoo Kirin M2+

[Страница товара](https://kugoo-russia.ru/electrosamokaty/kugoo-m2-plus).

- [Исходник спереди](https://static.tildacdn.com/stor3033-3461-4636-a337-373263383865/36947892.jpg) → `m2-plus-front-v1.png`.
- [Исходник сбоку](https://static.tildacdn.com/stor3162-6439-4564-a239-346435356463/73860603.jpg) → `m2-plus-side-v1.png`.

На исходниках M2+ есть съёмное сиденье; оно сохранено. При поставке без сиденья потребуются другие фотографии, не ретушь комплектации.

## Характеристики и фильтры

Данные подготовленных карточек сохранены из задания владельца, а не заменены характеристиками продавцов. По ряду моделей страницы продавцов содержат другие значения дальности, массы, скорости и зарядки; совпадение коммерческого названия не гарантирует совпадение ревизии. Особенно нужно проверить M2+ NEW 2025, а у WISH — разницу между 20.8 Ah в названии и 21 Ah в описании. Подтверждение года выпуска M2+ по фото отсутствует.

Сохранены имеющиеся категории и числовые фильтры мощности/скорости/дальности/массы. Масса V3 неизвестна и не придумана. Поля `license: unknown` и `license_verified: false` оставлены до проверки документов. Фотография или рекламная скорость не подтверждают правовой статус транспорта.

## Шаблон обработки

Использован встроенный imagegen, по отдельному редактированию на каждый снимок. Для согласования серии `f3-plus-front-v1.png` служил только референсом фона/света; исходный снимок товара задавал геометрию и ракурс.

```text
Use case: precise-object-edit. Asset: G-Partner ecommerce product photo, square composition.
Input image 1 is the EDIT TARGET and sole reference for the product.
Input image 2 is ONLY a studio lighting/background reference, NOT a product reference.
Replace only the background with the same premium dark graphite #1E1E22 studio cyclorama,
matte charcoal floor, soft natural contact shadow and restrained orange #FF6B00 glow low
behind the vehicle. Product remains clearly visible with soft neutral white key light.
Preserve EXACT original vehicle geometry, its camera viewpoint, components, markings,
original labels, paint, cables, brakes, wheels and accessories. Do not add or remove parts.
Entire vehicle centered, fully visible with 10% margins, about 78% frame height.
No new viewpoint. No added text, price, badges, logo, props, smoke, neon lines or collage.
Photorealistic catalog image.
```

Уточнения по снимкам: M2+ — сохранить съёмное сиденье и малые колёса; V3 — корзину, задний багажник, педали и оба зеркала, отдельно передний и задний исходные ракурсы; F3 и WISH — сохранить ракурс и заводские детали исходника. Техническую точность поставки нужно подтверждать оригинальными фото и паспортом, а не результатом генерации.

## Проверки

```powershell
python -m unittest discover -s tests -p "test_import_catalog*.py"
```

Тесты проверяют набор цен и файлов, сохранение заполненных галерей, обновление только фото, порядок кадров, обработку дубликатов и multipart-запрос. Интеграционный тест поднимает временную локальную CRM, загружает все 8 PNG через настоящий API, проверяет доступность WebP и повторный импорт без дубликатов. Рабочая база и рабочий пароль не используются.

Отдельная браузерная проверка с реальными PNG и локальным тестовым каталогом:

```powershell
cd apps/mini-app
npm run dev -- --port 5192 --strictPort
# В другом терминале из apps/mini-app:
node src/storefront/photos-check.mjs
```

Проверяет четыре карточки, загрузку всех фото, переключение галереи, `object-fit: contain`, отсутствие горизонтального переполнения и ошибок JavaScript на ширинах 320, 390 и 1440 px. Скриншоты сохраняются в `apps/mini-app/test-results/kugoo-photos/`. Запросы каталога замоканы, запись в CRM запрещена.
