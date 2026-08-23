#!/usr/bin/env python3
"""Render the 1080x1350 Apex HQ showcase from native browser captures."""

from __future__ import annotations

import base64
import io
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
CAPTURES = Path(__file__).resolve().parent / "captures"
OUTPUT = ROOT / "public" / "apex-hq-showcase.png"

W, H = 1080, 1350
INK = (8, 8, 11, 255)
GOLD = (232, 185, 58, 255)
PAPER = (245, 243, 238, 255)
MUTED = (169, 166, 158, 255)
CYAN = (113, 206, 232, 255)


def font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    if mono:
        return ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", size)
    return ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", size, index=1 if bold else 0)


def rounded(image: Image.Image, radius: int) -> Image.Image:
    image = image.convert("RGBA")
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width - 1, image.height - 1), radius=radius, fill=255)
    image.putalpha(mask)
    return image


def cover(image: Image.Image, size: tuple[int, int], focus_x: float = 0.5, focus_y: float = 0.5) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = round((resized.width - target_w) * focus_x)
    top = round((resized.height - target_h) * focus_y)
    return resized.crop((left, top, left + target_w, top + target_h))


def glow(canvas: Image.Image, center: tuple[int, int], radius: int, color: tuple[int, int, int], opacity: int) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    px = layer.load()
    cx, cy = center
    x0, x1 = max(0, cx - radius), min(W, cx + radius)
    y0, y1 = max(0, cy - radius), min(H, cy + radius)
    for y in range(y0, y1):
        for x in range(x0, x1):
            distance = math.hypot(x - cx, y - cy) / radius
            if distance < 1:
                alpha = round(opacity * (1 - distance) ** 2)
                px[x, y] = (*color, alpha)
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(26)))


def shadowed_panel(canvas: Image.Image, box: tuple[int, int, int, int], radius: int, fill: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x0, y0 + 18, x1, y1 + 18), radius=radius, fill=(0, 0, 0, 160))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(28)))
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, fill=fill, outline=(255, 255, 255, 26), width=1)


def load_icon() -> Image.Image:
    svg = (ROOT / "public" / "apex-icon.svg").read_text()
    match = re.search(r"data:image/png;base64,([^\"']+)", svg)
    if not match:
        raise RuntimeError("Embedded PNG not found in public/apex-icon.svg")
    return Image.open(io.BytesIO(base64.b64decode(match.group(1)))).convert("RGBA")


def draw_laptop(canvas: Image.Image, screenshot: Image.Image) -> None:
    outer = (66, 440, 1014, 1029)
    shadowed_panel(canvas, outer, 30, (35, 35, 40, 255))
    screen_box = (91, 466, 989, 1003)
    screen = rounded(cover(screenshot, (898, 537), focus_y=0.0), 18)
    canvas.alpha_composite(screen, (screen_box[0], screen_box[1]))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((536, 451, 544, 459), fill=(9, 9, 12, 255), outline=(74, 74, 80, 255))

    base_shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(base_shadow).rounded_rectangle((40, 1020, 1040, 1074), radius=18, fill=(0, 0, 0, 170))
    canvas.alpha_composite(base_shadow.filter(ImageFilter.GaussianBlur(22)))
    base = Image.new("RGBA", (1000, 56), (0, 0, 0, 0))
    base_px = base.load()
    for y in range(base.height):
        shade = 126 - round(y * 0.95)
        for x in range(base.width):
            edge = min(x, base.width - 1 - x)
            base_px[x, y] = (shade, shade, shade + 4, min(255, edge * 16))
    canvas.alpha_composite(rounded(base, 16), (40, 1010))
    draw.rounded_rectangle((430, 1010, 650, 1022), radius=6, fill=(61, 61, 66, 255))


