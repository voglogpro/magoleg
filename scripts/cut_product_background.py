"""Снять фон с предметных фотографий каталога.

Витрина магазина стоит на фирменной сцене, поэтому прямоугольник фона вокруг техники
выбивается из интерфейса. Скрипт делает фон прозрачным, чтобы товар встал на сцену.

Режимы различаются тем, как отделяется фон:

* ``light`` — заливка **от краёв кадра** по однотонному светлому фону студии. Белые
  детали внутри самой техники (фара, надписи, светлая рама) не выедаются, потому что
  они не связаны с краем. Край смягчается, иначе по контуру остаётся пила.
* ``neural`` — сегментация предмета моделью ``rembg``. Нужна там, где фон тёмный и с
  подсветкой: тёмная рама и покрышки по цвету не отличаются от фона, и любая заливка
  протекает внутрь техники. Модель ставится отдельно: ``pip install rembg onnxruntime``.
* ``auto`` (по умолчанию) — светлый фон режется заливкой, тёмный отдаётся модели.

    python scripts/cut_product_background.py apps/mini-app/public/products/kugoo-current
    python scripts/cut_product_background.py <папка> --mode neural
    python scripts/cut_product_background.py <папка> --dry-run   # только отчёт

Исходники остаются на диске: результат сохраняется рядом в WebP с альфой —
прозрачность без веса PNG, который для фотографии раздувается в несколько мегабайт.
"""

from __future__ import annotations

import argparse
import sys
from collections import deque
from functools import cache
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
# Модель сегментации: выделяет предмет целиком, а не по цвету, поэтому тёмная техника
# не сливается с тёмной подсветкой фона.
NEURAL_MODEL = "isnet-general-use"
# Полупрозрачный край модели: ниже порога это дымка вокруг предмета, выше — сам предмет.
NEURAL_FLOOR, NEURAL_CEILING = 30, 225


def corner_reference(image: Image.Image) -> tuple[int, ...]:
    """Средний цвет четырёх углов кадра — на предметной съёмке это чистый фон."""
    width, height = image.size
    pixels = image.load()
    corners = [pixels[0, 0], pixels[width - 1, 0], pixels[0, height - 1], pixels[width - 1, height - 1]]
    return tuple(sum(channel) // len(corners) for channel in zip(*corners))


def is_light_background(image: Image.Image) -> bool:
    """Светлая ли студия в кадре: от этого зависит, какой режим справится с фоном."""
    return sum(corner_reference(image)) / 3 >= MIN_BACKGROUND_LUMA


def background_mask(image: Image.Image, tolerance: int) -> list[bool]:
    """True для пикселей фона, связанных с краем кадра."""
    width, height = image.size
    pixels = image.load()
    reference = corner_reference(image)
    if not is_light_background(image):
        raise ValueError("Углы кадра тёмные — фон не однотонно светлый, нужен режим neural")

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


@cache
def neural_session():
    """Ленивая загрузка модели: она весит сотни мегабайт, а светлому режиму не нужна."""
    try:
        from rembg import new_session
    except ImportError as error:  # pragma: no cover - зависит от окружения запуска
        raise ValueError("Для тёмного фона нужен rembg: pip install rembg onnxruntime") from error
    return new_session(NEURAL_MODEL)


def neural_alpha(image: Image.Image, session) -> Image.Image:
    """Альфа предмета по сегментации: тёмная техника отделяется от тёмного фона."""
    from rembg import remove

    alpha = remove(image, session=session).getchannel("A")
    # Модель оставляет вокруг предмета слабую дымку и не дотягивает альфу до непрозрачной
    # внутри него. Растягиваем края шкалы, иначе фон сцены просвечивает сквозь технику.
    span = NEURAL_CEILING - NEURAL_FLOOR
    return alpha.point(lambda value: 0 if value <= NEURAL_FLOOR else
                       255 if value >= NEURAL_CEILING else round((value - NEURAL_FLOOR) * 255 / span))


def cut(path: Path, mode: str, tolerance: int, feather: float) -> tuple[Path, float]:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    if mode == "neural" or (mode == "auto" and not is_light_background(image)):
        alpha = neural_alpha(image, neural_session())
        removed = 1 - sum(alpha.get_flattened_data()) / (255 * width * height)
    else:
        visited = background_mask(image, tolerance)
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
    parser = argparse.ArgumentParser(description="Сделать фон предметных фотографий прозрачным")
    parser.add_argument("directory", type=Path, help="Папка с фотографиями каталога")
    parser.add_argument("--mode", choices=("auto", "light", "neural"), default="auto",
                        help="Как отделять фон: заливкой по светлому, моделью или по яркости кадра")
    parser.add_argument("--tolerance", type=int, default=TOLERANCE, help=f"Допуск к оттенку фона (по умолчанию {TOLERANCE})")
    parser.add_argument("--feather", type=float, default=FEATHER, help=f"Смягчение края в пикселях (по умолчанию {FEATHER})")
    parser.add_argument("--dry-run", action="store_true", help="Только проверить, ничего не записывать")
    arguments = parser.parse_args()

    sources = sorted(path for path in arguments.directory.glob("*") if path.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if not sources:
        print(f"В {arguments.directory} нет исходных фотографий", file=sys.stderr)
        return 1
    failures = 0
    for path in sources:
        try:
            if arguments.dry_run:
                print(f"— {path.name}: фон {'светлый' if is_light_background(Image.open(path).convert('RGB')) else 'тёмный'}")
                continue
            target, removed = cut(path, arguments.mode, arguments.tolerance, arguments.feather)
            print(f"+ {target.name}: прозрачным стало {removed:.0%} кадра")
        except (OSError, ValueError) as error:
            failures += 1
            print(f"! {path.name}: {error}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
