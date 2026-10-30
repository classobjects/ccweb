# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Constraints the code assumed, indexes nothing needed, a fuller note view.

Three rules the application already relied on, now held by the database:

- **An email address is one account whatever its case.** Sign-in and
  registration compare `lower(email)`, but the index compared the text as
  typed, so two registrations racing with `Bob@` and `bob@` could both land.
  `uq_users_email` is a unique index on the lowered text, as `uq_vendor_name`
  is.
- **A certificate number appears once per item.** The item editor keys an
  item's certificates by number; two rows with one number would be one key.
  `uq_item_certification_item_number`.
- **A design series is a coin's or a note's.** `series.applies_to` is free
  text; `ck_series_applies_to` holds it to `coin` or `currency`.

None of these changes data. Where rows already break a rule the upgrade stops
before changing anything and names them: settle them in the console, then
upgrade again.

Seventeen indexes go, each repeating the leading columns of a unique
constraint or another index on the same table, which serves every lookup it
did -- `item_certification.inventory_item_id`'s among them, now that the
new unique constraint leads with it. `ix_users_email` gives way to
`uq_users_email`.

`currency_inventory` gains the large-size note's co-signer, `register`, and
composes its grade with `grade_display()` as `coin_inventory` does, rather
than showing the grade's code.

Revision ID: d7f2b9e4a6c1
Revises: a3d6f8b2c4e7
Create Date: 2026-10-29 12:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d7f2b9e4a6c1"
down_revision: str | None = "a3d6f8b2c4e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Indexes dropped because another index on the table leads with their
#: columns, as (name, table, columns) so the downgrade can rebuild them.
_REDUNDANT: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("ix_note_issue_lookup", "note_issue", ("denomination_id", "series_year")),
    ("ix_reference_alias_table_row", "reference_alias", ("table_name", "row_id")),
    (
        "ix_item_field_source_inventory_item_id",
        "item_field_source",
        ("inventory_item_id",),
    ),
    (
        "ix_item_status_history_inventory_item_id",
        "item_status_history",
        ("inventory_item_id",),
    ),
    (
        "ix_location_history_inventory_item_id",
        "location_history",
        ("inventory_item_id",),
    ),
    (
        "ix_valuation_snapshot_inventory_item_id",
        "valuation_snapshot",
        ("inventory_item_id",),
    ),
    ("ix_item_error_inventory_item_id", "item_error", ("inventory_item_id",)),
    ("ix_item_image_inventory_item_id", "item_image", ("inventory_item_id",)),
    ("ix_image_derivative_image_id", "image_derivative", ("image_id",)),
    ("ix_series_alias_series_id", "series_alias", ("series_id",)),
    ("ix_series_year_range_series_id", "series_year_range", ("series_id",)),
    ("ix_offer_claim_listing_id", "offer_claim", ("listing_id",)),
    ("ix_sales_lot_item_sales_lot_id", "sales_lot_item", ("sales_lot_id",)),
    (
        "ix_sales_order_item_share_sales_order_item_id",
        "sales_order_item_share",
        ("sales_order_item_id",),
    ),
    ("ix_composition_denomination_id", "composition", ("denomination_id",)),
    ("ix_inventory_item_item_kind_id", "inventory_item", ("item_kind_id",)),
    (
        "ix_item_certification_inventory_item_id",
        "item_certification",
        ("inventory_item_id",),
    ),
)

_SERIES_SIDES = "applies_to IN ('coin', 'currency')"

#: Each query names the rows one rule refuses, one line per clash. Copied
#: here rather than derived from the models: a migration keeps the rule of
#: its day.
_REFUSALS: tuple[tuple[str, str], ...] = (
    (
        "These accounts are one address in different cases; keep one",
        "SELECT string_agg(email || ' (user ' || id || ')', ' and ' "
        "ORDER BY id) FROM users GROUP BY lower(email::text) "
        "HAVING count(*) > 1 ORDER BY 1",
    ),
    (
        "These items hold one certificate number twice; remove the repeat",
        "SELECT i.item_code || ': ' || c.cert_number || ' (rows ' "
        "|| string_agg(c.id::text, ', ' ORDER BY c.id) || ')' "
        "FROM item_certification c "
        "JOIN inventory_item i ON i.id = c.inventory_item_id "
        "GROUP BY i.item_code, c.cert_number HAVING count(*) > 1 ORDER BY 1",
    ),
    (
        "These series apply to neither coin nor currency; set one",
        "SELECT code || ' (' || applies_to || ')' FROM series "
        f"WHERE NOT ({_SERIES_SIDES}) ORDER BY 1",
    ),
)

