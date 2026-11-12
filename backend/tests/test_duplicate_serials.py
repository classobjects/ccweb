# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Duplicate Serial: the $1 star ranges of Series 2013 and 1995."""

from __future__ import annotations

from decimal import Decimal

import pytest
from app import serial_patterns
from app.duplicate_serials import RANGES, is_duplicate


@pytest.mark.parametrize(
    ("serial", "expected"),
    [
        ("B00000001*", True),
        ("B00250000*", True),
        ("B00250001*", False),
        ("B03200000*", False),
        ("B03200001*", True),
        ("B09600000*", True),
        ("B09600001*", False),
        ("B00000001A", False),
        ("C00000001*", False),
        ("b0000 0001*", True),
        (None, False),
    ],
)
def test_the_two_ranges(serial: str | None, expected: bool) -> None:
    """Series 2013 B star serials in the two printed-twice ranges."""
    assert is_duplicate("frn", Decimal("1"), 2013, serial) is expected


@pytest.mark.parametrize(
    ("serial", "expected"),
    [
        ("B00640000*", True),
        ("B00640001*", False),
        ("F09856001*", True),
        ("F10240000*", True),
        ("F09856000*", False),
        ("F10240001*", False),
        ("F00000001*", False),
    ],
)
def test_the_1995_ranges(serial: str, expected: bool) -> None:
    """Series 1995 B and F star serials in the repeated ranges."""
    assert is_duplicate("frn", Decimal("1"), 1995, serial) is expected


def test_other_series_faces_and_classes_are_not_duplicates() -> None:
    """The rule needs the series, the face and a Federal Reserve Note."""
    assert not is_duplicate("frn", Decimal("1"), 2017, "B00000001*")
    assert not is_duplicate("frn", Decimal("1"), 2013, "F09856001*")
    assert not is_duplicate("frn", Decimal("5"), 2013, "B00000001*")
    assert not is_duplicate("silver_certificate", Decimal("1"), 2013, "B00000001*")
    assert not is_duplicate(None, None, None, "B00000001*")


def test_four_ranges_all_one_dollar_frn() -> None:
    """The data is four rows, all Federal Reserve $1."""
    assert len(RANGES) == 4
    assert {(r.note_type, r.face) for r in RANGES} == {("frn", Decimal("1"))}


def test_designations_adds_duplicate_serial_without_fancy() -> None:
    """Duplicate Serial is derived, but it is not a digit pattern."""
    found = serial_patterns.designations(
        "B00250000*", note_type="frn", face=Decimal("1"), series_year=2013
    )
    assert "duplicate_serial" in found
    assert "star" in found
    assert "duplicate_serial" in serial_patterns.DESIGNATIONS
    assert "duplicate_serial" not in serial_patterns.DIGIT_PATTERNS


def test_designations_without_a_serial_is_empty() -> None:
    """No serial, nothing earned."""
    assert (
        serial_patterns.designations(
            None, note_type="frn", face=Decimal("1"), series_year=2013
        )
        == set()
    )


def test_designations_equals_analyze_outside_the_ranges() -> None:
    """Outside the ranges the result is analyze's, unchanged."""
    serial = "B05555555A"
    assert serial_patterns.designations(
        serial, note_type="frn", face=Decimal("1"), series_year=2013
    ) == serial_patterns.analyze(serial)
