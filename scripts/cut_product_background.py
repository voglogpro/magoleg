"""Снять однотонный светлый фон с предметных фотографий каталога.

Фотографии поставщика сняты на белом циклораме, а витрина магазина тёмная: белый
прямоугольник вокруг техники выбивается из интерфейса. Скрипт делает фон прозрачным,
чтобы товар встал на фирменную сцену витрины.

Заливка идёт **от краёв кадра**, поэтому белые детали внутри самой техники (фара,
надписи, светлая рама) не выедаются. Край смягчается, иначе по контуру остаётся пила.

    python scripts/cut_product_background.py apps/mini-app/public/products/kugoo-current
    python scripts/cut_product_background.py <папка> --dry-run   # только отчёт

Исходные JPEG остаются на диске: результат сохраняется рядом в WebP с альфой —
прозрачность без веса PNG, который для фотографии раздувается в несколько мегабайт.
"""

from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

# Допуск к оттенку фона: студийный белый «гуляет» из-за виньетки и сжатия JPEG.
TOLERANCE = 26
# Ниже этой яркости пиксель считается предметом, даже если он попал в допуск.
MIN_BACKGROUND_LUMA = 200
# Размытие альфы: убирает лесенку и остатки светлого ореола по контуру.
FEATHER = 1.6
# Поле вокруг техники после обрезки пустого фона, доля от большей стороны предмета.
MARGIN = 0.06
# Качество WebP: на предметной съёмке разница с исходником не видна, вес падает в разы.
QUALITY = 86


def background_mask(image: Image.Image, tolerance: int) -> list[bool]:
    """True для пикселей фона, связанных с краем кадра."""
    width, height = image.size
    pixels = image.load()
    corners = [pixels[0, 0], pixels[width - 1, 0], pixels[0, height - 1], pixels[width - 1, height - 1]]
    reference = tuple(sum(channel) // len(corners) for channel in zip(*corners))
    if sum(reference) / 3 < MIN_BACKGROUND_LUMA:
        raise ValueError("Углы кадра тёмные — фон не однотонно светлый, вырезать нечего")

    def is_background(x: int, y: int) -> bool:
        pixel = pixels[x, y]
        return (sum(pixel) / 3 >= MIN_BACKGROUND_LUMA
                and all(abs(pixel[index] - reference[index]) <= tolerance for index in range(3)))

    visited = [False] * (width * height)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if not visited[y * width + x] and is_background(x, y):
                visited[y * width + x] = True
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if not visited[y * width + x] and is_background(x, y):
                visited[y * width + x] = True
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height and not visited[ny * width + nx] and is_background(nx, ny):
                visited[ny * width + nx] = True
                queue.append((nx, ny))
    return visited


def cut(path: Path, tolerance: int, feather: float) -> tuple[Path, float]:
    image = Image.open(path).convert("RGB")
    visited = background_mask(image, tolerance)
    width, height = image.size
    alpha = Image.new("L", image.size, 255)
    alpha.putdata([0 if flag else 255 for flag in visited])
    removed = sum(visited) / (width * height)
    if removed > 0.97:
        raise ValueError("Прозрачным стал почти весь кадр — фотография не предметная")
    if feather:
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    result = image.convert("RGBA")
    result.putalpha(alpha)
    # Студийный кадр наполовину состоит из пустого фона: без обрезки техника в карточке
    # выглядит мелкой. Оставляем единое поле, чтобы товар не упирался в края.
    box = result.getbbox()
    if box:
        margin = round(max(box[2] - box[0], box[3] - box[1]) * MARGIN)
        result = result.crop((max(0, box[0] - margin), max(0, box[1] - margin),
                              min(width, box[2] + margin), min(height, box[3] + margin)))
    target = path.with_suffix(".webp")
    result.save(target, "WEBP", quality=QUALITY, method=6)
    return target, removed


def main() -> int:
    parser = argparse.ArgumentParser(description="Сделать светлый фон предметных фотографий прозрачным")
    parser.add_argument("directory", type=Path, help="Папка с фотографиями каталога")
    parser.add_argument("--tolerance", type=int, default=TOLERANCE, help=f"Допуск к оттенку фона (по умолчанию {TOLERANCE})")
    parser.add_argument("--feather", type=float, default=FEATHER, help=f"Смягчение края в пикселях (по умолчанию {FEATHER})")
    parser.add_argument("--dry-run", action="store_true", help="Только проверить, ничего не записывать")
    arguments = parser.parse_args()

    sources = sorted(path for path in arguments.directory.glob("*") if path.suffix.lower() in {".jpg", ".jpeg"})
    if not sources:
        print(f"В {arguments.directory} нет JPEG-фотографий", file=sys.stderr)
        return 1
    failures = 0
    for path in sources:
        try:
            if arguments.dry_run:
                background_mask(Image.open(path).convert("RGB"), arguments.tolerance)
                print(f"— {path.name}: фон распознан")
                continue
            target, removed = cut(path, arguments.tolerance, arguments.feather)
            print(f"+ {target.name}: прозрачным стало {removed:.0%} кадра")
        except (OSError, ValueError) as error:
            failures += 1
            print(f"! {path.name}: {error}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
