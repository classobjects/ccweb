# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Every picture in docs/ui-guide.md: where it is, how it is set up, how framed.

`PICTURES` is the whole list. Adding a picture is one `Picture(...)`: its
file name, the address it opens, who is signed in, the steps that put the
screen in the state shown (a function of `Shooter`), the window size, and
the frame:

- `page`: the window as it is.
- `first` / `last`: a list too long for the window, shown by its first rows
  and its last (`_1` and `_2`), each cut at a row's edge. `rows` names the
  rows; the console's header stays at the top of `last`.
- `whole`: a long form, the window made tall enough to show all of it.
- `dialog`: the open dialog alone, made tall enough to show all of it.

The rules come from the owner: light theme; a list by its first and last
rows; a form whole, never cut.
"""

from __future__ import annotations

import json
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import httpx
from PIL import Image

from .browser import BrowserError, Page
from .stack import ADMIN_EMAIL, REPO_ROOT, Guide

#: Where the guide's pictures live.
OUT = REPO_ROOT / "docs" / "images" / "ui-guide"

Frame = Literal["page", "first", "last", "whole", "dialog"]
Who = Literal["admin", "customer", "nobody"]

#: The rows of an ordinary console table.
TABLE_ROWS = "main.content tbody > tr:not(.item-second):not(.item-detail)"

#: The purchase still on its way, which Receiving and an open purchase show.
PARCEL = "12-33333-30003"

#: The open dialog the `dialog` frame shows: the innermost one open.
OPEN_DIALOG = "dialog[open]"


class Shooter:
    """The browser, signed in as needed, and the steps a setup is made of."""

    def __init__(self, guide: Guide, page: Page, passwords: dict[str, str]) -> None:
        """Sign in each account once, through the API."""
        self.guide = guide
        self.page = page
        self.tokens = {
            "admin": self._login(ADMIN_EMAIL, passwords[ADMIN_EMAIL]),
            "customer": self._login(*_customer(passwords)),
        }

    def _login(self, email: str, password: str) -> dict[str, str]:
        """A token pair for the account, as the sign-in page stores it."""
        answer = httpx.post(
            f"{self.guide.console}/api/auth/login",
            data={"username": email, "password": password},
            timeout=30,
        )
        answer.raise_for_status()
        return dict(answer.json())

    def api(self, path: str) -> object:
        """GET a console API path as the manager."""
        answer = httpx.get(
            f"{self.guide.console}/api{path}",
            headers={"Authorization": f"Bearer {self.tokens['admin']['access_token']}"},
            timeout=30,
        )
        answer.raise_for_status()
        return answer.json()

    def purchase_id(self, order_number: str) -> int:
        """The id of the purchase with this order number."""
        rows = self.api("/purchase-orders")
        assert isinstance(rows, list)
        for row in rows:
            if row["order_number"] == order_number:
                return int(row["id"])
        raise BrowserError(f"no purchase {order_number}")

    def open(self, route: str, who: Who) -> None:
        """Open a route on the frontend as `who`, and wait for it to settle."""
        page = self.page
        if page.evaluate("location.origin") != self.guide.console:
            page.goto(f"{self.guide.console}/management/login")
        # Each picture starts with an empty cart; one that needs a cart fills it.
        page.evaluate("localStorage.removeItem('ccwebdb.cart.v2')")
        if who == "nobody":
            page.evaluate("localStorage.removeItem('ccwebdb.tokens')")
        else:
            tokens = json.dumps(self.tokens[who])
            page.evaluate(
                f"localStorage.setItem('ccwebdb.tokens', {json.dumps(tokens)})"
            )
        if "{parcel}" in route:
            route = route.replace("{parcel}", str(self.purchase_id(PARCEL)))
        page.goto(self.guide.console + route)
        page.settle(1.2)

    # -- steps a setup is made of --------------------------------------------

    def click(self, spec: str) -> None:
        """Click, then let the page settle."""
        self.page.click(spec)
        self.page.settle(0.6)

    def type(self, spec: str, text: str) -> None:
        """Type into a field."""
        self.page.type(spec, text)

    def choose(self, spec: str, label: str) -> None:
        """Pick an option of a select, then let the page settle."""
        self.page.choose(spec, label)
        self.page.settle(0.6)

    def calm(self) -> None:
        """Take focus off any field, so the help band says nothing in particular."""
        self.page.blur()
        time.sleep(0.2)


def _customer(passwords: dict[str, str]) -> tuple[str, str]:
    """The shop customer's email and password."""
    for email, password in passwords.items():
        if email != ADMIN_EMAIL:
            return email, password
    raise BrowserError("no customer password")


