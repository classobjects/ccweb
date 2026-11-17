# Reports

*2026-09-29.* Reports answer the questions the owner asks of the collection
as a whole:

- what is missing or wrong in the record;
- what the collection is made of;
- what has been bought and not yet arrived;
- what is on offer and what has sold;
- what it all cost.

They are for the owner and managers only, on the management console's
**Reports** page (`/management/reports`). The same reports run from the
command line, export to a workbook, and print on paper.

Reports read; they never write. Fixing what a report finds is done where it
is always done: the item editor, a bulk edit, Receiving, a pass. Every
report row that names items links there.

## What reports are built on

| Source | Used by reports as |
|---|---|
| `app/issues.py` -- named checks per kind (`no_year`, `no_denomination`, `zero_cost`, `malformed_serial`, `near_duplicate_serial`, ...), each a SQL predicate with a description | `dq_issues` counts and lists by these same checks; a new check is added there, once, and appears in the search, its badges and the reports alike. |
| `app/inventory_search.py` -- `COIN_VIEW` / `CURRENCY_VIEW`, `count_issues`, `MISSING_FIELDS`, the live-row rule stated as SQL text, allowlisted filters | Breakdowns group by the same facets; every drill-down into the inventory is a search URL built from the same filter names; `dq_completeness` and `dq_photos` reuse `MISSING_FIELDS[key].sql` verbatim. |
| `app/live.py` -- `live_item()`, `OUTSTANDING_STATUSES` (`ordered`, `missing`), also read by `routers/acquisitions.py` | Every report reads `live_item()`, and `pr_outstanding` reads both names, so a report and Receiving never disagree about what is live or outstanding. |
| `sales_order_item_share` (amount, fee per item), `sales_order_fee`, `listing`, `auction_lot` | `sl_sales`, `sl_offered` and `sl_auctions` read these; the per-item share is what makes a sale's cost basis and gain computable per item. |
| `metal_price` | `cb_metal`'s melt value reads the latest quoted `price_per_ozt` per metal. Prices are recorded by hand on the console's Spot prices page (`routers/metal_prices.py`; `docs/system-administration.md`), one row per quote. |
| `app/workbook_backup.py` conventions -- NULL as an empty cell, ISO timestamps, column widths | Each report exports to a workbook the same way. |

The aggregates these reports need take milliseconds on the base tables
(`test_reports_performance.py` fails any report over a second). So reports
are computed on request, from the base tables. There is no cache, snapshot
table or materialized view.

## The catalog

Each report has:

- an id, a group, a title and a one-line purpose;
- its parameters, with their defaults;
- its columns;
- a totals row, where a total means something;
- a drill-down, where its rows name items. A drill-down is a link from a
  row to the page that shows or fixes what the row counts.

Groups are listed in the order the console shows them; `GROUP_ORDER` in
`app/reports/registry.py` states it. Within a group, reports keep the order
they are registered in.

Each report below is described by its rows, its totals, its drill-down and
any parameters or notes.

### Collection -- what it is made of

Every Collection report takes the same two parameters, each one code from
the seeded vocabulary or `all`:

- `status`, default `received`;
- `disposition`, default `held`.

So "the collection" reads, by default, as what the owner has actually taken
in and still has. It does not mean everything ever ordered or ever sold.

- **`cb_holdings` -- Holdings.**
  - Rows: kind x denomination, with items, pieces and total cost.
  - Totals: a subtotal row (`All <kind>`) after each kind's denominations,
    and an overall total.
  - Drill: a row drills to that kind's search, narrowed to the
    denomination. Where the kind can carry a denomination and none is
    recorded, it narrows by `missing=denomination` instead. A subtotal row
    drills to the kind alone.
- **`cb_designs` -- Coins by design.**
  - Rows: design series held, across every non-currency kind, with items,
    year span and total cost. Rows follow the series vocabulary's own order
    (then label), with "No series" last.
  - Currency is left out altogether. A series is optional for a note
    (`MISSING_FIELDS["series"]`), so folding notes into "No series" would
    read as a gap in a note that has none.
  - Totals: an overall total.
  - Drill: the coin search narrowed to that series (or `missing=series`).
- **`cb_notes` -- Notes.**
  - Rows: note type x series designation, with items, seal colors present,
    Federal Reserve districts present, and total cost.
  - Star notes and fancy serials are counted from the attribute codes that
    mean them. Each of those columns is shown when the vocabulary carries
    its code; a note explains it when one is left out.
  - Totals: an overall total.
  - Drill: the currency search narrowed to that note type and series
    designation, only when both are known.
