# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Fancy-serial designations derived from the serial number.

These are what a PMG or PCGS submission asks the sender to declare, and they
carry real premiums, so the risk runs both ways: a missed designation sells a
note too cheaply, and a wrong one is a claim the note cannot support.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from app.labels import label_lines, label_text
from app.models import (
    CurrencyDetail,
    Denomination,
    InventoryItem,
    ItemAttribute,
    ItemAttributeLink,
    NoteType,
    utcnow,
)
from app.serial_patterns import analyze, is_incomplete, run
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.builders import ItemFactory, build_purchase_order, code_id

#: A star and nothing else: no ladder, repeater or fancy digits.
STAR_SERIAL = "A38164927*"


@pytest.mark.parametrize(
    ("serial", "expected"),
    [
        ("A12344321B", {"radar", "fancy_serial"}),
        ("A12341234B", {"repeater", "fancy_serial"}),
        ("A11112222B", {"binary", "double_quad", "fancy_serial"}),
        ("M88888888", {"solid_serial", "radar", "repeater", "fancy_serial"}),
        ("A12345678B", {"ladder", "fancy_serial"}),
        # Low and high are positional -- where the note sits in the print
        # run -- so they stack with the pattern designations rather than
        # replacing them.
        ("A00001234B", {"low_serial", "partial_ladder", "fancy_serial"}),
        # Ladder family: Ladder (all eight step), Scattered (the eight digits
        # of a ladder, shuffled), Partial (a run of five or more, or four
        # consecutive pairs). A note may earn Scattered and Partial both.
        ("A31452786B", {"scattered_ladder", "fancy_serial"}),
        ("A67890123B", {"ladder", "fancy_serial"}),
        (
            "A81234567B",
            {"scattered_ladder", "partial_ladder", "fancy_serial"},
        ),
        ("A12345567B", {"partial_ladder", "fancy_serial"}),
        ("A12345679B", {"partial_ladder", "fancy_serial"}),
        ("A89012555B", {"partial_ladder", "fancy_serial"}),
        ("A00112233B", {"partial_ladder", "fancy_serial"}),
        ("A33112200B", {"partial_ladder", "fancy_serial"}),
        ("A99001122B", {"high_serial", "partial_ladder", "fancy_serial"}),
        ("A10203040B", set()),
        ("A12321555B", set()),
        ("A11111112B", {"binary", "fancy_serial"}),
        ("A98765432B", {"high_serial", "ladder", "fancy_serial"}),
        (
            "A99999999B",
            {
                "high_serial",
                "solid_serial",
                "radar",
                "repeater",
                "fancy_serial",
            },
        ),
        ("A04301989B", {"birthday", "fancy_serial"}),
        ("A15141514B", {"trinary", "repeater", "fancy_serial"}),
        ("A25282252B", {"trinary", "fancy_serial"}),
        # Four of one digit then four of another. Binary too -- two distinct
        # digits -- but the arrangement is the thing collectors pay for.
        ("E00003333B", {"double_quad", "binary", "low_serial", "fancy_serial"}),
        ("A19472856B", set()),
    ],
)
def test_designations(serial: str, expected: set[str]) -> None:
    assert analyze(serial) == expected


def test_a_star_is_not_a_fancy_serial() -> None:
    """Two different questions on a grading form, and two different suffixes.

    A star swept into `fancy_serial` would be a claim about the note's digits
    that its digits do not support.
    """
    plain_star = analyze("A19472856*")
    assert plain_star == {"star"}
    assert "fancy_serial" not in plain_star

    # A star note whose digits *are* patterned earns both, separately.
    both = analyze("A12344321*")
    assert {"star", "radar", "fancy_serial"} <= both


def test_short_serials_yield_no_pattern() -> None:
    """The eight-digit rule.

    "59" has two distinct digits, so a naive binary test calls it a binary
    note. It is a truncated field, not a note, and reading patterns from a
    short serial would invent designations.
    """
    for serial in ("59", "887", "1791040", "99V7711"):
        assert is_incomplete(serial)
        assert analyze(serial) - {"star"} == set()


