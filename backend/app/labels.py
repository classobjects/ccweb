# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Holder labels: the sheets they print on and the text each item's carries.

docs/specs/holder-labels-design.md, section 4. The sheet layouts are data in
one place -- a third product is a new entry in `SHEETS`, not new code.
`label_lines` is what an item's label says, one string per printed line with
the empty lines left out; `label_text` joins them into the one string a
label's tracking stores and compares. `labelable_clause` and `is_labelable`
say which items are offered a label at all.

`labels_of` is `label_lines` for many items at once: what notes carry --
attributes, errors, Friedberg numbers -- is read in one statement for all
of them, so a run over the whole collection is a handful of statements, not
several per item. `label_lines` is its one-item case, so both read the same.

Label bookkeeping (`write_quietly`) is not an edit of the item: it moves
neither its version nor its last-changed time, so a form open on an item
does not conflict with a printed sheet or a refreshed flag.
"""

from __future__ import annotations

import re
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import ColumnElement, Table, and_, bindparam, or_, select, true, update
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import set_committed_value

from .item_attributes import Held, held_attributes_of
from .item_descriptions import FANCY_SERIAL, fancy_is_redundant, saved_errors_of
from .models import (
    FriedbergNumber,
    InventoryItem,
    ItemKind,
    ItemStatus,
    Mint,
    NoteType,
    Series,
)
from .models.core import ITEM_CODE_PREFIX
from .models.reference import Disposition
from .offer_titles import _coin_date, _years, name_of

__all__ = [
    "SHEETS",
    "SHEET_FOR_KIND",
    "SheetLayout",
    "is_labelable",
    "label_items",
    "label_lines",
    "label_text",
    "labelable_clause",
    "labels_of",
    "printed_number",
    "refresh_every_stale",
    "refresh_stale",
    "write_quietly",
]


@dataclass(frozen=True)
class SheetLayout:
    """One label product: its grid and margins, in inches, on US Letter."""

    code: str
    name: str
    columns: int
    rows: int
    width: Decimal
    height: Decimal
    top: Decimal
    left: Decimal
    gap_x: Decimal
    gap_y: Decimal
    rounded: bool

    @property
    def cells(self) -> int:
        """Labels on one sheet."""
        return self.columns * self.rows


def _d(text: str) -> Decimal:
    """An inch measurement written as the product page gives it."""
    return Decimal(text)


SHEETS: dict[str, SheetLayout] = {
    "SL597": SheetLayout(
        "SL597",
        "Coin",
        10,
        16,
        _d("0.625"),
        _d("0.5"),
        _d("0.3345"),
        _d("0.333"),
        _d("0.176"),
        _d("0.1556"),
        True,
    ),
    "SL564": SheetLayout(
        "SL564",
        "Note and set",
        6,
        17,
        _d("1.333"),
        _d("0.625"),
        _d("0.188"),
        _d("0.25"),
        _d("0"),
        _d("0"),
        False,
    ),
}

#: The sheet an item of each labelable kind prints on.
SHEET_FOR_KIND: dict[str, str] = {"coin": "SL597", "currency": "SL564", "set": "SL564"}

#: Parts of one line, and of lines 3 and 4, are joined with these.
_PART_GAP = "  "
_LIST_JOIN = " · "

#: The attribute groups line 3 of a note draws from.
_NOTE_GROUPS = frozenset({"serial", "variety"})
#: Attributes line 3 leaves out: Error Note, because line 4 carries the
#: errors themselves; Gift, because it is how the item was acquired, and a
#: label is read by customers.
_UNPRINTED_ATTRIBUTES = frozenset({"error", "gift"})

_STATUS = "received"
_DISPOSITIONS = ("held", "listed")
_SET = "set"


def printed_number(item_code: str) -> str:
    """The item's number as printed: ``CC-004521`` is ``004521``."""
    return item_code.removeprefix(f"{ITEM_CODE_PREFIX}-")


def labelable_clause() -> ColumnElement[bool]:
    """The items offered a label, as a WHERE clause on `InventoryItem`.

    A coin, note or set that is received, held or listed, in no grading
    service's holder, a single piece or a set, and neither deleted nor split.
    """
    kind_ids = select(ItemKind.id).where(ItemKind.code.in_(SHEET_FOR_KIND))
    set_ids = select(ItemKind.id).where(ItemKind.code == _SET)
    status_ids = select(ItemStatus.id).where(ItemStatus.code == _STATUS)
    disposition_ids = select(Disposition.id).where(Disposition.code.in_(_DISPOSITIONS))
    return and_(
        InventoryItem.item_kind_id.in_(kind_ids),
        InventoryItem.status_id.in_(status_ids),
        InventoryItem.disposition_id.in_(disposition_ids),
        InventoryItem.grading_service_id.is_(None),
        or_(InventoryItem.piece_count == 1, InventoryItem.item_kind_id.in_(set_ids)),
        InventoryItem.deleted_at.is_(None),
        InventoryItem.split_at.is_(None),
    )


