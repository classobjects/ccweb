# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""The user account table, and the installation's printer correction.

`users` is the login table the whole application uses. The schema references
it from `customer`, `sales_order`, both type catalogs and every table that
records who did something.

`label_printer_correction` is one row, or none: how large the installation's
printer prints a page of holder labels.
"""

from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, enum_column, utcnow

__all__ = ["LabelPrinterCorrection", "Theme", "User", "UserRole"]


class UserRole(enum.StrEnum):
    """What a login may do. Managers see cost basis; customers do not."""

    manager = "manager"
    customer = "customer"


class Theme(enum.StrEnum):
    """The colors an account's pages show (docs/specs/theme-preference-design.md).

    `auto` follows the device's own light or dark setting.
    """

    auto = "auto"
    light = "light"
    dark = "dark"


class User(Base):
    """A login. Referenced by customers, orders and every who-did-it column."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: Unique whatever its case (`uq_users_email`): `Bob@example.com` and
    #: `bob@example.com` reach one mailbox, so they are one account.
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        enum_column(UserRole, "user_role"),
        default=UserRole.customer,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    #: Light, dark, or the device's own setting -- the person's choice,
    #: following them to every device they sign in on.
    theme: Mapped[Theme] = mapped_column(
        enum_column(Theme, "user_theme"),
        default=Theme.auto,
        server_default=Theme.auto.value,
        nullable=False,
    )
    #: Bumped whenever the password changes, and carried inside every token.
    #:
    #: Tokens are stateless JWTs with no server-side store, so without this a
    #: password reset changes only what the person types next time -- every
    #: token issued before the reset keeps working until it expires. That is
    #: useless for the case the reset exists for, which is revoking access to
    #: an account that should no longer have it.
    token_version: Mapped[int] = mapped_column(
        Integer, default=1, server_default=text("1"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    __table_args__ = (Index("uq_users_email", text("lower(email::text)"), unique=True),)


class LabelPrinterCorrection(Base):
    """How large the installation's printer prints a page of holder labels.

    holder-labels-design.md, section 4, "Printer correction". Percent across
    and down, as read off a test page; every label is laid out larger (or
    smaller) by the inverse, so it lands on its label. One for the whole
    installation, whoever prints: `id` is always 1. No row is 100% both
    ways.
    """

    __tablename__ = "label_printer_correction"

    id: Mapped[int] = mapped_column(
        SmallInteger, primary_key=True, autoincrement=False, default=1
    )
    across: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    down: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_label_printer_correction_one_row"),
        CheckConstraint(
            "across BETWEEN 90 AND 110", name="ck_label_printer_correction_across"
        ),
        CheckConstraint(
            "down BETWEEN 90 AND 110", name="ck_label_printer_correction_down"
        ),
    )
