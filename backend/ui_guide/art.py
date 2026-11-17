# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Placeholder photographs: drawings marked DEMO IMAGE, never a real piece.

Drawn here, so the demo collection carries no photograph of anything real
and the pictures need no files kept anywhere else.
"""

from __future__ import annotations

import io
import sys
from functools import cache

from PIL import Image, ImageDraw, ImageFont

#: Face, rim and lettering colors by metal.
_TONES = {
    "silver": ((205, 208, 214), (122, 126, 134), (45, 48, 54)),
    "gold": ((232, 205, 130), (170, 135, 60), (80, 60, 20)),
    "copper": ((196, 132, 98), (128, 80, 56), (60, 34, 22)),
    "nickel": ((190, 192, 186), (120, 122, 116), (50, 52, 48)),
}
_NOTE_PAPER = (228, 233, 220)
_NOTE_INK = (52, 84, 64)
_SEALS = {"blue": (40, 70, 140), "red": (170, 40, 40), "green": (40, 120, 70)}

_SERIF = (
    "georgia.ttf",
    "times.ttf",
    "DejaVuSerif.ttf",
    "LiberationSerif-Regular.ttf",
)


@cache
def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """A serif face at `size` pixels, or Pillow's own where none is found."""
    folders = (
        ["C:/Windows/Fonts/"]
        if sys.platform == "win32"
        else ["", "/usr/share/fonts/truetype/dejavu/"]
    )
    for folder in folders:
        for name in _SERIF:
            try:
                return ImageFont.truetype(folder + name, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def _centered(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    size: int,
    fill: tuple[int, int, int],
) -> None:
    """Write `text` centered on the point."""
    draw.text(xy, text, font=_font(size), fill=fill, anchor="mm")


def _png(image: Image.Image) -> bytes:
    """The image as PNG bytes."""
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def coin(top: str, middle: str, metal: str = "silver", side: str = "") -> bytes:
    """A round piece: a date line, a name, and DEMO IMAGE, on a plain field."""
    face, rim, ink = _TONES.get(metal, _TONES["silver"])
    image = Image.new("RGB", (800, 800), (244, 242, 238))
    draw = ImageDraw.Draw(image)
    draw.ellipse((60, 60, 740, 740), fill=rim)
    draw.ellipse((74, 74, 726, 726), fill=face)
    draw.ellipse((106, 106, 694, 694), outline=rim, width=4)
    _centered(draw, (400, 340), top, 64, ink)
    _centered(draw, (400, 420), middle, 34, ink)
    if side:
        _centered(draw, (400, 480), side, 26, rim)
    _centered(draw, (400, 620), "DEMO IMAGE", 32, rim)
    return _png(image)


def note(top: str, middle: str, seal: str = "green", side: str = "") -> bytes:
    """An oblong note: a value line, a type, a seal, and DEMO IMAGE."""
    image = Image.new("RGB", (1000, 430), (244, 242, 238))
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 980, 410), fill=_NOTE_PAPER, outline=_NOTE_INK, width=8)
    draw.rectangle((44, 44, 956, 386), outline=_NOTE_INK, width=2)
    _centered(draw, (400, 170), top, 44, (40, 44, 40))
    _centered(draw, (400, 230), middle, 26, (40, 44, 40))
    if side:
        _centered(draw, (400, 275), side, 22, _NOTE_INK)
    color = _SEALS.get(seal, _SEALS["green"])
    draw.ellipse((750, 130, 880, 260), outline=color, width=10)
    _centered(draw, (500, 355), "DEMO IMAGE - NOT A BANKNOTE", 22, _NOTE_INK)
    return _png(image)


def slab(top: str, middle: str) -> bytes:
    """A holder seen from the front: a label band over a round piece."""
    image = Image.new("RGB", (600, 900), (244, 242, 238))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (60, 40, 540, 860),
        radius=30,
        fill=(236, 238, 242),
        outline=(150, 154, 160),
        width=6,
    )
    draw.rectangle((90, 70, 510, 220), fill=(255, 255, 255), outline=(150, 154, 160))
    _centered(draw, (300, 120), top, 34, (30, 30, 30))
    _centered(draw, (300, 175), middle, 24, (60, 60, 60))
    draw.ellipse(
        (120, 300, 480, 660), fill=(205, 208, 214), outline=(122, 126, 134), width=8
    )
    _centered(draw, (300, 760), "DEMO IMAGE", 30, (122, 126, 134))
    return _png(image)