_CURRENCY_INVENTORY_BEFORE = """
CREATE VIEW currency_inventory AS
SELECT
    i.id,
    i.source_title,
    i.description,
    k.code            AS item_kind,
    d.code            AS denomination,
    d.label           AS denomination_label,
    stf.code          AS storage_form,
    i.piece_count,
    c.code            AS country,
    i.year_start,
    i.year_end,
    nt.code           AS note_type,
    cud.series_year,
    cud.series_letter,
    sc.code           AS seal_color,
    fd.letter         AS fed_district_letter,
    fd.city           AS fed_district_city,
    cud.serial_number,
    cud.friedberg_id,
    fr.fr_number      AS friedberg_number,
    cud.friedberg_status,
    sig.treasurer,
    sig.secretary,
    g.code            AS grade,
    g.numeric_value   AS grade_value,
    gd.code           AS grade_designation,
    gs.code           AS grading_service,
    a.code            AS authenticity,
    st.code           AS status,
    disp.code         AS disposition,
    i.item_code,
    i.parent_item_id,
    i.split_at,
    i.storage_location_id,
    i.local_catalog_number,
    i.item_cost,
    i.shipping_cost,
    i.sales_tax,
    i.total_cost,
    i.numismatic_value,
    vb.code           AS valuation_basis,
    i.attributes,
    i.created_at,
    i.updated_at
FROM inventory_item i
JOIN item_kind k              ON k.id  = i.item_kind_id
JOIN storage_form stf         ON stf.id = i.storage_form_id
JOIN authenticity a           ON a.id  = i.authenticity_id
JOIN item_status st           ON st.id = i.status_id
JOIN disposition disp         ON disp.id = i.disposition_id
JOIN valuation_basis vb       ON vb.id = i.valuation_basis_id
LEFT JOIN currency_detail cud ON cud.inventory_item_id = i.id
LEFT JOIN denomination d      ON d.id  = i.denomination_id
LEFT JOIN country c           ON c.id  = i.country_id
LEFT JOIN note_type nt        ON nt.id = cud.note_type_id
LEFT JOIN seal_color sc       ON sc.id = cud.seal_color_id
LEFT JOIN fed_district fd     ON fd.id = cud.fed_district_id
LEFT JOIN signature_combination sig ON sig.id = cud.signature_combination_id
LEFT JOIN friedberg_number fr ON fr.id = cud.friedberg_id
LEFT JOIN grade g             ON g.id  = i.grade_id
LEFT JOIN grade_designation gd ON gd.id = i.grade_designation_id
LEFT JOIN grading_service gs  ON gs.id = i.grading_service_id
WHERE i.split_at IS NULL
  AND i.deleted_at IS NULL
  AND k.code = 'currency'
"""