def draw_phone(canvas: Image.Image, screenshot: Image.Image) -> None:
    x, y, width, height = 700, 654, 294, 638
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x - 8, y + 18, x + width + 8, y + height + 28), radius=62, fill=(0, 0, 0, 190))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(32)))

    frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    frame_px = frame.load()
    cx, cy = width / 2, height / 2
    for py in range(height):
        for px in range(width):
            distance = abs((px - cx) / width) + abs((py - cy) / height)
            shine = max(0, 1 - distance)
            value = round(77 + 36 * shine)
            frame_px[px, py] = (value + 4, value + 2, value, 255)
    canvas.alpha_composite(rounded(frame, 62), (x, y))

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x + 7, y + 7, x + width - 8, y + height - 8), radius=55, fill=(4, 4, 6, 255), outline=(177, 177, 180, 115), width=1)
    screen_box = (x + 14, y + 14, x + width - 15, y + height - 15)
    screen = rounded(cover(screenshot, (screen_box[2] - screen_box[0], screen_box[3] - screen_box[1]), focus_y=0.0), 48)
    canvas.alpha_composite(screen, (screen_box[0], screen_box[1]))

    island_w, island_h = 84, 24
    island_x = x + (width - island_w) // 2
    draw.rounded_rectangle((island_x, y + 23, island_x + island_w, y + 23 + island_h), radius=13, fill=(1, 1, 2, 255))
    draw.ellipse((island_x + 62, y + 31, island_x + 70, y + 39), fill=(18, 25, 31, 255))
    draw.rounded_rectangle((x - 3, y + 122, x + 2, y + 185), radius=3, fill=(91, 89, 86, 255))
    draw.rounded_rectangle((x - 3, y + 205, x + 2, y + 278), radius=3, fill=(91, 89, 86, 255))
    draw.rounded_rectangle((x + width - 2, y + 166, x + width + 3, y + 255), radius=3, fill=(91, 89, 86, 255))


def render() -> None:
    desktop_path = CAPTURES / "desktop-command.png"
    mobile_path = CAPTURES / "mobile-command.png"
    if not desktop_path.exists() or not mobile_path.exists():
        raise SystemExit("Missing native captures. See tools/marketing-showcase/README.md")

    desktop = Image.open(desktop_path).convert("RGBA")
    mobile = Image.open(mobile_path).convert("RGBA")
    canvas = Image.new("RGBA", (W, H), INK)
    glow(canvas, (128, 284), 430, (181, 128, 34), 110)
    glow(canvas, (930, 565), 480, (31, 151, 204), 76)
    draw = ImageDraw.Draw(canvas)

    icon = load_icon()
    icon.thumbnail((62, 62), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon, (62, 58))
    draw.text((137, 68), "APEX DETAILERS", font=font(25, bold=True), fill=PAPER)
    draw.text((139, 100), "HAWKE'S BAY  /  APEX HQ", font=font(13, mono=True), fill=GOLD)

    draw.text((62, 174), "THE WHOLE BUSINESS.", font=font(57, bold=True), fill=PAPER)
    draw.text((62, 234), "ONE COMMAND CENTRE.", font=font(57, bold=True), fill=PAPER)
    draw.text((65, 320), "Bookings, customers, jobs, quotes and revenue — built into one", font=font(23), fill=MUTED)
    draw.text((65, 352), "fast workspace that works just as well from the driveway.", font=font(23), fill=MUTED)

    accent = Image.new("RGBA", (956, 3), (0, 0, 0, 0))
    accent_px = accent.load()
    for x in range(accent.width):
        t = x / max(1, accent.width - 1)
        color = tuple(round(GOLD[i] * (1 - t) + CYAN[i] * t) for i in range(3)) + (220,)
        for y in range(3):
            accent_px[x, y] = color
    canvas.alpha_composite(accent, (62, 407))

    draw_laptop(canvas, desktop)
    draw_phone(canvas, mobile)
    draw.text((64, 1138), "BUILT FOR THE WORK.", font=font(15, mono=True), fill=GOLD)
    draw.text((64, 1174), "Quotes  ·  Jobs  ·  Bookings", font=font(24, bold=True), fill=PAPER)
    draw.text((64, 1208), "Customers  ·  Calendar  ·  Revenue", font=font(24, bold=True), fill=PAPER)
    draw.text((64, 1274), "APEX HQ  /  OPERATIONS WITHOUT THE ADMIN DRAG", font=font(13, mono=True), fill=MUTED)

    grain = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    grain_px = grain.load()
    for gy in range(0, H, 3):
        for gx in range((gy // 3) % 3, W, 7):
            grain_px[gx, gy] = (255, 255, 255, 4)
    canvas.alpha_composite(grain)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUTPUT, quality=95, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    render()
