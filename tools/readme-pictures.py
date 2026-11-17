"""
Pictures for README.md, from the help capture run's "readme-" pictures in
public/help (see src/help/shots/readme.ts).

  python tools/readme-pictures.py sheet <out.jpg>     a numbered contact sheet of all scene pictures
  python tools/readme-pictures.py collage <name> 3 17 22 ...   docs/readme/<name>.jpg, a grid of those scene numbers
"""
import glob
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..")
SOURCE = os.path.join(ROOT, "public", "help")
OUT = os.path.join(ROOT, "docs", "readme")


def cover(image, width, height):
    """The middle of the picture, cut to the shape and made that size."""
    scale = max(width / image.width, height / image.height)
    sized = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    left = (sized.width - width) // 2
    top = (sized.height - height) // 2
    return sized.crop((left, top, left + width, top + height))


def scene(number):
    return Image.open(os.path.join(SOURCE, f"readme-scene-{number:02d}.png")).convert("RGB")


def sheet(out):
    numbers = sorted(int(os.path.basename(path)[13:15]) for path in glob.glob(os.path.join(SOURCE, "readme-scene-*.png")))
    columns, width, height, gap = 6, 320, 200, 6
    rows = -(-len(numbers) // columns)
    page = Image.new("RGB", (columns * (width + gap) + gap, rows * (height + gap) + gap), "#101218")
    draw = ImageDraw.Draw(page)
    for place, number in enumerate(numbers):
        x = gap + (place % columns) * (width + gap)
        y = gap + (place // columns) * (height + gap)
        page.paste(cover(scene(number), width, height), (x, y))
        draw.rectangle((x, y, x + 34, y + 20), fill="#000000")
        draw.text((x + 6, y + 4), str(number), fill="#ffffff")
    page.save(out, quality=88)
    print("wrote", out, len(numbers), "scenes")


def collage(name, numbers):
    """Four columns of 16:10 tiles on the page's dark color, with thin gaps."""
    columns, width, height, gap = 4, 600, 375, 8
    rows = -(-len(numbers) // columns)
    page = Image.new("RGB", (columns * width + (columns - 1) * gap, rows * height + (rows - 1) * gap), "#0d1117")
    for place, number in enumerate(numbers):
        page.paste(cover(scene(number), width, height), ((place % columns) * (width + gap), (place // columns) * (height + gap)))
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, f"{name}.jpg")
    page.save(out, quality=86, optimize=True, progressive=True)
    print("wrote", out, page.size, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    if sys.argv[1] == "sheet":
        sheet(sys.argv[2])
    elif sys.argv[1] == "collage":
        collage(sys.argv[2], [int(value) for value in sys.argv[3:]])
