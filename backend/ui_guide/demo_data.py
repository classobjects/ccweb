# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""The made-up demo collection the pictures are taken from.

Every name, address, order number, listing number and certificate here is
invented: people and businesses are "Example" and "Demo" names at
example.com addresses, telephone numbers are in the 555-01xx range kept for
fiction, listing numbers start DEMO-, and certificate numbers are runs of
zeros no grader issues. Photographs are the drawings in `ui_guide.art`.

The collection is entered through the application's own API, in-process,
so every row passes the rules a person entering it would meet. Run only by
`python -m ui_guide`, which points DATABASE_URL at the demo database
before this module is imported.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from app import throttle
from app.database import SessionLocal
from app.main import app
from app.models import User, UserRole
from app.security import hash_password
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from . import art
from .stack import ADMIN_EMAIL, StackError

#: The demo customers who sign in to the shop.
CUSTOMER_EMAIL = "alex.sample@example.com"
SECOND_CUSTOMER_EMAIL = "jordan.demo@example.net"


class Api:
    """The application's API, in-process, raising on any refusal."""

    def __init__(self) -> None:
        """A client with no one signed in yet."""
        self.client = TestClient(app)
        self.headers: dict[str, str] = {}

    def sign_in(self, email: str, password: str) -> dict[str, str]:
        """Sign in and use that account for the calls that follow."""
        for limit in throttle.ALL_LIMITS:
            limit.clear()
        answer = self.client.post(
            "/api/auth/login", data={"username": email, "password": password}
        )
        if answer.status_code != 200:
            raise StackError(f"sign-in as {email}: {answer.text}")
        self.headers = {"Authorization": f"Bearer {answer.json()['access_token']}"}
        return self.headers

    def call(
        self,
        method: str,
        path: str,
        body: object = None,
        *,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        data: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """One request; the decoded answer, or StackError naming the refusal.

        Every answer the collection reads is an object; any other is handed
        back under "value", and nothing is under it for an empty answer.
        """
        answer = self.client.request(
            method,
            "/api" + path,
            json=body,
            files=files,
            data=data,
            headers=self.headers,
        )
        if answer.status_code >= 300:
            raise StackError(f"{method} {path}: {answer.status_code} {answer.text}")
        value = answer.json() if answer.content else None
        return value if isinstance(value, dict) else {"value": value}

    def post(self, path: str, body: object = None) -> dict[str, Any]:
        """POST, with a JSON body."""
        return self.call("POST", path, body)

    def patch(self, path: str, body: object) -> dict[str, Any]:
        """PATCH, with a JSON body."""
        return self.call("PATCH", path, body)

    def get(self, path: str) -> dict[str, Any]:
        """GET."""
        return self.call("GET", path)


def set_password(email: str, password: str, role: UserRole | None = None) -> None:
    """Create the account, or give it this password: the pictures sign in with it."""
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == email))
        if user is None:
            if role is None:
                raise StackError(f"no account {email}")
            user = User(email=email, full_name="Site Administrator", role=role)
            session.add(user)
        user.hashed_password = hash_password(password)
        session.commit()


@dataclass
class Demo:
    """The collection as it is entered: what was made, by a key of our own."""

    api: Api
    today: date = field(default_factory=date.today)
    items: dict[str, dict[str, Any]] = field(default_factory=dict)
    vendors: dict[str, int] = field(default_factory=dict)
    sellers: dict[str, int] = field(default_factory=dict)
    places: dict[str, int] = field(default_factory=dict)
    purchases: dict[str, int] = field(default_factory=dict)
    listings: dict[str, dict[str, Any]] = field(default_factory=dict)
    lots: dict[str, int] = field(default_factory=dict)

    def ago(self, days: int) -> str:
        """The ISO date `days` before today."""
        return (self.today - timedelta(days=days)).isoformat()

    def id(self, key: str) -> int:
        """The id of the item entered under `key`."""
        return int(self.items[key]["id"])


# --- the made-up businesses, people and places ---------------------------------

VENDORS = (
    ("ebay", "ebay.com", "https://www.ebay.com", "marketplace"),
    ("riverbend", "Riverbend Coin Exchange", "https://riverbend.example.com", "dealer"),
    ("lakeside", "Lakeside Numismatics", "https://lakeside.example.com", "dealer"),
    (
        "northgate",
        "Northgate Auction Gallery",
        "https://northgate.example.com",
        "auction",
    ),
    ("private", "Private sale", None, "private"),
)

SELLERS = (
    (
        "oldtown",
        "oldtown_coins",
        "https://www.ebay.com/str/oldtowncoinsdemo",
        "Morgan Example",
        "morgan@example.com",
        "+12025550147",
    ),
    (
        "paper",
        "paper_and_mint",
        "https://www.ebay.com/str/paperandmintdemo",
        None,
        None,
        None,
    ),
    (
        "stack",
        "silverstack_demo",
        "https://www.ebay.com/str/silverstackdemo",
        "Riley Example",
        "riley@example.org",
        "+13125550188",
    ),
)

PLACES = (
    (
        "bank",
        {
            "kind": "safe_deposit_box",
            "institution": "First Example Bank",
            "identifier": "Box 214",
            "notes": "Second key in the desk drawer.",
        },
    ),
    (
        "safe",
        {
            "kind": "safe",
            "institution": "Office",
            "identifier": "Safe 1",
            "notes": "Top shelf: slabs. Bottom shelf: albums.",
        },
    ),
    ("home", {"kind": "home", "institution": "Study", "identifier": "Cabinet B"}),
)


