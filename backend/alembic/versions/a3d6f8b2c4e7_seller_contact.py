# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Sellers: a contact name, email and phone.

A seller is an account on a marketplace; the person behind it is sometimes
dealt with directly -- a question about a lot, a private sale after a show.
Each field is optional and every existing seller has none, so nothing changes
until the owner fills one in. The phone is E.164, checked at entry as a
customer's is.

Revision ID: a3d6f8b2c4e7
Revises: c5e7a9b1d3f6
Create Date: 2026-10-28 14:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a3d6f8b2c4e7"
down_revision: str | None = "c5e7a9b1d3f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the three contact columns, empty for every seller."""
    op.add_column("seller", sa.Column("contact_name", sa.String(255), nullable=True))
    op.add_column("seller", sa.Column("contact_email", sa.String(255), nullable=True))
    op.add_column("seller", sa.Column("contact_phone", sa.String(64), nullable=True))


def downgrade() -> None:
    """Drop the contact columns."""
    op.drop_column("seller", "contact_phone")
    op.drop_column("seller", "contact_email")
    op.drop_column("seller", "contact_name")