- **`cb_grades` -- Grades.**
  - Rows: view (Coins or Currency) x grade band x strike type x grading
    service, with items and total cost. The bands are 1-49, 50-59, 60-64,
    65-70, and "No numeric grade". The service reads "Raw" when there is
    none.
  - Totals: an overall total.
  - Drill: decided from the row's own group-by key, never by running a
    search at report time. It is kept only when no other row would be swept
    into the same search. It is omitted for a band with no numeric grade,
    since no search term states that band.
- **`cb_metal` -- Precious metal.**
  - Rows: metal x form, over items with a recorded fine weight. Columns are
    items, fine troy ounces, total cost, and melt value at the latest
    recorded spot price.
  - Form is Coin, a bullion form, or the kind's own label. Only bullion is
    grouped by its form, so a stray `bullion_form_id` on another kind never
    splits its row.
  - A metal with no recorded price contributes to items, ounces and cost,
    but not to melt. The melt total is empty (not zero) when nothing is
    priced, and a note names every metal left out.
  - Drill: like `cb_grades`, decided structurally, not by a run-time search.
    Currency, and a bullion row with no form, are never drilled.
- **`cb_attributes` -- Attributes and errors.**
  - Rows: every attribute and error type a live item carries, split by the
    view it was recorded on, with items. An attribute or error type that
    applies to either kind is two rows, one per view. Attributes come first,
    then errors, each in its vocabulary's own order (then label).
  - Totals: none, since an item can carry several at once.
  - Drill: that view's search narrowed to the attribute or error type.
- **`cb_id_numbers` -- Serial and certificate numbers.**
  - Rows: every live item holding a serial number -- a note's
    (`currency_detail`) or a bullion item's (`coin_detail`) -- or at least
    one grading certificate (`reports/id_numbers.py`). One row per item, in
    item-code order.
  - Columns: item, description, kind, metal, total fine weight, serial
    number, grading service and certificate numbers, photo (yes/no). Total
    fine weight is the per-piece fine weight times `piece_count`, as
    `cb_metal` counts it. Service and certificate numbers show each
    different value once, joined.
  - Totals: items and fine weight.
  - Drill: a row opens the item's editor.
- **`cb_serials` -- Matching serial numbers.**
  - Rows: every set of two or more notes whose serial numbers match
    (`reports/serials.py`), one row per set, in order of the digits.
  - Columns: serial digits, notes, star notes among them, the serials as
    written, the denominations, series and districts among them (each
    different value once), and total cost.
  - Totals: notes, star notes and cost.
  - Drill: the Currency list of exactly the notes of its set
    (`item_codes=<code>,<code>`), whatever status they are in now.
  - A serial with no digit matches nothing.

`cb_serials` takes three parameters beyond status and disposition. Each
defaults to its widest reading:

| Parameter | Choices | Meaning |
|---|---|---|
| Denomination | `any` (default), `must_match` | Whether two notes must also be of one denomination. |
| Letters | `ignore` (default), `must_match` | Whether the letters before and after the digits count. Ignored, `B00003333A` matches `F00003333C`. |
| Star notes | `match_plain_notes` (default), `only_other_stars` | Whether a star note matches a note without the star. |

A star note is a replacement note, marked by a star in its serial number.
With the letters counted and star notes matching plain ones, the star stands
where a letter would: `F01011010*` matches `F01011010H`. A star note brings
every plain note it matches into one set. Two plain notes differing in one
letter are never matched without a star note between them. Case and spacing
are not part of a serial.

### Data quality -- what is missing or wrong

- **`dq_issues` -- Open issues.**
  - Rows: one per named check per view (coins, then currency), with its
    description and items.
  - Totals: none, since an item can carry several issues at once.
  - Drill: `?issue=<check>`, when the row counted anything.
- **`dq_completeness` -- Field completeness.**
  - Rows: one per kind with at least one live item. Columns are live items,
    then percent filled for each field that applies to that kind:

    | Field | Applies to |
    |---|---|
    | year | every kind; a note's is its series year |
    | denomination, grade | coins and notes only |
    | country | every kind |
    | series | not currency, whose year is its series year |
    | metal | not currency or sets |
    | photograph, storage location, listing link, seller's item id | every kind |

  - A blank cell means the field does not apply to that kind. It never
    means 0% or 100%.
  - Drill: a row drills to that kind's search. A cell drills one step
    further, to the same search with `missing=<key>` added. The console
    builds that itself, since a column's key is exactly the `missing=` field
    name.
- **`dq_photos` -- Photographs.**
  - Rows: live items with no photograph, by kind and status, then a final
    row for photographs filed against no item at all.
  - Drill: a kind x status row drills to `?missing=photo` narrowed by
    status. The unfiled row drills to `/photos`.
- **`dq_derived` -- Filled by a rule.**
  - Rows: field x rule, over the `item_field_source` rows of live items.
    These are the fields that still hold what a pass filled in, since saving
    a field by hand removes its row. A field a person emptied on purpose
    (`HELD`) is excluded.
  - Drill: none, since an item with two such fields counts once for each.
