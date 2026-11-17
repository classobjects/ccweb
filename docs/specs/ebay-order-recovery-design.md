# eBay order numbers and listing ids

*2026-09-29.* Two eBay identifiers tie our records to eBay:

- An eBay purchase is found, and checked against eBay, by its **order
  number**.
- An item bought on eBay is traced to the listing it came from by eBay's
  **item id**.

A purchase recorded without an order number cannot be found either way.
`python -m app.ebay_orders` fills both in from eBay's own purchase history.
It is a command-line pass that the owner or an administrator runs from
`backend\` after downloading that history.

The pass fills only what is empty, and it merges the purchases that one eBay
order was split into. A second run finds nothing left to do, so the pass can
be run again after each new download.

The result shows in the management console:

- the item editor's **Seller's item id** field (editable), with a link to
  the listing on eBay;
- the `sellers_item_id` filter in both inventory searches;
- each change, in the item's History.

## Source

The source is eBay's purchase history, saved by the Chrome extension **eBay
Purchase History Downloader** (README, *Useful tools*). It saves one workbook
per year (`Ebay_Purchase_History_<year>.xlsx`). The pass reads the first
sheet, which has a row per item bought:

| Column | Used for |
|---|---|
| `OrderNumber` | the order number filled in |
| `OrderDate` | `Mon DD, YYYY`, or a date cell; breaks a tie when one listing was bought twice, and fills an empty order date |
| `ItemID` | **the key**: eBay's item number for the listing |
| `Seller`, `ItemName`, `ItemPrice` | shown in the review workbook |

A workbook missing any of these columns is refused, naming the column.

## The key is the item id

Every eBay purchase links its listing (`https://www.ebay.com/itm/<item id>`),
and most items do too (`inventory_item.listing_url`). So the match is exact.
It does not rely on words, date or price.

The item id and a stored order number can disagree. The cause may be a typo
in the stored number, or another order placed the same day. Either side
could be wrong, so a disagreement is reported and never changed.

## One purchase per eBay order

An eBay order of several listings may have been recorded as one purchase per
listing. `purchase_order` allows one purchase per vendor's order number
(`uq_purchase_order_vendor_number`), and an eBay order is one purchase. So
those purchases are **merged**:

1. Their items move to one purchase: the one already holding the number,
   else the oldest (lowest id).
2. The emptied purchases are deleted. Nothing but `inventory_item` points at
   a purchase.

Each item keeps its own listing's id in `sellers_item_id`. The merged
purchase's link becomes the order's page on eBay.

What only a deleted purchase recorded is kept:

- Its notes are appended to the surviving purchase's notes.
- Its seller is given to a survivor that has none. A survivor that already
  names another seller keeps its own, since a purchase has one seller. The
  review workbook names the other seller, with every note carried, for a
  person to settle.

One trap guards the delete. SQLAlchemy's default for a parent's children is
to null their parent. So deleting a purchase whose loaded `items` list still
held the moved items would null those items' purchase. The pass therefore
expires each purchase before deleting it, and raises if any item still
points at it. A test loads that list, and fails with the expiry removed.

## `sellers_item_id`

`inventory_item.sellers_item_id` (text, indexed; migration `9a4c2e7f5b18`) is
the seller's id for the listing the item was bought from. The pass fills it
only where it is empty: from the item's own listing link, else from its
purchase's. A lot's pieces share it.

**It is not unique and does not name an order.** A seller lists many of one
coin under one id, and that listing is bought in several orders. For
example, CC-000101 and CC-000102 may share `100000000001` across orders
`11-11111-11111` and `22-22222-22222`. So:

- its index is plain, not unique;
- when the pass meets an id bought more than once, it prefers the order
  dated as the purchase is, and leaves any remaining tie for a person.

## The pass

The dry run, over one or more order workbooks.

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.ebay_orders FILE.xlsx
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.ebay_orders FILE.xlsx
```

The same, writing the review workbook.

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.ebay_orders FILE.xlsx --review OUT.xlsx
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.ebay_orders FILE.xlsx --review OUT.xlsx
```

Writes.

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.ebay_orders FILE.xlsx --commit --by EMAIL
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.ebay_orders FILE.xlsx --commit --by EMAIL
```

**Dry run by default**: the pass prints what it would do and writes nothing.
`--commit` writes, in one transaction. It requires `--by`: the email of the
account the History rows name, matched regardless of capitals.

Exit status:

| Status | When |
|---|---|
| 0 | a dry run or a commit |
| 1 | no vendor is eBay (below) |
| 2 | `--by` names no account, or a usage error such as `--commit` without `--by` |

The other passes, which finish through `app.pass_cli`, exit 1 for an unknown
`--by`. This one keeps 1 for its eBay refusal.

Cell formats it accepts:

- An `OrderDate` cell may be eBay's text or a real date (a workbook saved
  again by a spreadsheet). An `OrderDate` that is neither is refused, naming
  the file and row.
- An `ItemID` cell may be text or a number.

The eBay vendor is known by its host name, such as `ebay.com` or
`www.ebay.co.uk`. The host is read from the vendor's host, else its name;
`app.listing_links` shares this rule. With no such vendor the pass refuses
(exit 1) rather than report that nothing is left to do.

Only live items are read. A deleted row, and a lot replaced by its pieces,
say nothing about an order.

1. `plan` decides everything, writing nothing:
   - the listing ids to set;
   - the order for each unnumbered eBay purchase: the one order its listings
     appear in, preferring a line of the purchase's own date;
   - the purchases each order merges;
   - what is left for a person: no eBay listing link, a listing not in the
     history, or listings in several orders.
2. `apply` makes those changes and fills an empty order date from the
   history. It records each item's `order_number` and `sellers_item_id`
   change through `field_changes.record`, so each shows in the item's
   History.
3. `--review` writes a workbook with three sheets:
   - **Numbered**, which also lists the sellers and notes of the purchases
     each order merges;
   - **Needs you**;
   - **Numbers that disagree**: the stored number, eBay's number for its
     listing, and what each order held -- or "not in the history (a typo?)".

## Settling a number that disagrees

Two clues settle which order a purchase belongs to:

- **Price.** eBay's line price includes tax, as our `total_cost` does. So
  the order whose price matches ours to the cent is the purchase's.
- **Lot number.** A live-show description's opening lot number
  ("#134 - E - 05/17/26") names the lot. A description naming another lot
  is a row filed or copied onto the wrong purchase.