Setup = Callable[[Shooter], None]


@dataclass(frozen=True)
class Picture:
    """One picture: what it shows and how it is taken."""

    name: str
    route: str
    setup: Setup | None = None
    frame: Frame = "page"
    who: Who = "admin"
    width: int = 1400
    height: int = 900
    rows: str = TABLE_ROWS
    mobile: bool = False


# --- setups ---------------------------------------------------------------------


def _open_menu(s: Shooter) -> None:
    s.click("nav button >> 2")


def _no_grade(s: Shooter) -> None:
    s.click("starts=no grade (")


def _tick_three(s: Shooter) -> None:
    for index in (-1, -2, -3):
        s.page.click(f"{TABLE_ROWS} input[type=checkbox] >> {index}")
    s.page.settle(0.6)
    s.page.evaluate("document.querySelector('main.content').scrollTop = 0")


def _review(s: Shooter) -> None:
    s.click("starts=Review these")


def _edit(code: str) -> Setup:
    def setup(s: Shooter) -> None:
        s.click(f"text={code}")
        s.page.wait_until_shown(OPEN_DIALOG)
        s.page.settle(1.0)
        s.calm()

    return setup


def _split(s: Shooter) -> None:
    _edit("CC-000024")(s)
    s.click("text=Split into pieces...")
    inner = "dialog[open] dialog[open]"
    for index, year in enumerate(("1964", "1965", "1966", "1967")):
        s.page.type(f"{inner} input[aria-label^='Year'] >> {index}", year)
        s.page.choose(f"{inner} tbody select >> {index}", "Washington Quarter")
    s.calm()


def _existing_purchase(s: Shooter) -> None:
    s.click("text=Add to an existing purchase")


def _find_parcel(s: Shooter) -> None:
    s.type("main.content input:not([type=radio]) >> 0", PARCEL)
    s.click("text=Find")
    s.calm()


def _receive_one(s: Shooter) -> None:
    s.click("text=CC-000041")
    s.page.wait_until_shown(OPEN_DIALOG)
    s.calm()


def _receive_all(s: Shooter) -> None:
    s.click("starts=Receive all")
    s.page.wait_until_shown(OPEN_DIALOG)
    s.calm()


def _offer(s: Shooter) -> None:
    s.type("main.content input[placeholder^='CC-']", "CC-000028")
    s.page.key("Enter")
    s.page.settle(1.0)
    if s.page.exists(OPEN_DIALOG):
        s.page.key("Escape")
        s.page.settle(0.4)
    s.page.click(f"{TABLE_ROWS} input[type=checkbox] >> 0")
    s.click("starts=Offer for sale")
    s.page.wait_until_shown(OPEN_DIALOG)
    s.choose(f"{OPEN_DIALOG} select >> 0", "Web store")
    s.type(f"{OPEN_DIALOG} input[aria-label^='Price'] >> 0", "24.00")
    s.calm()


def _record_sale(s: Shooter) -> None:
    s.click("starts=Record sale")
    s.page.wait_until_shown(OPEN_DIALOG)
    s.type(f"{OPEN_DIALOG} input >> 0", "19.00")
    s.type(f"{OPEN_DIALOG} input >> 1", "notecollector_demo")
    s.type(f"{OPEN_DIALOG} input >> 2", "DEMO-ORDER-7802")
    s.type(f"{OPEN_DIALOG} input >> 3", "2.52")
    s.type(f"{OPEN_DIALOG} input >> 4", "0.30")
    s.calm()


def _view(title: str) -> Setup:
    def setup(s: Shooter) -> None:
        index = 0 if title == "Winter Signature Sale" else 1
        s.click(f"text=View >> {index}")
        s.page.settle(1.0)

    return setup


def _new_order(s: Shooter) -> None:
    s.click("text=New order")
    s.page.wait_until_shown(OPEN_DIALOG)
    s.type(f"{OPEN_DIALOG} input >> 0", "Jordan")
    s.type(f"{OPEN_DIALOG} input >> 1", "Silver Eagle")
    s.click("text=Search")
    s.calm()


def _history(s: Shooter) -> None:
    s.click("text=History >> 2")
    s.page.wait_until_shown(OPEN_DIALOG)
    s.calm()


def _customers(s: Shooter) -> None:
    s.click("text=Customers")


