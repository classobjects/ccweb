# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Canceled, in US spelling, where it is stored.

An auction's status `cancelled` and a sales order's status code `cancelled`
become `canceled`, as an item's status already is. The sales-order status's
label follows its code unless someone renamed it. Every row holding either
value keeps its meaning: the enum value is renamed in place, and the status
row's id is unchanged, so no order points anywhere new.

Revision ID: d8e2a4c6f1b3
Revises: c3a7e1f9d2b4
Create Date: 2026-11-12 12:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "d8e2a4c6f1b3"
down_revision: str | None = "c3a7e1f9d2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rename both values to `canceled`."""
    op.execute("ALTER TYPE auction_status RENAME VALUE 'cancelled' TO 'canceled'")
    op.execute(
        "UPDATE sales_order_status SET code = 'canceled' WHERE code = 'cancelled'"
    )
    op.execute(
        "UPDATE sales_order_status SET label = 'Canceled' "
        "WHERE code = 'canceled' AND label = 'Cancelled'"
    )


def downgrade() -> None:
    """Back to `cancelled`."""
    op.execute(
        "UPDATE sales_order_status SET label = 'Cancelled' "
        "WHERE code = 'canceled' AND label = 'Canceled'"
    )
    op.execute(
        "UPDATE sales_order_status SET code = 'cancelled' WHERE code = 'canceled'"
    )
    op.execute("ALTER TYPE auction_status RENAME VALUE 'canceled' TO 'cancelled'")