def is_labelable(db: Session, item: InventoryItem) -> bool:
    """Whether this item is offered a label (`labelable_clause`, for one item)."""
    found = db.scalar(
        select(InventoryItem.id).where(InventoryItem.id == item.id, labelable_clause())
    )
    return found is not None


def label_text(lines: list[str]) -> str:
    """The lines as the one string a label's tracking stores."""
    return "\n".join(lines)


#: What `label_lines` reads through an item's relationships, loaded with it.
_LABEL_LOADS = (
    selectinload(InventoryItem.item_kind),
    selectinload(InventoryItem.metal),
    selectinload(InventoryItem.set_form),
    selectinload(InventoryItem.denomination),
    selectinload(InventoryItem.country),
    selectinload(InventoryItem.coin_detail),
    selectinload(InventoryItem.currency_detail),
)


def label_items(db: Session, *where: ColumnElement[bool]) -> list[InventoryItem]:
    """The items matching `where`, in item-number order, ready for `labels_of`.

    Each comes with the relationships its label reads, so a run is not a
    query per item for its kind, metal or detail.
    """
    return list(
        db.scalars(
            select(InventoryItem)
            .where(*where)
            .options(*_LABEL_LOADS)
            .order_by(InventoryItem.item_code)
        ).all()
    )


@dataclass(frozen=True)
class _Facts:
    """What the labels of several items read beyond the items themselves."""

    held: dict[int, list[Held]]
    errors: dict[int, list[tuple[str, str | None]]]
    friedberg: dict[int, str]
    #: Reference rows `db.get` will be asked for. The session's identity map
    #: holds rows weakly, so these are kept here while the lines are made.
    kept: list[object]


def _facts(db: Session, items: Sequence[InventoryItem]) -> _Facts:
    """Read, for all `items` at once, what their labels need beyond themselves."""
    note_ids = [i.id for i in items if i.item_kind.code == "currency"]
    details = [i.currency_detail for i in items if i.currency_detail is not None]
    fr_ids = {d.friedberg_id for d in details if d.friedberg_id is not None}
    friedberg = (
        dict(
            db.execute(
                select(FriedbergNumber.id, FriedbergNumber.fr_number).where(
                    FriedbergNumber.id.in_(fr_ids)
                )
            )
            .tuples()
            .all()
        )
        if fr_ids
        else {}
    )
    kept: list[object] = []
    note_type_ids = {d.note_type_id for d in details if d.note_type_id is not None}
    if note_type_ids:
        kept += db.scalars(select(NoteType).where(NoteType.id.in_(note_type_ids)))
    mint_ids = {
        i.coin_detail.mint_id
        for i in items
        if i.coin_detail is not None and i.coin_detail.mint_id is not None
    }
    if mint_ids:
        kept += db.scalars(select(Mint).where(Mint.id.in_(mint_ids)))
    series_ids = {i.series_id for i in items if i.series_id is not None}
    if series_ids:
        kept += db.scalars(select(Series).where(Series.id.in_(series_ids)))
    return _Facts(
        held=held_attributes_of(db, note_ids),
        errors=saved_errors_of(db, note_ids),
        friedberg=friedberg,
        kept=kept,
    )


def labels_of(db: Session, items: Sequence[InventoryItem]) -> dict[int, list[str]]:
    """`label_lines` for each of `items`, keyed by item id.

    What the items share is read once for all of them; load them with
    `label_items` so their own relationships are too.
    """
    if not items:
        return {}
    facts = _facts(db, items)
    return {item.id: _lines(db, item, facts) for item in items}


def label_lines(db: Session, item: InventoryItem) -> list[str]:
    """What the item's label says, a string per line, empty lines left out."""
    return labels_of(db, [item])[item.id]


def _lines(db: Session, item: InventoryItem, facts: _Facts) -> list[str]:
    """One item's label lines, from the facts read for its run."""
    kind = item.item_kind.code
    if kind == "currency":
        lines = _note_lines(db, item, facts)
    elif kind == _SET:
        lines = _set_lines(db, item)
    else:
        lines = _coin_lines(db, item)
    return [line for line in lines if line]


