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
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.orm import Session

from . import item_attributes
from .item_descriptions import FANCY_SERIAL, fancy_is_redundant, saved_features
from .models import FriedbergNumber, InventoryItem, ItemKind, ItemStatus, Mint
from .models.core import ITEM_CODE_PREFIX
from .models.reference import Disposition
from .offer_titles import _coin_date, _years, name_of

__all__ = [
    "SHEETS",
    "SHEET_FOR_KIND",
    "SheetLayout",
    "is_labelable",
    "label_lines",
    "label_text",
    "labelable_clause",
    "printed_number",
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
#: Line 4 carries the errors, so the attribute that only says "has one" is left out.
_ERROR_ATTRIBUTE = "error"

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


def label_lines(db: Session, item: InventoryItem) -> list[str]:
    """What the item's label says, a string per line, empty lines left out."""
    kind = item.item_kind.code
    if kind == "currency":
        lines = _note_lines(db, item)
    elif kind == _SET:
        lines = _set_lines(db, item)
    else:
        lines = _coin_lines(db, item)
    return [line for line in lines if line]


def _coin_lines(db: Session, item: InventoryItem) -> list[str]:
    """Number, year with mint mark, metal."""
    return [
        printed_number(item.item_code),
        _coin_date(db, item) or "",
        item.metal.label if item.metal is not None else "",
    ]


def _note_lines(db: Session, item: InventoryItem) -> list[str]:
    """Number, Friedberg and Coolness; what it is; attributes; errors."""
    detail = item.currency_detail
    first = [printed_number(item.item_code)]
    if (
        detail is not None
        and detail.friedberg_status in ("confirmed", "proposed")
        and detail.friedberg_id is not None
    ):
        fr = db.get(FriedbergNumber, detail.friedberg_id)
        if fr is not None:
            first.append(f"Fr {fr.fr_number}")
    if detail is not None and detail.coolness_index is not None:
        first.append(f"Cool {detail.coolness_index:.1f}%")
    held = [
        h
        for h in item_attributes.held_attributes(db, item.id)
        if h.group in _NOTE_GROUPS and h.code != _ERROR_ATTRIBUTE
    ]
    if fancy_is_redundant(h.code for h in held):
        held = [h for h in held if h.code != FANCY_SERIAL]
    errors = [label for label, _details in saved_features(db, item).errors]
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