# --- what was bought ---------------------------------------------------------------
#
# Each purchase: (key, vendor, seller, order number, days ago, arrived days
# ago or None, place, [items]). Each item: (key, fields for POST
# /inventory, photograph or None). A photograph is (drawing, args).

_US = {"country": "US"}


def _coin(title: str, denom: str, year: int | None, **more: object) -> dict[str, Any]:
    """The fields of a US coin."""
    fields: dict[str, Any] = {
        "item_kind": "coin",
        "source_title": title,
        "denomination": denom,
        **_US,
        **more,
    }
    if year is not None:
        fields["year_start"] = year
    return fields


def _note(
    title: str, denom: str, year: int, letter: str | None, serial: str, **more: object
) -> dict[str, Any]:
    """The fields of a US note."""
    fields: dict[str, Any] = {
        "item_kind": "currency",
        "source_title": title,
        "denomination": denom,
        "series_year": year,
        "serial_number": serial,
        **_US,
        **more,
    }
    if letter:
        fields["series_letter"] = letter
    return fields


PURCHASES: tuple[tuple[Any, ...], ...] = (
    (
        "morgans",
        "ebay",
        "oldtown",
        "12-11111-10001",
        140,
        132,
        "safe",
        [
            (
                "m1881s",
                _coin(
                    "1881-S Morgan Silver Dollar PCGS MS64",
                    "usd_coin_1_00",
                    1881,
                    mint="S",
                    grade="MS64",
                    grading_service="PCGS",
                    series="morgan_dollar",
                    metal="silver",
                    item_cost="142.00",
                    shipping_cost="5.00",
                    description="Brilliant, well struck, original luster.",
                ),
                ("coin", "1881-S", "Morgan Dollar", "silver"),
            ),
            (
                "m1885o",
                _coin(
                    "1885-O Morgan Dollar NGC MS63",
                    "usd_coin_1_00",
                    1885,
                    mint="O",
                    grade="MS63",
                    grading_service="NGC",
                    series="morgan_dollar",
                    metal="silver",
                    item_cost="88.00",
                    shipping_cost="5.00",
                ),
                ("coin", "1885-O", "Morgan Dollar", "silver"),
            ),
            (
                "m1921",
                _coin(
                    "1921 Morgan Dollar AU58",
                    "usd_coin_1_00",
                    1921,
                    grade="58",
                    series="morgan_dollar",
                    metal="silver",
                    item_cost="41.50",
                    shipping_cost="4.00",
                ),
                ("coin", "1921", "Morgan Dollar", "silver"),
            ),
            (
                "p1922",
                _coin(
                    "1922 Peace Dollar MS62",
                    "usd_coin_1_00",
                    1922,
                    grade="MS62",
                    series="peace_dollar",
                    metal="silver",
                    item_cost="44.00",
                    shipping_cost="4.00",
                ),
                ("coin", "1922", "Peace Dollar", "silver"),
            ),
            (
                "p1923",
                _coin(
                    "1923 Peace Dollar MS63",
                    "usd_coin_1_00",
                    1923,
                    grade="MS63",
                    series="peace_dollar",
                    metal="silver",
                    item_cost="46.00",
                    shipping_cost="4.00",
                ),
                ("coin", "1923", "Peace Dollar", "silver"),
            ),
            (
                "p1925",
                _coin(
                    "1925 Peace Dollar AU55",
                    "usd_coin_1_00",
                    1925,
                    grade="55",
                    series="peace_dollar",
                    metal="silver",
                    item_cost="38.00",
                    shipping_cost="4.00",
                ),
                None,
            ),
        ],
    ),
    (
        "bullion",
        "riverbend",
        None,
        "RB-4471",
        120,
        115,
        "bank",
        [
            (
                "ase",
                {
                    "item_kind": "bullion",
                    "source_title": "2026 American Silver Eagle 1 oz",
                    "year_start": 2026,
                    "bullion_form": "silver_eagle",
                    "metal": "silver",
                    "denomination": "usd_coin_1_00",
                    "series": "american_silver_eagle",
                    "fineness": "0.999",
                    "gross_weight_ozt": "1.0000",
                    **_US,
                    "item_cost": "36.80",
                    "shipping_cost": "2.50",
                },
                ("coin", "2026", "Silver Eagle", "silver"),
            ),
            (
                "ase_roll",
                {
                    "item_kind": "bullion",
                    "source_title": "2025 American Silver Eagle roll of 20",
                    "year_start": 2025,
                    "bullion_form": "silver_eagle",
                    "metal": "silver",
                    "denomination": "usd_coin_1_00",
                    "series": "american_silver_eagle",
                    "storage_form": "roll",
                    "piece_count": 20,
                    "fineness": "0.999",
                    "gross_weight_ozt": "1.0000",
                    **_US,
                    "item_cost": "690.00",
                    "shipping_cost": "12.00",
                },
                None,
            ),
            (
                "round",
                {
                    "item_kind": "bullion",
                    "source_title": "1 oz silver round, Demo Mint",
                    "no_date": True,
                    "bullion_form": "round",
                    "metal": "silver",
                    "fineness": "0.999",
                    "gross_weight_ozt": "1.0000",
                    "item_cost": "33.10",
                    "shipping_cost": "2.50",
                },
                ("coin", "1 OZ", "Silver Round", "silver"),
            ),
            (
                "bar10",
                {
                    "item_kind": "bullion",
                    "source_title": "10 oz silver bar, poured",
                    "no_date": True,
                    "bullion_form": "bar",
                    "metal": "silver",
                    "fineness": "0.999",
                    "gross_weight_ozt": "10.0000",
                    "serial_number": "DEMO-0042",
                    "item_cost": "322.00",
                    "shipping_cost": "8.00",
                },
                None,
            ),
            (
                "age",
                {
                    "item_kind": "bullion",
                    "source_title": "2024 American Gold Eagle 1/10 oz",
                    "year_start": 2024,
                    "bullion_form": "gold_eagle",
                    "metal": "gold",
                    "denomination": "usd_coin_5_00",
                    "series": "american_gold_eagle",
                    "fineness": "0.9167",
                    "gross_weight_ozt": "0.1091",
                    "fine_weight_ozt": "0.1000",
                    **_US,
                    "item_cost": "302.00",
                    "shipping_cost": "8.00",
                },
                ("coin", "2024", "Gold Eagle", "gold"),
            ),
            (
                "junk",
                _coin(
                    "Roll of 40 1964 Washington quarters, 90% silver",
                    "usd_coin_0_25",
                    1964,
                    series="washington_quarter",
                    metal="silver",
                    storage_form="roll",
                    piece_count=40,
                    item_cost="268.00",
                    shipping_cost="6.00",
                ),
                None,
            ),
        ],
    ),
    (
        "notes",
        "ebay",
        "paper",
        "12-22222-20002",
        100,
        92,
        "bank",
        [
            (
                "sc1957",
                _note(
                    "1957-B $1 Silver Certificate star note PMG 64 EPQ",
                    "usd_note_1",
                    1957,
                    "B",
                    "*31415926A",
                    grade="N64",
                    grade_designation="EPQ",
                    grading_service="PMG",
                    cert_number="0000017-001",
                    coolness_index="42.5",
                    star_run_size=640000,
                    item_cost="18.00",
                    shipping_cost="3.00",
                ),
                ("note", "$1 Series 1957-B", "Silver Certificate", "blue"),
            ),
            (
                "sc1935",
                _note(
                    "1935-G $1 Silver Certificate",
                    "usd_note_1",
                    1935,
                    "G",
                    "R12345678J",
                    grade="N30",
                    item_cost="9.00",
                    shipping_cost="1.50",
                ),
                ("note", "$1 Series 1935-G", "Silver Certificate", "blue"),
            ),
            (
                "frn2017",
                _note(
                    "2017-A $1 Federal Reserve Note",
                    "usd_note_1",
                    2017,
                    "A",
                    "B00001234C",
                    grade="N66",
                    item_cost="12.00",
                    shipping_cost="1.50",
                    attributes=["low_serial"],
                ),
                ("note", "$1 Series 2017-A", "Federal Reserve Note", "green"),
            ),
            (
                "usn1963",
                _note(
                    "1963 $2 United States Note red seal",
                    "usd_note_2",
                    1963,
                    None,
                    "A20202020A",
                    grade="N63",
                    item_cost="14.00",
                    shipping_cost="1.50",
                ),
                ("note", "$2 Series 1963", "United States Note", "red"),
            ),
            (
                "frn1995",
                _note(
                    "1995 $1 Federal Reserve Note radar",
                    "usd_note_1",
                    1995,
                    None,
                    "D12344321A",
                    grade="N58",
                    item_cost="7.00",
                    shipping_cost="1.50",
                ),
                None,
            ),
            (
                "frn2013",
                _note(
                    "2013 $5 Federal Reserve Note",
                    "usd_note_5",
                    2013,
                    None,
                    "MB55511122A",
                    item_cost="8.00",
                    shipping_cost="1.50",
                ),
                None,
            ),
            (
                "frn1977",
                _note(
                    "1977-A $20 Federal Reserve Note",
                    "usd_note_20",
                    1977,
                    "A",
                    "L01020304A",
                    grade="N25",
                    item_cost="24.00",
                    shipping_cost="1.50",
                ),
                None,
            ),
        ],
    ),
    (
        "gold",
        "northgate",
        None,
        "NAG-88120",
        80,
        70,
        "bank",
        [
            (
                "lib1904",
                _coin(
                    "1904 $20 Liberty Head Double Eagle PCGS MS62",
                    "usd_coin_20_00",
                    1904,
                    grade="MS62",
                    grading_service="PCGS",
                    series="liberty_head_gold",
                    metal="gold",
                    fineness="0.9",
                    gross_weight_ozt="1.0750",
                    item_cost="2310.00",
                    shipping_cost="25.00",
                ),
                ("coin", "1904", "Double Eagle", "gold"),
            ),
            (
                "slq1916",
                _coin(
                    "1917 Standing Liberty Quarter type 1 VF30",
                    "usd_coin_0_25",
                    1917,
                    grade="30",
                    series="standing_liberty_quarter",
                    metal="silver",
                    item_cost="96.00",
                    shipping_cost="10.00",
                ),
                ("coin", "1917", "Standing Liberty", "silver"),
            ),
            (
                "m1893",
                _coin(
                    "1893 Morgan Dollar VF30",
                    "usd_coin_1_00",
                    1893,
                    grade="30",
                    series="morgan_dollar",
                    metal="silver",
                    item_cost="210.00",
                    shipping_cost="10.00",
                ),
                ("coin", "1893", "Morgan Dollar", "silver"),
            ),
            (
                "ihc1909",
                _coin(
                    "1909 Indian Head Cent MS64 RB",
                    "usd_coin_0_01",
                    1909,
                    grade="MS64",
                    grade_designation="RB",
                    series="indian_head_cent",
                    metal="copper",
                    item_cost="65.00",
                    shipping_cost="5.00",
                ),
                ("coin", "1909", "Indian Head Cent", "copper"),
            ),
        ],
    ),
    (
        "sets",
        "lakeside",
        None,
        "LN-2031",
        60,
        55,
        "home",
        [
            (
                "quarters4",
                _coin(
                    "Four Washington quarters, 1960s, circulated",
                    "usd_coin_0_25",
                    None,
                    year_end=None,
                    series="washington_quarter",
                    metal="silver",
                    piece_count=4,
                    item_cost="28.00",
                    shipping_cost="4.00",
                    description="Four quarters bought as one lot.",
                ),
                None,
            ),
            (
                "proof1980",
                {
                    "item_kind": "set",
                    "source_title": "1980 US Proof Set",
                    "year_start": 1980,
                    "set_form": "proof_set",
                    "storage_form": "proof_set",
                    **_US,
                    "item_cost": "6.50",
                    "shipping_cost": "1.00",
                },
                None,
            ),
            (
                "proof1982",
                {
                    "item_kind": "set",
                    "source_title": "1982 US Proof Set",
                    "year_start": 1982,
                    "set_form": "proof_set",
                    "storage_form": "proof_set",
                    **_US,
                    "item_cost": "6.50",
                    "shipping_cost": "1.00",
                },
                None,
            ),
            (
                "proof1984",
                {
                    "item_kind": "set",
                    "source_title": "1984 US Proof Set",
                    "year_start": 1984,
                    "set_form": "proof_set",
                    "storage_form": "proof_set",
                    **_US,
                    "item_cost": "7.00",
                    "shipping_cost": "1.00",
                },
                None,
            ),
            (
                "mint1999",
                {
                    "item_kind": "set",
                    "source_title": "1999 US Mint Set",
                    "year_start": 1999,
                    "set_form": "mint_set",
                    "storage_form": "mint_set",
                    **_US,
                    "item_cost": "18.00",
                    "shipping_cost": "2.00",
                },
                None,
            ),
        ],
    ),
    (
        "estate",
        "private",
        None,
        None,
        170,
        168,
        "home",
        [
            (
                "wlh1942",
                _coin(
                    "1942 Walking Liberty Half Dollar",
                    "usd_coin_0_50",
                    1942,
                    grade="45",
                    series="walking_liberty_half",
                    metal="silver",
                    item_cost="22.00",
                ),
                ("coin", "1942", "Walking Liberty", "silver"),
            ),
            (
                "wlh1943",
                _coin(
                    "1943 Walking Liberty Half Dollar",
                    "usd_coin_0_50",
                    1943,
                    grade="50",
                    series="walking_liberty_half",
                    metal="silver",
                    item_cost="23.00",
                ),
                ("coin", "1943", "Walking Liberty", "silver"),
            ),
            (
                "merc1941",
                _coin(
                    "1941 Mercury dime",
                    "usd_coin_0_10",
                    1941,
                    series="winged_liberty_head_dime",
                    metal="silver",
                    item_cost="3.00",
                ),
                None,
            ),
            (
                "merc1944",
                _coin(
                    "1944-D Mercury dime",
                    "usd_coin_0_10",
                    1944,
                    mint="D",
                    series="winged_liberty_head_dime",
                    metal="silver",
                    item_cost="3.00",
                ),
                None,
            ),
            (
                "ihc1899",
                _coin(
                    "1899 Indian Head Cent",
                    "usd_coin_0_01",
                    1899,
                    grade="12",
                    series="indian_head_cent",
                    metal="copper",
                    item_cost="2.50",
                ),
                None,
            ),
            (
                "ihc1902",
                _coin(
                    "1902 Indian Head Cent",
                    "usd_coin_0_01",
                    1902,
                    grade="15",
                    series="indian_head_cent",
                    metal="copper",
                    item_cost="2.50",
                ),
                None,
            ),
            (
                "buff",
                _coin(
                    "Buffalo nickel, date worn off",
                    "usd_coin_0_05",
                    None,
                    series="indian_head_nickel",
                    item_cost="0.50",
                ),
                None,
            ),
            (
                "token",
                {
                    "item_kind": "token",
                    "source_title": "Civil War store card token",
                    "year_start": 1863,
                    "item_cost": "18.00",
                    "description": "Merchant's token, copper, demo piece.",
                },
                None,
            ),
            (
                "medal",
                {
                    "item_kind": "medal",
                    "source_title": "County fair prize medal",
                    "item_cost": "12.00",
                },
                None,
            ),
            (
                "franklin",
                _coin(
                    "1958 Franklin Half Dollar off-center strike",
                    "usd_coin_0_50",
                    1958,
                    series="franklin_half",
                    metal="silver",
                    grade="40",
                    item_cost="45.00",
                ),
                ("coin", "1958", "Franklin Half", "silver"),
            ),
        ],
    ),
    (
        "late",
        "ebay",
        "oldtown",
        "12-44444-40004",
        35,
        None,
        None,
        [
            (
                "frn1988",
                _note(
                    "1988-A $1 Federal Reserve Note web press",
                    "usd_note_1",
                    1988,
                    "A",
                    "F12121212B",
                    item_cost="16.00",
                    shipping_cost="1.50",
                ),
                None,
            ),
            (
                "frn2003",
                _note(
                    "2003 $2 Federal Reserve Note",
                    "usd_note_2",
                    2003,
                    None,
                    "AA00002003A",
                    item_cost="6.00",
                    shipping_cost="1.50",
                ),
                None,
            ),
        ],
    ),
    (
        "parcel",
        "ebay",
        "stack",
        "12-33333-30003",
        6,
        None,
        None,
        [
            (
                "m1878",
                _coin(
                    "1878 Morgan Dollar 7TF",
                    "usd_coin_1_00",
                    1878,
                    series="morgan_dollar",
                    metal="silver",
                    item_cost="182.00",
                    shipping_cost="5.00",
                ),
                None,
            ),
            (
                "buff1938",
                _coin(
                    "1938-D Buffalo nickel",
                    "usd_coin_0_05",
                    1938,
                    mint="D",
                    series="indian_head_nickel",
                    item_cost="14.00",
                    shipping_cost="2.00",
                ),
                None,
            ),
            (
                "frn1950",
                _note(
                    "1950-A $10 Federal Reserve Note",
                    "usd_note_10",
                    1950,
                    "A",
                    "B11223344A",
                    item_cost="19.00",
                    shipping_cost="2.00",
                ),
                None,
            ),
        ],
    ),
)