- **`dq_purchases` -- Purchases with gaps.**
  - Rows: one per purchase with at least one gap, newest first. Columns are
    the purchase (`#<id>`), order number, vendor, order date, and its gaps.
  - The gaps, in a fixed order:
    - a generated placeholder number;
    - no order date;
    - no web address;
    - an order date after the purchase's own entry date;
    - an order date more than a year before entry;
    - an item with zero cost;
    - no items at all. A purchase whose only items are deleted or split
      reads as "no items"; it is not dropped from the report.
  - Drill: `/receiving?order=<id>`.
- **`dq_locations` -- Where items are.**
  - Rows: live items by storage location, one row per location as the
    console's own location picker lists them, plus a "None recorded" row.
    Columns are items and total cost. Two locations sharing a label are
    still two rows, disambiguated `<label> (#<id>)`.
  - Totals: an overall total.
  - Drill: none, since the inventory search has no filter for one specific
    location.
- **`dq_series_years` -- Coins dated outside their series.**
  - Rows: one per live coin whose year falls outside its design series'
    years -- a typo, a tribute piece or the wrong series. Columns are item,
    title, year (`1999-2009` for a range), series, and the series' years
    (`1986 on` for one still struck). Ordered by series, then year.
  - Coins only, since a note's year is its series year.
  - It runs the same SQL text as `issue=year_outside_series`, so the report
    and the filter list the same coins.
  - Drill: `/inventory/coins?item_code=<code>`.
- **`dq_series_review` -- Series to review.**
  - Rows: one per live item `app.series_classify` leaves for a person. They
    are decided by that pass's own `classify`, so the report and the pass's
    printed report cannot disagree.
  - The reasons, in this order:
    - *description names a design the facts rule out* (a conflict);
    - *series set, but the facts rule it out*;
    - *facts allow several designs* (a boundary year).

    Within a reason, rows go by the designs in play.
  - Columns: item, why, designs (what the text names, the series set, or
    the designs allowed), denomination, year (a note's series year and
    letter), series, and the three texts the pass reads. Title, description
    and rating each have their own column, so a design named in only one of
    them is visible.
  - `show` narrows to one kind. Notes count each kind. Nothing is written.
  - Drill: `/inventory/coins?item_code=<code>`, or `/inventory/currency` for
    a note.

### Purchasing and receiving -- what has been bought and has not yet arrived

- **`pr_outstanding` -- Not yet arrived.**
  - Rows: one per purchase carrying at least one live item still `ordered`
    or `missing`, oldest ordered first.
  - Columns: order number (`(no number)` when none), vendor, seller, order
    date, days waiting, items outstanding, all live items on the purchase,
    the outstanding items' cost, and an `Overdue` text column. That column
    holds the word "Overdue" once days waiting exceeds the parameter, and is
    empty otherwise.
  - Parameter: `overdue_days` (default 21).
  - Totals: an overall total.
  - Drill: `/receiving?order=<id>`.
- **`pr_outstanding_items` -- Not yet arrived items.**
  - Rows: one per item `pr_outstanding` counts as outstanding: live,
    `ordered` or `missing`, and on a purchase. They come in that report's
    order (oldest ordered first, undated last), then by item code.
  - Why it exists: a purchase row cannot say what its items are, since one
    purchase may hold many. This lists them.
  - Columns: order, vendor, seller, order date, days waiting, item, year,
    mint, serial number, title, status and total cost. Year, mint and serial
    number are read as `pr_received_items` reads them.
  - Totals: the cost, which equals `pr_outstanding`'s.
  - Parameters: none.
  - Drill: a row drills to its own item, which the Reports page opens in
    the editor.
- **`pr_spend` -- Spending.**
  - Rows: period x vendor, over purchases with a live item. A purchase with
    none is not counted as a purchase at all, which a note states. Columns
    are purchases, items, item cost, shipping, sales tax and total.
  - Totals: a subtotal row per period (`All vendors`) and an overall total
    (`All periods`).
  - Parameters:
    - a date range (`date_from`/`date_to`) filtering by the purchase's own
      order date; either or both empty means no bound on that side;
    - `period`: `month` (default), `quarter` or `year`.
  - Drill: none, since a period x vendor cell has no single search page.
  - A note counts purchases excluded for having no order date at all.
- **`pr_sources` -- Vendors and sellers.**
  - Rows: one per vendor with a counted purchase (the same live-item rule as
    `pr_spend`). Beneath it, one row per seller that vendor's purchases have
    named. Columns are purchases, items, total spent, and first and last
    order date.
  - Totals: over vendor rows only. A seller row is a further breakdown of
    purchases its vendor row already counts, not more purchases.
  - Drill: none.
