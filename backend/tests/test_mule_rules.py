# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""A mule read from a note's series and back plate number.

docs/specs/item-attributes-design.md, "Attributes from facts: Mule". Issue
facts are built by each test, as in test_attribute_rules.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from app.attribute_rules import ALWAYS, EVIDENCE, NEVER
from app.classifier_defaults import run
from app.models import (
    CurrencyDetail,
    Denomination,
    FriedbergNumber,
    InventoryItem,
    ItemAttribute,
    ItemAttributeLink,
    NoteIssue,
    ProvenanceSource,
)
from app.mule_rules import mule_verdict
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from tests.builders import (
    ItemFactory,
    add_note_issue,
    code_id,
    patch_current,
    review_cases,
)

ONE, FIVE, TWENTY = Decimal("1.0000"), Decimal("5"), Decimal("20")


# --- the rule --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("note_type", "face", "year", "letter", "back", "expected"),
    [
        # $1 Silver Certificates: 1935 faces are micro, 1935A macro; the
        # last micro back is 929.
        ("silver_certificate", ONE, 1935, None, "929", NEVER),
        ("silver_certificate", ONE, 1935, None, "930", ALWAYS),
        ("silver_certificate", ONE, 1935, "A", "929", ALWAYS),
        ("silver_certificate", ONE, 1935, "a", "3367", NEVER),
        # Back 470 has numbers of neither size: left to a person.
        ("silver_certificate", ONE, 1935, "A", "470", EVIDENCE),
        # $5: the same in three classes, the last micro back 938.
        ("frn", FIVE, 1934, None, "939", ALWAYS),
        ("frn", FIVE, 1934, None, "637", NEVER),
        ("frn", FIVE, 1934, "C", "629", ALWAYS),
        ("us_note", FIVE, 1928, "B", "939", ALWAYS),
        ("silver_certificate", FIVE, 1934, "B", "1200", NEVER),
        # $20: back 204 is macro though numbered among the micros.
        ("frn", TWENTY, 1934, None, "204", ALWAYS),
        ("frn", TWENTY, 1934, "A", "204", NEVER),
        ("frn", TWENTY, 1934, "A", "310", ALWAYS),
        # $1 FRN 1963: a back of the silver certificates' run.
        ("frn", ONE, 1963, None, "447", ALWAYS),
        ("frn", ONE, 1963, None, "448", NEVER),
        ("frn", ONE, 1977, "A", "5", ALWAYS),
        ("frn", ONE, 1977, "A", "923", NEVER),
        ("frn", ONE, 1981, "A", "706", ALWAYS),
        ("frn", ONE, 1981, "A", "16", NEVER),
    ],
)
def test_the_back_plate_decides_in_a_series_that_has_mules(
    note_type: str,
    face: Decimal,
    year: int,
    letter: str | None,
    back: str,
    expected: str,
) -> None:
    assert mule_verdict(note_type, face, year, letter, back) == expected


@pytest.mark.parametrize(
    ("note_type", "face", "year", "letter", "back"),
    [
        # A series with no published rule: nothing is said, either way.
        ("frn", ONE, 2021, None, "65"),
        ("frn", ONE, 1963, "A", "923"),
        ("silver_certificate", ONE, 1935, "E", "5743"),
        ("frn", Decimal("10"), 1934, "C", "1234"),
        # Another class or face value than the rule's.
        ("silver_certificate", ONE, 1963, None, "100"),
        ("frn", FIVE, 1935, None, "930"),
        # Not enough known.
        (None, ONE, 1935, None, "930"),
        ("silver_certificate", None, 1935, None, "930"),
        ("silver_certificate", ONE, None, None, "930"),
        ("silver_certificate", ONE, 1935, None, None),
        ("silver_certificate", ONE, 1935, None, "93O"),
    ],
)
def test_a_mule_is_said_only_where_a_rule_speaks(
    note_type: str | None,
    face: Decimal | None,
    year: int | None,
    letter: str | None,
    back: str | None,
) -> None:
    assert mule_verdict(note_type, face, year, letter, back) is None


# --- the pass --------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _issues(db: Session) -> None:
    """Only these tests' issues: $1 Silver Certificates of 1935 and 1935A."""
    db.execute(delete(NoteIssue))
    for letter in (None, "A"):
        add_note_issue(
            db, "usd_note_1", 1935, "silver_certificate", "blue", letter=letter
        )
    db.flush()


def _note(
    db: Session, make_item: ItemFactory, letter: str | None, back: str | None
) -> InventoryItem:
    """A $1 Series 1935 note with this letter and back plate."""
    item = make_item(
        kind="currency",
        title="Plain note",
        item_cost=Decimal("5.00"),
        grade_id=None,
        strike_type_id=None,
        denomination_id=code_id(db, Denomination, "usd_note_1"),
        year_start=1935,
    )
    db.add(
        CurrencyDetail(
            inventory_item_id=item.id,
            series_year=1935,
            series_letter=letter,
            back_plate_number=back,
        )
    )
    db.commit()
    return item


def _link(db: Session, item: InventoryItem) -> ItemAttributeLink | None:
    """The item's Mule attribute, or None when it does not carry it."""
    return db.scalar(
        select(ItemAttributeLink).where(
            ItemAttributeLink.inventory_item_id == item.id,
            ItemAttributeLink.item_attribute_id == code_id(db, ItemAttribute, "mule"),
        )
    )


