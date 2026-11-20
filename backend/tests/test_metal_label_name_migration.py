# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""The migration that gives long-named metals a short name for coin labels.

Built on a throwaway database taken to the revision before it, given the
metals, then upgraded -- the path the live database takes.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic.command import upgrade
from alembic.config import Config
from sqlalchemy import create_engine, text

from tests.conftest import TEST_URL, drop_database

BACKEND_DIR = Path(__file__).resolve().parents[1]
BEFORE = "c3e8f1a5d7b9"
AFTER = "d5a8c2e6f1b3"


def _to(url: str, revision: str) -> None:
    """Migrate the database at `url`, and no other, up to the revision."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    upgrade(config, revision)


@pytest.fixture
def before_url() -> Iterator[str]:
    """A database migrated up to the revision before the label name."""
    name = f"{TEST_URL.database}_metal_label_name"
    admin = create_engine(
        TEST_URL.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    with admin.connect() as conn:
        drop_database(conn, name)
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    url = TEST_URL.set(database=name).render_as_string(hide_password=False)
    try:
        _to(url, BEFORE)
        yield url
    finally:
        with admin.connect() as conn:
            drop_database(conn, name)
        admin.dispose()


def test_each_long_named_metal_takes_its_label_name_and_no_other(
    before_url: str,
) -> None:
    engine = create_engine(before_url)
    codes = [
        "clad",
        "manganese_brass",
        "24k_gold_plated_clad",
        "gold_plated_silver",
        "silver_copper_clad",
        "silver",
        "pewter",
    ]
    with engine.begin() as conn:
        for order, code in enumerate(codes):
            conn.execute(
                text(
                    "insert into metal (code, label, sort_order, is_active, source,"
                    " symbol, is_precious) values (:c, :c, :o, true, 'manual', '',"
                    " false) on conflict (code) do nothing"
                ),
                {"c": code, "o": order},
            )
    engine.dispose()

    _to(before_url, AFTER)

    engine = create_engine(before_url)
    with engine.connect() as conn:
        names = dict(
            conn.execute(text("select code, label_name from metal")).tuples().all()
        )
    engine.dispose()
    assert names["clad"] == "Clad"
    assert names["manganese_brass"] == "Clad"
    assert names["24k_gold_plated_clad"] == "24K Plate"
    assert names["gold_plated_silver"] == "Au/Ag"
    assert names["silver_copper_clad"] == "40% Silver"
    assert names["silver"] == ""
    assert names["pewter"] == ""