- **`pr_received` -- Received.**
  - Rows: arrival day x vendor, with items and total cost. Newest day first,
    then vendor.
  - Arrivals are read from `item_status_history`'s own transitions *to*
    `received`. The opening row that a new item, a split child or a seed
    gets is never counted: it is not an arrival, and a note says so.
  - An item recorded with no purchase counts under the vendor "No
    purchase".
  - A split parent's own receipt is attributed to its live children, on the
    parent's own day and vendor, since the pieces arrived with it. A piece
    detached from its lot is no longer one of them, and the same note says
    so.
  - An item received more than once counts once per receipt, noted.
  - Totals: an overall total.
  - Parameter: a date range on the arrival day.
  - Drill: `pr_received_items` for the row's own day and vendor
    (`/reports?report=pr_received_items&date_from=<day>&date_to=<day>&vendor=<name>`),
    which lists exactly the items the row counts. No inventory search can be
    narrowed by arrival day, and a day's arrivals mix coins and currency.
- **`pr_received_items` -- Received items.**
  - Rows: one per item received, read from the same arrivals `pr_received`
    counts. It is one shared query, so the two cannot disagree. Ordered
    newest day first, then vendor, then item code.
  - Columns: day, item, year, mint, serial number, title, vendor, seller,
    order number and total cost.
  - Year, mint and serial number tell one piece from the next. Each is
    blank where it does not apply or is not recorded:
    - a coin's year is its own (`1999-2009` for a range, "No date" for a
      piece recorded as undated), with its mint's label;
    - a note's is its series designation (`1935A`), with its printed serial
      number.

    They are read in one further query over the pieces listed, not joined
    onto the arrivals `pr_received` also reads.
  - The seller is the purchase's own.
  - A split lot's receipt lists its live pieces, each with its own year and
    mint, on the lot's own day, vendor, seller and order.
  - Totals: the cost.
  - Parameters:
    - a date range on the arrival day;
    - `vendor`: a vendor's name exactly as `pr_received` shows it ("No
      purchase" for items recorded with none), or `all`. `all` is the
      default; it is a word because the console's form refuses a text
      parameter left empty.
  - Drill: a row drills to its own item, which the Reports page opens in
    the editor.

### Selling -- what is on offer and what has sold

- **`sl_offered` -- On offer.**
  - Rows: active and paused listings, of items and sales lots, by venue,
    then oldest listed first. Columns are listing, what it offers, status,
    asking price, currency, cost basis and days listed.
  - A coin offered elsewhere, or grouped into a lot, keeps its paused
    store-listing row (status "Paused for `<venue>` listing"). That row is
    left out of both totals, so the coin counts once, on the listing that
    superseded it, not twice (noted by count).
  - A listing not priced in USD is left out of the asking total only (also
    noted).
  - Totals: asking (USD only) and cost basis.
  - Drill: the item's editor, or `/lots` for a lot.
- **`sl_sales` -- Sales.**
  - Rows: month x venue, over sales orders placed in range whose status is
    a completed or in-progress sale: pending, paid, packed, shipped or
    delivered. Canceled and refunded orders are never counted, since that
    money went back. A note names the counted statuses and how many orders
    in range were excluded.
  - Columns: orders, gross, fees, net, cost basis and gain. Cost basis and
    gain are summed per item share (`sales_order_item_share`, specific
    identification), so a bucket's own gain is exactly the sum of its
    items'.
  - Parameter: a date range on the order's own placement date.
  - Totals: an overall total.
  - Drill: `/sales`.
- **`sl_fulfillment` -- To ship.**
  - Rows: one per order still open and unshipped, oldest first. Columns are
    order (`#<id>`), placed, customer, items, amount and days waiting.
  - Open and unshipped means `pending`, `paid` or `packed`: the open-order
    statuses the sales side itself uses (`sale_state`). They are stated as
    an included list, so a future status is never swept in by default.
  - A deleted or split item is left out of its order's own item count. A
    note counts them when there are any.
  - Totals: an overall total.
  - Drill: `/sales`.
- **`sl_aging` -- Held and not offered.**
  - Rows: live items received and held, not on any active or paused
    listing, and not an open member of a sales lot. They are grouped by
    months since receipt x kind, with items and total cost.
  - The month buckets are 0-5, 6-11, 12-23, 24+, or "Unknown" when no
    receipt transition is found: an item whose history holds only its
    opening row, which is not an arrival.
  - A split child with no receipt of its own falls back to its split
    parent's. A piece detached from its lot has no parent to fall back to.
  - A note counts the "Unknown" items when there are any, and names both
    reasons.
  - Totals: an overall total.
  - Drill: none.
- **`sl_auctions` -- Auctions.**
  - Rows: one per auction, ordered by status (draft through settled, then
    canceled). Columns are lots, sold, unsold (withdrawn counts as unsold),
    hammer total and fees.
  - Hammer total and fees are shown only for a settled auction, since a
    closed one may carry a result mid-settlement.
  - Totals: none. The figures are not meaningful summed across different
    auctions and statuses.
  - Drill: `/auctions`.
