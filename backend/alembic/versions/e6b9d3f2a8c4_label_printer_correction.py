# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Holder labels: the installation's printer correction.

How large the printer prints a page of labels, percent across and down (90
to 110, one decimal place), kept once for the whole installation. One row
at most (`id` is always 1); no row is 100% both ways, so the upgrade adds
none. A downgrade drops the table.

Revision ID: e6b9d3f2a8c4
Revises: d5a8c2e6f1b3
Create Date: 2026-11-21 20:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e6b9d3f2a8c4"
down_revision: str | None = "d5a8c2e6f1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the one-row table, with its range checks."""
    op.create_table(
        "label_printer_correction",
        sa.Column("id", sa.SmallInteger(), autoincrement=False, nullable=False),
        sa.Column("across", sa.Numeric(4, 1), nullable=False),
        sa.Column("down", sa.Numeric(4, 1), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_label_printer_correction_one_row"),
        sa.CheckConstraint(
            "across BETWEEN 90 AND 110", name="ck_label_printer_correction_across"
        ),
        sa.CheckConstraint(
            "down BETWEEN 90 AND 110", name="ck_label_printer_correction_down"
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Drop the printer correction."""
    op.drop_table("label_printer_correction")
