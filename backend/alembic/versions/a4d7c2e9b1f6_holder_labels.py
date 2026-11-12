# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Holder labels: what a note records for them, and what an item remembers.

A note records its Coolness index (a percentage, 0 to 100, one decimal place)
and the size of its star run (a whole number above 0), each typed by the
owner and each optional.

An item remembers when its label was last printed and the text it carried,
whether it has changed since (`label_stale`), and whether it waits in the
batch of labels to print next. The batch has a partial index, because it is
read on every visit to the labels page and holds a handful of rows among
thousands.

Revision ID: a4d7c2e9b1f6
Revises: d8e2a4c6f1b3
Create Date: 2026-11-12 13:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a4d7c2e9b1f6"
down_revision: str | None = "d8e2a4c6f1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the note columns and their checks, and the item's label columns."""
    op.add_column(
        "currency_detail",
        sa.Column("coolness_index", sa.Numeric(4, 1), nullable=True),
    )
    op.add_column(
        "currency_detail",
        sa.Column("star_run_size", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_currency_detail_coolness_index",
        "currency_detail",
        "coolness_index IS NULL OR coolness_index BETWEEN 0 AND 100",
    )
    op.create_check_constraint(
        "ck_currency_detail_star_run_size",
        "currency_detail",
        "star_run_size IS NULL OR star_run_size > 0",
    )
    op.add_column(
        "inventory_item",
        sa.Column("label_printed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("inventory_item", sa.Column("label_text", sa.Text(), nullable=True))
    op.add_column(
        "inventory_item",
        sa.Column(
            "label_stale", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.add_column(
        "inventory_item",
        sa.Column(
            "in_label_batch",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_inventory_item_in_label_batch",
        "inventory_item",
        ["id"],
        postgresql_where=sa.text("in_label_batch"),
    )


def downgrade() -> None:
    """Drop the item's label columns, then the note checks and columns."""
    op.drop_index(
        "ix_inventory_item_in_label_batch",
        table_name="inventory_item",
        postgresql_where=sa.text("in_label_batch"),
    )
    op.drop_column("inventory_item", "in_label_batch")
    op.drop_column("inventory_item", "label_stale")
    op.drop_column("inventory_item", "label_text")
    op.drop_column("inventory_item", "label_printed_at")
    op.drop_constraint("ck_currency_detail_star_run_size", "currency_detail")
    op.drop_constraint("ck_currency_detail_coolness_index", "currency_detail")
    op.drop_column("currency_detail", "star_run_size")
    op.drop_column("currency_detail", "coolness_index")
