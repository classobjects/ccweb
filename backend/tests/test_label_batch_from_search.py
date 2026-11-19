# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Choosing what to label with the inventory's own search.

The Coins and Currency screens' filters -- an item-number range among them --
pick the items, and `POST /api/inventory/{view}/label-batch` adds every
labelable match, on every page, to the label print batch.
"""

from __future__ import annotations

import pytest
from app.labels import printed_number
from app.models import CoinDetail, CurrencyDetail, InventoryItem, Metal, Mint, NoteType
from app.models.reference import Disposition
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.builders import ItemFactory, code_id


def _coin(db: Session, make_item: ItemFactory, **kw: object) -> InventoryItem:
    item = make_item(year_start=1921, metal_id=code_id(db, Metal, "silver"), **kw)
    db.add(CoinDetail(inventory_item_id=item.id, mint_id=code_id(db, Mint, "S")))
    db.commit()
    db.refresh(item)
    return item


def _note(db: Session, make_item: ItemFactory) -> InventoryItem:
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


def _codes(
    client: TestClient, headers: dict[str, str], view: str, **params: object
) -> list[str]:
    got = client.get(
        f"/api/inventory/{view}/search",
        params={"limit": 200, **params},
        headers=headers,
    )
    assert got.status_code == 200, got.text
    return [str(row["item_code"]) for row in got.json()["rows"]]


def _in_batch(db: Session, *items: InventoryItem) -> list[bool]:
    db.expire_all()
    return [db.get_one(InventoryItem, i.id).in_label_batch for i in items]


def test_the_search_takes_an_item_number_range(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    before, first, middle, last, after = (_coin(db, make_item) for _ in range(5))
    codes = _codes(
        client,
        admin_headers,
        "coins",
        # As the label prints a number, and with the prefix in any case.
        item_from=printed_number(first.item_code),
        item_to=last.item_code.lower(),
    )
    assert codes == [first.item_code, middle.item_code, last.item_code]
    # Either end alone is open on the other side.
    assert before.item_code not in _codes(
        client, admin_headers, "coins", item_from=first.item_code
    )
    assert after.item_code in _codes(
        client, admin_headers, "coins", item_from=first.item_code
    )
    assert after.item_code not in _codes(
        client, admin_headers, "coins", item_to=last.item_code
    )


def test_an_item_number_range_end_that_is_no_number_is_refused(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    got = client.get(
        "/api/inventory/coins/search",
        params={"item_from": "abc"},
        headers=admin_headers,
    )
    assert got.status_code == 422
    assert "item number" in got.text


def test_every_labelable_match_joins_the_batch_on_every_page(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    first = _coin(db, make_item)
    second = _coin(db, make_item)
    sold = _coin(db, make_item)
    sold.disposition_id = code_id(db, Disposition, "sold")
    db.commit()
    note = _note(db, make_item)
    outside = _coin(db, make_item)
    params = {"item_from": first.item_code, "item_to": note.item_code, "limit": 1}

    got = client.post(
        "/api/inventory/coins/label-batch", params=params, headers=admin_headers
    )
    assert got.status_code == 200, got.text
    # Every match, though a page would show one; the note is not a coin,
    # `outside` is past the range, and a sold coin takes no label.
    assert got.json() == {"matched": 3, "added": 2, "already": 0, "not_labelable": 1}
    assert _in_batch(db, first, second, sold, note, outside) == [
        True,
        True,
        False,
        False,
        False,
    ]

    again = client.post(
        "/api/inventory/coins/label-batch", params=params, headers=admin_headers
    )
    assert again.json() == {"matched": 3, "added": 0, "already": 2, "not_labelable": 1}


def test_the_currency_screen_adds_its_notes(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    coin = _coin(db, make_item)
    note = _note(db, make_item)
    got = client.post(
        "/api/inventory/currency/label-batch",
        params={"item_from": coin.item_code},
        headers=admin_headers,
    )
    assert got.status_code == 200, got.text
    assert got.json()["added"] == 1
    assert _in_batch(db, coin, note) == [False, True]


@pytest.mark.parametrize(
    ("view", "params", "status"),
    [
        ("coins", {"no_such_filter": "x"}, 422),
        ("coins", {"item_to": "x"}, 422),
        ("nope", {}, 404),
    ],
)
def test_a_bad_selection_adds_nothing(
    db: Session,
    make_item: ItemFactory,
    client: TestClient,
    admin_headers: dict[str, str],
    view: str,
    params: dict[str, str],
    status: int,
) -> None:
    coin = _coin(db, make_item)
    got = client.post(
        f"/api/inventory/{view}/label-batch", params=params, headers=admin_headers
    )
    assert got.status_code == status
    assert _in_batch(db, coin) == [False]


def test_a_customer_cannot_add_to_the_batch(
    client: TestClient, customer_headers: dict[str, str]
) -> None:
    got = client.post("/api/inventory/coins/label-batch", headers=customer_headers)
    assert got.status_code == 403