- **`sl_ready` -- Ready to sell.**
  - Rows: one per kind, over live items received and held (not listed, sold
    or shipped). Columns are the items, then how many have each of the four
    things a listing needs, and how many have all four:
    - an own photograph: one filed against the item with no web address on
      record. A seller's listing picture does not count.
    - a grade or weight: a grade on a coin or a note; a fine weight on
      bullion, a medal or a token. A set, and any other kind, needs neither.
    - a storage location;
    - a total cost above zero.
  - It is one grouped query, so `ready` never exceeds another column.
  - Totals: the totals row adds the kinds.
  - Drill: that kind's search narrowed to received and held, the items it
    counts.

### Money -- what it cost and what it is worth

- **`mn_basis` -- Cost basis.**
  - Rows: status x disposition of every live item, with items and total
    cost.
  - Totals: an overall total (`All statuses`).
  - Drill: none. A status x disposition row spans both the coin and
    currency inventories, which no single search page can reproduce.
- **`mn_tax` -- Sales tax paid.**
  - Rows: period x vendor, over purchases with a live item (the same rule
    and note `pr_spend` uses). Columns are purchases and sales tax paid.
  - Totals: a subtotal row per period and an overall total.
  - Parameters:
    - a date range on the purchase's own order date;
    - `period`: `month` (default) or `year`. `mn_tax` never buckets by
      quarter.
  - Drill: none.
  - A note counts purchases excluded for having no order date.
- **`mn_value` -- Recorded value.**
  - Rows: per item kind, live items by status and disposition. The default
    is `received`/`held`, the same default every Collection report uses.
  - Columns:
    - items;
    - the ones carrying the owner's own recorded numismatic value;
    - their cost and that value, summed only over the valued ones, so a zero
      there never reads as "worth nothing";
    - the difference;
    - items with no recorded value.
  - Totals: an overall total.
  - Drill: that kind's search, narrowed the same way a Collection report's
    row is.
  - A note states plainly that the recorded value is the owner's own manual
    entry, whatever the item's valuation basis. No price-guide or vendor
    value is derived, seeded or shown anywhere in this report.

## How it works

### Backend: `app/reports/`

- **One registry.** `app/reports/registry.py` holds `REPORTS`, keyed by id,
  as `issues.py` holds its checks. Adding a report is adding one
  `register()` call in a group module.
  - `app/reports/__init__.py` imports every group module, so `REPORTS` is
    complete the moment anything imports `app.reports` itself.
  - `REPORTS` iterates in catalog order (`GROUP_ORDER`, then registration
    order). A report naming a group not in `GROUP_ORDER` is refused.
  - Each entry is a `Report`: `id`, `group`, `title`, `purpose`, `params`
    (a pydantic model of the parameters it takes, with their defaults), and
    `run(db, params) -> ReportResult`.
- **One result shape.** `ReportResult` has:
  - `columns`: key, label, and `kind` (text, count, money, percent, date,
    ounces). It is sent as `kind` on the wire, where a parameter's own sort
    is `type`.
  - `rows`: dicts keyed by column.
  - an optional `totals` row.
  - `drills`: a console path (with its query) per row, or `None` where that
    row has no drill-down. It is index-aligned with `rows`, and checked to
    be so.
  - `link_column`: the key of the column whose cell carries a row's link
    (`None` for the first column). It is checked to name a column.
    `sl_offered` links on `offers`, `dq_issues` on `check`.
  - `notes`: anything the reader must know to read it right, such as "Melt
    value leaves out metals with no recorded price: ...".
- **Grouped by module.**
  - Group modules, each defining its own reports and registering them:
    `collection.py`, `data_quality.py`, `money.py`, `purchasing.py` and
    `selling.py`. Also `serials.py`, which holds the one Collection report
    that matches its rows in Python (`cb_serials`), and `id_numbers.py`
    (`cb_id_numbers`, the per-item list of serials and certificates).
  - Four small modules hold logic more than one group module shares, rather
    than each restating it:
    - `tables.py`: the `inventory_item`/`item_kind` aliases and the
      live-row predicate on them, shared by every report that groups over
      live items; and the `item_status`/`disposition`/`currency_detail`
      aliases the search's own SQL names.
    - `live_params.py`: the status/disposition parameters, their filter, a
      search narrowed by them, a kind's drill-down, and the "Nothing matches
      these settings." note. These are shared by `mn_value` and every
      Collection report but `cb_serials`, which says "No two notes match on
      these settings.". It also holds the `kind=` a kind's search names and
      one item's own drill, shared by every group that drills to a kind or
      an item.
    - `receipts.py`: one definition of "an item's receipt" -- a status
      transition *to* `received`, never an opening row. Shared by
      `pr_received`, `pr_received_items` and `sl_aging`.
    - `live_purchases.py`: one definition of "a purchase" -- counted only
      when it carries a live item. Shared by `pr_spend`, `pr_sources` and
      `mn_tax`. It also holds `period_by_vendor`, the one period-by-vendor
      table `pr_spend` and `mn_tax` both are, each with its own measures.

    A report built on top of one of these can never silently disagree with
    another about what the shared word means.
  - The plumbing:
    - `base.py`: `Report`, `ReportResult`, `DateRange` with its `contains`,
      `Period`, and the small helpers the groups share (`widened_utc_bounds`
      for a `timestamptz` prefilter, `years_text`, `listed`);
    - `params.py` (`resolve_params`);
    - `serialize.py` (the JSON shapes);
    - `workbook.py`.
