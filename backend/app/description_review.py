# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Fill empty item descriptions, and review the written ones in a workbook.

The editor's Suggest button writes a description from an item's record
(`app.item_descriptions.suggested_description`), and a save fills an empty
one. This pass does the same for items already stored, in three steps:

    python -m app.description_review fill [--commit --by EMAIL]
    python -m app.description_review export WORKBOOK.xlsx
    python -m app.description_review apply WORKBOOK.xlsx [--commit --by EMAIL]

- `fill` gives every unsplit, undeleted item whose description is empty (or
  only whitespace) the suggestion, unless the record holds nothing to say.
- `export` writes a workbook with one row per unsplit, undeleted item whose
  written description differs from the suggestion: `item_code`, `current`,
  `suggested` and an empty `replace`. The owner puts an `x` in `replace` on
  each row whose description should give way.
- `apply` reads that workbook back and replaces the description of each
  marked row with the suggestion *as computed now*. A row whose `current` is
  no longer the item's description (it was edited since the export; line
  endings aside) is skipped and named, as is a code no live item holds -- one
  deleted or split since. A `replace` holding anything but `x` is ignored,
  and the rows so ignored are counted.

Each change is logged in the item's History under the person named by
`--by`. Nothing is written without `--commit`.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import field_changes, pass_cli
from .cell_text import keep_text
from .database import SessionLocal
from .item_descriptions import suggested_description
from .models import InventoryItem

__all__ = ["main"]

HEADER: tuple[str, ...] = ("item_code", "current", "suggested", "replace")
_WIDTHS: tuple[int, ...] = (16, 60, 60, 10)


def _live_items(db: Session) -> Iterator[InventoryItem]:
    """Every unsplit, undeleted item, by item code."""
    stmt = (
        select(InventoryItem)
        .where(InventoryItem.deleted_at.is_(None), InventoryItem.split_at.is_(None))
        .order_by(InventoryItem.item_code)
    )
    yield from db.execute(stmt).scalars().all()


def _is_empty(text: str | None) -> bool:
    """Whether a description says nothing."""
    return not (text or "").strip()


@dataclass
class Fill:
    """The empty descriptions the pass would fill: item id, code, new text."""

    rows: list[tuple[int, str, str]] = field(default_factory=list)
    #: Empty descriptions whose record gives nothing to suggest.
    nothing_to_say: int = 0


def plan_fill(db: Session) -> Fill:
    """Every suggestion `fill` would write. Writes nothing."""
    todo = Fill()
    for item in _live_items(db):
        if not _is_empty(item.description):
            continue
        suggestion = suggested_description(db, item)
        if suggestion:
            todo.rows.append((item.id, item.item_code, suggestion))
        else:
            todo.nothing_to_say += 1
    return todo


def _set_description(
    db: Session, item: InventoryItem, text: str, user_id: int, at: datetime
) -> None:
    """Write the description and log the change under the person."""
    before = {"description": item.description}
    item.description = text
    field_changes.record(
        db,
        item.id,
        before,
        {"description": text},
        ["description"],
        user_id=user_id,
        at=at,
    )


def apply_fill(db: Session, todo: Fill, user_id: int) -> int:
    """Write the planned suggestions; the caller commits."""
    now = datetime.now(UTC)
    for item_id, _code, text in todo.rows:
        _set_description(db, db.get_one(InventoryItem, item_id), text, user_id, now)
    db.flush()
    return len(todo.rows)


def export(db: Session, path: Path) -> int:
    """Write the review workbook; returns how many rows it holds."""
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.title = "descriptions"
    sheet.append(list(HEADER))
    count = 0
    for item in _live_items(db):
        current = item.description or ""
        if _is_empty(current):
            continue
        suggestion = suggested_description(db, item)
        if not suggestion or suggestion == current:
            continue
        count += 1
        # Line endings as `\n`: a carriage return does not survive the
        # workbook as written, and `apply` compares with them so read.
        row = (item.item_code, _lines(current), suggestion)
        for column, value in enumerate(row, 1):
            keep_text(sheet.cell(row=count + 1, column=column, value=value))
    for index, width in enumerate(_WIDTHS):
        sheet.column_dimensions[chr(ord("A") + index)].width = width
    sheet.freeze_panes = "A2"
    book.save(path)
    return count