def write_quietly(
    db: Session, changes: Mapping[InventoryItem, Mapping[str, object]]
) -> None:
    """Write label bookkeeping to items, without committing; not an edit of them.

    `changes` maps each item to its new column values. A plain UPDATE of the
    table, not a flush of the items: it leaves the version alone (an ORM
    flush would move it, and a form open on the item would then fail its
    save as a conflict over a flag its user never touched) and keeps
    `updated_at`. The loaded items are given the new values as already
    saved, so the session agrees with the database without a reload. A
    pending, unflushed change to the same columns on a loaded item is
    overwritten.
    """
    table = InventoryItem.__table__
    assert isinstance(table, Table)
    by_columns: dict[tuple[str, ...], list[tuple[InventoryItem, Mapping[str, object]]]]
    by_columns = {}
    for item, values in changes.items():
        by_columns.setdefault(tuple(sorted(values)), []).append((item, values))
    for columns, group in by_columns.items():
        statement = (
            update(table)
            .where(table.c.id == bindparam("b_id"))
            # `updated_at` set to itself: a column `onupdate` fires on any
            # UPDATE that does not name the column.
            .values(
                {
                    **{name: bindparam(f"b_{name}") for name in columns},
                    "updated_at": table.c.updated_at,
                }
            )
        )
        db.execute(
            statement,
            [
                {"b_id": item.id, **{f"b_{k}": v for k, v in values.items()}}
                for item, values in group
            ],
        )
        for item, values in group:
            for name, value in values.items():
                set_committed_value(item, name, value)


def refresh_stale(db: Session, item_ids: Collection[int]) -> None:
    """Set `label_stale` on the labeled items among these, without committing.

    A labeled item is stale when its label would now read differently from
    the text on its holder. An item whose holder carries no label is left
    alone, and is never stale; a printed label still waiting to be applied
    is not on the holder, so it is not compared. This is derived
    bookkeeping, not an edit: nothing is logged, and the item's version
    does not move (`write_quietly`).
    """
    if item_ids:
        _refresh(db, InventoryItem.id.in_(item_ids))


def refresh_every_stale(db: Session) -> None:
    """`refresh_stale` over every labeled item, without committing.

    Catches what no save saw: a vocabulary label renamed changes the label
    of every item carrying it, and none of them was edited.
    """
    _refresh(db, true())


def _refresh(db: Session, which: ColumnElement[bool]) -> None:
    """Bring `label_stale` up to date on the labeled items `which` selects."""
    items = label_items(db, which, InventoryItem.label_applied_at.is_not(None))
    lines = labels_of(db, items)
    flips: dict[InventoryItem, Mapping[str, object]] = {}
    for item in items:
        stale = item.label_text != label_text(lines[item.id])
        if item.label_stale != stale:
            flips[item] = {"label_stale": stale}
    write_quietly(db, flips)


def _coin_lines(db: Session, item: InventoryItem) -> list[str]:
    """Number, year with mint mark, metal."""
    return [
        printed_number(item.item_code),
        _coin_date(db, item) or "",
        item.metal.label if item.metal is not None else "",
    ]


def _note_lines(db: Session, item: InventoryItem, facts: _Facts) -> list[str]:
    """Number, Friedberg and Coolness; what it is; attributes; errors."""
    detail = item.currency_detail
    first = [printed_number(item.item_code)]
    if (
        detail is not None
        and detail.friedberg_status in ("confirmed", "proposed")
        and detail.friedberg_id is not None
    ):
        fr_number = facts.friedberg.get(detail.friedberg_id)
        if fr_number is not None:
            first.append(f"Fr {fr_number}")
    if detail is not None and detail.coolness_index is not None:
        first.append(f"Cool {detail.coolness_index:.1f}%")
    held = [
        h
        for h in facts.held.get(item.id, [])
        if h.group in _NOTE_GROUPS and h.code not in _UNPRINTED_ATTRIBUTES
    ]
    if fancy_is_redundant(h.code for h in held):
        held = [h for h in held if h.code != FANCY_SERIAL]
    errors = [label for label, _details in facts.errors.get(item.id, [])]
    return [
        _PART_GAP.join(first),
        name_of(db, item) or "",
        _LIST_JOIN.join(h.label for h in held),
        _LIST_JOIN.join(errors),
    ]


def _set_lines(db: Session, item: InventoryItem) -> list[str]:
    """Number; year and what the set is; mint and piece count."""
    mint = _mint_of(db, item)
    name = name_of(db, item)
    year = _years(item)
    if name is not None and mint is not None and mint.mark:
        # The mint is said on line 3; "1999-S" would say it twice.
        name = re.sub(rf"^(\d+)-{re.escape(mint.mark)}(?= |$)", r"\1", name)
    if name is None and item.set_form is not None:
        name = item.set_form.label
    if name is None or (year is not None and name.startswith(year)):
        second = name or ""
    else:
        second = f"{year} {name}" if year else name
    pieces = f"{item.piece_count} piece" + ("" if item.piece_count == 1 else "s")
    third = [mint.label] if mint is not None else []
    third.append(pieces)
    return [printed_number(item.item_code), second, _LIST_JOIN.join(third)]


def _mint_of(db: Session, item: InventoryItem) -> Mint | None:
    """The mint the item's coin detail records, if any."""
    detail = item.coin_detail
    if detail is None or detail.mint_id is None:
        return None
    return db.get(Mint, detail.mint_id)