#: Each item's history begins `ordered`; these purchases arrived (all but
#: the ones named in `NEVER_ARRIVED`).
NEVER_ARRIVED = {"frn2003": "missing"}


def _vendors_and_places(demo: Demo) -> None:
    """The vendors, sellers and storage locations."""
    api = demo.api
    for key, name, url, kind in VENDORS:
        demo.vendors[key] = api.post(
            "/vendors", {"name": name, "url": url, "vendor_kind": kind}
        )["id"]
    for key, name, url, contact, email, phone in SELLERS:
        demo.sellers[key] = api.post(
            "/sellers",
            {
                "name": name,
                "store_url": url,
                "contact_name": contact,
                "contact_email": email,
                "contact_phone": phone,
            },
        )["id"]
    for key, body in PLACES:
        demo.places[key] = api.post("/storage-locations", body)["id"]


def _photograph(demo: Demo, key: str, drawing: tuple[str, ...]) -> None:
    """File a front and a back drawing against the item, the front primary."""
    kind, top, middle, tone = drawing
    draw = art.note if kind == "note" else art.coin
    for role, primary in (("obverse", True), ("reverse", False)):
        picture = (
            draw(top, middle, tone)
            if primary
            else draw("Reverse", middle, tone, side=top)
        )
        demo.api.call(
            "POST",
            "/images",
            files={"file": (f"{key}_{role}.png", picture, "image/png")},
            data={
                "inventory_item_id": str(demo.id(key)),
                "image_role": role,
                "is_primary": "true" if primary else "false",
            },
        )


