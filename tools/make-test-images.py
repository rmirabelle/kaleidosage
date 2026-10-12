"""
Makes 4K test images that show the effects clearly: hard black-and-white
edges, repeating patterns, and patterns that never repeat.

    python tools/make-test-images.py

The images go to test-images/ (gitignored). Needs Pillow (pip install pillow).
"""
import colorsys
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

WIDTH, HEIGHT = 3840, 2160
OUT = Path(__file__).resolve().parent.parent / "test-images"
random.seed(7)


def save(image: Image.Image, name: str) -> None:
    path = OUT / name
    image.save(path, optimize=True)
    print(f"  {path.name}  {image.width}x{image.height}")


def hue(h: float, s: float = 0.85, v: float = 1.0) -> tuple[int, int, int]:
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


# Repeating patterns.

def checkerboard(square: int) -> Image.Image:
    image = Image.new("L", (WIDTH, HEIGHT), 255)
    draw = ImageDraw.Draw(image)
    for row in range(HEIGHT // square + 1):
        for column in range(WIDTH // square + 1):
            if (row + column) % 2 == 0:
                x, y = column * square, row * square
                draw.rectangle([x, y, x + square - 1, y + square - 1], fill=0)
    return image


def diagonal_stripes(width: int) -> Image.Image:
    image = Image.new("L", (WIDTH, HEIGHT), 255)
    draw = ImageDraw.Draw(image)
    for start in range(-HEIGHT, WIDTH + HEIGHT, width * 2):
        draw.polygon([(start, 0), (start + width, 0), (start + width + HEIGHT, HEIGHT), (start + HEIGHT, HEIGHT)], fill=0)
    return image


def rings(width: int) -> Image.Image:
    image = Image.new("L", (WIDTH, HEIGHT), 255)
    draw = ImageDraw.Draw(image)
    cx, cy = WIDTH / 2, HEIGHT / 2
    radius = math.hypot(cx, cy) + width
    index = 0
    while radius > 0:
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=0 if index % 2 == 0 else 255)
        radius -= width
        index += 1
    return image


def dot_grid(spacing: int) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (12, 12, 16))
    draw = ImageDraw.Draw(image)
    radius = spacing * 0.32
    for row in range(HEIGHT // spacing + 1):
        for column in range(WIDTH // spacing + 1):
            x, y = column * spacing + spacing / 2, row * spacing + spacing / 2
            color = hue((row * 0.07 + column * 0.03) % 1.0)
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color)
    return image


def color_grid(tile: int) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    columns = WIDTH // tile + 1
    for row in range(HEIGHT // tile + 1):
        for column in range(columns):
            x, y = column * tile, row * tile
            draw.rectangle([x + 4, y + 4, x + tile - 5, y + tile - 5], fill=hue(column / columns, 0.9, 0.95 - 0.5 * (row % 2)))
    return image


# Patterns that do not repeat.

def color_clouds() -> Image.Image:
    """Layers of random noise, each finer and fainter, blown up smoothly: soft colored clouds."""
    channels = []
    for _ in range(3):
        layer: Image.Image | None = None
        total = 0.0
        for octave, size in enumerate((6, 12, 24, 48, 96)):
            weight = 0.5 ** octave
            small = Image.new("L", (size * 16 // 9, size))
            small.putdata([random.randint(0, 255) for _ in range(small.width * small.height)])
            big = small.resize((WIDTH, HEIGHT), Image.BICUBIC)
            layer = big if layer is None else Image.blend(layer, big, weight / (total + weight))
            total += weight
        assert layer is not None
        channels.append(layer.point(lambda v: max(0, min(255, int((v - 128) * 2.4 + 128)))))
    return Image.merge("RGB", channels)


def random_shapes(count: int) -> Image.Image:
    """Sharp-edged circles, boxes and triangles in random sizes and colors."""
    image = Image.new("RGB", (WIDTH, HEIGHT), (8, 8, 10))
    draw = ImageDraw.Draw(image)
    for _ in range(count):
        size = random.choice([12, 30, 60, 120, 240]) * random.uniform(0.6, 1.4)
        x, y = random.uniform(-size, WIDTH), random.uniform(-size, HEIGHT)
        color = hue(random.random(), random.uniform(0.3, 1.0), random.uniform(0.5, 1.0))
        kind = random.random()
        if kind < 0.4:
            draw.ellipse([x, y, x + size, y + size], fill=color)
        elif kind < 0.7:
            draw.rectangle([x, y, x + size, y + size * random.uniform(0.3, 1.5)], fill=color)
        else:
            draw.polygon([(x, y + size), (x + size / 2, y), (x + size, y + size)], fill=color)
    return image


def scattered_lines(count: int) -> Image.Image:
    """Thin white lines at random angles on black: shows motion blur direction clearly."""
    image = Image.new("L", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(image)
    for _ in range(count):
        x, y = random.uniform(0, WIDTH), random.uniform(0, HEIGHT)
        angle = random.uniform(0, math.tau)
        length = random.uniform(40, 600)
        draw.line([x, y, x + math.cos(angle) * length, y + math.sin(angle) * length], fill=random.randint(140, 255), width=random.choice([1, 2, 3, 6]))
    return image.filter(ImageFilter.SMOOTH)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    print(f"Writing test images to {OUT}")
    save(checkerboard(120), "checker-bw-large.png")
    save(checkerboard(24), "checker-bw-fine.png")
    save(diagonal_stripes(40), "stripes-diagonal.png")
    save(rings(36), "rings.png")
    save(dot_grid(96), "dot-grid.png")
    save(color_grid(160), "color-grid.png")
    save(color_clouds(), "color-clouds.png")
    save(random_shapes(2500), "random-shapes.png")
    save(scattered_lines(1800), "scattered-lines.png")


if __name__ == "__main__":
    main()
