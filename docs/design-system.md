# Маголег — дизайн-система mock-MVP

Статус: визуальный прототип. API, реквизиты продавца, реальные цены, остатки,
доставка и финансирование не подключены.

## Направление

Утилитарный premium для курьеров: техника является главным визуальным объектом,
интерфейс выдержан в графите, тёплом молочном фоне и электрическом лайме. Без
glassmorphism, неоновых свечений, искусственных рейтингов и вымышленных отзывов.

## Токены

- Canvas: `#f3f1e9`; dark: `#161816`.
- Surface: `#fcfbf7`; dark: `#20231f`.
- Text: `#171916`; dark: `#f6f6ef`.
- Accent: `#d8ef47`; on-accent: `#171916`.
- Spacing: 4, 8, 12, 16, 24, 32 px.
- Radius: 8, 12, 18 px; круглые только chips и icon buttons.
- Минимальная зона нажатия: 44×44 px.
- Типографика: Manrope с системным fallback.

Telegram theme variables используются как первичный источник там, где они
доступны. Учитываются `safe-area-inset-top` и `safe-area-inset-bottom`.

## Компоненты v1

- App header и brand mark.
- Demo notice.
- Category tabs и search field.
- Product card и демонстрационный силуэт техники.
- Stock badge, price hierarchy и finance disclaimer.
- Product detail, specification tiles и add-on selector.
- Cart line, quantity control и order summary.
- Checkout stepper, fields, map/API placeholders.
- Sticky action и bottom navigation.

## Контентные ограничения

Силуэты — нейтральные макеты, не изображения реальных моделей. Любая цена,
наличие, срок, платёж или банковское условие сопровождается маркировкой demo.

