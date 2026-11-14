# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""The labels API: runs, the print batch, recording a printed sheet.

holder-labels spec, section 4, "Printing" and "Knowing what is labeled".
"""

from __future__ import annotations

from datetime import datetime

import pytest
from app.labels import label_lines, label_text, printed_number
from app.models import (
    AppliesTo,
    CoinDetail,
    CurrencyDetail,
    ErrorType,
    GradingService,
    InventoryItem,
    Metal,
    Mint,
    NoteType,
    utcnow,
)
from app.models.reference import Disposition
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from tests.builders import ItemFactory, code_id

_API = "/api/labels"


def _coin(db: Session, make_item: ItemFactory, **kw: object) -> InventoryItem:
    """A Silver 1921-S coin: labelable, never labeled."""
    item = make_item(year_start=1921, metal_id=code_id(db, Metal, "silver"), **kw)
    db.add(CoinDetail(inventory_item_id=item.id, mint_id=code_id(db, Mint, "S")))
    db.commit()
    db.refresh(item)
    return item


def _note(db: Session, make_item: ItemFactory) -> InventoryItem:
    """A labelable note, never labeled."""
    item = make_item(kind="currency", year_start=None)
    db.add(
        CurrencyDetail(
            inventory_item_id=item.id,
            note_type_id=code_id(db, NoteType, "frn"),
            series_year=1999,
            serial_number="F12344321R",
        )
    )
    db.commit()
    db.refresh(item)
    return item


def _label(db: Session, item: InventoryItem, text: str | None = None) -> None:
    """Record the item as labeled, with its text now unless another is given."""
    item.label_applied_at = utcnow()
    item.label_text = text if text is not None else label_text(label_lines(db, item))
    db.commit()


def _fresh(db: Session, item_id: int) -> InventoryItem:
    """The item as the database holds it now."""
    db.expire_all()
    found = db.get(InventoryItem, item_id)
    assert found is not None
    return found


def _sold(db: Session, item: InventoryItem) -> None:
    item.disposition_id = code_id(db, Disposition, "sold")
    db.commit()


def _run(client: TestClient, headers: dict[str, str], source: str) -> dict[str, object]:
    got = client.get(f"{_API}/run", params={"source": source}, headers=headers)
    assert got.status_code == 200, got.text
    body: dict[str, object] = got.json()
    return body


def _codes(run: dict[str, object]) -> list[str]:
    labels = run["labels"]
    assert isinstance(labels, list)
    return [label["item_code"] for label in labels]


def _add(client: TestClient, headers: dict[str, str], *ids: int) -> None:
    added = client.post(f"{_API}/batch", json={"item_ids": list(ids)}, headers=headers)
    assert added.status_code == 200, added.text


def _printed(
    db: Session, client: TestClient, headers: dict[str, str], source: str, *ids: int
) -> int:
    """Say these items' labels printed, each with the lines it reads now."""
    labels = [{"item_id": i, "lines": label_lines(db, _fresh(db, i))} for i in ids]
    done = client.post(
        f"{_API}/printed",
        json={"labels": labels, "source": source},
        headers=headers,
    )
    assert done.status_code == 200, done.text
    recorded: int = done.json()["recorded"]
    return recorded


def _settle(
    client: TestClient, headers: dict[str, str], how: str, *ids: int
) -> dict[str, object]:
    """Mark these items' waiting labels `applied` or `unused`."""
    done = client.post(f"{_API}/{how}", json={"item_ids": list(ids)}, headers=headers)
    assert done.status_code == 200, done.text
    body: dict[str, object] = done.json()
    return body


def _waiting(client: TestClient, headers: dict[str, str]) -> list[dict[str, object]]:
    got = client.get(f"{_API}/waiting", headers=headers)
    assert got.status_code == 200, got.text
    body: list[dict[str, object]] = got.json()
    return body


# --- sheets -----------------------------------------------------------------


