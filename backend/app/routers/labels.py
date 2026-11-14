# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Holder labels: the sheets, the runs to print, the batch, printed and applied.

docs/specs/holder-labels-design.md, section 4, "Printing", "Applying" and
"Knowing what is labeled". Manager only. A label answered *Yes* waits to
be applied; only an applied one is the holder's. What a label says, and
which items are offered one, is `app.labels`; this module picks the items
of a run and records what printed and what was applied.

**A run** is drawn from one source: the print batch, every labelable item
whose holder carries no label, or every labelable item whose label no
longer matches -- the last two leaving out a label already waiting. It
comes back as one list per sheet product, so a batch of coins and notes is
two runs, each in item-number order.

**Recording is not editing.** Joining or leaving the batch, being printed,
applied or returned write through `labels.write_quietly`: the item's version and
last-changed time stay as they were, so a form open on the item still
saves.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
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
    LabelsAppliedOut,
    LabelSheetOut,
    LabelSource,
    LabelsPrintedIn,
    LabelsRecordedOut,
    LabelWaitingRunOut,
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
            db,
            labelable_clause(),
            InventoryItem.label_applied_at.is_(None),
            InventoryItem.label_waiting_at.is_(None),
        )
    else:
        with committing(db, _STALE):
            refresh_every_stale(db)
        items = label_items(
            db,
            labelable_clause(),
            InventoryItem.label_stale.is_(True),
            InventoryItem.label_waiting_at.is_(None),
        )
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

    A printed label is on the sheet, not the holder: each waits to be
    applied (`record_applied`), and the holder keeps whatever label it
    carried. The text recorded is the lines sent -- what is on the sheet --
    not what the item reads now: an item edited between the run and this
    answer needs a new label once this one is applied. An item named that
    is not labelable is passed over. Printing from the batch empties it of
    the items recorded. Recording twice records once: a label already
    waiting with the same text keeps the time it printed. `recorded` counts
    the labelable items named.
    """
    printed = {label.item_id: label_text(label.lines) for label in payload.labels}
    items = label_items(db, InventoryItem.id.in_(printed), labelable_clause())
    now = utcnow()
    changes: dict[InventoryItem, dict[str, object]] = {}
    for item in items:
        text = printed[item.id]
        change: dict[str, object] = {}
        if item.label_waiting_at is None or item.label_waiting_text != text:
            change.update(label_waiting_at=now, label_waiting_text=text)
        if payload.source == _BATCH and item.in_label_batch:
            change["in_label_batch"] = False
        if change:
            changes[item] = change
    with committing(db, _STALE):
        write_quietly(db, changes)
    return LabelsRecordedOut(recorded=len(items))


def _waiting_lines(item: InventoryItem) -> list[str]:
    """The lines the item's waiting label printed with."""
    return (item.label_waiting_text or "").split("\n")


@router.get("/waiting")
def list_waiting(db: DbSession, _admin: AdminUser) -> list[LabelWaitingRunOut]:
    """Printed labels not yet applied, one run per *Yes* and sheet, newest first.

    Each label carries the lines it printed with. An item sold since its
    label printed is still listed: the label exists, and is settled here.
    """
    items = label_items(db, InventoryItem.label_waiting_at.is_not(None))
    runs: dict[tuple[datetime, str], list[InventoryItem]] = {}
    for item in items:
        assert item.label_waiting_at is not None
        key = (item.label_waiting_at, SHEET_FOR_KIND[item.item_kind.code])
        runs.setdefault(key, []).append(item)
    sheet_order = list(SHEETS)
    return [
        LabelWaitingRunOut(
            printed_at=printed_at,
            sheet=sheet,
            labels=[
                LabelOut(
                    item_id=item.id,
                    item_code=item.item_code,
                    lines=_waiting_lines(item),
                )
                for item in group
            ],
        )
        for (printed_at, sheet), group in sorted(
            runs.items(),
            key=lambda kv: (-kv[0][0].timestamp(), sheet_order.index(kv[0][1])),
        )
    ]


def _settle(
    db: Session,
    item_ids: Sequence[int],
    change: Callable[[InventoryItem], dict[str, object]],
) -> LabelsAppliedOut:
    """Apply `change` to the waiting labels of these items; name the others."""
    ids = list(dict.fromkeys(item_ids))
    items = label_items(db, InventoryItem.id.in_(ids))
    found = {item.id for item in items}
    unknown = [i for i in ids if i not in found]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=". ".join(f"No item has id {i}" for i in unknown)
            + ". Nothing was changed.",
        )
    # Sorted before writing: the write clears what tells them apart.
    waiting = [item for item in items if item.label_waiting_at is not None]
    not_waiting = [item.item_code for item in items if item.label_waiting_at is None]
    with committing(db, _STALE):
        write_quietly(db, {item: change(item) for item in waiting})
    return LabelsAppliedOut(done=len(waiting), not_waiting=not_waiting)


@router.post("/applied", responses={422: unprocessable("an item named is unknown")})
def record_applied(
    db: DbSession, _admin: AdminUser, payload: LabelItemsIn
) -> LabelsAppliedOut:
    """Record that these items' waiting labels are now on their holders.

    Each waiting label becomes the holder's: its text and the time now. It
    needs a new label at once when the item reads differently from what
    printed. Items with no label waiting are named in `not_waiting` and
    left alone.
    """
    items = label_items(
        db,
        InventoryItem.id.in_(payload.item_ids),
        InventoryItem.label_waiting_at.is_not(None),
    )
    current = labels_of(db, items)
    now = utcnow()

    def apply(item: InventoryItem) -> dict[str, object]:
        text = item.label_waiting_text
        return {
            "label_applied_at": now,
            "label_text": text,
            "label_stale": text != label_text(current[item.id]),
            "label_waiting_at": None,
            "label_waiting_text": None,
        }

    return _settle(db, payload.item_ids, apply)


@router.post("/unused", responses={422: unprocessable("an item named is unknown")})
def record_unused(
    db: DbSession, _admin: AdminUser, payload: LabelItemsIn
) -> LabelsAppliedOut:
    """Forget these items' waiting labels: spoiled, lost or set aside.

    Each item goes back to what its holder carries -- nothing, or its
    earlier label -- so the next run prints it again. Items with no label
    waiting are named in `not_waiting` and left alone.
    """
    return _settle(
        db,
        payload.item_ids,
        lambda _item: {"label_waiting_at": None, "label_waiting_text": None},
    )