def _purchases(demo: Demo) -> None:
    """Every purchase, its items, what arrived, and the photographs."""
    api = demo.api
    for key, vendor, seller, number, days, arrived, place, items in PURCHASES:
        body: dict[str, Any] = {
            "vendor_id": demo.vendors[vendor],
            "order_number": number,
            "ordered_on": demo.ago(days),
            "seller_id": demo.sellers[seller] if seller else None,
        }
        if vendor == "ebay":
            body["source_url"] = "https://www.ebay.com/vod/FetchOrderDetails"
        if key == "estate":
            body["notes"] = "Bought from a neighbor's estate, one envelope."
        purchase = api.post("/purchase-orders", body)
        demo.purchases[key] = purchase["id"]
        for item_key, fields, _photo in items:
            created = api.post(
                "/inventory", {"purchase_order_id": purchase["id"], **fields}
            )
            demo.items[item_key] = created
        if arrived is None:
            continue
        api.post(
            "/inventory/receive",
            {
                "item_ids": [demo.id(k) for k, _f, _p in items],
                "outcome": "received",
                "arrived_on": demo.ago(arrived),
                "storage_location_id": demo.places[place],
            },
        )
    for item_key, outcome in NEVER_ARRIVED.items():
        api.post(
            "/inventory/receive",
            {
                "item_ids": [demo.id(item_key)],
                "outcome": outcome,
                "note": "Tracking shows delivered; not in the mailbox.",
            },
        )
    for _key, _v, _s, _n, _d, _a, _p, items in PURCHASES:
        for item_key, _fields, photo in items:
            if photo is not None:
                _photograph(demo, item_key, photo)
    api.call(
        "PUT",
        f"/inventory/{demo.id('franklin')}/errors",
        {"errors": [{"error_type": "off_center", "details": "10% at 3 o'clock"}]},
    )
    for name in ("unfiled_obverse", "unfiled_reverse"):
        picture = art.coin(
            "1964",
            "Kennedy Half",
            "silver",
            side="" if "obverse" in name else "Reverse",
        )
        api.call(
            "POST",
            "/images",
            files={"file": (f"IMG_20{name[-7:-3]}.png", picture, "image/png")},
        )