def _storage_forms(s: Shooter) -> None:
    s.choose("main.content select >> 0", "storage_form")
    s.click("[aria-label='Actions for Album']")


def _shop_find(s: Shooter, words: str) -> None:
    """Search the shop's catalog, from its first page."""
    s.page.goto(f"{s.guide.console}/")
    s.page.settle(1.0)
    s.type("main input[type=search], main input[placeholder^='Search']", words)
    s.page.settle(1.5)


def _shop_detail(s: Shooter) -> None:
    _shop_find(s, "1881-S")
    s.click("main a[href*='/coins/']")
    s.page.settle(1.0)


def _shop_cart(s: Shooter) -> None:
    s.page.evaluate("localStorage.removeItem('ccwebdb.cart.v2')")
    for words in ("2026 American Silver Eagle", "1923 Peace Dollar"):
        _shop_find(s, words)
        s.click("text=Add to cart >> 0")
    s.page.goto(f"{s.guide.console}/cart")
    s.page.settle(1.0)


# --- the pictures -----------------------------------------------------------------

M = "/management"

PICTURES: list[Picture] = [
    Picture("login", f"{M}/login", who="nobody"),
    Picture("menu", f"{M}/sales", _open_menu),
    Picture("coins_1", f"{M}/inventory/coins", frame="first"),
    Picture("coins_2", f"{M}/inventory/coins", frame="last"),
    Picture("currency_1", f"{M}/inventory/currency", frame="first"),
    Picture("currency_2", f"{M}/inventory/currency", frame="last"),
    Picture("coins_issue_1", f"{M}/inventory/coins", _no_grade, frame="first"),
    Picture("coins_issue_2", f"{M}/inventory/coins", _no_grade, frame="last"),
    Picture("coins_bulk_1", f"{M}/inventory/coins", _tick_three, frame="first"),
    Picture("coins_bulk_2", f"{M}/inventory/coins", _tick_three, frame="last"),
    Picture("review", f"{M}/inventory/coins", _review),
    Picture(
        "editor_coin",
        f"{M}/inventory/coins",
        _edit("CC-000001"),
        frame="dialog",
        width=1008,
    ),
    Picture(
        "editor_note",
        f"{M}/inventory/currency",
        _edit("CC-000013"),
        frame="dialog",
        width=1008,
    ),
    Picture("split_dialog", f"{M}/inventory/coins", _split, frame="dialog", width=1008),
    Picture("labels", f"{M}/labels", frame="whole"),
    Picture("photos", f"{M}/photos"),
    Picture("order_lookup", f"{M}/order-lookup"),
    Picture("purchases", f"{M}/purchases"),
    Picture("purchase_existing", f"{M}/purchases", _existing_purchase),
    Picture("purchase_open", f"{M}/purchases?order={{parcel}}", frame="whole"),
    Picture("receive_found", f"{M}/receiving", _find_parcel),
    Picture("receive_order", f"{M}/receiving?order={{parcel}}"),
    Picture(
        "receive_dialog",
        f"{M}/receiving?order={{parcel}}",
        _receive_one,
        frame="dialog",
        width=1008,
    ),
    Picture(
        "receive_all",
        f"{M}/receiving?order={{parcel}}",
        _receive_all,
        frame="dialog",
        width=1008,
    ),
    Picture("listings_1", f"{M}/listings", frame="first"),
    Picture("listings_2", f"{M}/listings", frame="last"),
    Picture("offer_dialog", f"{M}/inventory/coins", _offer, frame="dialog"),
    Picture("record_sale", f"{M}/listings", _record_sale, frame="dialog", width=1008),
    Picture(
        "lots_1",
        f"{M}/lots",
        frame="first",
        rows="main.content section, main.content .card, main.content tbody tr",
    ),
    Picture(
        "lots_2",
        f"{M}/lots",
        frame="last",
        rows="main.content section, main.content .card, main.content tbody tr",
    ),
    Picture("auctions", f"{M}/auctions"),
    Picture(
        "auction_draft", f"{M}/auctions", _view("Winter Signature Sale"), frame="whole"
    ),
    Picture(
        "auction_settled",
        f"{M}/auctions",
        _view("Autumn Coin & Currency Sale"),
        frame="whole",
    ),
    Picture("sales", f"{M}/sales"),
    Picture("sales_new", f"{M}/sales", _new_order, frame="dialog", width=1008),
    Picture("sales_history", f"{M}/sales", _history, frame="dialog", width=1008),
    Picture("platforms", f"{M}/platforms", frame="whole"),
    Picture("spot_prices", f"{M}/spot-prices"),
    Picture("reports_1", f"{M}/reports", frame="first", rows="main.content a"),
    Picture("reports_2", f"{M}/reports", frame="last", rows="main.content a"),
    Picture("report_cb_holdings_1", f"{M}/reports?report=cb_holdings", frame="first"),
    Picture("report_cb_holdings_2", f"{M}/reports?report=cb_holdings", frame="last"),
    Picture("report_cb_metal", f"{M}/reports?report=cb_metal"),
    Picture("report_dq_issues_1", f"{M}/reports?report=dq_issues", frame="first"),
    Picture("report_dq_issues_2", f"{M}/reports?report=dq_issues", frame="last"),
    Picture("report_pr_outstanding", f"{M}/reports?report=pr_outstanding"),
    Picture("report_sl_ready", f"{M}/reports?report=sl_ready"),
    Picture("report_sl_sales", f"{M}/reports?report=sl_sales"),
    Picture("people", f"{M}/people"),
    Picture("people_customers", f"{M}/people", _customers),
    Picture("vocab_storage_form_1", f"{M}/vocabularies", _storage_forms, frame="first"),
    Picture("vocab_storage_form_2", f"{M}/vocabularies", _storage_forms, frame="last"),
    Picture("lists", f"{M}/lists"),
    Picture("lists_sellers", f"{M}/lists?tab=sellers"),
    Picture("lists_vendors", f"{M}/lists?tab=vendors"),
    Picture("lists_locations", f"{M}/lists?tab=locations"),
    Picture(
        "shop_catalog_1",
        "/",
        frame="first",
        who="nobody",
        rows="main .card, main article",
    ),
    Picture(
        "shop_catalog_2",
        "/",
        frame="last",
        who="nobody",
        rows="main .card, main article",
    ),
    Picture("shop_detail", "/", _shop_detail, frame="whole", who="nobody"),
    Picture("shop_cart", "/", _shop_cart, who="customer"),
    Picture("shop_orders", "/orders", who="customer"),
    Picture("shop_login", "/login", who="nobody"),
    Picture("shop_register", "/register", who="nobody"),
    Picture("shop_phone", "/", who="nobody", width=390, height=844, mobile=True),
]


