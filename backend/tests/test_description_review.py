# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""`app.description_review`: fill empty descriptions, review the written ones.

`main` is always given the test's own `db`: left to itself it opens the
application's `SessionLocal`, which is the application database.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.description_review import main
from app.item_descriptions import suggested_description
from app.models import Denomination, InventoryItem, ItemFieldChange, Series, User
from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.builders import build_bare_item, code_id


def _dollar(db: Session, **extra: object) -> InventoryItem:
    """An 1881 Morgan dollar, whose record gives a description to suggest."""
    return build_bare_item(
        db,
        denomination_id=code_id(db, Denomination, "usd_coin_1_00"),
        series_id=code_id(db, Series, "morgan_dollar"),
        year_start=1881,
        year_end=1881,
        **extra,
    )


def _changes(db: Session, item: InventoryItem) -> list[ItemFieldChange]:
    """The History rows of the item's description."""
    return list(
        db.execute(
            select(ItemFieldChange).where(
                ItemFieldChange.inventory_item_id == item.id,
                ItemFieldChange.field_name == "description",
            )
        ).scalars()
    )


def _description(db: Session, item: InventoryItem) -> str | None:
    """The item's stored description, read afresh."""
    db.refresh(item)
    return item.description


def test_fill_writes_and_logs_only_the_empty_ones(
    db: Session, admin_user: User, capsys: pytest.CaptureFixture[str]
) -> None:
    empty = _dollar(db, description="")
    blank = _dollar(db, description="   ")
    written = _dollar(db, description="Seller words")
    db.commit()
    suggestion = suggested_description(db, empty)
    assert suggestion

    assert main(["fill"], db=db) == 0
    assert "2" in capsys.readouterr().out
    assert _description(db, empty) == ""
    assert not _changes(db, empty)

    assert main(["fill", "--commit", "--by", admin_user.email], db=db) == 0
    assert _description(db, empty) == suggestion
    assert _description(db, blank) == suggestion
    assert _description(db, written) == "Seller words"
    log = _changes(db, empty)
    assert [c.new_value for c in log] == [suggestion]
    assert log[0].changed_by_id == admin_user.id
    assert not _changes(db, written)


def test_fill_leaves_a_deleted_item_alone(db: Session, admin_user: User) -> None:
    from datetime import UTC, datetime

    gone = _dollar(db, description="", deleted_at=datetime.now(UTC))
    db.commit()
    assert main(["fill", "--commit", "--by", admin_user.email], db=db) == 0
    assert _description(db, gone) == ""


def _sheet(path: Path) -> list[list[object]]:
    """The workbook's rows."""
    sheet = load_workbook(path).active
    assert sheet is not None
    return [list(row) for row in sheet.iter_rows(values_only=True)]


def test_export_round_trips_a_description_beginning_with_equals(
    db: Session, tmp_path: Path
) -> None:
    item = _dollar(db, description="=SUM(A1) seller words")
    same = _dollar(db)
    same.description = suggested_description(db, same)
    _dollar(db, description="")
    db.commit()
    path = tmp_path / "review.xlsx"

    assert main(["export", str(path)], db=db) == 0

    rows = _sheet(path)
    assert rows[0] == ["item_code", "current", "suggested", "replace"]
    assert [r[0] for r in rows[1:]] == [item.item_code]
    assert rows[1][1] == "=SUM(A1) seller words"
    assert rows[1][2] == suggested_description(db, item)
    assert rows[1][3] is None
    sheet = load_workbook(path).active
    assert sheet is not None
    assert sheet["B2"].data_type == "s"


def _marked(path: Path, marks: dict[str, str], current: dict[str, str]) -> None:
    """Write a review workbook: one row per code, with its mark."""
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.append(["item_code", "current", "suggested", "replace"])
    for code, mark in marks.items():
        sheet.append([code, current.get(code, ""), "ignored", mark])
    book.save(path)


def test_apply_replaces_only_the_marked_rows(
    db: Session,
    admin_user: User,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    yes = _dollar(db, description="Old one")
    upper = _dollar(db, description="Old two")
    no = _dollar(db, description="Old three")
    db.commit()
    path = tmp_path / "marked.xlsx"
    _marked(
        path,
        {yes.item_code: " x ", upper.item_code: "X", no.item_code: "", "NOPE-1": "x"},
        {
            yes.item_code: "Old one",
            upper.item_code: "Old two",
            no.item_code: "Old three",
        },
    )

    assert main(["apply", str(path)], db=db) == 0
    out = capsys.readouterr().out
    assert "NOPE-1" in out
    assert _description(db, yes) == "Old one"

    assert main(["apply", str(path), "--commit", "--by", admin_user.email], db=db) == 0
    assert _description(db, yes) == suggested_description(db, yes)
    assert _description(db, upper) == suggested_description(db, upper)
    assert _description(db, no) == "Old three"
    log = _changes(db, yes)
    assert [(c.old_value, c.changed_by_id) for c in log] == [("Old one", admin_user.id)]


def test_apply_skips_a_row_changed_since_the_export(
    db: Session,
    admin_user: User,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    item = _dollar(db, description="Edited since")
    db.commit()
    path = tmp_path / "marked.xlsx"
    _marked(path, {item.item_code: "x"}, {item.item_code: "As exported"})

    assert main(["apply", str(path), "--commit", "--by", admin_user.email], db=db) == 0

    assert _description(db, item) == "Edited since"
    assert item.item_code in capsys.readouterr().out
    assert not _changes(db, item)