# --- selling -------------------------------------------------------------------------

PLATFORMS = (
    {
        "code": "ebay",
        "name": "eBay",
        "kind": "marketplace",
        "account_handle": "democoinshop",
        "commission_rate": "13.25",
        "processing_fixed": "0.30",
        "listing_url_template": "https://www.ebay.com/itm/{external_id}",
        "notes": "Store subscription, basic tier.",
    },
    {
        "code": "northgate",
        "name": "Northgate Auction Gallery",
        "kind": "auction_house",
        "account_handle": "Consignor 4410",
        "commission_rate": "10",
        "listing_fee": "5.00",
        "notes": "Seller's commission falls to 8% above $1,000.",
    },
    {
        "code": "livebid",
        "name": "LiveBid Demo",
        "kind": "live_auction",
        "account_handle": "democoinshop",
        "commission_rate": "8",
        "processing_rate": "2.9",
        "processing_fixed": "0.30",
    },
)

#: Store listings: item key, price, and the title a buyer sees.
STORE = (
    ("m1885o", "112.00", "1885-O Morgan Dollar NGC MS63"),
    ("p1922", "62.00", "1922 Peace Dollar MS62"),
    ("p1923", "64.00", "1923 Peace Dollar MS63"),
    ("ase", "45.00", "2026 American Silver Eagle, 1 oz"),
    ("round", "39.00", "1 oz Silver Round"),
    ("age", "365.00", "2024 American Gold Eagle, 1/10 oz"),
    ("lib1904", "2650.00", "1904 $20 Liberty Head Double Eagle PCGS MS62"),
    ("sc1957", "32.00", "1957-B $1 Silver Certificate Star Note PMG 64 EPQ"),
    ("sc1935", "15.00", "1935-G $1 Silver Certificate"),
    ("usn1963", "22.00", "1963 $2 United States Note, Red Seal"),
    ("ihc1909", "95.00", "1909 Indian Head Cent MS64 RB"),
    ("wlh1942", "34.00", "1942 Walking Liberty Half Dollar"),
    # Last, so the shop shows it first.
    ("m1881s", "189.00", "1881-S Morgan Dollar PCGS MS64"),
)