# --- framing ----------------------------------------------------------------------

#: The element that scrolls: the console's content pane, else the document.
_SCROLLER = (
    "(document.querySelector('main.content') && "
    "document.querySelector('main.content').scrollHeight > "
    "document.querySelector('main.content').clientHeight) ? "
    "document.querySelector('main.content') : document.scrollingElement"
)


def _overflow(page: Page) -> int:
    """How much taller the scrolling content is than its window."""
    (extra,) = page.numbers(
        f"() => {{ const s = {_SCROLLER}; return [s.scrollHeight - s.clientHeight]; }}"
    )
    return int(extra)


def _scroll(page: Page, to: Literal["top", "bottom"]) -> None:
    """Scroll the content to its top or its bottom."""
    where = "0" if to == "top" else "s.scrollHeight"
    page.evaluate(f"(() => {{ const s = {_SCROLLER}; s.scrollTop = {where}; }})()")
    time.sleep(0.4)


def _row_cuts(page: Page, rows: str) -> list[float]:
    """Where the list may be cut cleanly: atop each row, and below the last."""
    return page.numbers(
        """(sel) => {
          const found = [...document.querySelectorAll(sel)]
            .filter((el) => el.getClientRects().length);
          const cuts = found.map((el) => el.getBoundingClientRect().top);
          if (found.length) {
            const end = found[found.length - 1].parentElement;
            cuts.push(end.getBoundingClientRect().bottom);
          }
          return cuts;
        }""",
        rows,
    )


def _band(page: Page) -> tuple[float, float]:
    """Where the content's visible window starts and ends, above the help band."""
    top, bottom = page.numbers(
        """() => {
          const pane = document.querySelector('main.content');
          const main = pane && pane.scrollHeight > pane.clientHeight ? pane : null;
          const band = document.querySelector('footer.help-bar');
          const top = main ? main.getBoundingClientRect().top : 0;
          const bottom = band ? band.getBoundingClientRect().top : innerHeight;
          return [top, bottom];
        }"""
    )
    return top, bottom