- **The live-row rule.** Every report reads live items only -- no
  `deleted_at`, no `split_at` -- through one shared predicate, `live_item()`
  in `app/live.py`. The search views are SQL text, so they state the same
  rule as text: `i.split_at IS NULL` in each view's `where`, and the default
  `DELETED_MODES["no"]`. `tests/test_live.py` pins the two as selecting the
  same rows.
- **A drill-down is decided from a row's own definition, never by running a
  search at report time.** `cb_grades` and `cb_metal` have group-by keys
  that do not line up one-to-one with a search filter. They work out
  whether a wider search would sweep in more than that row's own count, and
  omit the drill when it would:
  - `cb_grades` works this out from its own rows;
  - `cb_metal` from one further grouped count over the base tables, without
    its fine-weight condition, since its own rows cannot see an item with no
    fine weight.

  No report issues a second query against the search itself to check.
- **Queries** are SQLAlchemy Core on the base tables. They group in SQL by a
  foreign-key id or code, together with its label, wherever SQL can state
  the group. Five reports group in Python instead:
  - `pr_received`, `pr_received_items` and `sl_sales`: their bucket is a
    `timestamptz`'s local calendar day, which SQL cannot work out without
    the application server's time zone;
  - `sl_aging`: its bucket is whole months since that day;
  - `cb_serials`: it reads every live note's serial once, because a star
    stands where a letter would and no `GROUP BY` says that.

  `dq_series_review` takes its rows from `series_classify.classify`.
  Parameters are bound. Column names come from allowlists, never from a
  request.
- **Money** is `Decimal`. It is summed in SQL where the grouping allows,
  else added as `Decimal` in Python, which is exact; never a float. It is
  sent as decimal strings, as everywhere else.
- **Date-range parameters.** `DateRange` (`app/reports/base.py`) is the
  shared params base for any report scoped to a date range. It has
  `date_from` and `date_to`, both optional and independent, titled "From"
  and "To".
  - A report subclasses it (`class SpendParams(DateRange): period: ...`)
    rather than declaring the two fields itself.
  - `date_from` after `date_to` is refused: 422 from the API, exit 2 from
    the command line.
  - Either bound absent means no limit on that side. An open range is a
    normal question, never today's date or any other stand-in default.
- **Period parameters.** `Period` (`month`, `quarter` or `year`) and its
  `period_start`/`period_label` helpers in `base.py` are written once. They
  are shared by every report that buckets a date range into a time period:
  - `pr_spend`, all three;
  - `mn_tax`, `month` (its default) or `year`, through the narrower
    `TaxPeriod` literal.

  So the two can never drift apart on what a period is or how it reads.

### API

- `GET /api/reports` -- the catalog: a list of `{id, group, title, purpose,
  params}`. Each parameter carries:
  - `name`;
  - `label`: the pydantic field's own `title`;
  - `type`: `choice`, `integer`, `date` or `text`;
  - `default`;
  - `choices`: a `Literal` parameter's own values, else `null`.

  A `date` parameter's default is always `null`. Its value on the wire and
  in the address is ISO `YYYY-MM-DD`.
- `GET /api/reports/{id}?<params>` -- the result as JSON:
  `{id, group, title, params (resolved), run_at (ISO, local), columns, rows,
  totals, drills, link_column, notes}`.
  - A `Decimal` crosses as the string it prints, a `date` as its ISO text.
  - 404 for an unknown report.
  - 422 for an unknown parameter name, or a value its params model rejects.
    The value is validated by that model itself, the one thing
    `resolve_params` shares with the command line. So a report is validated
    identically from either.
- `GET /api/reports/{id}/workbook?<params>` -- the same result as an `.xlsx`
  download, named `<id>_<YYYY-MM-DD>.xlsx` (the run date). It has one
  sheet, laid out top to bottom:
  1. the report's title;
  2. one row per parameter: its label and the value it ran with. A date
     bound is a date cell; an absent one is the word `any`;
  3. a "Run at" row;
  4. a blank row;
  5. the header row, frozen;
  6. the data rows;
  7. the totals row directly below (bold), when there is one;
  8. a blank row, then each note.

  Money and percent cells are written as numbers, and NULL as an empty
  cell. One writer (`app/reports/workbook.py`) is used by the API and the
  command line alike.
