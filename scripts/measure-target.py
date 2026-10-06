#!/usr/bin/env python3
"""Measure docs/redesign/target-ui.png so the redesign copies numbers, not impressions.

The target is four app screens laid out in a 2x2 grid on a dark mat. Each screen
is a scaled-down 1440x960 desktop viewport, so every measurement here is taken in
target pixels and reported again as the 1440-wide equivalent and as a proportion
of the viewport. Run it with:

    python scripts/measure-target.py            # human-readable report
    python scripts/measure-target.py --json     # the same numbers as JSON

Pillow is the only dependency (`pip install pillow`).
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from dataclasses import dataclass, field

from PIL import Image

TARGET = "docs/redesign/target-ui.png"
VIEWPORT_WIDTH = 1440
VIEWPORT_HEIGHT = 960

# The four screens, in reading order, with the page each one shows.
SCREEN_NAMES = ["dashboard", "catalogue", "eligibility", "cart"]


def hex_of(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    """Chebyshev distance: one channel moving far enough is an edge."""
    return max(abs(x - y) for x, y in zip(a, b))


@dataclass
class Screen:
    name: str
    left: int
    top: int
    right: int
    bottom: int
    image: Image.Image = field(repr=False)

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top

    @property
    def scale(self) -> float:
        """Target pixels per viewport pixel."""
        return self.width / VIEWPORT_WIDTH

    def px(self, value: float) -> float:
        """A measurement in target pixels, as 1440-viewport pixels."""
        return round(value / self.scale, 1)

    def at(self, x: int, y: int) -> tuple[int, int, int]:
        return self.image.getpixel((x, y))[:3]


def luminance(pixel: tuple[int, int, int]) -> float:
    return 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]


def find_screens(image: Image.Image) -> list[Screen]:
    """Split the sheet into its four screens along the dark gutters between them.

    The two columns are not cut at the same height, so the horizontal gutter is
    looked for inside each column rather than across the whole sheet.
    """
    width, height = image.size
    dark_columns = [
        x
        for x in range(width)
        if sum(luminance(image.getpixel((x, y))[:3]) < 90 for y in range(0, height, 4))
        > height / 4 * 0.8
    ]
    columns = runs_between(dark_columns, width)
    screens: list[Screen] = []
    for column_index, (left, right) in enumerate(columns):
        dark_rows = [
            y
            for y in range(height)
            if sum(
                luminance(image.getpixel((x, y))[:3]) < 90 for x in range(left, right, 4)
            )
            > (right - left) / 4 * 0.85
        ]
        rows = runs_between(dark_rows, height)
        for row_index, (top, bottom) in enumerate(rows):
            index = row_index * len(columns) + column_index
            name = SCREEN_NAMES[index] if index < len(SCREEN_NAMES) else f"screen{index}"
            screens.append(Screen(name, left, top, right, bottom, image))
    return sorted(screens, key=lambda s: SCREEN_NAMES.index(s.name))


def runs_between(occupied: list[int], limit: int) -> list[tuple[int, int]]:
    """The gaps between the occupied indices: where the screens actually are."""
    taken = set(occupied)
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i in range(limit):
        if i in taken:
            if start is not None and i - start > limit * 0.2:
                runs.append((start, i))
            start = None
        elif start is None:
            start = i
    if start is not None and limit - start > limit * 0.2:
        runs.append((start, limit))
    return runs


def common_colours(screen: Screen, count: int = 10) -> list[tuple[str, float]]:
    """The colours that cover the screen, as a share of its pixels."""
    region = screen.image.crop((screen.left, screen.top, screen.right, screen.bottom))
    pixels = list(region.convert("RGB").getdata())
    tally = Counter(pixels)
    total = len(pixels)
    return [(hex_of(rgb), round(n / total * 100, 2)) for rgb, n in tally.most_common(count)]


def edges_along_row(screen: Screen, y: int, threshold: int = 10) -> list[int]:
    """Columns where the colour changes, measured from the screen's left edge."""
    found: list[int] = []
    previous = screen.at(screen.left, y)
    for x in range(screen.left + 1, screen.right):
        pixel = screen.at(x, y)
        if distance(pixel, previous) >= threshold:
            found.append(x - screen.left)
        previous = pixel
    return found


def edges_along_column(screen: Screen, x: int, threshold: int = 10) -> list[int]:
    """Rows where the colour changes, measured from the screen's top edge."""
    found: list[int] = []
    previous = screen.at(x, screen.top)
    for y in range(screen.top + 1, screen.bottom):
        pixel = screen.at(x, y)
        if distance(pixel, previous) >= threshold:
            found.append(y - screen.top)
        previous = pixel
    return found


def corner_radius(screen: Screen, x: int, y: int, inside: tuple[int, int, int]) -> float:
    """How far a top-left corner is cut, by walking the diagonal out of it."""
    for step in range(0, 40):
        if distance(screen.at(x + step, y + step), inside) < 12:
            # The diagonal of a quarter-circle of radius r cuts r*(1-1/sqrt2).
            return round(step / (1 - 0.70710678) * (1 / screen.scale), 1)
    return 0.0


def measure(screen: Screen) -> dict[str, object]:
    """The structural numbers for one screen."""
    out: dict[str, object] = {
        "crop": [screen.left, screen.top, screen.right, screen.bottom],
        "size_px": [screen.width, screen.height],
        "scale": round(screen.scale, 4),
        "colours": common_colours(screen),
    }

    # The sidebar: scan a row below the header, where nav sits against content.
    nav_y = screen.top + int(screen.height * 0.35)
    out["row_edges_mid"] = [screen.px(x) for x in edges_along_row(screen, nav_y, 8)[:12]]

    # The header: scan a column through the sidebar, where the logo block ends.
    logo_x = screen.left + int(screen.width * 0.02)
    out["column_edges_sidebar"] = [
        screen.px(y) for y in edges_along_column(screen, logo_x, 8)[:12]
    ]

    # And a column through the content, which crosses every stacked card.
    content_x = screen.left + int(screen.width * 0.5)
    out["column_edges_content"] = [
        screen.px(y) for y in edges_along_column(screen, content_x, 8)[:24]
    ]
    return out


def sample(image: Image.Image, points: dict[str, tuple[int, int]]) -> dict[str, str]:
    return {name: hex_of(image.getpixel(xy)[:3]) for name, xy in points.items()}


def main() -> int:
    image = Image.open(TARGET).convert("RGB")
    screens = find_screens(image)
    report = {
        "image": TARGET,
        "size": list(image.size),
        "mat": hex_of(image.getpixel((0, 0))[:3]),
        "screens": {s.name: measure(s) for s in screens},
    }

    if "--json" in sys.argv:
        print(json.dumps(report, indent=2))
        return 0

    print(f"{TARGET}  {image.size[0]}x{image.size[1]}  mat {report['mat']}")
    for screen in screens:
        data = report["screens"][screen.name]
        print(f"\n== {screen.name} ==")
        print(f"   crop {data['crop']}  {data['size_px'][0]}x{data['size_px'][1]}")
        print(f"   scale {data['scale']} target px per {VIEWPORT_WIDTH}px viewport px")
        print("   colours: " + ", ".join(f"{h} {p}%" for h, p in data["colours"][:8]))
        print(f"   vertical edges at 35% height (viewport px): {data['row_edges_mid']}")
        print(f"   sidebar column edges (viewport px): {data['column_edges_sidebar']}")
        print(f"   content column edges (viewport px): {data['column_edges_content']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