#: eBay fixed-price listings: item key, price, title, made-up listing number.
EBAY = (
    ("m1921", "72.00", "1921 Morgan Silver Dollar AU58", "DEMO-110001"),
    ("frn2017", "19.00", "2017-A $1 FRN Low Serial B00001234C", "DEMO-110002"),
    ("slq1916", "139.00", "1917 Standing Liberty Quarter Type 1 VF30", "DEMO-110003"),
    ("frn1977", "36.00", "1977-A $20 Federal Reserve Note", "DEMO-110004"),
)

FEES_EBAY = [
    {"kind": "commission", "amount": "9.54"},
    {"kind": "processing", "amount": "0.30"},
    {"kind": "shipping_label", "amount": "4.85"},
]


def _offer(
    demo: Demo,
    venue: str,
    key: str,
    price: str,
    title: str,
    number: str | None = None,
    fmt: str = "fixed_price",
) -> dict[str, Any]:
    """Offer one item and remember its listing."""
    listing = demo.api.post(
        "/offers",
        {
            "venue": venue,
            "format": fmt,
            "items": [
                {
                    "item_id": demo.id(key),
                    "price": price,
                    "title": title,
                    "description": f"{title}. As pictured; ships insured.",
                    "external_id": number,
                }
            ],
        },
    )["listings"][0]
    demo.listings[key] = listing
    return dict(listing)


def _lot(
    demo: Demo, key: str, title: str, members: list[str], description: str = ""
) -> int:
    """An assembling sales lot holding these items."""
    lot = demo.api.post("/sales-lots", {"title": title, "description": description})
    demo.api.patch(
        f"/sales-lots/{lot['id']}",
        {"add_item_ids": [demo.id(m) for m in members], "version": lot["version"]},
    )
    demo.lots[key] = lot["id"]
    return int(lot["id"])