- Manager only (`AdminUser`), like everything that shows cost, value or
  location. Nothing here reaches the shop.

### Command line

Every report's id, group and title -- Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.reports list
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.reports list
```

One report as a plain-text table -- Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.reports run REPORT_ID
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.reports run REPORT_ID
```

With a parameter set; repeatable -- Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.reports run REPORT_ID --param NAME=VALUE
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.reports run REPORT_ID --param NAME=VALUE
```

Written as a workbook too -- Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.reports run REPORT_ID --workbook FILE.xlsx
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.reports run REPORT_ID --workbook FILE.xlsx
```

The command line uses the same registry, for a report wanted from a script
or before the console is open.

- `list` prints every report's id, group and title.
- `run` prints a report as a plain-text table: title, parameters, header,
  rows, totals, notes. `--param` (repeatable) sets its parameters.
- A parameter left off the command line runs with its own default, printed
  in words. An absent date bound prints as `any`, the same word the
  console's print heading uses, never the text "None".
- An unknown report id or a bad `--param` is reported on stderr and exits 2.
- It is read-only, so there is no `--commit`.

### Console: the Reports page

- A **Reports** link sits in the console menu, between Selling and Settings.
- The page lists the catalog by group. Choosing a report shows its
  parameters (as the inventory filter panel does), its table with the
  totals row, its notes, and **Export workbook**.
- The report and its parameters are kept in the address (`/reports?report=
  pr_outstanding&overdue_days=30`), so a report can be bookmarked or
  reopened.
  - Run writes only the parameters that differ from their defaults.
  - Leaving a parameter field empty is refused (`Enter a value for <label>.`),
    rather than silently running that parameter's default.
  - The exception is a date parameter (`<input type=date>`). Emptying
    either From or To means no bound on that side: the field is simply left
    out of the request and the address, not refused.
  - A dropdown whose value in the address is not one of its choices starts
    at its default, so what it shows is what Run sends.
- Columns sort in the browser, since a report is at most a few thousand
  rows. A header click sorts ascending, then descending, then back to the
  report's own order.
- Money is shown with `money()` from the decimal string, never parsed into a
  float. Fine ounces are shown to three places, as the workbook shows them,
  from the decimal string the same way.
- Pressing Run on an unchanged form runs the report again. Beside the
  button the form says "Running..." while the request is out, and then when
  the answer on screen was run ("Ran <time>"). The same rows often come
  back, and nothing else would show that it ran.
- A row with a drill-down links to the page that fixes or shows it, in the
  same tab.
  - A drill that names exactly one item is not followed. Examples: an
    `sl_offered` row offering one item
    (`/inventory/<coins|currency>?item=CC-######`), or a `dq_series_years`
    row (`?item_code=CC-######`). Instead the Reports page opens that
    item's editor over the report (`reports/values.js`, `itemOfDrill`). So
    closing it returns to the report, and a save runs the report again.
  - The same address works on its own. The inventory page reads `item`
    from its own address and opens that item's editor on load (not only
    from a click in its table). When the editor closes, it drops `item` from
    the address again, replacing that history entry rather than pushing a
    new one, so Back does not reopen it.
  - `dq_completeness`'s percent cells link one step further: the row's own
    drill with `missing=<key>` added, where a column's `key` is exactly the
    `missing=` field name it counts.
  - A row's link sits on the cell of its result's `link_column`.
- The inventory page shows an active `missing=` as a chip in its filter
  panel ("Missing: photograph"), since the filter has no control of its
  own. Clicking the chip removes it from the address and searches again.
  The field names and their labels live in one frontend module,
  `pages/inventory/missingFields.js`.
- The help band explains each parameter, as every console form does.
- **Print** sits beside Export workbook; see Printing.

### Printing

Every report prints on paper as well as showing on the screen, from the
same page, with no report-specific code:

- **Print** opens the browser's print dialog (`window.print()`) for the
  report as shown: the same rows, sort and parameters.
- A print stylesheet (`@media print`) prints the report alone. The console
  menu, the help band, the parameter form and the buttons are hidden.
- A heading printed only on paper names the report, its parameters in
  words, one per line ("Overdue after (days): 21"), when it was run, and its
  row count. A date parameter prints as a date; an absent bound prints
  "any" ("From: any").
- The table's header row repeats on every page (`thead` as a table header
  group). A row is never split across pages. The totals row and the
  report's notes follow the last row.
- A report of more than six columns prints landscape (`report--wide`, which
  sets the `@page` size; `PORTRAIT_COLUMNS` in `ReportView.jsx`).
