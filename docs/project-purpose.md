# What this project is for

Everything else in `docs/` describes *how* something works. This document
describes *why*: the business the system serves, the three things a sale
depends on, what is deliberately out of scope, and the constraints every
feature obeys. It is for anyone changing the system. Read it first when a
design decision looks arbitrary: most of them follow from a rule stated
here.

## The goal

Let a coin and paper-money collector or small dealer run a business from
their collection: record what was bought and what it cost, describe each
item correctly, and sell it -- in their own shop and on outside platforms --
without ever selling it twice.

It was built for one real collection of several thousand items, kept for
years and being turned into a business. That collection is the measure
every feature was tested against. Recording what was bought is not enough.
The business has to sell from the record, and the record has to answer the
questions a tax return asks.

Three things have to be true for a sale:

1. **The catalog is accurate.** An item offered for sale must be described
   correctly. A numismatic buyer knows the difference between AU58 and
   MS63, and a misdescription is a refund and a reputation.
2. **Cost basis is defensible.** Every item traces to what was actually
   paid for it, including when twenty coins arrived as one purchase. This
   is a tax requirement, not a nicety.
3. **Availability is unambiguous.** An item cannot be sold twice, and
   cannot be offered in two places at once.

## Where items are sold

Every channel is a **platform** (`sales_venue`, the console's **Platforms**
page), so a listing always names where it is offered. There are three
kinds of channel.

**The web store** (the shop). Registered customers browse the catalog, add
to a cart and order. The owner can also place an order on a customer's
behalf from the console.

**Outside platforms** -- eBay, Whatnot, and auction houses such as Heritage
and HiBid. The owner lists there by hand. This system records the offer,
and afterwards the sale: buyer, price, fees.

**Scheduled auctions.** A set of items is chosen in advance and offered in
**auction lots** of one or more items, on someone else's platform. That
platform identifies the buyer, the price, and the timing that selects the
winner.

### This system does not run bidding

This is the single most important scoping fact on the sales side. There is
no bid table, no proxy bidding, no soft close, no outbid notification, and
none is planned. The venue does all of it. What this system does is:

- assemble the auction: choose items, group them into lots, number them
- keep those items out of every other channel while the auction is pending
- record consignment when an auction house takes custody
- settle it afterwards: what sold, to whom, for how much, and what came back

The reason: a bidding engine is a concurrency-critical, money-handling,
dispute-generating subsystem. Auction *assembly and settlement* is only a
catalog, a status rule and a record of results.

### The rule that connects the channels

**An item has at most one active offer.** The database enforces it (a
partial unique index on `offer_claim`), so it holds however the item is
offered: alone or in a lot, in the store, on a platform or in an auction.
In practice:

- Offering an item elsewhere pauses its store listing.
- An item in a pending auction cannot be bought from the store.
- When an auction settles, an unsold item goes back to the store at its old
  price if it was there before, and otherwise to `held`.

The block is derived from the offers themselves, not from a flag someone
maintains. A stored `is_blocked` column would be one missed update away
from selling something twice.
[specs/selling-design.md](specs/selling-design.md) has the full model.

Not built: customers registering interest in an item held by an auction,
which needs email delivery.

## Three meanings of "lot", kept apart

The word is correct in each use, but the three are not the same
relationship. The code always says which one it means.

| Term | Direction | Relationship | Example |
|---|---|---|---|
| **Purchase lot** | how it came in | `inventory_item.parent_item_id`, after a split | a roll of 20 Morgan dollars bought as one item, split into 20 |
| **Sales lot** | how it goes out | `sales_lot_item`; dissolves if it does not sell | five coins bought years apart, offered together |
| **Auction lot** | a sales lot in an auction | `auction_lot` | that sales lot, as lot 47 in a Heritage sale |

A purchase lot is decomposed; a sales lot is assembled. An item can belong
to one of each at once, and they say nothing about each other.

## The order of work

```
catalog  ->  clean up  ->  list  ->  sell
```

- **Catalog.** The collection is cataloged.
- **Clean up.** Clean-up is attribution: establishing what each item
  actually is. It is ongoing and has no shortcut.
- **List and sell.** These are built: offers, sales lots, auctions and
  recorded sales.

An item is ready to list when it is described well enough to sell. The
console's diagnostics show what is still missing.

[workflow-new-collection.md](workflow-new-collection.md) covers every
acquisition, from purchase to sale.

## The database is the system of record

The `ccwebdb` database is the record. Corrections, derived
classifications, receipts, photographs and sales exist only in the
database. So the database is what gets backed up -- by `pg_dump`,
`app.backup` and the workbook backup (`app.workbook_backup`). Data is fixed
in the console, or with passes (command-line corrections) over stored
items.

## Constraints that apply everywhere

- **Money is exact.** `NUMERIC`, never a float. Divisions reconcile to the
  penny, or report the discrepancy rather than absorbing it.
- **Provenance survives.** A sold item's cost basis must still be
  answerable years later, including for a coin that arrived inside a lot of
  fifty.
- **An item has one identity for life.** `item_code` (`CC-000123`) is
  issued once, never changed and never reused. A returned item resumes its
  own history, and an audit reference is never ambiguous.
- **Nothing with a history is deleted.** Items are soft deleted, split,
  ended or withdrawn. Vocabulary values are retired or merged. An item that
  has ever been offered, a sales lot that has been offered, and any order
  stay for good. Rows are removed outright only where nothing of the
  history depends on them:
  - an unused vendor, seller, storage location or Friedberg row;
  - a sales lot never offered, and a member taken out of a lot still being
    assembled;
  - a lot taken out of an auction (its listing is ended and kept);
  - a vocabulary value merged into another;
  - a photograph deleted or taken off an item;
  - a certificate or error removed from an item, which the item's History
    records.
- **Only facts are shipped as reference data.** The catalog is sold, so
  anything seeded is redistributed with it. Design series, office holders
  and mint specifications may be shipped; a publisher's numbering or price
  guide may not.
- **The owner is not a customer.** The console shows cost basis, margin,
  storage location, history and every photograph of an item. The shop
  shows only what a buyer needs: the listing's wording and price, and the
  item's primary photograph as generated renditions. This is enforced, and
  tested, where each public response is built (`routers/catalog.py`),
  field by field.
