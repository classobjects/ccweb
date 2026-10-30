# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""The table aliases the report queries share, and the live rule on them.

`inventory_item` and `item_kind`, aliased `i` and `k` -- exactly how
`inventory_search`'s own queries alias them (`_J_KIND`) -- so SQL text
written for the search against those aliases (`MISSING_FIELDS[key].sql`)
can be reused in a report verbatim rather than restated against different
table names.

`item_status`, `disposition` and `currency_detail`, aliased `st`, `disp`
and `cud` as the search aliases them (`_J_CUR_DETAIL` for the last), for
the same reason: `MISSING_FIELDS[key].sql` names `cud` directly.

`LIVE` is `live_item()` (`app.live`), the shared live-row predicate, moved
onto the `i` alias: `live_item()` names `InventoryItem` unaliased, and
`ClauseAdapter` rewrites its column references onto `ITEM` so it composes
with a query that joins `inventory_item` as `i`.
"""

from __future__ import annotations

from sqlalchemy.sql.util import ClauseAdapter

from ..live import live_item
from ..models import CurrencyDetail, Disposition, InventoryItem, ItemKind, ItemStatus

__all__ = ["CURRENCY_DETAIL", "DISPOSITION", "ITEM", "ITEM_STATUS", "KIND", "LIVE"]

ITEM = InventoryItem.__table__.alias("i")
KIND = ItemKind.__table__.alias("k")
ITEM_STATUS = ItemStatus.__table__.alias("st")
DISPOSITION = Disposition.__table__.alias("disp")
CURRENCY_DETAIL = CurrencyDetail.__table__.alias("cud")
LIVE = ClauseAdapter(ITEM).traverse(live_item())
