#!/usr/bin/env python3
"""Render a compact visual QA sheet for all pet animations."""

from pathlib import Path
import json

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PET = ROOT / "assets" / "pet"
OUT = ROOT / "outputs" / "pet-sprites-contact-sheet.png"
MANIFEST = json.loads((PET / "manifest.json").read_text(encoding="utf-8"))

CARD_W, CARD_H, GAP = 760, 170, 18
COLUMNS = 2
items = [
    (set_name, animation, spec)
    for set_name, animations in MANIFEST["sets"].items()
    for animation, spec in animations.items()
]
rows = (len(items) + COLUMNS - 1) // COLUMNS
sheet = Image.new("RGB", (GAP + COLUMNS * (CARD_W + GAP), GAP + rows * (CARD_H + GAP)), "#101923")
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default(size=20)
small = ImageFont.load_default(size=14)

for index, (set_name, animation, spec) in enumerate(items):
    column, row = index % COLUMNS, index // COLUMNS
    x = GAP + column * (CARD_W + GAP)
    y = GAP + row * (CARD_H + GAP)
    draw.rounded_rectangle((x, y, x + CARD_W, y + CARD_H), radius=14, fill="#192630", outline="#334a50", width=2)
    draw.text((x + 16, y + 12), f"{set_name} / {animation}", fill="#eef8f4", font=font)
    draw.text((x + 16, y + 40), f"{spec['frames']}f · {spec['fps'] or '—'} fps · {'loop' if spec['loop'] else 'once'}", fill="#91aaa4", font=small)
    strip = Image.open(PET / spec["file"]).convert("RGBA")
    frames = []
    for frame_index in range(spec["frames"]):
        frame = strip.crop((frame_index * 128, 0, (frame_index + 1) * 128, 128))
        frame = frame.resize((96, 96), Image.Resampling.NEAREST)
        frames.append(frame)
    total_width = len(frames) * 104 - 8
    start_x = x + CARD_W - total_width - 16
    start_y = y + 58
    for frame_index, frame in enumerate(frames):
        px = start_x + frame_index * 104
        for yy in range(0, 96, 12):
            for xx in range(0, 96, 12):
                color = "#eaf5ee" if (xx // 12 + yy // 12) % 2 == 0 else "#d7e5e1"
                draw.rectangle((px + xx, start_y + yy, px + xx + 11, start_y + yy + 11), fill=color)
        sheet.paste(frame, (px, start_y), frame)

OUT.parent.mkdir(parents=True, exist_ok=True)
sheet.save(OUT, optimize=True)
print(OUT)