def test_a_short_serial_still_shows_its_star() -> None:
    """The asterisk is not a digit pattern, so truncation does not hide it."""
    assert analyze("*59") == {"star"}


def test_consecutive_is_never_derived() -> None:
    """It describes a run of notes, which one serial cannot show.

    It is recorded by a person who knows they bought a run. No single serial
    could establish that, so this must not try.
    """
    for serial in ("A12345678B", "A00000001B", "M88888888"):
        assert "consecutive" not in analyze(serial)


def test_empty_serial_is_silent() -> None:
    assert analyze("") == set()


# ---------------------------------------------------------------------------
# The pass over the collection
# ---------------------------------------------------------------------------


def _note(db: Session, make_item: ItemFactory, serial: str) -> InventoryItem:
    """A bought banknote with this serial number, its words naming no attribute."""
    note = make_item(
        kind="currency",
        description="plain",
        grade_id=None,
        strike_type_id=None,
        item_cost=Decimal("5.00"),
    )
    db.add(CurrencyDetail(inventory_item_id=note.id, serial_number=serial))
    db.commit()
    return note


def _links(db: Session, item: InventoryItem) -> list[tuple[str, str | None]]:
    """The item's attribute links in force: code, and the rule that added it."""
    return sorted(
        db.execute(
            select(ItemAttribute.code, ItemAttributeLink.derived_by)
            .join(
                ItemAttribute, ItemAttribute.id == ItemAttributeLink.item_attribute_id
            )
            .where(
                ItemAttributeLink.inventory_item_id == item.id,
                ItemAttributeLink.removed_at.is_(None),
            )
        ).tuples()
    )


def test_a_retired_designation_is_not_added(
    db: Session, make_item: ItemFactory
) -> None:
    """Retiring a value stops every new use of it, the pass's included."""
    note = _note(db, make_item, STAR_SERIAL)
    star = db.scalars(select(ItemAttribute).where(ItemAttribute.code == "star")).one()
    star.is_active = False
    db.commit()

    stats, _ = run(db, commit=True)

    assert _links(db, note) == []
    assert stats["retired_attribute:star"] == 1


def test_a_retired_designation_the_pass_added_is_kept(
    db: Session, make_item: ItemFactory
) -> None:
    """Retiring leaves every record that uses the value as it is."""
    note = _note(db, make_item, STAR_SERIAL)
    run(db, commit=True)
    star = db.scalars(select(ItemAttribute).where(ItemAttribute.code == "star")).one()
    star.is_active = False
    db.commit()

    run(db, commit=True)

    assert _links(db, note) == [("star", "serial_pattern")]