@dataclass
class Replace:
    """What `apply` would do with a workbook."""

    #: (item id, item code) of each description to replace.
    items: list[tuple[int, str]] = field(default_factory=list)
    changed_since: list[str] = field(default_factory=list)
    #: Marked codes no unsplit, undeleted item holds.
    unknown: list[str] = field(default_factory=list)
    #: Rows whose `replace` holds something other than x or nothing.
    unrecognized: int = 0


def _lines(text: str) -> str:
    """The text with every line ending written as a line feed.

    A spreadsheet may save a line break as CRLF; that is not an edit.
    """
    return text.replace("\r\n", "\n").replace("\r", "\n")


def plan_apply(db: Session, path: Path) -> Replace:
    """The marked rows of the workbook, sorted into replace, skipped, unknown."""
    sheet = load_workbook(path, read_only=True).active
    assert sheet is not None
    marked: dict[str, str] = {}
    todo = Replace()
    for code, current, _suggested, mark in sheet.iter_rows(
        min_row=2, max_col=4, values_only=True
    ):
        said = str(mark or "").strip().lower()
        if not code:
            continue
        if said == "x":
            marked[str(code).strip()] = "" if current is None else str(current)
        elif said:
            todo.unrecognized += 1
    if not marked:
        return todo
    items = {
        item.item_code: item
        for item in db.execute(
            select(InventoryItem).where(
                InventoryItem.item_code.in_(marked),
                InventoryItem.deleted_at.is_(None),
                InventoryItem.split_at.is_(None),
            )
        ).scalars()
    }
    for code, current in marked.items():
        item = items.get(code)
        if item is None:
            todo.unknown.append(code)
        elif _lines(item.description or "") != _lines(current):
            todo.changed_since.append(code)
        else:
            todo.items.append((item.id, code))
    return todo


def apply_replace(db: Session, todo: Replace, user_id: int) -> int:
    """Replace each marked description with the suggestion now; caller commits."""
    now = datetime.now(UTC)
    done = 0
    for item_id, _code in todo.items:
        item = db.get_one(InventoryItem, item_id)
        suggestion = suggested_description(db, item)
        if suggestion and suggestion != item.description:
            _set_description(db, item, suggestion, user_id, now)
            done += 1
    db.flush()
    return done


def main(argv: Sequence[str] | None = None, *, db: Session | None = None) -> int:
    """Run one step; `db` is the session to work in.

    Run as a module, the application's own `SessionLocal` is opened. A caller
    that already has a session -- the tests, which must never let this open
    the live database -- passes it.
    """
    parser = argparse.ArgumentParser(prog="description_review", description=__doc__)
    steps = parser.add_subparsers(dest="step", required=True)
    fill = steps.add_parser("fill", help="fill the empty descriptions")
    pass_cli.add_commit_arguments(fill, "write the descriptions")
    out = steps.add_parser("export", help="write the review workbook")
    out.add_argument("workbook", type=Path)
    out.set_defaults(commit=False, by=None)
    back = steps.add_parser("apply", help="replace the descriptions marked x")
    back.add_argument("workbook", type=Path)
    pass_cli.add_commit_arguments(back, "write the descriptions")
    args = pass_cli.parse_args(parser, argv)

    if db is None:
        with SessionLocal() as own:
            return _run(own, args)
    return _run(db, args)


def _run(db: Session, args: argparse.Namespace) -> int:
    """The chosen step, in one session."""
    if args.step == "export":
        print(f"rows written to {args.workbook}: {export(db, args.workbook)}")
        return 0
    if args.step == "fill":
        todo = plan_fill(db)
        print(f"empty descriptions to fill: {len(todo.rows)}")
        print(f"left empty (nothing in the record to say): {todo.nothing_to_say}")
        return pass_cli.commit_or_report(
            db, args, lambda user_id: apply_fill(db, todo, user_id)
        )
    replace = plan_apply(db, args.workbook)
    print(f"descriptions to replace: {len(replace.items)}")
    for code in replace.changed_since:
        print(f"  skipped, changed since the export: {code}")
    for code in replace.unknown:
        print(f"  no live item: {code}")
    if replace.unrecognized:
        print(f"  {replace.unrecognized} rows with an unrecognized mark ignored")
    return pass_cli.commit_or_report(
        db, args, lambda user_id: apply_replace(db, replace, user_id)
    )


if __name__ == "__main__":
    sys.exit(main())
