# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Items: a printed label waits to be applied before it counts.

A label answered *Yes* is on a sheet, not on the holder. The holder's label
keeps its columns -- `label_printed_at` becomes `label_applied_at`, beside
`label_text` and `label_stale` -- and a printed label not yet applied is
held in `label_waiting_at` and `label_waiting_text`.

Every label recorded before was only printed, so it moves to waiting: no
holder is counted as labeled until its label is confirmed applied.

Revision ID: b7e1d4a9c3f2
Revises: a4d7c2e9b1f6
Create Date: 2026-11-14 13:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7e1d4a9c3f2"
down_revision: str | None = "a4d7c2e9b1f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rename the printed time, add the waiting pair, move prints to waiting."""
    op.alter_column(
        "inventory_item", "label_printed_at", new_column_name="label_applied_at"
    )
    op.add_column(
        "inventory_item",
        sa.Column("label_waiting_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "inventory_item", sa.Column("label_waiting_text", sa.Text(), nullable=True)
    )
    # `updated_at` kept: this is bookkeeping, not an edit of the items.
    op.execute(
        "UPDATE inventory_item SET label_waiting_at = label_applied_at, "
        "label_waiting_text = label_text, label_applied_at = NULL, "
        "label_text = NULL, label_stale = false, updated_at = updated_at "
        "WHERE label_applied_at IS NOT NULL"
    )


def downgrade() -> None:
    """Waiting labels back to printed where none was applied; drop the pair."""
    op.execute(
        "UPDATE inventory_item SET label_applied_at = label_waiting_at, "
        "label_text = label_waiting_text, label_stale = false, "
        "updated_at = updated_at "
        "WHERE label_waiting_at IS NOT NULL AND label_applied_at IS NULL"
    )
    op.drop_column("inventory_item", "label_waiting_text")
    op.drop_column("inventory_item", "label_waiting_at")
    op.alter_column(
        "inventory_item", "label_applied_at", new_column_name="label_printed_at"
    )
