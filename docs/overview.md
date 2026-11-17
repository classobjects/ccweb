# Overview

Last revised: 2026-11-16.

What this software is, the problem it solves, and how it is built, in
short. It is for someone deciding whether to use it, contribute to it, or
learn from it. The detail is in [architecture.md](architecture.md) and the
documents it links to.

## What it is

An inventory and sales system for a coin and paper-money business. It suits
one person or a small shop that holds several thousand items and sells them
in their own web store and on outside platforms (eBay, Whatnot, auction
houses). It has two parts:

- a **management console**, where the owner records purchases, receives
  and attributes items, photographs them, offers them for sale, records
  sales and runs reports; and
- a **shop**, where customers browse what is for sale, register and order.

It was written for a real collection being turned into a business. It is
published so that others in the same position can run it, adapt it, or
borrow its ideas.

## The problem

A collection kept in a spreadsheet answers "what do I have". A business has
to answer three harder questions. Every design decision here serves one of
them:

1. **What exactly is this item?** A numismatic buyer knows MS63 from AU58,
   a 1929 National from a 1929 Federal Reserve Bank Note, a proof from a
   business strike. Items are described in the hobby's standard terms:
   the US Mint's, then the grading services'. The system checks a
   description against the facts it can, such as the series a year allows,
   the signatures a note's series must carry, and the metal a date was
   struck in.
2. **What did it cost?** Cost basis must survive for years, and for tax. An
   item bought as one of twenty in a lot still traces to its share of that
   purchase, to the penny, tax and shipping included.
3. **Is it available?** An item is never sold twice or offered in two
   places at once. The database enforces this however the item is offered:
   alone or in a lot, in the shop, on a platform, or in an auction.

What it does **not** do is equally deliberate:

- it runs no bidding (the auction platform does);
- it takes no payments (orders are settled outside it);
- it never redistributes a publisher's catalog numbering or price guide
  (see [reference-data.md](reference-data.md)).

## How it works, in brief

- **Purchases to stock.** A purchase is recorded with its items. Each item
  gets a permanent code (`CC-000123`). When the parcel arrives, the items
  are received into a storage location. A lot can be split into pieces
  whose costs add up exactly.
- **Description.** The item editor holds every change until Save, detects
  concurrent edits, and records each change in the item's History. Passes
  -- corrections run from the command line -- fill blanks from facts
  (series, composition, signatures, weights). They never overwrite anything
  a person typed.
- **Photographs** are stripped of all metadata on the way in, because they
  can carry GPS. They are served only as generated renditions.
- **Selling.** Items are offered in the shop or on a platform, alone or in
  sales lots. Offering an item elsewhere pauses its shop listing. A sale
  records buyer, price and fees. An auction is assembled, consigned and
  settled here, while the platform runs the bidding.
- **Reports** cover the collection, data quality, purchasing, selling and
  money, on screen or as a workbook.
- **Backups** export the whole database to one workbook every day. Each
  copy is proved by restoring it into a scratch database and comparing
  every row; only then are older copies removed.

## How it is built

- A FastAPI and SQLAlchemy backend over PostgreSQL.
- Two React applications, built by Vite and kept in separate bundles.
- Caddy in front, in production.

It runs on Windows 11 and Ubuntu LTS, for development and for hosting.
Every operational script exists for both.

The quality gate covers formatting, lint, types, about 3,400 backend and
1,600 frontend tests, and a check that the shop bundle carries none of the
console. It is at zero findings, so any new finding is a real one.

## Where to go next

- [README.md](../README.md) -- the developer's entry point: setup, layout,
  API.
- [project-purpose.md](project-purpose.md) -- the rules every design
  follows.
- [architecture.md](architecture.md) -- the components and how a request
  travels through them.
- [workflow-new-collection.md](workflow-new-collection.md) -- an item's
  path from purchase to sale in the console.
- [ui-guide.md](ui-guide.md) -- a tour of the screens, with pictures.
