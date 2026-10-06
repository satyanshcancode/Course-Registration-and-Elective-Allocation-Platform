#!/usr/bin/env python3
"""Compare the four redesigned pages with docs/redesign/target-ui.png.

For each page it scales the 1440-wide screenshot down to the target screen's
width, crops both to the height they share, and writes three files into
docs/redesign/compare/:

    <page>-side-by-side.png   the target on the left, the app on the right
    <page>-diff.png           a heatmap of where the two differ
    <page>-overlay.png        the app in red over the target in cyan

and prints a score per page, so one round can be compared with the next rather
than argued about.

    python scripts/compare-target.py            # all four
    python scripts/compare-target.py dashboard  # just one

Needs the screenshots (`npm run screenshots`) and Pillow + numpy. The screens
are located with the same code that measures them, loaded from
scripts/measure-target.py, so the two can never disagree about where a screen
starts.
"""

from __future__ import annotations

import importlib.util
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

TARGET = "docs/redesign/target-ui.png"
SHOTS = "docs/screenshots"
OUT = "docs/redesign/compare"

# Which screenshot answers which screen of the target sheet.
PAGES = {
    "dashboard": "student-dashboard-1440-light.png",
    "catalogue": "student-courses-1440-light.png",
    "eligibility": "student-eligibility-1440-light.png",
    "cart": "student-cart-1440-light.png",
}


def load_measure():
    """scripts/measure-target.py, whose name is not an importable one."""
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location("measure_target", os.path.join(here, "measure-target.py"))
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    # Registered before it runs: @dataclass looks its own module up by name.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def heatmap(difference: np.ndarray) -> Image.Image:
    """Grey where the two agree, through amber, to red where they do not."""
    scaled = np.clip(difference / 96.0, 0, 1)
    red = (40 + scaled * 215).astype(np.uint8)
    green = (40 + (1 - scaled) * 60 + np.clip(scaled * 2, 0, 1) * 60).astype(np.uint8)
    blue = (40 + (1 - scaled) * 60).astype(np.uint8)
    return Image.fromarray(np.dstack([red, green, blue]), "RGB")


def label(image: Image.Image, text: str) -> Image.Image:
    """A caption bar above an image, so a side-by-side says which is which."""
    out = Image.new("RGB", (image.width, image.height + 22), (26, 29, 31))
    out.paste(image, (0, 22))
    ImageDraw.Draw(out).text((6, 6), text, fill=(240, 236, 228))
    return out


def compare(name: str, screen, shot_path: str) -> float:
    target = screen.image.crop((screen.left, screen.top, screen.right, screen.bottom)).convert("RGB")
    shot = Image.open(shot_path).convert("RGB")

    # Scale the screenshot by WIDTH, which keeps its aspect, then crop both to
    # the height they share. Scaling to the quadrant's height as well would
    # squash the app and make every vertical measurement meaningless.
    scale = target.width / shot.width
    shot = shot.resize((target.width, round(shot.height * scale)), Image.LANCZOS)
    height = min(target.height, shot.height)
    target = target.crop((0, 0, target.width, height))
    shot = shot.crop((0, 0, shot.width, height))

    a = np.asarray(target).astype(int)
    b = np.asarray(shot).astype(int)
    difference = np.abs(a - b).max(axis=2)
    score = float((difference > 32).mean() * 100)

    os.makedirs(OUT, exist_ok=True)
    side = Image.new("RGB", (target.width * 2 + 12, height + 22), (26, 29, 31))
    side.paste(label(target, "target"), (0, 0))
    side.paste(label(shot, f"app  ({score:.1f}% of pixels differ)"), (target.width + 12, 0))
    side.save(f"{OUT}/{name}-side-by-side.png")
    heatmap(difference).save(f"{OUT}/{name}-diff.png")

    # Cyan target under red app: anything that has moved shows as a fringe.
    overlay = np.dstack(
        [
            np.asarray(shot.convert("L")),
            np.asarray(target.convert("L")),
            np.asarray(target.convert("L")),
        ]
    ).astype(np.uint8)
    Image.fromarray(overlay, "RGB").save(f"{OUT}/{name}-overlay.png")
    return score


def main() -> int:
    wanted = [a for a in sys.argv[1:] if not a.startswith("-")] or list(PAGES)
    measure = load_measure()
    screens = {s.name: s for s in measure.find_screens(Image.open(TARGET).convert("RGB"))}

    worst = 0.0
    for name in wanted:
        shot_path = os.path.join(SHOTS, PAGES[name])
        if not os.path.exists(shot_path):
            print(f"{name:12} SKIP  no {shot_path}")
            continue
        score = compare(name, screens[name], shot_path)
        worst = max(worst, score)
        print(f"{name:12} {score:5.1f}% of pixels differ by more than 32/255")
    print(f"\nwrote {OUT}/  (side-by-side, diff, overlay)")
    return 0 if worst < 100 else 1


if __name__ == "__main__":
    raise SystemExit(main())
