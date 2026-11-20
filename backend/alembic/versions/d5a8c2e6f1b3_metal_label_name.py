# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Metals: a short name for coin holder labels.

A coin's label is 0.625" wide, and "Copper-Nickel Clad" or "Manganese
Brass" does not fit on it even at the smallest size. `metal.label_name` is
the name the label prints instead; empty prints the metal's label.

The upgrade sets it on the metals whose label is too long, by code, where
they exist -- the plated ones were added on the live database by hand --
and touches no other row. A downgrade drops the column.

Revision ID: d5a8c2e6f1b3
Revises: c3e8f1a5d7b9
Create Date: 2026-11-19 21:10:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5a8c2e6f1b3"
down_revision: str | None = "c3e8f1a5d7b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Each long-named metal's label name, by code.
LABEL_NAMES = {
    "clad": "Clad",
    "manganese_brass": "Clad",
    "24k_gold_plated_clad": "24K Plate",
    "gold_plated_silver": "Au/Ag",
    "silver_copper_clad": "40% Silver",
}


def upgrade() -> None:
    """Add the label name, and set it on the long-named metals that exist."""
    op.add_column(
        "metal",
        sa.Column(
            "label_name", sa.String(12), nullable=False, server_default=sa.text("''")
        ),
    )
    op.alter_column("metal", "label_name", server_default=None)
    for code, name in LABEL_NAMES.items():
        op.get_bind().execute(
            sa.text("UPDATE metal SET label_name = :name WHERE code = :code"),
            {"code": code, "name": name},
        )


def downgrade() -> None:
    """Drop the label name."""
    op.drop_column("metal", "label_name")
