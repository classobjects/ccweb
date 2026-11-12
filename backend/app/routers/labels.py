# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Holder labels: the sheets, the runs to print, the batch, a printed sheet.

docs/specs/holder-labels-design.md, section 4, "Printing" and "Knowing what
is labeled". Manager only. What a label says, and which items are offered
one, is `app.labels`; this module picks the items of a run and records what
printed.

**A run** is drawn from one source: the print batch, every labelable item
never labeled, or every labelable item whose label no longer matches. It
comes back as one list per sheet product, so a batch of coins and notes is
two runs, each in item-number order.

**Recording is not editing.** Joining or leaving the batch and being
printed write through `labels.write_quietly`: the item's version and
last-changed time stay as they were, so a form open on the item still
saves.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import AdminUser, DbSession
from ..labels import (
    SHEET_FOR_KIND,
    SHEETS,
    label_items,
    label_text,
    labelable_clause,
    labels_of,
    refresh_every_stale,
    write_quietly,
)
from ..models import InventoryItem, utcnow
from ..schemas import (
    LabelItemsIn,
    LabelOut,
    LabelRunOut,
    LabelRunsOut,
    LabelSheetOut,
    LabelSource,
    LabelsPrintedIn,
    LabelsRecordedOut,
)
from ._resolve import get_or_404, unprocessable
from ._tx import committing

router = APIRouter(prefix="/labels", tags=["labels"])

#: No write here checks a version, so a conflict cannot arise; `committing`
#: still wants the wording.
_STALE = "These items were changed by someone else. Reload and try again."

_BATCH = "batch"


def _labels(
    items: Sequence[InventoryItem], lines: Mapping[int, list[str]]
) -> list[LabelOut]:
    """The items' labels, in the order given."""
    return [
        LabelOut(item_id=item.id, item_code=item.item_code, lines=lines[item.id])
        for item in items
    ]


def _labelable_ids(db: Session, ids: Sequence[int]) -> set[int]:
    """Which of these items are offered a label."""
    return set(
        db.scalars(
            select(InventoryItem.id).where(
                InventoryItem.id.in_(ids), labelable_clause()
            )
        ).all()
    )


@router.get("/sheets")
def list_sheets(_admin: AdminUser) -> list[LabelSheetOut]:
    """Every label product, with its grid and margins in inches."""
    return [
        LabelSheetOut(
            code=s.code,
            name=s.name,
            columns=s.columns,
            rows=s.rows,
            width=s.width,
            height=s.height,
            top=s.top,
            left=s.left,
            gap_x=s.gap_x,
            gap_y=s.gap_y,
            rounded=s.rounded,
            cells=s.cells,
        )
        for s in SHEETS.values()
    ]


@router.get("/run")
def label_run(
    db: DbSession,
    _admin: AdminUser,
    source: Annotated[LabelSource, Query(description="What the run is drawn from")],
) -> LabelRunsOut:
    """The labels to print from `source`, one run per sheet product.

    `stale` first brings every labeled item's flag up to date, so a change
    no save saw -- a vocabulary label renamed -- is caught too. `batch`
    names, in `skipped`, the items in the batch no longer labelable; they
    are not printed and stay in the batch.
    """
    skipped: list[str] = []
    if source == _BATCH:
        batch = label_items(db, InventoryItem.in_label_batch.is_(True))
        offered = _labelable_ids(db, [item.id for item in batch])
        items = [item for item in batch if item.id in offered]
        skipped = [item.item_code for item in batch if item.id not in offered]
    elif source == "unlabeled":
        items = label_items(
            db, labelable_clause(), InventoryItem.label_printed_at.is_(None)
        )
    else:
        with committing(db, _STALE):
            refresh_every_stale(db)
        items = label_items(db, labelable_clause(), InventoryItem.label_stale.is_(True))
    lines = labels_of(db, items)
    by_sheet: dict[str, list[InventoryItem]] = {}
    for item in items:
        by_sheet.setdefault(SHEET_FOR_KIND[item.item_kind.code], []).append(item)
    return LabelRunsOut(
        runs=[
            LabelRunOut(sheet=code, labels=_labels(by_sheet[code], lines))
            for code in SHEETS
            if code in by_sheet
        ],
        skipped=skipped,
    )


def _batch(db: Session) -> list[LabelOut]:
    """The print batch, in item-number order, labelable or no longer."""
    items = label_items(db, InventoryItem.in_label_batch.is_(True))
    return _labels(items, labels_of(db, items))


@router.get("/batch")
def list_batch(db: DbSession, _admin: AdminUser) -> list[LabelOut]:
    """The print batch, in item-number order, labelable or no longer."""
    return _batch(db)


@router.post(
    "/batch",
    responses={422: unprocessable("an item named is unknown or not labelable")},
)
def add_to_batch(
    db: DbSession, _admin: AdminUser, payload: LabelItemsIn
) -> list[LabelOut]:
    """Add items to the print batch; returns the batch.

    All or none: when any item named is not labelable, none is added, and
    the refusal names every one that is not. An item already in the batch
    stays there once.
    """
    ids = list(dict.fromkeys(payload.item_ids))
    items = label_items(db, InventoryItem.id.in_(ids))
    found = {item.id for item in items}
    offered = _labelable_ids(db, ids)
    problems = [f"No item has id {i}" for i in ids if i not in found]
    refused = [item.item_code for item in items if item.id not in offered]
    if refused:
        problems.append("Not labelable: " + ", ".join(refused))
    if problems:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=". ".join(problems) + ". Nothing was added.",
        )
    with committing(db, _STALE):
        write_quietly(
            db,
            {
                item: {"in_label_batch": True}
                for item in items
                if not item.in_label_batch
            },
        )
    return _batch(db)


@router.delete("/batch/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_batch(db: DbSession, _admin: AdminUser, item_id: int) -> Response:
    """Take an item out of the print batch. Fine when it is not in it."""
    item = get_or_404(db, InventoryItem, item_id, "No such item")
    if item.in_label_batch:
        with committing(db, _STALE):
            write_quietly(db, {item: {"in_label_batch": False}})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/printed")
def record_printed(
    db: DbSession, _admin: AdminUser, payload: LabelsPrintedIn
) -> LabelsRecordedOut:
    """Record that these labels printed correctly, with what each says.

    The text recorded is the lines sent -- what is on the sheet -- not what
    the item reads now: an item edited between the run and this answer is
    recorded as needing a new label. An item named that is not labelable is
    passed over. Printing from the batch empties it of the items recorded.
    Recording twice records once: an item already labeled with the same
    text keeps the time it was first labeled. `recorded` counts the
    labelable items named.
    """
    printed = {label.item_id: label_text(label.lines) for label in payload.labels}
    items = label_items(db, InventoryItem.id.in_(printed), labelable_clause())
    current = labels_of(db, items)
    now = utcnow()
    changes: dict[InventoryItem, dict[str, object]] = {}
    for item in items:
        text = printed[item.id]
        stale = text != label_text(current[item.id])
        change: dict[str, object] = {}
        if item.label_printed_at is None or item.label_text != text:
            change.update(label_printed_at=now, label_text=text, label_stale=stale)
        elif item.label_stale != stale:
            change["label_stale"] = stale
        if payload.source == _BATCH and item.in_label_batch:
            change["in_label_batch"] = False
        if change:
            changes[item] = change
    with committing(db, _STALE):
        write_quietly(db, changes)
    return LabelsRecordedOut(recorded=len(items))