def _first(page: Page, rows: str) -> Image.Image:
    """The top of a long list, cut below the last whole row in view."""
    _scroll(page, "top")
    image = page.shot()
    _top, bottom = _band(page)
    fits = [y for y in _row_cuts(page, rows) if 0 < y <= bottom + 0.5]
    cut = max(fits) if fits else bottom
    return image.crop((0, 0, image.width, min(image.height, round(cut))))


def _last(page: Page, rows: str) -> Image.Image:
    """The end of a long list, cut above the first whole row; the header kept."""
    _scroll(page, "bottom")
    image = page.shot()
    top, _bottom = _band(page)
    starts = [y for y in _row_cuts(page, rows) if y >= top - 0.5]
    first = round(min(starts)) if starts else round(top)
    if top <= 0:
        return image.crop((0, first, image.width, image.height))
    if first <= top + 1:
        return image
    head = image.crop((0, 0, image.width, round(top)))
    rest = image.crop((0, first, image.width, image.height))
    joined = Image.new("RGB", (image.width, head.height + rest.height))
    joined.paste(head, (0, 0))
    joined.paste(rest, (0, head.height))
    return joined


def _whole(page: Page, picture: Picture) -> Image.Image:
    """The page made tall enough that nothing scrolls."""
    extra = _overflow(page)
    if extra > 0:
        page.viewport(picture.width, picture.height + extra, mobile=picture.mobile)
        time.sleep(0.6)
        extra = _overflow(page)
        if extra > 0:
            page.viewport(picture.width, page.height + extra, mobile=picture.mobile)
            time.sleep(0.6)
    return page.shot()


def _dialog(page: Page, picture: Picture) -> Image.Image:
    """The innermost open dialog, the window made tall enough to show all of it."""
    measure = """() => {
      const all = [...document.querySelectorAll('dialog[open]')];
      const d = all[all.length - 1];
      const inner = [d, ...d.querySelectorAll('*')].filter((e) =>
        e.scrollHeight > e.clientHeight + 1 &&
        /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      const hidden = inner.reduce((n, e) => n + e.scrollHeight - e.clientHeight, 0);
      const r = d.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height, hidden];
    }"""
    for _ in range(3):
        _x, _y, _w, _h, hidden = page.numbers(measure)
        if hidden <= 0:
            break
        page.viewport(picture.width, page.height + int(hidden) + 40)
        time.sleep(0.6)
    x, y, w, h, _hidden = page.numbers(measure)
    return page.shot({"x": x, "y": y, "width": w, "height": h})


def take(shooter: Shooter, picture: Picture) -> Path:
    """Set the picture's screen up, frame it and save it; return where."""
    page = shooter.page
    page.viewport(picture.width, picture.height, mobile=picture.mobile)
    shooter.open(picture.route, picture.who)
    if picture.setup is not None:
        picture.setup(shooter)
        page.settle(0.6)
    if picture.frame == "first":
        image = _first(page, picture.rows)
    elif picture.frame == "last":
        image = _last(page, picture.rows)
    elif picture.frame == "whole":
        image = _whole(page, picture)
    elif picture.frame == "dialog":
        image = _dialog(page, picture)
    else:
        image = page.shot()
    _refuse_a_broken_screen(page, picture)
    path = OUT / f"{picture.name}.png"
    image.save(path, optimize=True)
    return path


def _refuse_a_broken_screen(page: Page, picture: Picture) -> None:
    """Stop rather than save a screen that shows an error or is still loading."""
    text = str(page.evaluate("document.body.innerText"))
    for sign in ("Loading", "Something went wrong", "Page not found", "Not Found"):
        if sign in text:
            raise BrowserError(f"{picture.name}: the screen says {sign!r}")
    errors = page.evaluate(
        "[...document.querySelectorAll('.error')]"
        ".map((e) => e.innerText.trim()).filter(Boolean)"
    )
    if errors:
        raise BrowserError(f"{picture.name}: the screen shows an error: {errors}")


def take_all(guide: Guide, passwords: dict[str, str], names: list[str]) -> int:
    """Take the pictures named, or all; return how many failed."""
    OUT.mkdir(parents=True, exist_ok=True)
    page = Page(guide.browser_port)
    shooter = Shooter(guide, page, passwords)
    failed = 0
    try:
        for picture in PICTURES:
            if names and picture.name not in names:
                continue
            try:
                path = take(shooter, picture)
            except (BrowserError, httpx.HTTPError):
                failed += 1
                print(f"FAILED {picture.name}")
                traceback.print_exc()
                continue
            print(f"{picture.name:<26} {path.relative_to(REPO_ROOT).as_posix()}")
    finally:
        page.close()
    return failed
