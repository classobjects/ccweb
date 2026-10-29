# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Refuse to start with a starting item kind the database cannot give an item.

`DEFAULT_ITEM_KIND` is only the kind a purchase's new item starts as, but a
code the database does not hold, or holds retired, would fail every item
entered without a kind picked -- found only at the first purchase, with a
422 on the screen. So the API checks at start-up and stops, naming the code
and the kinds there are.

**The database may not be up yet.** As with the photograph check
(`app.media_check`), the check then logs that it could not run and lets the
API start.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .config import settings
from .media_check import startup_session
from .models import ItemKind

__all__ = ["UnknownDefaultKind", "check_at_startup", "check_default_kind"]

_log = logging.getLogger(__name__)


class UnknownDefaultKind(RuntimeError):
    """`DEFAULT_ITEM_KIND` names no active `item_kind` code."""


def check_default_kind(db: Session, code: str) -> None:
    """Raise `UnknownDefaultKind` unless `code` is an active item kind."""
    active = db.scalars(
        select(ItemKind.code).where(ItemKind.is_active).order_by(ItemKind.code)
    ).all()
    if code in active:
        return
    raise UnknownDefaultKind(
        f"DEFAULT_ITEM_KIND is {code!r}, which is not an item kind in use. "
        f"Set it in .env to one of: {', '.join(active)} -- or remove the "
        "line to start new items as coin."
    )


def check_at_startup(provide: Callable[[], object]) -> None:
    """Run `check_default_kind` on a session from `provide`; skip if the DB is down."""
    try:
        with startup_session(provide) as db:
            check_default_kind(db, settings.default_item_kind)
    except OperationalError as exc:
        _log.warning(
            "starting item kind not checked: the database is not reachable (%s)",
            exc.orig,
        )
