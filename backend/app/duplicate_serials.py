# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Duplicate Serial: $1 star notes whose serials were printed more than once.

The Bureau of Engraving and Printing printed some star-note serials twice. The
ranges are a fact about a printing error, so they ship as data
(docs/reference-data.md), with their sources beside them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class DuplicateRange:
    """One printed-twice run: a class, series, district prefix and serial span."""

    note_type: str
    face: Decimal
    series_year: int
    prefix: str
    low: int
    high: int


#: Series 2013 $1 New York (B) star notes: 6,650,000 serials printed at both
#: Washington and Fort Worth (250,000 + 6,400,000). Sources, which agree:
#:   https://www.2013b.com/2021/10/welcome.html
#:   https://project2013b2.com/
#:   https://www.numismaticnews.net/paper-money/duplicated-frn-serial-numbers
#:     (the BEP's count)
#: Series 1995 $1 star printings whose serials repeated an earlier run's, from
#: the same article's Table 1:
#:   https://www.numismaticnews.net/uploads/MTc4MTgxMjk1MDk5MDk0NjMy/table1.jpg
#: Series 1995 B: four runs each began at B00000001*; Series 1995 F: two
#: August 1996 runs overlapped.
RANGES: tuple[DuplicateRange, ...] = (
    DuplicateRange("frn", Decimal("1"), 2013, "B", 1, 250000),
    DuplicateRange("frn", Decimal("1"), 2013, "B", 3200001, 9600000),
    DuplicateRange("frn", Decimal("1"), 1995, "B", 1, 640000),
    DuplicateRange("frn", Decimal("1"), 1995, "F", 9856001, 10240000),
)

_STAR_SERIAL = re.compile(r"^([A-Z])(\d{8})\*$")


def is_duplicate(
    note_type: str | None,
    face: Decimal | None,
    series_year: int | None,
    serial: str | None,
) -> bool:
    """True when the note is a $1 star note in a printed-twice range."""
    if not serial or face is None:
        return False
    match = _STAR_SERIAL.match(serial.replace(" ", "").upper())
    if match is None:
        return False
    prefix, digits = match.group(1), int(match.group(2))
    return any(
        r.note_type == note_type
        and r.face == face
        and r.series_year == series_year
        and r.prefix == prefix
        and r.low <= digits <= r.high
        for r in RANGES
    )