def test_links_merged_into_another_attribute_survive_the_next_pass(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """A merge moves the pass's links to a value the pass does not derive.

    They are then the merge's, not the pass's: a pass that read them as its
    own would take them back as designations the serial no longer earns.
    """
    note = _note(db, make_item, STAR_SERIAL)
    run(db, commit=True)
    made = client.post(
        "/api/reference/item_attribute",
        json={
            "code": "replacement_test",
            "label": "Replacement Test",
            "extra": {"applies_to": "currency", "attribute_group": "serial"},
        },
        headers=admin_headers,
    )
    assert made.status_code == 201, made.text
    merged = client.post(
        "/api/reference/item_attribute/star/merge",
        json={"into": "replacement_test"},
        headers=admin_headers,
    )
    assert merged.status_code == 200, merged.text

    run(db, commit=True)

    assert _links(db, note) == [("replacement_test", None)]


def test_links_merged_into_a_designation_the_pass_derives_stay_its_own(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """Into a code the pass derives, the link is still the pass's to judge."""
    note = _note(db, make_item, "A12344321B")
    run(db, commit=True)
    assert ("radar", "serial_pattern") in _links(db, note)
    merged = client.post(
        "/api/reference/item_attribute/radar/merge",
        json={"into": "repeater"},
        headers=admin_headers,
    )
    assert merged.status_code == 200, merged.text

    assert ("repeater", "serial_pattern") in _links(db, note)


# ---------------------------------------------------------------------------
# On save
# ---------------------------------------------------------------------------

RADAR_SERIAL = "A12344321B"
PLAIN_SERIAL = "A19472856B"


def _patch(
    client: TestClient,
    headers: dict[str, str],
    item: InventoryItem,
    changes: dict[str, object],
) -> None:
    """Save these changes through the item editor's endpoint."""
    path = f"/api/inventory/{item.id}"
    version = client.get(path, headers=headers).json()["version"]
    response = client.patch(path, json={**changes, "version": version}, headers=headers)
    assert response.status_code == 200, response.text


def test_saving_a_serial_derives_its_designations(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """A serial saved in the editor gets its designations in the same save."""
    note = _note(db, make_item, PLAIN_SERIAL)

    _patch(client, admin_headers, note, {"serial_number": RADAR_SERIAL})

    db.expire_all()
    links = _links(db, note)
    assert ("radar", "serial_pattern") in links
    assert ("fancy_serial", "serial_pattern") in links


def test_correcting_the_serial_takes_back_what_was_derived(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """A serial corrected to an ordinary number loses the radar it was given."""
    note = _note(db, make_item, PLAIN_SERIAL)
    _patch(client, admin_headers, note, {"serial_number": RADAR_SERIAL})

    _patch(client, admin_headers, note, {"serial_number": PLAIN_SERIAL})

    db.expire_all()
    codes = {code for code, _ in _links(db, note)}
    assert "radar" not in codes
    assert "fancy_serial" not in codes


def test_a_removed_designation_is_not_put_back_on_save(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """A designation a person removed stays removed through later saves."""
    note = _note(db, make_item, PLAIN_SERIAL)
    _patch(client, admin_headers, note, {"serial_number": RADAR_SERIAL})
    db.expire_all()
    kept = [code for code, _ in _links(db, note) if code != "radar"]
    _patch(client, admin_headers, note, {"attributes": kept})

    _patch(client, admin_headers, note, {"rating": "looked at again"})

    db.expire_all()
    assert "radar" not in {code for code, _ in _links(db, note)}


def test_a_bulk_edit_derives_too(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """A serial set by a bulk edit is derived on every note it reaches."""
    notes = [_note(db, make_item, PLAIN_SERIAL) for _ in range(2)]

    response = client.post(
        "/api/inventory/bulk",
        json={
            "ids": [n.id for n in notes],
            "changes": {"serial_number": RADAR_SERIAL},
        },
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text

    db.expire_all()
    for note in notes:
        assert ("radar", "serial_pattern") in _links(db, note)


#: A Series 2013 $1 New York star in the first printed-twice range.
DUPLICATE_SERIAL = "B00000002*"


def _series_2013_dollar(changes: dict[str, object]) -> dict[str, object]:
    """These changes, on a Series 2013 $1 Federal Reserve Note."""
    return {
        "note_type": "frn",
        "denomination": "usd_note_1",
        "series_year": 2013,
        **changes,
    }


def test_series_2013_b_star_gets_duplicate_on_save(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """Duplicate Serial is derived on save with the star, from the note's class."""
    note = _note(db, make_item, PLAIN_SERIAL)

    _patch(
        client,
        admin_headers,
        note,
        _series_2013_dollar({"serial_number": DUPLICATE_SERIAL}),
    )

    db.expire_all()
    links = _links(db, note)
    assert ("duplicate_serial", "serial_pattern") in links
    assert ("star", "serial_pattern") in links


def test_correcting_the_series_takes_back_duplicate_serial(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """A series corrected out of the range loses Duplicate Serial."""
    note = _note(db, make_item, PLAIN_SERIAL)
    _patch(
        client,
        admin_headers,
        note,
        _series_2013_dollar({"serial_number": DUPLICATE_SERIAL}),
    )

    _patch(client, admin_headers, note, {"series_year": 2017})

    db.expire_all()
    codes = {code for code, _ in _links(db, note)}
    assert "duplicate_serial" not in codes
    assert "star" in codes


def test_the_pass_keeps_and_adds_duplicate_serial(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """The pass by hand judges Duplicate Serial as the save does.

    It neither takes back the link a save added nor misses a note that was
    never saved through the editor.
    """
    saved = _note(db, make_item, PLAIN_SERIAL)
    _patch(
        client,
        admin_headers,
        saved,
        _series_2013_dollar({"serial_number": DUPLICATE_SERIAL}),
    )
    unsaved = _note(db, make_item, "B00000003*")
    unsaved.denomination_id = code_id(db, Denomination, "usd_note_1")
    detail = db.get_one(CurrencyDetail, unsaved.id)
    detail.note_type_id = code_id(db, NoteType, "frn")
    detail.series_year = 2013
    db.commit()

    run(db, commit=True)

    db.expire_all()
    assert ("duplicate_serial", "serial_pattern") in _links(db, saved)
    assert ("duplicate_serial", "serial_pattern") in _links(db, unsaved)


# ---------------------------------------------------------------------------
# On save, as production runs it
# ---------------------------------------------------------------------------
#
# `SessionLocal` (app/database.py) sets `autoflush=False`; the test session
# does not. What reads the links a save has just derived -- the description,
# Duplicate Serial, the label's stale flag -- must see them without a query
# having flushed them first.


def test_a_new_note_s_description_names_the_designations_its_save_derived(
    client: TestClient, admin_headers: dict[str, str], db: Session
) -> None:
    """A note entered with no description is described with its star and radar."""
    order = build_purchase_order(db, vendor_name="Serial Pattern Vendor")
    payload = {
        "purchase_order_id": order.id,
        "item_kind": "currency",
        "source_title": "1999 $1 Federal Reserve Note",
        "item_cost": "20.00",
        "note_type": "frn",
        "denomination": "usd_note_1",
        "series_year": 1999,
        "serial_number": "A12344321*",
        "description": "",
    }
    db.autoflush = False
    try:
        made = client.post("/api/inventory", json=payload, headers=admin_headers)
    finally:
        db.autoflush = True
    assert made.status_code == 201, made.text

    assert "Star Note, Radar" in made.json()["description"]


def test_a_labeled_note_given_a_radar_serial_is_marked_stale(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """The stale flag reads the radar the same save derived."""
    note = _note(db, make_item, PLAIN_SERIAL)
    note.label_applied_at = utcnow()
    note.label_text = label_text(label_lines(db, note))
    db.commit()

    db.autoflush = False
    try:
        _patch(client, admin_headers, note, {"serial_number": RADAR_SERIAL})
    finally:
        db.autoflush = True

    db.expire_all()
    assert db.get_one(InventoryItem, note.id).label_stale is True


def test_duplicate_serial_reads_the_note_type_its_save_filled(
    client: TestClient,
    admin_headers: dict[str, str],
    make_item: ItemFactory,
    db: Session,
) -> None:
    """A Series 2013 $1 saved without its class gets FRN, then Duplicate Serial."""
    note = _note(db, make_item, PLAIN_SERIAL)

    db.autoflush = False
    try:
        _patch(
            client,
            admin_headers,
            note,
            {
                "denomination": "usd_note_1",
                "series_year": 2013,
                "serial_number": DUPLICATE_SERIAL,
            },
        )
    finally:
        db.autoflush = True

    db.expire_all()
    assert db.get_one(CurrencyDetail, note.id).note_type_id == code_id(
        db, NoteType, "frn"
    )
    assert ("duplicate_serial", "serial_pattern") in _links(db, note)
