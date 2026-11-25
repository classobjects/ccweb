# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Holder labels: the color bar's metal colors and cost brackets.

`metal.label_color` is the top block of a label's color bar, as `#rrggbb`;
empty leaves it blank. The upgrade sets it on the common metals by code,
where they exist -- the plated ones were added on the live database by hand
-- and touches no other row.

`label_cost_band` is the bottom block's brackets: a lower bound and a color
each, the resistor color code from black (under $10) to violet ($1,000 and
over). The upgrade creates and fills it. A downgrade drops both.

Revision ID: f4a8c1d6e2b7
Revises: e6b9d3f2a8c4
Create Date: 2026-11-24 19:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f4a8c1d6e2b7"
down_revision: str | None = "e6b9d3f2a8c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_GRAY = "#8c8c8c"
_WHITE = "#ffffff"

#: Each common metal's color, by code; a code not on the database is passed by.
LABEL_COLORS = {
    "silver": _GRAY,
    "silver_copper_clad": _GRAY,
    "gold_plated_silver": _GRAY,
    "gold": "#f5c400",
    "platinum": "#2f6fd6",
    "copper": "#e8741e",
    "bronze": "#e8741e",
    "nickel": _WHITE,
    "clad": _WHITE,
    "manganese_brass": _WHITE,
    "24k_gold_plated_clad": _WHITE,
}

#: The brackets as `backend/data/reference/operations.json` seeds them:
#: code, label, lower bound, color.
COST_BANDS = (
    ("under_10", "Under $10", "0.00", "#000000"),
    ("10_to_25", "$10 to $25", "10.00", "#8b4513"),
    ("25_to_50", "$25 to $50", "25.00", "#e02020"),
    ("50_to_100", "$50 to $100", "50.00", "#ff8c00"),
    ("100_to_200", "$100 to $200", "100.00", "#f5d000"),
    ("200_to_500", "$200 to $500", "200.00", "#1e9e3a"),
    ("500_to_1000", "$500 to $1,000", "500.00", "#2f6fd6"),
    ("1000_and_over", "$1,000 and over", "1000.00", "#8a3fd1"),
)

_HEX = "'^(#[0-9a-fA-F]{6})?$'"


def upgrade() -> None:
    """Add the metal color and the cost brackets, and fill both."""
    op.add_column(
        "metal",
        sa.Column(
            "label_color", sa.String(7), nullable=False, server_default=sa.text("''")
        ),
    )
    op.alter_column("metal", "label_color", server_default=None)
    op.create_check_constraint(
        "ck_metal_label_color", "metal", f"label_color ~ {_HEX}"
    )
    for code, color in LABEL_COLORS.items():
        op.get_bind().execute(
            sa.text("UPDATE metal SET label_color = :color WHERE code = :code"),
            {"code": code, "color": color},
        )

    band = op.create_table(
        "label_cost_band",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "source",
            postgresql.ENUM(
                "seeded",
                "derived",
                "manual",
                name="provenance_source",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("lower_bound", sa.Numeric(12, 2), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_label_cost_band_code"),
        sa.UniqueConstraint("lower_bound", name="uq_label_cost_band_lower_bound"),
        sa.CheckConstraint("lower_bound >= 0", name="ck_label_cost_band_lower_bound"),
        sa.CheckConstraint(f"color ~ {_HEX}", name="ck_label_cost_band_color"),
    )
    op.bulk_insert(
        band,
        [
            {
                "code": code,
                "label": label,
                "sort_order": (n + 1) * 10,
                "is_active": True,
                "source": "seeded",
                "lower_bound": bound,
                "color": color,
            }
            for n, (code, label, bound, color) in enumerate(COST_BANDS)
        ],
    )


def downgrade() -> None:
    """Drop the cost brackets and the metal color."""
    op.drop_table("label_cost_band")
    op.drop_constraint("ck_metal_label_color", "metal", type_="check")
    op.drop_column("metal", "label_color")