def _selling(demo: Demo) -> None:
    """Platforms, spot prices, offers, lots and auctions."""
    api = demo.api
    for platform in PLATFORMS:
        body: dict[str, object] = dict(platform)
        for rate in ("commission_rate", "processing_rate"):
            if rate in body:
                body[rate] = str(Decimal(str(body[rate])) / 100)
        body["terms_as_of"] = demo.ago(30)
        if body["code"] == "ebay":
            body["vendor_id"] = demo.vendors["ebay"]
        if body["code"] == "northgate":
            body["vendor_id"] = demo.vendors["northgate"]
        api.post("/sales-venues", body)
    for metal, price in (
        ("silver", "31.50"),
        ("gold", "2650.00"),
        ("platinum", "980.00"),
        ("copper", "0.2875"),
    ):
        api.post("/metal-prices", {"metal": metal, "price_per_ozt": price})

    # The lot first, so the shop lists it last: it has no photograph.
    proofs = _lot(
        demo,
        "proofs",
        "Three 1980s proof sets",
        ["proof1980", "proof1982", "proof1984"],
        "Three original government proof sets, boxes included.",
    )
    api.post(
        "/offers",
        {
            "venue": "store",
            "lot_id": proofs,
            "price": "36.00",
            "title": "Three 1980s US Proof Sets",
            "description": "1980, 1982 and 1984, in their boxes.",
        },
    )
    for key, price, title in STORE:
        _offer(demo, "store", key, price, title)
    for key, price, title, number in EBAY:
        _offer(demo, "ebay", key, price, title, number)
    _offer(
        demo,
        "ebay",
        "frn1995",
        "12.00",
        "1995 $1 FRN Radar Serial D12344321A",
        "DEMO-110005",
        fmt="auction",
    )
    # A sale recorded from eBay, which ends that listing.
    api.post(
        f"/listings/{demo.listings['m1921']['id']}/sale",
        {
            "price": "72.00",
            "buyer_username": "coinfan_demo",
            "external_order_id": "DEMO-ORDER-7731",
            "fees": FEES_EBAY,
        },
    )

    # Lots: one assembling, one offered in the store, one sold, one dissolved.
    _lot(
        demo,
        "dollars",
        "Classic silver dollar pair",
        ["m1893", "p1925"],
        "An 1893 Morgan and a 1925 Peace dollar, both circulated.",
    )
    halves = _lot(
        demo, "halves", "Two Walking Liberty halves", ["wlh1943", "franklin"], ""
    )
    sold = api.post(
        "/offers",
        {
            "venue": "ebay",
            "lot_id": halves,
            "price": "98.00",
            "title": "Walking Liberty + Franklin half lot",
            "external_id": "DEMO-110006",
        },
    )["listings"][0]
    api.post(
        f"/listings/{sold['id']}/sale",
        {
            "price": "98.00",
            "buyer_username": "halfdollarhunter",
            "external_order_id": "DEMO-ORDER-7745",
            "fees": [{"kind": "commission", "amount": "12.99"}],
        },
    )
    cents = _lot(demo, "cents", "Indian cent pair", ["ihc1899", "ihc1902"])
    ended = api.post(
        "/offers",
        {
            "venue": "ebay",
            "lot_id": cents,
            "price": "9.00",
            "title": "Two Indian Head cents",
            "external_id": "DEMO-110007",
        },
    )["listings"][0]
    api.post(f"/listings/{ended['id']}/end")

    # Auctions: one settled at the house, one still a draft.
    venue = "northgate"
    settled = api.post(
        "/auctions",
        {
            "venue": venue,
            "title": "Autumn Coin & Currency Sale",
            "external_id": "NAG-61",
            "starts_at": f"{demo.ago(21)}T18:00:00",
            "ends_at": f"{demo.ago(20)}T21:00:00",
            "notes": "Catalog closes three weeks before the sale.",
        },
    )
    api.post(
        f"/auctions/{settled['id']}/lots",
        {
            "lot_number": "1042",
            "item_id": demo.id("bar10"),
            "reserve": "300.00",
            "price": "250.00",
        },
    )
    api.post(
        f"/auctions/{settled['id']}/lots",
        {"lot_number": "1043", "item_id": demo.id("token"), "reserve": "25.00"},
    )
    api.post(f"/auctions/{settled['id']}/schedule")
    lots = api.post(f"/auctions/{settled['id']}/close")["lots"]
    by_number = {lot["lot_number"]: lot["id"] for lot in lots}
    api.post(
        f"/auctions/{settled['id']}/settle",
        {
            "lines": [
                {
                    "auction_lot_id": by_number["1042"],
                    "result": "sold",
                    "hammer_price": "420.00",
                    "buyer_username": "bidder_2207",
                },
                {"auction_lot_id": by_number["1043"], "result": "unsold"},
            ],
            "fees": [
                {
                    "buyer_username": "bidder_2207",
                    "fees": [
                        {"kind": "commission", "amount": "42.00"},
                        {"kind": "listing", "amount": "5.00"},
                    ],
                }
            ],
        },
    )
    mercs = _lot(
        demo,
        "mercs",
        "Mercury dime pair",
        ["merc1941", "merc1944"],
        "Two Winged Liberty Head dimes, 1941 and 1944-D.",
    )
    draft = api.post(
        "/auctions",
        {
            "venue": venue,
            "title": "Winter Signature Sale",
            "external_id": "NAG-62",
            "starts_at": f"{(demo.today + timedelta(days=24)).isoformat()}T18:00:00",
            "ends_at": f"{(demo.today + timedelta(days=25)).isoformat()}T21:00:00",
        },
    )
    api.post(
        f"/auctions/{draft['id']}/lots",
        {
            "lot_number": "2101",
            "item_id": demo.id("medal"),
            "reserve": "20.00",
            "price": "10.00",
        },
    )
    api.post(
        f"/auctions/{draft['id']}/lots",
        {"lot_number": "2102", "lot_id": mercs, "reserve": "8.00"},
    )


# --- people and orders -------------------------------------------------------

PEOPLE = (
    (
        CUSTOMER_EMAIL,
        "Alex Sample",
        "+12125550123",
        {
            "line1": "12 Example Street",
            "line2": "Apt 4",
            "city": "Springfield",
            "region": "IL",
            "postal_code": "62701",
            "country": "US",
        },
    ),
    (
        SECOND_CUSTOMER_EMAIL,
        "Jordan Demo",
        "+16175550142",
        {
            "line1": "88 Sample Road",
            "city": "Riverton",
            "region": "WY",
            "postal_code": "82501",
            "country": "US",
        },
    ),
)


