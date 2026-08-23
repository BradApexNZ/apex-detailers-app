#!/usr/bin/env python3
"""Render an Instagram MP4 from frames captured during real browser scrolling."""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

from render_static import (
    CYAN,
    GOLD,
    H,
    INK,
    MUTED,
    PAPER,
    W,
    draw_laptop,
    draw_phone,
    font,
    glow,
    load_icon,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "showcase-video.mp4"
FPS = 12


def background() -> Image.Image:
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
    draw.text((65, 320), "Real workflows. Real scrolling. Built for the desk and the driveway.", font=font(23), fill=MUTED)

    accent = Image.new("RGBA", (956, 3), (0, 0, 0, 0))
    accent_px = accent.load()
    for x in range(accent.width):
        t = x / max(1, accent.width - 1)
        color = tuple(round(GOLD[i] * (1 - t) + CYAN[i] * t) for i in range(3)) + (220,)
        for y in range(3):
            accent_px[x, y] = color
    canvas.alpha_composite(accent, (62, 407))

    draw.text((64, 1138), "BUILT FOR THE WORK.", font=font(15, mono=True), fill=GOLD)
    draw.text((64, 1174), "Quotes  ·  Jobs  ·  Bookings", font=font(24, bold=True), fill=PAPER)
    draw.text((64, 1208), "Customers  ·  Calendar  ·  Revenue", font=font(24, bold=True), fill=PAPER)
    draw.text((64, 1274), "APEX HQ  /  OPERATIONS WITHOUT THE ADMIN DRAG", font=font(13, mono=True), fill=MUTED)
    return canvas


def frame(canvas: Image.Image, desktop: Image.Image, mobile: Image.Image) -> Image.Image:
    result = canvas.copy()
    draw_laptop(result, desktop.convert("RGBA"))
    draw_phone(result, mobile.convert("RGBA"))
    return result.convert("RGB")


def numbered_pngs(folder: Path) -> list[Path]:
    files = sorted(folder.glob("*.png"))
    if not files:
        raise SystemExit(f"No PNG frames found in {folder}")
    return files


def paired_frames(root: Path, desktop_name: str, mobile_name: str) -> list[tuple[Path, Path]]:
    desktop = numbered_pngs(root / desktop_name)
    mobile = numbered_pngs(root / mobile_name)
    if len(desktop) != len(mobile):
        raise SystemExit(f"Frame counts differ: {desktop_name}={len(desktop)}, {mobile_name}={len(mobile)}")
    return list(zip(desktop, mobile))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames", type=Path, required=True, help="Folder containing the four native frame sequences")
    args = parser.parse_args()

    command_pairs = paired_frames(args.frames, "desktop", "mobile")
    jobs_pairs = paired_frames(args.frames, "desktop-jobs", "mobile-jobs")
    base = background()

    with tempfile.TemporaryDirectory(prefix="apex-video-") as temp_name:
        temp = Path(temp_name)
        rendered: list[Image.Image] = []
        for desktop_path, mobile_path in command_pairs:
            rendered.append(frame(base, Image.open(desktop_path), Image.open(mobile_path)))

        command_last = rendered[-1]
        jobs_first = frame(base, Image.open(jobs_pairs[0][0]), Image.open(jobs_pairs[0][1]))
        for index in range(FPS):
            rendered.append(Image.blend(command_last, jobs_first, (index + 1) / FPS))

        for desktop_path, mobile_path in jobs_pairs:
            rendered.append(frame(base, Image.open(desktop_path), Image.open(mobile_path)))

        # Hold the final real frame long enough for the viewer to read it.
        rendered.extend([rendered[-1].copy() for _ in range(FPS * 2)])

        for index, image in enumerate(rendered):
            if index < FPS:
                fade = (index + 1) / FPS
                image = Image.blend(Image.new("RGB", (W, H), INK[:3]), image, fade)
            image.save(temp / f"{index:05d}.jpg", quality=94, subsampling=0)

        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                str(FPS),
                "-i",
                str(temp / "%05d.jpg"),
                "-c:v",
                "libx264",
                "-preset",
                "slow",
                "-crf",
                "18",
                "-vf",
                "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p",
                "-pix_fmt",
                "yuv420p",
                "-color_range",
                "tv",
                "-colorspace",
                "bt709",
                "-color_primaries",
                "bt709",
                "-color_trc",
                "bt709",
                "-movflags",
                "+faststart",
                str(OUTPUT),
            ],
            check=True,
        )

    print(OUTPUT)


if __name__ == "__main__":
    main()
