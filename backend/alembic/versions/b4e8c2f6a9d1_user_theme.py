# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Each account's light, dark or automatic choice.

`users.theme` holds which colors the account's pages show: `light`, `dark`,
or `auto`, which follows the device's own setting. Every existing account
starts on `auto`, which is what every page did before, so nobody's page
changes until they choose (docs/specs/theme-preference-design.md).

Revision ID: b4e8c2f6a9d1
Revises: d7f2b9e4a6c1
Create Date: 2026-11-06 23:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b4e8c2f6a9d1"
down_revision: str | None = "d7f2b9e4a6c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_THEME = postgresql.ENUM("auto", "light", "dark", name="user_theme")


def upgrade() -> None:
    """Add `users.theme`, every existing account on `auto`."""
    _THEME.create(op.get_bind(), checkfirst=False)
    op.add_column(
        "users",
        sa.Column(
            "theme",
            postgresql.ENUM(name="user_theme", create_type=False),
            server_default="auto",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Drop the column and its type."""
    op.drop_column("users", "theme")
    _THEME.drop(op.get_bind(), checkfirst=False)