_CURRENCY_INVENTORY_AFTER = """
CREATE VIEW currency_inventory AS
SELECT
    i.id,
    i.source_title,
    i.description,
    k.code            AS item_kind,
    d.code            AS denomination,
    d.label           AS denomination_label,
    stf.code          AS storage_form,
    i.piece_count,
    c.code            AS country,
    i.year_start,
    i.year_end,
    nt.code           AS note_type,
    cud.series_year,
    cud.series_letter,
    sc.code           AS seal_color,
    fd.letter         AS fed_district_letter,
    fd.city           AS fed_district_city,
    cud.serial_number,
    cud.friedberg_id,
    fr.fr_number      AS friedberg_number,
    cud.friedberg_status,
    sig.treasurer,
    sig.secretary,
    sig.register,
    grade_display(
        stk.prefix, stk.suffix, g.numeric_value, g.is_plus, g.label,
        gsc.code = 'sheldon'
    ) AS grade,
    g.numeric_value   AS grade_value,
    gd.code           AS grade_designation,
    gs.code           AS grading_service,
    a.code            AS authenticity,
    st.code           AS status,
    disp.code         AS disposition,
    i.item_code,
    i.parent_item_id,
    i.split_at,
    i.storage_location_id,
    i.local_catalog_number,
    i.item_cost,
    i.shipping_cost,
    i.sales_tax,
    i.total_cost,
    i.numismatic_value,
    vb.code           AS valuation_basis,
    i.attributes,
    i.created_at,
    i.updated_at
FROM inventory_item i
JOIN item_kind k              ON k.id  = i.item_kind_id
JOIN storage_form stf         ON stf.id = i.storage_form_id
JOIN authenticity a           ON a.id  = i.authenticity_id
JOIN item_status st           ON st.id = i.status_id
JOIN disposition disp         ON disp.id = i.disposition_id
JOIN valuation_basis vb       ON vb.id = i.valuation_basis_id
LEFT JOIN currency_detail cud ON cud.inventory_item_id = i.id
LEFT JOIN denomination d      ON d.id  = i.denomination_id
LEFT JOIN country c           ON c.id  = i.country_id
LEFT JOIN note_type nt        ON nt.id = cud.note_type_id
LEFT JOIN seal_color sc       ON sc.id = cud.seal_color_id
LEFT JOIN fed_district fd     ON fd.id = cud.fed_district_id
LEFT JOIN signature_combination sig ON sig.id = cud.signature_combination_id
LEFT JOIN friedberg_number fr ON fr.id = cud.friedberg_id
LEFT JOIN grade g             ON g.id  = i.grade_id
LEFT JOIN grade_scale gsc     ON gsc.id = g.grade_scale_id
LEFT JOIN strike_type stk     ON stk.id = i.strike_type_id
LEFT JOIN grade_designation gd ON gd.id = i.grade_designation_id
LEFT JOIN grading_service gs  ON gs.id = i.grading_service_id
WHERE i.split_at IS NULL
  AND i.deleted_at IS NULL
  AND k.code = 'currency'
"""


def _refuse_rows_that_break_a_rule() -> None:
    """Stop, naming every row a new constraint would refuse, before any change."""
    conn = op.get_bind()
    problems = []
    for heading, query in _REFUSALS:
        rows = [str(row) for row in conn.execute(sa.text(query)).scalars()]
        if rows:
            problems.append(f"{heading}: " + "; ".join(rows))
    if problems:
        raise RuntimeError(
            "Nothing was changed. Settle these in the console, then upgrade "
            "again. " + " | ".join(problems)
        )


def upgrade() -> None:
    """Add the three rules, drop the redundant indexes, widen the note view."""
    _refuse_rows_that_break_a_rule()

    op.drop_index("ix_users_email", table_name="users")
    op.create_index(
        "uq_users_email", "users", [sa.text("lower(email::text)")], unique=True
    )
    op.create_unique_constraint(
        "uq_item_certification_item_number",
        "item_certification",
        ["inventory_item_id", "cert_number"],
    )
    op.create_check_constraint("ck_series_applies_to", "series", _SERIES_SIDES)

    for name, table, _ in _REDUNDANT:
        op.drop_index(name, table_name=table)

    op.execute("DROP VIEW currency_inventory")
    op.execute(_CURRENCY_INVENTORY_AFTER)


def downgrade() -> None:
    """The view, indexes and exact-match email index as they were."""
    op.execute("DROP VIEW currency_inventory")
    op.execute(_CURRENCY_INVENTORY_BEFORE)

    for name, table, columns in reversed(_REDUNDANT):
        op.create_index(name, table, list(columns))

    op.drop_constraint("ck_series_applies_to", "series", type_="check")
    op.drop_constraint(
        "uq_item_certification_item_number", "item_certification", type_="unique"
    )
    op.drop_index("uq_users_email", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=True)
