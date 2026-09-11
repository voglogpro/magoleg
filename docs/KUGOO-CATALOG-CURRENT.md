# Актуальная подборка Kugoo

Дата проверки: **11 сентября 2026 года**.

`catalog-kugoo-current.json` хранит точные данные для повторной загрузки в CRM. В него вошли три модели со старого скриншота, обновление уже опубликованного F3 PLUS и четыре актуальные модели из российского каталога.

| Модель | Причина | Цена-ориентир | Источник |
|---|---|---:|---|
| Kugoo Kirin M4 PRO MAX 48V | Восстановление со скриншота | 59 900 ₽ | https://kugoo-russia.ru/electrosamokaty/kugoo-m4-pro-max |
| Kugoo F3 PRO MAX | Восстановление со скриншота, хит | 79 900 ₽ | https://kugoo-russia.ru/electrosamokaty/kugoo-kirin-f3-pro-max |
| Kugoo Kirin M4 | Восстановление со скриншота | 37 900 ₽ | https://kugoo-russia.ru/electrosamokaty/kugoo-m4 |
| Kugoo F3 PLUS | Обновление старой карточки | 64 900 ₽ | https://kugoo-russia.ru/electrosamokaty/kugoo-f3-plus |
| Kugoo V3 Pro | Новая V-серия | 64 900 ₽ | https://kugoo-russia.ru/electrobikes/kugoo-kirin-v3-pro |
| Kugoo V4 Max | Новая V-серия | 69 900 ₽ | https://kugoo-russia.ru/electrobikes/kugoo-kirin-v4-max |
| Kugoo G2 Max | Популярная флагманская модель | 51 900 ₽ | https://kugoo-russia.ru/electrosamokaty/kugoo-kirin-g2-max |
| Kugoo Wish 04 | Актуальный электропитбайк | 189 000 ₽ | https://kugoo-russia.ru/elektropitbajki/kugoo-wish-04 |

## Важно перед публикацией

- Цены — ориентир по внешнему российскому магазину, а не подтверждённая цена G-Partner.
- Наличие у другого продавца не означает наличие на складе G-Partner. Новые карточки загружаются как «под заказ».
- Требования к правам оставлены как «уточняются», пока владелец не проверит документы конкретной модификации.
- Фотографии взяты из галерей страниц моделей. Права на коммерческое использование нужно подтвердить у правообладателя.

## Загрузка

```bash
python scripts/import_catalog.py https://g-partner.ru docs/catalog-kugoo-current.json --update-existing
```

Команда создаёт новые карточки как черновики. Для существующих карточек она обновляет цену и характеристики, но сохраняет текущее наличие, публикацию и галерею.
