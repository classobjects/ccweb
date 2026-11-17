# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Notes: the Coolness index takes two decimal places.

`currency_detail.coolness_index` goes from `NUMERIC(4,1)` to `NUMERIC(5,2)`:
still 0 to 100, now to a hundredth. Widening keeps every value as it was.

Revision ID: c3e8f1a5d7b9
Revises: b7e1d4a9c3f2
Create Date: 2026-11-16 22:40:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3e8f1a5d7b9"
down_revision: str | None = "b7e1d4a9c3f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Widen the column to two decimal places."""
    op.alter_column(
        "currency_detail",
        "coolness_index",
        type_=sa.Numeric(5, 2),
        existing_type=sa.Numeric(4, 1),
        existing_nullable=True,
    )


def downgrade() -> None:
    """Back to one decimal place: a second one is rounded away."""
    op.alter_column(
        "currency_detail",
        "coolness_index",
        type_=sa.Numeric(4, 1),
        existing_type=sa.Numeric(5, 2),
        existing_nullable=True,
        postgresql_using="round(coolness_index, 1)",
    )