def _mules(
    client: TestClient, headers: dict[str, str], item: InventoryItem
) -> list[str | None]:
    """What derived each Mule attribute the item shows; a 1935 $1 is No Motto too."""
    body = client.get(f"/api/inventory/{item.id}", headers=headers).json()
    return [a["derived_by"] for a in body["attributes"] if a["code"] == "mule"]


def test_a_mule_by_its_plates_gets_the_mule_attribute(
    db: Session, make_item: ItemFactory
) -> None:
    mule = _note(db, make_item, "A", "612")
    plain = _note(db, make_item, "A", "3367")
    report = run(db, commit=True)

    link = _link(db, mule)
    assert link is not None
    assert (link.source, link.derived_by) == (
        ProvenanceSource.derived,
        "attribute_rule",
    )
    assert _link(db, plain) is None
    assert report.counts["attribute: mule added"] == 1


def test_a_mule_marked_by_hand_on_a_plain_note_is_reported_not_removed(
    db: Session, make_item: ItemFactory
) -> None:
    note = _note(db, make_item, "A", "3367")
    db.add(
        ItemAttributeLink(
            inventory_item_id=note.id,
            item_attribute_id=code_id(db, ItemAttribute, "mule"),
            source=ProvenanceSource.manual,
        )
    )
    db.commit()
    assert review_cases(db, note) == [
        ("disagrees", "1935A with back plate 3367 is never Mule")
    ]
    run(db, commit=True)
    assert _link(db, note) is not None


def test_back_470_is_left_for_evidence(db: Session, make_item: ItemFactory) -> None:
    note = _note(db, make_item, "A", "470")
    assert review_cases(db, note) == [("needs evidence", "1935A: Mule?")]


def test_correcting_the_back_plate_takes_the_mule_back(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    note = _note(db, make_item, None, "950")
    run(db, commit=True)
    assert _link(db, note) is not None

    response = patch_current(
        client,
        f"/api/inventory/{note.id}",
        json={"back_plate_number": "905"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert _mules(client, admin_headers, note) == []


def test_a_notes_detail_says_what_its_plates_say(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """For the Friedberg lookup: a mule's number, or none of the mules'."""
    notes = {
        back: _note(db, make_item, "A", back) for back in ("612", "3367", "470", None)
    }
    run(db, commit=True)  # fills in the class the rule asks for
    found = {
        back: client.get(f"/api/inventory/{note.id}", headers=admin_headers).json()[
            "mule_by_plates"
        ]
        for back, note in notes.items()
    }
    assert found == {"612": True, "3367": False, "470": None, None: None}


def test_a_mule_is_added_when_its_back_plate_is_saved(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    note = _note(db, make_item, "A", None)
    run(db, commit=True)
    response = patch_current(
        client,
        f"/api/inventory/{note.id}",
        json={"back_plate_number": "612"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert _mules(client, admin_headers, note) == ["attribute_rule"]


def test_a_confirmed_mule_number_makes_the_note_a_mule(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """Read off the holder: the attribute follows the number, not the plates.

    A 2021 note's plates say nothing, so only the number can. A proposed
    number -- an unchecked answer -- does not; clearing it takes it back.
    """
    note = _note(db, make_item, None, None)
    mule = FriedbergNumber(fr_number="9907-Em")
    plain = FriedbergNumber(fr_number="9907-E")
    db.add_all([mule, plain])
    db.commit()

    def attach(row: FriedbergNumber, status: str) -> None:
        response = client.post(
            f"/api/inventory/{note.id}/friedberg",
            json={"friedberg_id": row.id, "status": status},
            headers=admin_headers,
        )
        assert response.status_code == 200, response.text

    attach(mule, "proposed")
    assert _mules(client, admin_headers, note) == []
    attach(mule, "confirmed")
    assert _mules(client, admin_headers, note) == ["attribute_rule"]
    attach(plain, "confirmed")
    assert _mules(client, admin_headers, note) == []

    attach(mule, "confirmed")
    response = client.delete(
        f"/api/inventory/{note.id}/friedberg", headers=admin_headers
    )
    assert response.status_code == 204, response.text
    assert _mules(client, admin_headers, note) == []


def test_correcting_a_held_number_redecides_its_notes_mule(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """The notes hold the row, so a number corrected is theirs at once.

    Dropping the `m` from a confirmed mule's number takes the attribute off
    the note holding it, and putting it back adds it again, as attaching
    and clearing do.
    """
    note = _note(db, make_item, None, None)
    row = FriedbergNumber(fr_number="9908-Em")
    db.add(row)
    db.commit()
    attached = client.post(
        f"/api/inventory/{note.id}/friedberg",
        json={"friedberg_id": row.id, "status": "confirmed"},
        headers=admin_headers,
    )
    assert attached.status_code == 200, attached.text
    assert _mules(client, admin_headers, note) == ["attribute_rule"]

    for number, mules in (("9908-E", []), ("9908-Em", ["attribute_rule"])):
        corrected = client.patch(
            f"/api/friedberg/{row.id}",
            json={"fr_number": number},
            headers=admin_headers,
        )
        assert corrected.status_code == 200, corrected.text
        assert _mules(client, admin_headers, note) == mules