def test_the_sheets_are_listed_with_their_cells(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    got = client.get(f"{_API}/sheets", headers=admin_headers)
    assert got.status_code == 200, got.text
    by_code = {s["code"]: s for s in got.json()}
    assert set(by_code) == {"SL597", "SL564"}
    coin = by_code["SL597"]
    assert coin["cells"] == 160
    assert (coin["columns"], coin["rows"], coin["rounded"]) == (10, 16, True)
    assert coin["name"] == "Coin"
    for field in ("width", "height", "top", "left", "gap_x", "gap_y"):
        assert field in coin
    assert float(coin["gap_y"]) == 0.1556
    assert by_code["SL564"]["cells"] == 102


def test_a_customer_cannot_read_labels(
    client: TestClient, customer_headers: dict[str, str], make_item: ItemFactory
) -> None:
    item = make_item()
    h = customer_headers
    assert client.get(f"{_API}/sheets", headers=h).status_code == 403
    assert client.get(f"{_API}/run?source=unlabeled", headers=h).status_code == 403
    assert client.get(f"{_API}/batch", headers=h).status_code == 403
    body = {"item_ids": [item.id]}
    assert client.post(f"{_API}/batch", json=body, headers=h).status_code == 403
    assert client.delete(f"{_API}/batch/{item.id}", headers=h).status_code == 403
    printed = {"labels": [{"item_id": item.id, "lines": ["x"]}], "source": "batch"}
    assert client.post(f"{_API}/printed", json=printed, headers=h).status_code == 403
    assert client.get(f"{_API}/sheets").status_code == 401


# --- runs -------------------------------------------------------------------


def test_the_unlabeled_run_holds_labelable_items_with_no_label(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    first = _coin(db, make_item)
    second = _coin(db, make_item)
    labeled = _coin(db, make_item)
    _label(db, labeled)
    sold = _coin(db, make_item)
    _sold(db, sold)
    slab = _coin(db, make_item, grading_service_id=code_id(db, GradingService, "PCGS"))

    body = _run(client, admin_headers, "unlabeled")
    runs = body["runs"]
    assert isinstance(runs, list)
    assert [r["sheet"] for r in runs] == ["SL597"]
    codes = _codes(runs[0])
    assert codes == sorted(codes)
    assert first.item_code in codes and second.item_code in codes
    for absent in (labeled, sold, slab):
        assert absent.item_code not in codes
    label = next(lb for lb in runs[0]["labels"] if lb["item_id"] == first.id)
    assert label["lines"] == [printed_number(first.item_code), "1921-S", "Silver"]
    assert body["skipped"] == []


def test_a_run_of_an_unknown_source_is_refused(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    got = client.get(f"{_API}/run", params={"source": "all"}, headers=admin_headers)
    assert got.status_code == 422


def test_the_stale_run_catches_a_change_no_save_saw(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """A vocabulary rename changes a label without saving the item.

    Simulated by a stored text that no longer matches while the flag still
    says fresh. The run's refresh marks it without moving the item's
    version or its last-changed time: it is bookkeeping, not an edit, and a
    form open on the item must not conflict over it.
    """
    changed = _coin(db, make_item)
    _label(db, changed, "000000\n1921-D\nSilver")
    current = _coin(db, make_item)
    _label(db, current)
    before = _fresh(db, changed.id)
    version, updated_at = before.version, before.updated_at
    assert before.label_stale is False

    body = _run(client, admin_headers, "stale")
    runs = body["runs"]
    assert isinstance(runs, list)
    codes = [code for run in runs for code in _codes(run)]
    assert changed.item_code in codes
    assert current.item_code not in codes

    after = _fresh(db, changed.id)
    assert after.label_stale is True
    assert (after.version, after.updated_at) == (version, updated_at)


def test_a_mixed_batch_prints_as_two_runs(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    coin = _coin(db, make_item)
    note = _note(db, make_item)
    _add(client, admin_headers, note.id, coin.id)

    body = _run(client, admin_headers, "batch")
    runs = body["runs"]
    assert isinstance(runs, list)
    assert [(r["sheet"], _codes(r)) for r in runs] == [
        ("SL597", [coin.item_code]),
        ("SL564", [note.item_code]),
    ]
    assert body["skipped"] == []


def test_an_item_sold_after_joining_the_batch_is_skipped(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    kept = _coin(db, make_item)
    gone = _coin(db, make_item)
    _add(client, admin_headers, kept.id, gone.id)
    _sold(db, gone)

    body = _run(client, admin_headers, "batch")
    runs = body["runs"]
    assert isinstance(runs, list)
    assert [_codes(r) for r in runs] == [[kept.item_code]]
    assert body["skipped"] == [gone.item_code]
    # It stays in the batch for the owner to remove.
    assert _fresh(db, gone.id).in_label_batch is True


def test_a_batch_of_only_skipped_items_still_names_them(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    gone = _coin(db, make_item)
    _add(client, admin_headers, gone.id)
    _sold(db, gone)
    body = _run(client, admin_headers, "batch")
    assert body == {"runs": [], "skipped": [gone.item_code]}


# --- the batch --------------------------------------------------------------


def test_the_batch_is_listed_and_an_item_removed(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    coin = _coin(db, make_item)
    note = _note(db, make_item)
    _add(client, admin_headers, note.id, coin.id)
    _add(client, admin_headers, coin.id)  # already there: fine

    listed = client.get(f"{_API}/batch", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    assert [lb["item_code"] for lb in listed.json()] == sorted(
        [coin.item_code, note.item_code]
    )
    entry = next(lb for lb in listed.json() if lb["item_id"] == coin.id)
    assert entry["lines"] == label_lines(db, coin)

    removed = client.delete(f"{_API}/batch/{coin.id}", headers=admin_headers)
    assert removed.status_code == 204
    again = client.delete(f"{_API}/batch/{coin.id}", headers=admin_headers)
    assert again.status_code == 204
    left = client.get(f"{_API}/batch", headers=admin_headers).json()
    assert [lb["item_id"] for lb in left] == [note.id]
    assert client.delete(f"{_API}/batch/0", headers=admin_headers).status_code == 404


def test_only_labelable_items_join_the_batch(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    good = _coin(db, make_item)
    sold = _coin(db, make_item)
    _sold(db, sold)
    bullion = make_item(kind="bullion")

    refused = client.post(
        f"{_API}/batch",
        json={"item_ids": [good.id, sold.id, bullion.id]},
        headers=admin_headers,
    )
    assert refused.status_code == 422, refused.text
    detail = refused.json()["detail"]
    assert sold.item_code in detail and bullion.item_code in detail
    assert good.item_code not in detail
    assert _fresh(db, good.id).in_label_batch is False

    unknown = client.post(
        f"{_API}/batch", json={"item_ids": [good.id, 0]}, headers=admin_headers
    )
    assert unknown.status_code == 422, unknown.text
    assert _fresh(db, good.id).in_label_batch is False


# --- recording a printed sheet ----------------------------------------------


def test_printing_the_unlabeled_run_leaves_the_batch_alone(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    item = _coin(db, make_item)
    _add(client, admin_headers, item.id)
    assert _printed(db, client, admin_headers, "unlabeled", item.id) == 1

    after = _fresh(db, item.id)
    assert after.in_label_batch is True
    assert after.label_waiting_at is not None
    assert after.label_waiting_text == label_text(label_lines(db, after))


def test_printing_the_batch_empties_it_but_not_of_skipped_items(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    kept = _coin(db, make_item)
    gone = _coin(db, make_item)
    _add(client, admin_headers, kept.id, gone.id)
    _sold(db, gone)

    assert _printed(db, client, admin_headers, "batch", kept.id, gone.id) == 1
    assert _fresh(db, kept.id).in_label_batch is False
    after_gone = _fresh(db, gone.id)
    assert after_gone.in_label_batch is True
    assert after_gone.label_waiting_at is None


def test_printed_twice_records_once(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    item = _coin(db, make_item)
    other = _coin(db, make_item)
    _sold(db, other)
    _add(client, admin_headers, item.id)

    assert _printed(db, client, admin_headers, "batch", item.id, other.id) == 1
    first = _fresh(db, item.id)
    stamped: datetime | None = first.label_waiting_at
    text = first.label_waiting_text
    assert stamped is not None and text
    assert first.in_label_batch is False

    assert _printed(db, client, admin_headers, "batch", item.id, other.id) == 1
    second = _fresh(db, item.id)
    assert (second.label_waiting_at, second.label_waiting_text) == (stamped, text)
    assert second.in_label_batch is False
    assert _fresh(db, other.id).label_waiting_at is None


def test_a_reprint_keeps_the_old_label_until_applied(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """The holder carries its old label until the new one is on it."""
    item = _coin(db, make_item)
    _label(db, item, "old text")
    item.label_stale = True
    db.commit()
    old = _fresh(db, item.id).label_applied_at
    assert old is not None

    assert _printed(db, client, admin_headers, "stale", item.id) == 1
    printed = _fresh(db, item.id)
    assert (printed.label_applied_at, printed.label_text) == (old, "old text")
    assert printed.label_stale is True
    assert printed.label_waiting_text == label_text(label_lines(db, printed))
    stale = _run(client, admin_headers, "stale")["runs"]
    assert isinstance(stale, list)
    assert item.item_code not in [code for run in stale for code in _codes(run)]

    assert _settle(client, admin_headers, "applied", item.id) == {
        "done": 1,
        "not_waiting": [],
    }
    after = _fresh(db, item.id)
    assert after.label_text == label_text(label_lines(db, after))
    assert after.label_stale is False
    assert after.label_applied_at is not None and after.label_applied_at > old
    assert (after.label_waiting_at, after.label_waiting_text) == (None, None)


def test_the_text_recorded_is_the_text_that_printed(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """An edit between printing and Yes leaves the label needing a new one.

    The sheet carries what the run returned, so that is what is recorded;
    the item now reads differently, so once applied it is stale at once.
    """
    item = _coin(db, make_item)
    run = _run(client, admin_headers, "unlabeled")
    runs = run["runs"]
    assert isinstance(runs, list)
    printed = next(
        lb["lines"] for r in runs for lb in r["labels"] if lb["item_id"] == item.id
    )
    detail = db.scalars(
        select(CoinDetail).where(CoinDetail.inventory_item_id == item.id)
    ).one()
    detail.mint_id = code_id(db, Mint, "D")
    db.commit()

    done = client.post(
        f"{_API}/printed",
        json={
            "source": "unlabeled",
            "labels": [{"item_id": item.id, "lines": printed}],
        },
        headers=admin_headers,
    )
    assert done.status_code == 200, done.text
    assert done.json() == {"recorded": 1}
    waiting = _fresh(db, item.id)
    assert waiting.label_waiting_text == label_text(printed)
    assert waiting.label_applied_at is None and waiting.label_stale is False

    _settle(client, admin_headers, "applied", item.id)
    after = _fresh(db, item.id)
    assert after.label_text == label_text(printed)
    assert after.label_stale is True
    assert after.label_applied_at is not None


@pytest.mark.parametrize("autoflush", [True, False])
def test_an_error_added_to_a_labeled_note_marks_its_label_stale(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
    autoflush: bool,
) -> None:
    """The errors are saved apart from the item, and still change its label.

    Run both ways: production's session does not autoflush.
    """
    note = _note(db, make_item)
    _label(db, note)
    note_error = db.scalars(
        select(ErrorType.code)
        .where(ErrorType.applies_to == AppliesTo.currency, ErrorType.is_active)
        .order_by(ErrorType.id)
    ).first()
    assert note_error is not None

    db.autoflush = autoflush
    try:
        saved = client.put(
            f"/api/inventory/{note.id}/errors",
            json={"errors": [{"error_type": note_error}]},
            headers=admin_headers,
        )
    finally:
        db.autoflush = True
    assert saved.status_code == 200, saved.text

    assert _fresh(db, note.id).label_stale is True


@pytest.mark.parametrize(
    "lines", [["x"] * 9, ["x" * 501]], ids=["too many lines", "too long a line"]
)
def test_a_printed_label_larger_than_any_label_is_refused(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
    lines: list[str],
) -> None:
    """No label holds more than eight lines of a few hundred characters."""
    item = _coin(db, make_item)
    done = client.post(
        f"{_API}/printed",
        json={"source": "unlabeled", "labels": [{"item_id": item.id, "lines": lines}]},
        headers=admin_headers,
    )
    assert done.status_code == 422, done.text
    assert _fresh(db, item.id).label_waiting_at is None


def test_printed_without_its_source_is_refused(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    item = _coin(db, make_item)
    done = client.post(
        f"{_API}/printed",
        json={"labels": [{"item_id": item.id, "lines": ["x"]}]},
        headers=admin_headers,
    )
    assert done.status_code == 422
    assert _fresh(db, item.id).label_waiting_at is None


def test_label_bookkeeping_does_not_move_the_item_version(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """Batch, printed, applied and not used are not edits of the item.

    A form open on the item while the owner prints must save without a
    conflict, so none of these moves its version or its last-changed time.
    """
    item = _coin(db, make_item)
    before = _fresh(db, item.id)
    mark = (before.version, before.updated_at)

    _add(client, admin_headers, item.id)
    assert (_fresh(db, item.id).version, _fresh(db, item.id).updated_at) == mark
    client.delete(f"{_API}/batch/{item.id}", headers=admin_headers)
    _add(client, admin_headers, item.id)
    _printed(db, client, admin_headers, "batch", item.id)
    assert _fresh(db, item.id).label_waiting_at is not None
    _settle(client, admin_headers, "unused", item.id)
    _printed(db, client, admin_headers, "unlabeled", item.id)
    _settle(client, admin_headers, "applied", item.id)
    after = _fresh(db, item.id)
    assert after.label_applied_at is not None
    assert (after.version, after.updated_at) == mark


# --- applying ---------------------------------------------------------------


def test_yes_leaves_labels_waiting_not_labeled(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """A printed label is on the sheet: printed, not applied, and not reprinted."""
    item = _coin(db, make_item)
    _printed(db, client, admin_headers, "unlabeled", item.id)

    after = _fresh(db, item.id)
    assert after.label_applied_at is None and after.label_text is None
    unlabeled = _run(client, admin_headers, "unlabeled")["runs"]
    assert isinstance(unlabeled, list)
    assert item.item_code not in [code for run in unlabeled for code in _codes(run)]
    found = client.get(
        "/api/inventory/coins/search",
        params={"label": "printed"},
        headers=admin_headers,
    )
    assert found.status_code == 200, found.text
    assert [row["id"] for row in found.json()["rows"]] == [item.id]


def test_waiting_runs_are_grouped_newest_first(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """One run per Yes and sheet, the lines as printed, newest Yes first."""
    early = _coin(db, make_item)
    _printed(db, client, admin_headers, "unlabeled", early.id)
    coin, note = _coin(db, make_item), _note(db, make_item)
    _printed(db, client, admin_headers, "unlabeled", coin.id, note.id)

    runs = _waiting(client, admin_headers)
    assert [(r["sheet"], _codes(r)) for r in runs] == [
        ("SL597", [coin.item_code]),
        ("SL564", [note.item_code]),
        ("SL597", [early.item_code]),
    ]
    assert runs[0]["printed_at"] == runs[1]["printed_at"]
    assert str(runs[0]["printed_at"]) > str(runs[2]["printed_at"])
    first = runs[2]["labels"]
    assert isinstance(first, list)
    assert first[0]["lines"] == [printed_number(early.item_code), "1921-S", "Silver"]


def test_applied_moves_the_waiting_label_onto_the_holder(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    item = _coin(db, make_item)
    _printed(db, client, admin_headers, "unlabeled", item.id)
    printed = _fresh(db, item.id).label_waiting_text

    assert _settle(client, admin_headers, "applied", item.id) == {
        "done": 1,
        "not_waiting": [],
    }
    after = _fresh(db, item.id)
    assert after.label_applied_at is not None
    assert (after.label_text, after.label_stale) == (printed, False)
    assert (after.label_waiting_at, after.label_waiting_text) == (None, None)
    assert _waiting(client, admin_headers) == []


def test_applied_names_items_not_waiting(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """A mix is settled for the waiting ones; the others are named, untouched."""
    waiting, never = _coin(db, make_item), _coin(db, make_item)
    _printed(db, client, admin_headers, "unlabeled", waiting.id)

    assert _settle(client, admin_headers, "applied", waiting.id, never.id) == {
        "done": 1,
        "not_waiting": [never.item_code],
    }
    assert _fresh(db, never.id).label_applied_at is None


def test_settling_an_unknown_item_is_refused(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    item = _coin(db, make_item)
    _printed(db, client, admin_headers, "unlabeled", item.id)
    done = client.post(
        f"{_API}/applied", json={"item_ids": [item.id, 999999]}, headers=admin_headers
    )
    assert done.status_code == 422
    assert "999999" in done.json()["detail"]
    assert _fresh(db, item.id).label_applied_at is None


def test_unused_returns_the_item_to_what_its_holder_carries(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """A spoiled label is forgotten: the next run prints the item again."""
    fresh = _coin(db, make_item)
    relabeled = _coin(db, make_item)
    _label(db, relabeled, "old text")
    relabeled.label_stale = True
    db.commit()
    _printed(db, client, admin_headers, "unlabeled", fresh.id)
    _printed(db, client, admin_headers, "stale", relabeled.id)

    assert _settle(client, admin_headers, "unused", fresh.id, relabeled.id) == {
        "done": 2,
        "not_waiting": [],
    }
    assert _fresh(db, fresh.id).label_waiting_at is None
    kept = _fresh(db, relabeled.id)
    assert (kept.label_text, kept.label_stale) == ("old text", True)
    assert kept.label_waiting_at is None
    unlabeled = _run(client, admin_headers, "unlabeled")["runs"]
    stale = _run(client, admin_headers, "stale")["runs"]
    assert isinstance(unlabeled, list) and isinstance(stale, list)
    assert fresh.item_code in [code for run in unlabeled for code in _codes(run)]
    assert relabeled.item_code in [code for run in stale for code in _codes(run)]


# --- cost of a run ----------------------------------------------------------


def _statements(db: Session, client: TestClient, headers: dict[str, str]) -> int:
    """How many statements the unlabeled run sends."""
    counted: list[str] = []

    def count(_conn: Connection, _cur: object, statement: str, *_rest: object) -> None:
        counted.append(statement)

    db.expire_all()
    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", count)
    try:
        _run(client, headers, "unlabeled")
    finally:
        event.remove(engine, "before_cursor_execute", count)
    return len(counted)


def test_a_run_reads_its_items_together(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    """A run's statements do not grow with its notes, coins and sets.

    A whole collection is thousands of items; a statement or two per item
    each would be tens of thousands of round trips.
    """
    for _ in range(3):
        _note(db, make_item)
        _coin(db, make_item)
    small = _statements(db, client, admin_headers)
    for _ in range(15):
        _note(db, make_item)
        _coin(db, make_item)
    large = _statements(db, client, admin_headers)
    assert large - small <= 2, (small, large)
    assert small <= 25, small
