# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Indexes for two lookups that read a whole table.

`listing.paused_by_listing_id`: settling or ending an offer reads back the
store listings it paused, by this column. Partial, as only a paused listing
carries a pointer.

`location_history.storage_location_id`: a location's recorded moves are
counted before it may be deleted, and the foreign key's RESTRICT check reads
the same column.

Both are reads by an exact value, so a plain b-tree serves them. Nothing is
added for the inventory's free-text search: it ORs `ILIKE '%...%'` across
four columns with an EXISTS on the purchase, and an OR with a subquery arm
cannot become a bitmap scan, so trigram indexes there go unused and cost
every write.

Revision ID: c3a7e1f9d2b4
Revises: b4e8c2f6a9d1
Create Date: 2026-11-11 20:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3a7e1f9d2b4"
down_revision: str | None = "b4e8c2f6a9d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create both indexes."""
    op.create_index(
        "ix_listing_paused_by_listing_id",
        "listing",
        ["paused_by_listing_id"],
        postgresql_where=sa.text("paused_by_listing_id IS NOT NULL"),
    )
    op.create_index(
        "ix_location_history_storage_location_id",
        "location_history",
        ["storage_location_id"],
    )


def downgrade() -> None:
    """Drop both."""
    op.drop_index("ix_location_history_storage_location_id", "location_history")
    op.drop_index("ix_listing_paused_by_listing_id", "listing")
