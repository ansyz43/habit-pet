#!/usr/bin/env python3
"""Build final 128px pet sprite strips from generated storyboard sheets."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "pet" / "source"
OUTPUT = ROOT / "assets" / "pet"
PROMPT_SPECS = OUTPUT / "prompts" / "animation-specs.json"
FRAME_SIZE = 128
BASELINE_Y = 120
ALPHA_CUTOFF = 112

# Extracted from the 16 approved swatches in reference-sheet-v1.png.
PALETTE = [
    "#0e1626",
    "#476363",
    "#8dc79f",
    "#b7e4b8",
    "#e4f5d7",
    "#fcf4dd",
    "#fae4bb",
    "#fcb9be",
    "#f9a0a8",
    "#fce99a",
    "#779f86",
    "#b7c6bd",
    "#eaf5ee",
    "#fcf7ec",
    "#fce5c8",
    "#fcdb78",
]
PALETTE_RGB = [tuple(bytes.fromhex(color[1:])) for color in PALETTE]

META = {
    "egg": {
        "idle": {"frames": 2, "fps": 4, "loop": True, "grid": (2, 1), "target": (76, 92)},
        "hatch": {"frames": 6, "fps": 8, "loop": False, "grid": (3, 2), "target": (88, 102)},
    },
    "baby": {
        "idle": {"frames": 4, "fps": 6, "loop": True, "grid": (2, 2), "target": (82, 74), "seamless_end": True},
        "happy": {"frames": 6, "fps": 10, "loop": False, "grid": (3, 2), "target": (88, 80)},
        "sad": {"frames": 4, "fps": 4, "loop": True, "grid": (2, 2), "target": (84, 76), "seamless_end": True},
        "sleep": {"frames": 2, "fps": 2, "loop": True, "grid": (2, 1), "target": (84, 74)},
    },
    "teen": {
        "idle": {"frames": 4, "fps": 6, "loop": True, "grid": (2, 2), "target": (108, 104), "seamless_end": True},
        "happy": {"frames": 6, "fps": 10, "loop": False, "grid": (3, 2), "target": (112, 106)},
        "sad": {"frames": 4, "fps": 4, "loop": True, "grid": (2, 2), "target": (110, 105), "seamless_end": True},
        "sleep": {"frames": 2, "fps": 2, "loop": True, "grid": (2, 1), "target": (110, 104)},
    },
    "adult": {
        "idle": {"frames": 4, "fps": 6, "loop": True, "grid": (2, 2), "target": (118, 112), "seamless_end": True},
        "happy": {"frames": 6, "fps": 10, "loop": False, "grid": (3, 2), "target": (120, 114)},
        "sad": {"frames": 4, "fps": 4, "loop": True, "grid": (2, 2), "target": (118, 112), "seamless_end": True},
        "sleep": {"frames": 2, "fps": 2, "loop": True, "grid": (2, 1), "target": (118, 112)},
    },
    "legend": {
        "idle": {"frames": 4, "fps": 6, "loop": True, "grid": (2, 2), "target": (122, 118), "seamless_end": True},
        "happy": {"frames": 6, "fps": 10, "loop": False, "grid": (3, 2), "target": (124, 120)},
        "sad": {"frames": 4, "fps": 4, "loop": True, "grid": (2, 2), "target": (122, 118), "seamless_end": True},
        "sleep": {"frames": 2, "fps": 2, "loop": True, "grid": (2, 1), "target": (122, 118)},
    },
    "death": {
        "grave": {"frames": 1, "fps": 0, "loop": False, "grid": (1, 1), "target": (72, 88)},
        "ghost": {"frames": 4, "fps": 6, "loop": True, "grid": (2, 2), "target": (108, 116), "seamless_end": True},
    },
    "fx": {
        "evolve": {"frames": 6, "fps": 12, "loop": False, "grid": (3, 2), "target": (116, 116), "center": True},
        "hearts": {"frames": 4, "fps": 10, "loop": False, "grid": (2, 2), "target": (92, 92), "center": True},
        "zzz": {"frames": 3, "fps": 3, "loop": True, "grid": (3, 1), "target": (84, 84), "center": True},
    },
}


def nearest_palette(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    r, g, b = rgb
    return min(
        PALETTE_RGB,
        key=lambda p: 2 * (r - p[0]) ** 2 + 3 * (g - p[1]) ** 2 + 2 * (b - p[2]) ** 2,
    )


def remove_tiny_components(image: Image.Image, minimum_fraction: float = 0.003) -> Image.Image:
    """Drop detached generation specks while preserving real props and legend stars."""
    alpha = image.getchannel("A")
    width, height = image.size
    data = bytearray(alpha.tobytes())
    visited = bytearray(width * height)
    components: list[list[int]] = []
    for start, value in enumerate(data):
        if not value or visited[start]:
            continue
        visited[start] = 1
        stack = [start]
        component: list[int] = []
        while stack:
            point = stack.pop()
            component.append(point)
            x, y = point % width, point // width
            for neighbor in (point - 1, point + 1, point - width, point + width):
                if neighbor < 0 or neighbor >= width * height or visited[neighbor] or not data[neighbor]:
                    continue
                nx, ny = neighbor % width, neighbor // width
                if abs(nx - x) + abs(ny - y) != 1:
                    continue
                visited[neighbor] = 1
                stack.append(neighbor)
        components.append(component)
    if not components:
        return image
    cutoff = max(8, math.ceil(max(map(len, components)) * minimum_fraction))
    for component in components:
        if len(component) < cutoff:
            for point in component:
                data[point] = 0
    clean_alpha = Image.frombytes("L", (width, height), bytes(data))
    image.putalpha(clean_alpha)
    return image


def clean_cell(cell: Image.Image, remove_specks: bool) -> Image.Image:
    """Hard-cut alpha and remove RGB fringe before nearest-neighbor scaling."""
    src = cell.convert("RGBA")
    pixels = []
    for r, g, b, a in src.getdata():
        if a < ALPHA_CUTOFF:
            pixels.append((0, 0, 0, 0))
        else:
            pixels.append((r, g, b, 255))
    src.putdata(pixels)
    if remove_specks:
        src = remove_tiny_components(src)
    bbox = src.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Generated cell contains no visible pixels")
    return src.crop(bbox)


def split_grid(
    sheet: Image.Image, grid: tuple[int, int], frames: int, remove_specks: bool
) -> list[Image.Image]:
    cols, rows = grid
    result: list[Image.Image] = []
    for index in range(frames):
        col, row = index % cols, index // cols
        left = round(col * sheet.width / cols)
        right = round((col + 1) * sheet.width / cols)
        top = round(row * sheet.height / rows)
        bottom = round((row + 1) * sheet.height / rows)
        result.append(clean_cell(sheet.crop((left, top, right, bottom)), remove_specks))
    return result


def quantize_rgba(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    cache: dict[tuple[int, int, int], tuple[int, int, int]] = {}
    output = []
    for r, g, b, a in source.getdata():
        if not a:
            output.append((0, 0, 0, 0))
            continue
        rgb = (r, g, b)
        mapped = cache.setdefault(rgb, nearest_palette(rgb))
        output.append((*mapped, 255))
    source.putdata(output)
    return source


def normalize_frames(
    cells: list[Image.Image], target: tuple[int, int], center: bool
) -> list[Image.Image]:
    max_w = max(cell.width for cell in cells)
    max_h = max(cell.height for cell in cells)
    scale = min(target[0] / max_w, target[1] / max_h)
    frames: list[Image.Image] = []
    for cell in cells:
        width = max(1, round(cell.width * scale))
        height = max(1, round(cell.height * scale))
        sprite = cell.resize((width, height), Image.Resampling.NEAREST)
        sprite = quantize_rgba(sprite)
        frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        x = (FRAME_SIZE - width) // 2
        y = (FRAME_SIZE - height) // 2 if center else BASELINE_Y - height + 1
        if x < 0 or y < 0 or x + width > FRAME_SIZE or y + height > FRAME_SIZE:
            raise ValueError(f"Normalized sprite does not fit: {(width, height)} at {(x, y)}")
        frame.alpha_composite(sprite, (x, y))
        frames.append(frame)
    return frames


def build_strip(frames: Iterable[Image.Image]) -> Image.Image:
    frames = list(frames)
    strip = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
    return strip


def validate_strip(path: Path, meta: dict) -> dict:
    image = Image.open(path).convert("RGBA")
    expected = (FRAME_SIZE * meta["frames"], FRAME_SIZE)
    if image.size != expected:
        raise AssertionError(f"{path}: expected {expected}, got {image.size}")
    colors = {pixel[:3] for pixel in image.getdata() if pixel[3]}
    alphas = {pixel[3] for pixel in image.getdata()}
    if not colors.issubset(set(PALETTE_RGB)) or len(colors) > 16:
        raise AssertionError(f"{path}: invalid palette ({len(colors)} colors)")
    if not alphas.issubset({0, 255}):
        raise AssertionError(f"{path}: alpha is not binary")
    if not meta.get("center"):
        for index in range(meta["frames"]):
            frame = image.crop((index * FRAME_SIZE, 0, (index + 1) * FRAME_SIZE, FRAME_SIZE))
            bbox = frame.getchannel("A").getbbox()
            if bbox is None or bbox[3] - 1 != BASELINE_Y:
                raise AssertionError(f"{path}: frame {index} baseline is not y={BASELINE_Y}")
    return {"colors": len(colors), "size": list(image.size)}


def main() -> None:
    prompt_specs = json.loads(PROMPT_SPECS.read_text(encoding="utf-8"))
    manifest = {
        "frameSize": FRAME_SIZE,
        "baselineY": BASELINE_Y,
        "palette": PALETTE,
        "totalFrames": 0,
        "sets": {},
    }
    report = {"animations": {}, "totalFrames": 0}

    for set_name, animations in META.items():
        set_dir = OUTPUT / set_name
        set_dir.mkdir(parents=True, exist_ok=True)
        manifest["sets"][set_name] = {}
        for animation, meta in animations.items():
            key = f"{set_name}/{animation}"
            spec = prompt_specs["animations"].get(key)
            if spec is None or spec["frames"] != meta["frames"]:
                raise AssertionError(f"Prompt spec mismatch for {key}")
            raw_path = SOURCE / f"{set_name}_{animation}.png"
            if not raw_path.exists():
                raise FileNotFoundError(raw_path)
            sheet = Image.open(raw_path).convert("RGBA")
            cells = split_grid(sheet, meta["grid"], meta["frames"], set_name != "fx")
            frames = normalize_frames(cells, meta["target"], bool(meta.get("center")))
            if meta.get("seamless_end"):
                frames[-1] = frames[0].copy()
            output_path = set_dir / f"{animation}.png"
            build_strip(frames).save(output_path, optimize=True)
            manifest["sets"][set_name][animation] = {
                "file": f"{set_name}/{animation}.png",
                "frames": meta["frames"],
                "fps": meta["fps"],
                "loop": meta["loop"],
            }
            manifest["totalFrames"] += meta["frames"]
            report["animations"][key] = validate_strip(output_path, meta)

    if manifest["totalFrames"] != 90:
        raise AssertionError(f"Expected 90 frames, got {manifest['totalFrames']}")
    report["totalFrames"] = manifest["totalFrames"]
    report["paletteSize"] = len(PALETTE)

    manifest_path = OUTPUT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "manifest.js").write_text(
        "window.PET_MANIFEST = " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    (OUTPUT / "validation-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Built {manifest['totalFrames']} frames across {len(report['animations'])} animations")


if __name__ == "__main__":
    main()
