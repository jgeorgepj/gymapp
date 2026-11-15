from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
BG = (18, 18, 18, 255)
ACCENT = (255, 107, 53, 255)

def draw_barbell(draw, size, scale=1.0, bg_fill=True):
    cx, cy = size / 2, size / 2
    bar_w = size * 0.52 * scale
    bar_h = size * 0.05 * scale
    plate_w = size * 0.08 * scale
    plate_h = size * 0.30 * scale
    plate_h2 = size * 0.22 * scale
    gap = bar_w / 2

    # bar
    draw.rounded_rectangle(
        [cx - bar_w / 2, cy - bar_h / 2, cx + bar_w / 2, cy + bar_h / 2],
        radius=bar_h / 2, fill=ACCENT
    )
    # plates (outer bigger, inner smaller) on each side
    for side in (-1, 1):
        x = cx + side * gap
        draw.rounded_rectangle(
            [x - plate_w, cy - plate_h / 2, x + plate_w, cy + plate_h / 2],
            radius=plate_w * 0.4, fill=ACCENT
        )
        x2 = cx + side * (gap - plate_w * 1.6)
        draw.rounded_rectangle(
            [x2 - plate_w * 0.8, cy - plate_h2 / 2, x2 + plate_w * 0.8, cy + plate_h2 / 2],
            radius=plate_w * 0.3, fill=ACCENT
        )

def make_icon(path, size, maskable=False):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    scale = 0.7 if maskable else 1.0
    draw_barbell(draw, size, scale=scale)
    img.save(path)

os.makedirs(OUT, exist_ok=True)
make_icon(os.path.join(OUT, "icon-192.png"), 192)
make_icon(os.path.join(OUT, "icon-512.png"), 512)
make_icon(os.path.join(OUT, "icon-maskable.png"), 512, maskable=True)
print("icons written")