def _people(demo: Demo) -> dict[str, str]:
    """Shop customers who registered and ordered; a second manager; a retired one.

    Returns the customers' passwords, by email, for signing in to the shop.
    """
    api = demo.api
    admin_headers = api.headers
    passwords: dict[str, str] = {}
    customer_ids: dict[str, int] = {}
    for email, name, phone, address in PEOPLE:
        password = secrets.token_urlsafe(12)
        passwords[email] = password
        api.headers = {}
        for limit in throttle.ALL_LIMITS:
            limit.clear()
        user = api.post(
            "/auth/register", {"email": email, "password": password, "full_name": name}
        )
        api.headers = admin_headers
        customer = api.post(f"/users/{user['id']}/customer")
        customer_ids[email] = customer["id"]
        api.patch(f"/customers/{customer['id']}", {"phone": phone})
        api.post(f"/customers/{customer['id']}/addresses", address)
    api.post(
        "/users",
        {
            "email": "sam.manager@example.com",
            "full_name": "Sam Manager",
            "role": "manager",
            "password": secrets.token_urlsafe(12),
        },
    )
    former = api.post(
        "/users",
        {
            "email": "former.helper@example.org",
            "full_name": "Former Helper",
            "role": "customer",
            "password": secrets.token_urlsafe(12),
        },
    )
    api.patch(f"/users/{former['id']}", {"is_active": False})

    # Shop orders, placed by the customers themselves.
    api.sign_in(CUSTOMER_EMAIL, passwords[CUSTOMER_EMAIL])
    first = api.post(
        "/orders",
        {
            "items": [
                {"listing_id": demo.listings["p1922"]["id"], "quantity": 1},
                {"listing_id": demo.listings["sc1935"]["id"], "quantity": 1},
            ]
        },
    )
    api.sign_in(SECOND_CUSTOMER_EMAIL, passwords[SECOND_CUSTOMER_EMAIL])
    second = api.post(
        "/orders",
        {"items": [{"listing_id": demo.listings["wlh1942"]["id"], "quantity": 1}]},
    )
    api.headers = admin_headers
    version = first["version"]
    for status in ("paid", "packed", "shipped", "delivered"):
        version = api.patch(
            f"/orders/{first['id']}", {"status": status, "version": version}
        )["version"]
    api.patch(
        f"/orders/{second['id']}", {"status": "paid", "version": second["version"]}
    )
    # One taken by telephone, still pending.
    api.post(
        f"/customers/{customer_ids[SECOND_CUSTOMER_EMAIL]}/orders",
        {
            "items": [
                {
                    "listing_id": demo.listings["round"]["id"],
                    "quantity": 1,
                    "unit_price": "37.00",
                }
            ],
            "notes": "Taken by telephone; pays by check.",
        },
    )
    return passwords


def _labels(demo: Demo) -> None:
    """One printed sheet whose labels wait to be applied, then a print batch.

    The sheet is printed from the batch, with the lines the run gives, as
    the Labels page does when its Yes is answered.
    """
    api = demo.api
    printed = [demo.id(k) for k in ("p1923", "usn1963", "frn1995", "mint1999")]
    api.post("/labels/batch", {"item_ids": printed})
    runs = api.get("/labels/run?source=batch")["runs"]
    labels = [
        {"item_id": label["item_id"], "lines": label["lines"]}
        for run in runs
        for label in run["labels"]
    ]
    api.post("/labels/printed", {"source": "batch", "labels": labels})
    api.post(
        "/labels/batch",
        {"item_ids": [demo.id(k) for k in ("p1925", "ihc1909", "frn2013")]},
    )


#: How many days ago each order was placed, oldest order first. The API
#: stamps everything with the moment it is entered; a shop's orders are
#: spread over weeks, and the Sales report groups them by month.
ORDER_AGES = (24, 18, 13, 8, 4, 1)

#: How long before the first order the listings went up.
LISTED_AGE = 25

_BACKDATE = (
    # Listings, and their history, went up before anything sold.
    # The first listed the longest ago, a day apart.
    """UPDATE listing_status_history h SET changed_at = h.changed_at
         - make_interval(
             days => :listed + (SELECT max(id) FROM listing) - h.listing_id
           )""",
    """UPDATE listing SET listed_at = listed_at
         - make_interval(days => :listed + (SELECT max(id) FROM listing) - id)""",
    # Each order on its own day; each later change to it a day after the last.
    """UPDATE sales_order o SET placed_at = o.placed_at - make_interval(days => a.age)
       FROM (SELECT id, (:ages)[row_number() OVER (ORDER BY id)] AS age
             FROM sales_order) a WHERE a.id = o.id""",
    """UPDATE sales_order_change c
       SET changed_at = o.placed_at + make_interval(days => LEAST(cs.step, a.age)::int)
       FROM (SELECT id, sales_order_id,
                    row_number() OVER (PARTITION BY sales_order_id ORDER BY id) - 1
                      AS step
             FROM sales_order_change) cs
       JOIN sales_order o ON o.id = cs.sales_order_id
       JOIN (SELECT id, (:ages)[row_number() OVER (ORDER BY id)] AS age
             FROM sales_order) a ON a.id = o.id
       WHERE c.id = cs.id""",
    """UPDATE sales_order_item i SET snapshot_at = o.placed_at
       FROM sales_order o WHERE o.id = i.sales_order_id
       AND i.snapshot_at IS NOT NULL""",
    # A listing that ended with a sale ended when the order was placed;
    # one ended unsold, a week after it went up.
    """UPDATE listing l SET ended_at = COALESCE(
         (SELECT max(o.placed_at) FROM sales_order_item i
          JOIN sales_order o ON o.id = i.sales_order_id WHERE i.listing_id = l.id),
         l.listed_at + interval '7 days')
       WHERE l.ended_at IS NOT NULL""",
    """UPDATE listing_status_history h SET changed_at = l.ended_at
       FROM listing l WHERE l.id = h.listing_id AND h.to_status = 'ended'""",
)


def _backdate() -> None:
    """Spread the orders and listings over the weeks before today."""
    with SessionLocal() as session:
        for statement in _BACKDATE:
            session.execute(
                text(statement),
                {"listed": LISTED_AGE, "ages": list(ORDER_AGES)},
            )
        session.commit()


def build(admin_password: str) -> dict[str, str]:
    """Enter the whole collection. Returns the shop customers' passwords.

    Nothing is split: the split dialog's picture opens on the four quarters
    and is closed without splitting them.
    """
    set_password(ADMIN_EMAIL, admin_password, UserRole.manager)
    api = Api()
    with api.client:
        api.sign_in(ADMIN_EMAIL, admin_password)
        demo = Demo(api)
        _vendors_and_places(demo)
        _purchases(demo)
        _selling(demo)
        passwords = _people(demo)
        _labels(demo)
    _backdate()
    return passwords
