# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Holder labels: what a note records for them.

A note records its Coolness index (a percentage, 0 to 100, one decimal place)
and the size of its star run (a whole number above 0), each typed by the
owner and each optional.

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
    """Add the two columns and their checks."""
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


def downgrade() -> None:
    """Drop the checks and the two columns."""
    op.drop_constraint("ck_currency_detail_star_run_size", "currency_detail")
    op.drop_constraint("ck_currency_detail_coolness_index", "currency_detail")
    op.drop_column("currency_detail", "star_run_size")
    op.drop_column("currency_detail", "coolness_index")
