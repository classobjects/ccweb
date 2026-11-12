"""Sheet layouts and the text each item's label carries (holder-labels spec, 4)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from app.labels import (
    SHEET_FOR_KIND,
    SHEETS,
    is_labelable,
    label_lines,
    label_text,
    labelable_clause,
    printed_number,
)
from app.models import (
    CoinDetail,
    CurrencyDetail,
    Denomination,
    ErrorType,
    FriedbergNumber,
    GradingService,
    InventoryItem,
    ItemAttribute,
    ItemAttributeLink,
    ItemError,
    Metal,
    Mint,
    NoteType,
    SetForm,
    StorageForm,
    utcnow,
)
from app.models.reference import Disposition, ItemStatus
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.builders import ItemFactory, code_id


def test_each_layout_fills_letter_exactly() -> None:
    for s in SHEETS.values():
        across = s.left * 2 + s.columns * s.width + (s.columns - 1) * s.gap_x
        down = s.top * 2 + s.rows * s.height + (s.rows - 1) * s.gap_y
        assert float(across) == pytest.approx(8.5, abs=0.0035)
        assert float(down) == pytest.approx(11, abs=0.0035)
    assert SHEETS["SL597"].cells == 160
    assert SHEETS["SL564"].cells == 102
    assert SHEETS["SL597"].rounded and not SHEETS["SL564"].rounded
    assert SHEETS["SL597"].gap_y == Decimal("0.1556")
    assert SHEET_FOR_KIND == {"coin": "SL597", "currency": "SL564", "set": "SL564"}


def test_printed_number() -> None:
    assert printed_number("CC-004521") == "004521"
    assert printed_number("CC-000412_02") == "000412_02"


def _coin(db: Session, make_item: ItemFactory, **kw: object) -> InventoryItem:
    item = make_item(year_start=1921, metal_id=code_id(db, Metal, "silver"), **kw)
    db.refresh(item)
    return item


def test_coin_lines(db: Session, make_item: ItemFactory) -> None:
    item = _coin(db, make_item)
    db.add(CoinDetail(inventory_item_id=item.id, mint_id=code_id(db, Mint, "S")))
    db.flush()
    db.refresh(item)
    assert item.metal is not None
    assert label_lines(db, item) == [
        printed_number(item.item_code),
        "1921-S",
        item.metal.label,
    ]


def test_coin_without_mint_or_date(db: Session, make_item: ItemFactory) -> None:
    item = _coin(db, make_item)
    assert label_lines(db, item)[1] == "1921"
    undated = make_item(year_start=None, no_date=True)
    assert label_lines(db, undated) == [printed_number(undated.item_code)] + (
        [undated.metal.label] if undated.metal is not None else []
    )
    span = make_item(year_start=1878, year_end=1904)
    assert label_lines(db, span)[1] == "1878-1904"


def _note(db: Session, make_item: ItemFactory, **detail: object) -> InventoryItem:
    item = make_item(
        kind="currency",
        year_start=None,
        denomination_id=code_id(db, Denomination, "usd_note_1"),
    )
    db.add(
        CurrencyDetail(
            inventory_item_id=item.id,
            note_type_id=code_id(db, NoteType, "frn"),
            series_year=1999,
            serial_number="F12344321R",
            **detail,
        )
    )
    db.flush()
    db.refresh(item)
    return item


def _link(db: Session, item: InventoryItem, code: str) -> None:
    attribute = db.scalars(
        select(ItemAttribute).where(ItemAttribute.code == code)
    ).one()
    db.add(ItemAttributeLink(inventory_item_id=item.id, item_attribute_id=attribute.id))
    db.flush()


def _friedberg(db: Session, number: str) -> int:
    row = FriedbergNumber(fr_number=number)
    db.add(row)
    db.flush()
    return row.id


def test_note_lines(db: Session, make_item: ItemFactory) -> None:
    item = _note(
        db,
        make_item,
        friedberg_id=_friedberg(db, "9901*"),
        friedberg_status="proposed",
        coolness_index=Decimal("96.9"),
    )
    for code in ("star", "wide", "partial_ladder", "fancy_serial", "gift", "cac"):
        _link(db, item, code)
    errors = db.scalars(
        select(ErrorType)
        .where(ErrorType.applies_to.in_(["currency", "any"]))
        .order_by(ErrorType.sort_order, ErrorType.label)
        .limit(2)
    ).all()
    assert len(errors) == 2
    for error in errors:
        db.add(
            ItemError(inventory_item_id=item.id, error_type_id=error.id, details="x")
        )
    db.flush()
    from app.offer_titles import name_of

    labels = {
        a.code: a.label
        for a in db.scalars(
            select(ItemAttribute).where(
                ItemAttribute.code.in_(["star", "wide", "partial_ladder", "gift"])
            )
        )
    }
    name = name_of(db, item)
    assert name
    assert label_lines(db, item) == [
        f"{printed_number(item.item_code)}  Fr 9901*  Cool 96.9%",
        name,
        # vocabulary order; CAC (verification group) and Fancy Serial are left out
        " · ".join(labels[c] for c in ("star", "partial_ladder", "wide", "gift")),
        " · ".join(e.label for e in errors),
    ]
    assert label_text(label_lines(db, item)).count("\n") == 3


def test_a_conflicting_friedberg_is_not_printed(
    db: Session, make_item: ItemFactory
) -> None:
    for status in ("unknown", "conflicting"):
        item = _note(
            db,
            make_item,
            friedberg_id=_friedberg(db, f"99{status[:2]}"),
            friedberg_status=status,
        )
        assert label_lines(db, item)[0] == printed_number(item.item_code)
    confirmed = _note(
        db, make_item, friedberg_id=_friedberg(db, "9902"), friedberg_status="confirmed"
    )
    assert label_lines(db, confirmed)[0].endswith("  Fr 9902")


def test_a_note_with_nothing_to_add_drops_empty_lines(
    db: Session, make_item: ItemFactory
) -> None:
    item = _note(db, make_item)
    _link(db, item, "fancy_serial")
    lines = label_lines(db, item)
    assert "" not in lines
    assert len(lines) == 3  # number, name, Fancy Serial alone is still said
    assert (
        lines[2]
        == db.scalars(
            select(ItemAttribute.label).where(ItemAttribute.code == "fancy_serial")
        ).one()
    )


def _set(db: Session, make_item: ItemFactory, **kw: object) -> InventoryItem:
    fields: dict[str, object] = {
        "kind": "set",
        "year_start": 1999,
        "piece_count": 9,
        "set_form_id": code_id(db, SetForm, "silver_proof_set"),
    }
    item = make_item(**{**fields, **kw})
    db.refresh(item)
    return item


def test_set_lines(db: Session, make_item: ItemFactory) -> None:
    item = _set(db, make_item)
    assert label_lines(db, item) == [
        printed_number(item.item_code),
        "1999 Silver Proof Set",
        "9 pieces",
    ]
    db.add(CoinDetail(inventory_item_id=item.id, mint_id=code_id(db, Mint, "S")))
    db.flush()
    db.refresh(item)
    assert label_lines(db, item) == [
        printed_number(item.item_code),
        "1999 Silver Proof Set",
        "San Francisco · 9 pieces",
    ]


def test_a_sets_year_is_not_printed_twice(db: Session, make_item: ItemFactory) -> None:
    item = _set(db, make_item)
    # name_of already leads with the year; the line must not repeat it.
    assert label_lines(db, item)[1].count("1999") == 1
    one = _set(db, make_item, piece_count=1)
    assert label_lines(db, one)[2] == "1 piece"


def test_a_set_with_nothing_to_name_it_drops_the_line(
    db: Session, make_item: ItemFactory
) -> None:
    item = make_item(kind="set", year_start=None, piece_count=2)
    assert label_lines(db, item) == [printed_number(item.item_code), "2 pieces"]


def _make(db: Session, make_item: ItemFactory, **kw: object) -> InventoryItem:
    return make_item(**kw)


def test_labelable(db: Session, make_item: ItemFactory) -> None:
    sold = ("sold", None)
    cases: list[tuple[InventoryItem, bool]] = [
        (make_item(), True),
        (make_item(kind="currency"), True),
        (_set(db, make_item), True),
        (make_item(disposition_id=code_id(db, Disposition, "listed")), True),
        (make_item(disposition_id=code_id(db, Disposition, sold[0])), False),
        (make_item(status_id=code_id(db, ItemStatus, "ordered")), False),
        (make_item(grading_service_id=code_id(db, GradingService, "PMG")), False),
        (
            make_item(piece_count=50, storage_form_id=code_id(db, StorageForm, "roll")),
            False,
        ),
        (make_item(kind="bullion"), False),
        (make_item(deleted_at=utcnow()), False),
        (make_item(split_at=utcnow()), False),
    ]
    in_force = set(db.scalars(select(InventoryItem.id).where(labelable_clause())).all())
    for item, expected in cases:
        assert is_labelable(db, item) is expected
        assert (item.id in in_force) is expected
