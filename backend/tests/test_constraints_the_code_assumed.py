# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Rules the application relied on, now held by the database itself.

An address is one account whatever its case; a certificate number appears
once per item; a design series is a coin's or a note's. Each is refused by
the database, not only by the code in front of it -- and the migration that
adds them stops, naming the rows, rather than change data that breaks one.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic.command import downgrade, upgrade
from alembic.config import Config
from app.models import (
    Base,
    CurrencyDetail,
    Grade,
    ItemCertification,
    ItemKind,
    ReferenceMixin,
    Series,
    SignatureCombination,
    User,
)
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tests.builders import build_bare_item, code_id
from tests.conftest import TEST_URL, drop_database

BACKEND_DIR = Path(__file__).resolve().parents[1]
BEFORE = "a3d6f8b2c4e7"


def _refused(db: Session, row: object) -> None:
    """Assert the database refuses `row`, leaving the session usable."""
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(row)
        db.flush()


def test_a_second_spelling_of_an_address_is_refused_by_the_database(
    db: Session,
) -> None:
    db.add(User(email="carol@example.com", hashed_password="x"))
    db.flush()

    _refused(db, User(email="Carol@Example.COM", hashed_password="y"))


def test_one_certificate_number_is_held_once_per_item(db: Session) -> None:
    item = build_bare_item(db)
    other = build_bare_item(db)
    db.add(ItemCertification(inventory_item_id=item.id, cert_number="12345678"))
    # The same number on another item is another holder's business.
    db.add(ItemCertification(inventory_item_id=other.id, cert_number="12345678"))
    db.flush()

    _refused(db, ItemCertification(inventory_item_id=item.id, cert_number="12345678"))


def test_a_series_applies_to_coin_or_currency_and_nothing_else(db: Session) -> None:
    db.add(Series(code="test_note_design", label="Note design", applies_to="currency"))
    db.flush()

    _refused(db, Series(code="test_any_design", label="Any", applies_to="any"))


def test_every_classifier_keeps_its_unique_code() -> None:
    """A table adding its own constraints adds them to the code's, never in place."""
    tables = [
        Base.metadata.tables[mapper.class_.__tablename__]
        for mapper in Base.registry.mappers
        if issubclass(mapper.class_, ReferenceMixin)
    ]
    assert len(tables) > 30
    missing = sorted(
        table.name
        for table in tables
        if f"uq_{table.name}_code" not in {c.name for c in table.constraints}
    )
    assert missing == []


def test_the_currency_inventory_names_both_signers_and_composes_the_grade(
    db: Session,
) -> None:
    pair = SignatureCombination(
        code="test_register_pair", label="Speelman / White", treasurer="White"
    )
    pair.register = "Speelman"
    db.add(pair)
    db.flush()
    item = build_bare_item(
        db,
        item_kind_id=code_id(db, ItemKind, "currency"),
        grade_id=code_id(db, Grade, "N64"),
    )
    db.add(CurrencyDetail(inventory_item_id=item.id, signature_combination_id=pair.id))
    db.flush()

    row = (
        db.execute(
            text(
                "SELECT treasurer, secretary, register, grade "
                "FROM currency_inventory WHERE id = :id"
            ),
            {"id": item.id},
        )
        .mappings()
        .one()
    )
    assert dict(row) == {
        "treasurer": "White",
        "secretary": None,
        "register": "Speelman",
        "grade": "Choice Uncirculated 64",
    }


# ---------------------------------------------------------------------------
# The migration
# ---------------------------------------------------------------------------


def _config(url: str) -> Config:
    """Alembic's configuration, aimed at the database at `url` and no other."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture
def before_url() -> Iterator[str]:
    """A throwaway database migrated up to the revision before these rules."""
    name = f"{TEST_URL.database}_assumed"
    admin = create_engine(
        TEST_URL.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    with admin.connect() as conn:
        drop_database(conn, name)
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    url = TEST_URL.set(database=name).render_as_string(hide_password=False)
    try:
        upgrade(_config(url), BEFORE)
        yield url
    finally:
        with admin.connect() as conn:
            drop_database(conn, name)
        admin.dispose()


_CLASSIFIERS = (
    "item_kind",
    "storage_form",
    "authenticity",
    "item_status",
    "disposition",
    "valuation_basis",
)


def _record_rows_that_break_each_rule(url: str) -> None:
    """Two spellings of one address, a repeated certificate, an `any` series."""
    engine = create_engine(url)
    with engine.begin() as conn:
        for email in ("dave@example.com", "Dave@Example.com", "erin@example.com"):
            conn.execute(
                text(
                    "INSERT INTO users (email, full_name, hashed_password, role, "
                    "is_active, token_version, created_at) "
                    "VALUES (:e, '', 'x', 'customer', true, 1, now())"
                ),
                {"e": email},
            )
        ids = {
            table: conn.execute(
                text(
                    f"INSERT INTO {table} (code, label, sort_order, is_active, "
                    "source) VALUES ('t', 't', 0, true, 'manual') RETURNING id"
                )
            ).scalar_one()
            for table in _CLASSIFIERS
        }
        item_id = conn.execute(
            text(
                "INSERT INTO inventory_item (item_kind_id, storage_form_id, "
                "authenticity_id, status_id, disposition_id, valuation_basis_id, "
                "item_cost, shipping_cost, tax_rate, tax_includes_shipping, "
                "source, created_at, updated_at) VALUES (:item_kind, "
                ":storage_form, :authenticity, :item_status, :disposition, "
                ":valuation_basis, 0, 0, 0, false, 'manual', now(), now()) "
                "RETURNING id"
            ),
            ids,
        ).scalar_one()
        for number in ("555", "555", "556"):
            conn.execute(
                text(
                    "INSERT INTO item_certification (inventory_item_id, "
                    "cert_number, created_at, updated_at) "
                    "VALUES (:i, :n, now(), now())"
                ),
                {"i": item_id, "n": number},
            )
        conn.execute(
            text(
                "INSERT INTO series (code, label, sort_order, is_active, source, "
                "applies_to) VALUES ('odd_design', 'Odd', 0, true, 'manual', 'any')"
            )
        )
    engine.dispose()


def _indexes(url: str, table: str) -> set[str]:
    """The names of the indexes on `table` in the database at `url`."""
    engine = create_engine(url)
    try:
        return {str(index["name"]) for index in inspect(engine).get_indexes(table)}
    finally:
        engine.dispose()


def test_the_upgrade_names_every_row_a_new_rule_refuses_and_changes_nothing(
    before_url: str,
) -> None:
    _record_rows_that_break_each_rule(before_url)

    with pytest.raises(RuntimeError) as refused:
        upgrade(_config(before_url), "head")

    message = str(refused.value)
    assert "Dave@Example.com" in message
    assert "dave@example.com" in message
    assert "erin@example.com" not in message
    assert ": 555 (rows" in message
    assert "556" not in message
    assert "odd_design (any)" in message
    # Nothing was changed: the exact-match index is still the one there.
    assert "ix_users_email" in _indexes(before_url, "users")
    assert "uq_users_email" not in _indexes(before_url, "users")


def test_the_upgrade_downgrades_and_upgrades_again(before_url: str) -> None:
    config = _config(before_url)
    upgrade(config, "head")
    assert "ix_note_issue_lookup" not in _indexes(before_url, "note_issue")

    downgrade(config, BEFORE)
    assert "ix_note_issue_lookup" in _indexes(before_url, "note_issue")
    assert "ix_users_email" in _indexes(before_url, "users")

    upgrade(config, "head")
    assert "uq_users_email" in _indexes(before_url, "users")
