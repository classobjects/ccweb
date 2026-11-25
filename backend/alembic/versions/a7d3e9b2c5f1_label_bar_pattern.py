# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Holder labels: a pattern for a metal's block of the color bar.

`metal.label_pattern` is how the block is filled: empty is solid, `striped`
adds white diagonal lines, so a metal can share another's color and still be
told from it. The upgrade gives the colorized metals -- added on the live
database by hand -- their base metal's color, striped (the owner's ruling):
Colorized Silver gray, Colorized Copper orange. Rows that do not exist are
passed by. A downgrade drops the column and leaves the colors.

Revision ID: a7d3e9b2c5f1
Revises: f4a8c1d6e2b7
Create Date: 2026-11-24 20:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7d3e9b2c5f1"
down_revision: str | None = "f4a8c1d6e2b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Each colorized metal's color and pattern, by code.
STRIPED = {
    "colorized_silver": "#8c8c8c",
    "colorized_copper": "#e8741e",
}


def upgrade() -> None:
    """Add the pattern, and stripe the colorized metals in their base colors."""
    op.add_column(
        "metal",
        sa.Column(
            "label_pattern", sa.String(16), nullable=False, server_default=sa.text("''")
        ),
    )
    op.alter_column("metal", "label_pattern", server_default=None)
    op.create_check_constraint(
        "ck_metal_label_pattern", "metal", "label_pattern IN ('', 'striped')"
    )
    for code, color in STRIPED.items():
        op.get_bind().execute(
            sa.text(
                "UPDATE metal SET label_color = :color, label_pattern = 'striped'"
                " WHERE code = :code"
            ),
            {"code": code, "color": color},
        )


def downgrade() -> None:
    """Drop the pattern."""
    op.drop_constraint("ck_metal_label_pattern", "metal", type_="check")
    op.drop_column("metal", "label_pattern")