- Black on white:
  - nothing is carried by color alone (an overdue row is marked in words,
    in its own Overdue cell);
  - money is right-aligned;
  - a drill-down link prints as its plain text.
- Page numbers and the date come from the browser's own print header and
  footer.


### The `missing=` search filter

Drill-downs reuse the inventory search's filters, including
**`missing=<field>`**: items whose field is empty.

- It is kind-aware, as the completeness report is
  (`inventory_search.MISSING_FIELDS`, one shared predicate per field). A
  field outside its kinds matches nothing.
- Its field names are exactly `dq_completeness`'s percent-column keys:
  year, denomination, grade, country, series, metal, photo,
  storage_location, listing_link, sellers_item_id. So a report cell's count
  and its drill-down search's count are the same predicate.
- It works in the search on its own.

## Rules

- **Read-only.** No report writes, and none offers a button that does.
  Fixing is done where it is done today.
- **Admin only**, as above.
- **No proprietary numbering or prices.** Reports show the owner's own
  records.
  - A catalog's numbering (Friedberg, Pick) is shown only as the owner
    recorded it on an item.
  - No report derives, seeds or exports a price guide's values.
  - `mn_value`'s recorded value is the owner's own manual entry, never a
    price-guide or vendor figure.
  - A valuation source under license stays out of exports.
- **Kind-aware.** A field that does not apply to a kind (a note's metal, a
  coin's seal) is not "missing" for it. A note's year is its series year.
- **Live rows only**, as above.
- **Current state.** Reports answer from the database as it is, not as it
  was at a past date.

## Out of scope

- Charts.
- Scheduled or emailed reports.
- Dashboards.
- A free-form query builder.
- A tax-return form of realized gain. `sl_sales` works gain out per item and
  shows it by month and venue, but how fees and shipping are presented on a
  return is outside it.
- Snapshots over time, which need history the database does not keep.

## Decisions

| Question | Decision |
|---|---|
| When is an outstanding purchase overdue? | After **21 days** from its order date -- `pr_outstanding`'s default, still a parameter. |
| How is a sale's gain worked out? | **Per item** (specific identification): each sold item's share of the sale (`sales_order_item_share`) less that item's own cost basis. `sl_sales` uses this; no other method is offered. |
| What grade bands does `cb_grades` use? | **Numbers**, not names: 1-49, 50-59, 60-64, 65-70, and "No numeric grade". The strike type (MS, PR) and the grading service are separate columns, not folded into the band. |
| What counts as a purchase, for spending and tax totals? | One with **at least one live item** -- `pr_spend`, `pr_sources` and `mn_tax` all read the same rule, so a purchase whose only items are deleted or split is not silently counted by one report and not another. |
| What counts as a receipt? | A status **transition to** `received` -- an opening row (a new item, a split child or a seed) is never an arrival. A split parent's receipt is attributed to its live children. |
| Which sales orders are counted as sales? | **Pending, paid, packed, shipped or delivered** -- never canceled or refunded, since that money went back. |
| What does `mn_value` and the Collection reports default to? | **Received and held** -- what the owner has actually taken in and still has -- widened to `all` on request. |
| Printed as well as shown? | **Yes**: every report prints (see Printing). |
| Storage locations | **Optional.** A location is chosen on New item, in Receiving, or in the item editor, and changed whenever the piece moves; every move is kept in its location history. `dq_locations` reports "none recorded" as a row, not as an error. |

## Testing

- Each report's `run` is tested against built data with a known answer. The
  data includes a deleted and a split item that must not count, and an item
  of a kind a field does not apply to. The files:
  - `tests/test_reports_collection.py`, `_data_quality`, `_purchasing`,
    `_selling`, `_money`;
  - `sl_ready` in `_ready`; `cb_serials` in `_serials`; `cb_id_numbers` in
    `_id_numbers`;
  - date ranges in `_dates`; period labels and bucketing in `_purchasing`;
  - the period-by-vendor table `pr_spend` and `mn_tax` share, in
    `test_period_by_vendor.py`;
  - the registry's ordering and refusals in `_registry`.
- The API (`test_reports_api.py`): catalog shape, a parameter default, a
  422, a 404, manager only. The workbook round-trips: the sheet's rows equal
  the JSON's. The command line: `test_reports_cli.py`.
- The console (`Reports.test.jsx`): the page lists the catalog, runs a
  report from the address, sorts, exports, prints, and drills down. For
  printing, the Print button calls the browser's print, and the print-only
  heading carries the title, parameters and run time.
- Performance (`test_reports_performance.py`) is a guard, not a benchmark.
  Every report runs against the test database, and the test fails:
  - if any report takes over a second;
  - if a report sends more queries once the same collection is built a
    second time beside the first, which is what one query per row looks
    like.
