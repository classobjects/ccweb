"""DEFAULT_ITEM_KIND: the kind a purchase's new item starts as, checked at start-up."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from app import default_kind_check
from app.config import Settings, settings
from app.database import get_db
from app.main import app
from app.models import ItemKind
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from tests.builders import build_purchase_order


def test_a_coin_unless_set() -> None:
    assert Settings.model_fields["default_item_kind"].default == "coin"


def test_an_active_kind_passes(db: Session) -> None:
    default_kind_check.check_default_kind(db, "currency")


def test_an_unknown_kind_is_refused_naming_the_kinds_there_are(db: Session) -> None:
    with pytest.raises(default_kind_check.UnknownDefaultKind) as refused:
        default_kind_check.check_default_kind(db, "banknote")
    message = str(refused.value)
    assert "'banknote'" in message
    assert "coin" in message and "currency" in message


def test_a_retired_kind_is_refused(db: Session) -> None:
    medal = db.scalars(select(ItemKind).where(ItemKind.code == "medal")).one()
    medal.is_active = False
    db.flush()
    with pytest.raises(default_kind_check.UnknownDefaultKind):
        default_kind_check.check_default_kind(db, "medal")


def test_an_unreachable_database_logs_and_lets_the_api_start(
    caplog: pytest.LogCaptureFixture,
) -> None:
    def unreachable() -> Iterator[Session]:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))
        yield  # pragma: no cover -- makes this a generator, as `get_db` is

    default_kind_check.check_at_startup(unreachable)
    assert "starting item kind not checked" in caplog.text


def test_the_api_refuses_to_start_with_an_unknown_kind(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Wired into the app's start-up, through `get_db` as requests are."""
    monkeypatch.setattr(settings, "default_item_kind", "banknote")
    app.dependency_overrides[get_db] = lambda: db
    try:
        with (
            pytest.raises(
                default_kind_check.UnknownDefaultKind, match="DEFAULT_ITEM_KIND is"
            ),
            TestClient(app),
        ):
            pass  # pragma: no cover -- start-up refuses first
    finally:
        app.dependency_overrides.clear()


def test_a_purchase_names_the_kind_its_new_item_starts_as(
    client: TestClient,
    admin_headers: dict[str, str],
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "default_item_kind", "currency")
    order = build_purchase_order(db, vendor_name="hibid.com")
    db.commit()

    res = client.get(f"/api/purchase-orders/{order.id}", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert res.json()["default_item_kind"] == "currency"


def test_the_console_is_told_the_kind_its_front_page_opens_on(
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "default_item_kind", "currency")
    res = client.get("/api/defaults/item-kind", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert res.json() == {"item_kind": "currency"}


def test_only_staff_are_told_the_kind(client: TestClient) -> None:
    assert client.get("/api/defaults/item-kind").status_code == 401
