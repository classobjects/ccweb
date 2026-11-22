# Database design

**What this covers.** The PostgreSQL schema behind the coin and banknote
inventory and sales platform. It describes every table, the part of the
business it serves, and the constraints that keep the record honest.
SQLAlchemy 2 maps the schema in `backend/app/models/`, and Alembic migrates
it (`backend/alembic/`). The models are the source of truth. This document
explains their shape, and the reasons behind the rules that are easy to
break.

**Who it is for.** Anyone who changes a model, writes a migration, a report
or a query against the database, or decides where a new fact belongs.

**Why it matters.** The database is the business record:

- what was bought, and for how much;
- where each piece is, and what it is;
- what was offered and sold;
- who changed what.

Several guarantees live in the schema and in a handful of single-writer
modules: an item is offered in only one place, cost basis (what was paid for
an item, with tax and shipping) is never shown to a buyer, and history
survives corrections. A change that goes around them loses them.

The sections follow the life of an item:

| § | Part of the business | Tables |
|---|---|---|
| 3 | **Buying** -- what was acquired, from whom, at what cost | `inventory_item`, `coin_detail`, `currency_detail`, `vendor`, `seller`, `purchase_order` |
| 4 | **Vocabulary** -- the shared words every item is classified with | 33 classifier tables, `series_alias`, `series_year_range`, `note_issue`, `reference_alias`, `reference_merge` |
| 5 | **Identifying** -- certificates, errors, attributes, type catalogs | `item_certification`, `item_error`, `item_attribute_link`, `friedberg_number`, `pcgs_type` |
| 6 | **Valuing** -- cost stored, worth computed | `composition`, `metal_price`, `valuation_snapshot` |
| 7 | **Keeping track** -- status, location and who changed what | `item_status_history`, `storage_location`, `location_history`, `item_field_source`, `item_field_change` |
| 8 | **Photographing** | `image`, `image_derivative`, `item_image`, `listing_image`, `shipment_image` |
| 9 | **Selling** -- offers, lots, auctions, buyers, orders, shipping | `sales_venue`, `listing`, `listing_status_history`, `offer_claim`, `sales_lot`, `sales_lot_item`, `auction`, `auction_lot`, `customer`, `address`, `sales_order` and its children, `shipment` |
| 10 | **Views** and the public boundary | `coin_inventory`, `currency_inventory`, `item_valuation`, `public_catalog` |
| 11 | Conventions, constraints, indexes, locking, migrations | |
| 12 | Shipped reference data | `backend/data/reference/*.json` |
| 13 | **Logins** and settings | `users`, `label_printer_correction` |

Reports (`app.reports`) have no tables of their own; they read these.

---

## 1. Principles

**Classifiers are foreign keys, never free text.** A classifier is anything
used to search, filter, group or report on. Each one is a reference table
with a stable code. `$20 Bill`, `$20 Blll` and `$20 B` are three strings but
one concept. Labels are not copied onto the rows that use them, so a rename
takes effect everywhere as soon as it commits. Search speed does not come
from denormalizing. It comes from reading the base tables with only the
joins a query needs, plus partial indexes on the facet columns (§11).

**The owner's own words are kept.** Beside the classified values, `rating`
holds the owner's rating as written, and `weight_note` holds a weight that
is not a single number. The passes (jobs that fill item fields from known
facts, §7) and search read them as evidence.

**Money is `NUMERIC(12,2)` mapped to `Decimal`.** There are no floats
anywhere in the stack. Weights multiply into money, so they are
`NUMERIC(12,6)`.

**Cost basis is fixed; value is time-varying.** What was paid is stored.
What an item is worth moves with the spot price (the market price of its
metal) and is computed at read time.

**Machine guesses never masquerade as curated facts.** Reference rows, type
catalog rows, compositions, aliases, attribute links, errors and items each
record their origin in the `provenance_source` enum:

- `seeded`;
- `derived` by a rule;
- `manual`, entered by a person.

Per-field provenance on items is `item_field_source` (§7).

**Storage location and cost basis are never customer-visible, and neither
is an original photograph.** A listed item's primary photograph reaches the
shop only as its renditions (resized copies). Those are public to whoever
holds the image's hash. The shop names no other photograph of the item.
This is an authorization boundary, enforced and tested (§8, §10).

**One writer per invariant.** Where a column and a history or guard table
must change together, exactly one module writes them (§11).

---

## 2. Entity overview

```
  vendor ── purchase_order ── inventory_item ──┬── coin_detail ── pcgs_type
  seller ──┘                    │  │           └── currency_detail ── friedberg_number
                                │  └── parent_item_id (lot lineage)
                                │
      item_certification, item_error, item_attribute_link   (identification)
      item_status_history, location_history ── storage_location
      item_field_source, item_field_change  (per-field state)
      item_image ── image ── image_derivative
      valuation_snapshot                    composition, metal_price

  inventory_item ─┬─ listing ──────────── sales_order_item ── sales_order ── customer ── users
  sales_lot ──────┘   │  ├─ offer_claim         │                 ├─ sales_order_fee
   └─ sales_lot_item  │  ├─ listing_status_history                ├─ sales_order_change
                      │  ├─ listing_image                         └─ shipment ── shipment_image
                      │  └─ auction_lot ── auction
                      └─ sales_venue          sales_order_item_share ── inventory_item
```

Everything hangs off `inventory_item`. Coins, notes, bullion and sets share
one table, because:

- they share purchase, cost, grade, certification, status, location and
  images;
- acquisitions routinely contain several kinds;
- sales reference any of them through one foreign key chain;
- an item whose kind is not yet known still needs a row.

What differs lives in 1:1 detail tables.

---

## 3. Items and acquisition

The buying side: every physical object the business holds or has held, the
purchase it came from, and who sold it (`models/core.py`).

### `inventory_item`

One row per acquired item or lot. A lot is a group of pieces bought as one
thing.

| Column | Type | Notes |
|---|---|---|
| `id` | int pk | internal surrogate key |
| `item_code` | varchar(32), unique | **permanent identifier of the physical object**, such as `CC-000123`. Server default `item_code_format(nextval('item_code_seq'))`: at least six digits, more past `CC-999999` |
| `version` | int | optimistic concurrency (§11) |
| `purchase_order_id` | fk null | null when the acquisition is not recorded |
| `item_kind_id` | fk | coin, currency, bullion, set, medal, token, other, unknown |
| `denomination_id` | fk null | face value in a currency, coin or note |
| `bullion_form_id`, `set_form_id` | fk null | Silver Eagle, Mint Set, … |
| `storage_form_id` | fk | single, roll, tube, strap, brick, box, bag, album, … |
| `piece_count` | int, default 1 | how many objects the row stands for; every weight and value multiplies by it |
| `country_id` | fk null | issuer |
| `year_start`, `year_end` | int null | a coin's year, or a range for sets and rolls. Empty on a banknote, whose year is `currency_detail.series_year`. The API refuses a year on a note; there is no constraint |
| `no_date` | boolean, default false | the piece carries no date at all (a gold bar, an undated round), which is not the same as a year not recorded. `ck_inventory_item_no_date_no_years` stops it also holding a year. "No year recorded" (`issue=no_year`, `missing=year`) does not list it |
| `series_id` | fk null | design series (Morgan Dollar). Kept on the item so facets group on an indexed column of the scanned table |
| `strike_type_id` | fk null | business, proof, specimen, … — the "PR" of PR69 |
| `grade_id` | fk null | the number (`65`, `64+`), or a non-numeric grade |
| `grade_designation_id` | fk null | a grade suffix: DCAM, CAM, RD, RB, BN, FS, FB on a coin; EPQ, PPQ on a note. One per grade, and part of it |
| `grading_service_id` | fk null | who graded it |
| `authenticity_id` | fk | unverified, genuine, counterfeit, questionable |
| `status_id` | fk | acquisition axis (§7) |
| `disposition_id` | fk | sales axis (§7) |
| `storage_location_id` | fk null | where it physically is (§7) |
| `parent_item_id` | fk null → `inventory_item` | the lot this piece was split from |
| `split_at` | timestamptz null | set on a lot when it is broken into pieces |
| `deleted_at` | timestamptz null | soft delete: the row should never have existed |
| `label_applied_at` | timestamptz null | when the label now on the holder was applied; null while the holder carries none |
| `label_text` | text null | the text the holder's label carries (`labels.label_text`), kept to tell whether the item has changed since |
| `label_stale` | boolean, default false | the holder's label would now read differently from `label_text`. Set by `labels.refresh_stale` on every save. Never set for an item whose holder carries no label. Not a logged field change |
| `label_waiting_at` | timestamptz null | when a label printed for the item, and not yet applied, was printed. One *Yes* stamps its whole run alike. Null while none waits |
| `label_waiting_text` | text null | the text that waiting label carries; it becomes `label_text` when applied |
| `in_label_batch` | boolean, default false | waiting in the batch of labels to print next. Partial index `ix_inventory_item_in_label_batch` on `id WHERE in_label_batch` |
| `local_catalog_number` | varchar(64) null, indexed | the owner's own earlier numbering; not unique |
| `source_title` | varchar(500) | what the seller called the item, kept verbatim |
| `description` | text | what a person recognizes the item by |
| `listing_url` | varchar(1000) null | the web address of the listing it was bought from; http(s) only when entered or edited |
| `sellers_item_id` | varchar(64) null, indexed | the seller's own id for that listing (eBay's item number). Every piece of one listing carries it, and one listing can be bought in several orders, so it is **not unique** |
| `rating` | text null | the owner's rating in their own words ("66EPQ Double Quad"). Searched and read as evidence; shown and corrected in the item editor; never shown to a buyer |
| `weight_note` | text null | a weight as written where it is not a single number ("1 oz each") |
| `item_cost`, `shipping_cost` | numeric(12,2) | cost basis inputs (§6) |
| `tax_rate` | numeric(6,4) | stamped on insert (§6) |
| `tax_includes_shipping` | boolean | stamped on insert (§6) |
| `sales_tax`, `total_cost` | numeric(12,2), **generated** | §6 |
| `numismatic_value` | numeric(12,2) null | hand-entered collector value; never negative |
| `valuation_basis_id` | fk | melt, numismatic, manual |
| `composition_id`, `metal_id` | fk null | metal content (§6) |
| `fineness` | numeric(6,4) null | 0.9000, 0.9990 |
| `gross_weight_ozt`, `fine_weight_ozt` | numeric(12,6) null | troy ounces |
| `attributes` | jsonb | the long tail only |
| `source` | provenance_source | default `manual` |
| `created_at`, `updated_at` | timestamptz | |

**`item_code` never changes and is never reused.** It survives listing,
sale, return and relisting, so one object has one history.

- It comes from a sequence, not from `id`. A gap left by a deletion is
  therefore never filled by a new item wearing a dead item's code.
- The default calls `nextval` once and hands the value to the SQL function
  `item_code_format()`. The function pads it to six digits and keeps any
  digits beyond. `lpad` alone would cut the millionth code to six digits and
  issue one already held.
- The migration creates the function on a real database; `create_all`
  creates it from the same text in `models/core.py`.
- The default expression is written exactly as PostgreSQL stores it, so the
  migration drift test stays quiet.

**Split lots.** A lot bought as one thing and sold as many is split. Each
piece becomes a child with `parent_item_id` pointing at the lot, and the lot
gets `split_at`. The parent is kept, because it holds the purchase order,
the original cost and the code a receipt refers to. But anything that
counts inventory or money must exclude rows with `split_at` set, or the
collection appears to cost twice what it did. Every view and every facet
index does.

**Soft delete is not a disposition.** Disposition records what happened to
an object. "Created by mistake" did not happen to one. `deleted_at IS NULL`
sits beside `split_at IS NULL` in every view.

**`attributes` promotion rule.** Anything filtered, sorted, joined or
aggregated on earns a real column or reference table.

Errors, certificates and attributes such as Star Note are not columns on
the item. They are the link tables in §5.

### `coin_detail` and `currency_detail`

Each is 1:1 with `inventory_item`: the primary key is `inventory_item_id`,
with cascade on delete. Each is present only for the relevant kind, and
every classifier in it is nullable.

- `currency_detail` belongs to a banknote.
- `coin_detail` belongs to every other kind.

A kind change swaps the row (`app.item_kinds.match_detail_to_kind`).
Changing a banknote to another kind is refused while the note row holds a
value.

| `coin_detail` | Notes |
|---|---|
| `mint_id` | fk `mint` |
| `variety` | varchar(128), free text |
| `serial_number` | varchar(64) null, indexed. Stamped on a bar, round or Goldback; bullion only (§5) |
| `pcgs_type_id` | fk `pcgs_type` (§5) |
| `pcgs_status` | `unknown` \| `proposed` \| `confirmed` \| `conflicting` (check constraint), default `unknown` |

| `currency_detail` | Notes |
|---|---|
| `note_type_id` | Federal Reserve Note, Silver Certificate, … |
| `series_year`, `series_letter` | a series letter is **not** a mint mark |
| `series_designation` | **generated**: `1957B`, or `1935` with no letter |
| `seal_color_id`, `signature_combination_id`, `fed_district_id` | fks |
| `serial_number` | varchar(64), indexed; leading zeros and star suffixes carry meaning |
| `friedberg_id` | fk `friedberg_number` (§5) |
| `friedberg_status` | same four values as `pcgs_status` |
| `face_plate_number`, `back_plate_number`, `plate_position` | varchar(16). Needed to identify a mule, and they carry check letters |
| `printing_facility` | `dc` \| `fw` (check constraint); null when not known. Read from the face plate when there is one: `FW` before the plate number means Fort Worth (`app.plates`) |
| `coolness_index` | numeric(5,2) null, check 0 to 100 (`ck_currency_detail_coolness_index`). The "Coolness Index" CoolNumbers.com gives a serial, typed by the owner |
| `star_run_size` | integer null, check above 0 (`ck_currency_detail_star_run_size`). The size of a star note's print run, typed by the owner |

A series letter (`1957-B`) and a mint mark (`1921-D`) look alike but mean
different things. They are therefore separate columns on separate tables.

### `vendor`, `seller` and `purchase_order`

Where things were bought.

- The **vendor** is usually the marketplace or house: ebay.com, whatnot.com,
  a mint, a dealer.
- The **seller** is the account on it that actually sold the pieces. One
  seller sells many purchases.

| `vendor` | Notes |
|---|---|
| `name` | unique whatever its case (`uq_vendor_name`, on `lower(name)`) |
| `host` (indexed), `url` | the site, when there is one |
| `vendor_kind_id` | fk null: marketplace, auction, mint, dealer, private, unknown |

| `seller` | Notes |
|---|---|
| `name` | unique whatever its case (`uq_seller_name`, on `lower(name)`) |
| `store_url` | their store or profile page (http(s)), or a `mailto:` address. A mail address typed alone is stored as one |
| `contact_name`, `contact_email`, `contact_phone` | optional: the person behind the account, for a seller dealt with directly. The phone is E.164, checked at entry as a customer's is |

| `purchase_order` | Notes |
|---|---|
| `vendor_id` | fk, not null |
| `seller_id` | fk null, indexed: who sold it on the marketplace the vendor names |
| `order_number` | varchar(128), nullable |
| `ordered_on` | date, indexed |
| `source_url`, `notes` | |

`order_number` is text, because marketplace and auction identifiers carry
leading zeros, letters and separators. Many channels issue none, so it is
nullable. A partial unique index keeps it unique per vendor when present:
`uq_purchase_order_vendor_number` on `(vendor_id, order_number) WHERE
order_number IS NOT NULL`.

---

## 4. Reference data and provenance

The shared vocabulary: every word an item is classified with, so that
search, facets and reports group on one concept rather than on spellings
(`models/reference.py`).

Every classifier table uses `ReferenceMixin` (`models/base.py`), which
gives it these columns:

- `id`;
- `code`: unique (`uq_<table>_code`), machine-facing, and must not change
  once referenced;
- `label`: display text, which may be reworded;
- `sort_order`, `is_active`, `source`.

Foreign keys to classifier tables are `ON DELETE RESTRICT`, so a classifier
in use cannot vanish.

| Table | Classifies | Extra columns |
|---|---|---|
| `item_kind` | coin, currency, bullion, set, medal, token, other, unknown | |
| `bullion_form` | Silver Eagle, Silver Bar, Krugerrand, … | `metal_id`, `typical_fine_weight_ozt`, `typical_fineness` |
| `set_form` | Mint Set, Proof Set, … | |
| `storage_form` | single, roll, tube, strap, brick, box, bag, album, … | `default_quantity` (a data-entry default only: choosing the form in the item editor fills Pieces with it while Pieces is 1 or the previous form's count) |
| `currency` | USD, … | `symbol`, `minor_units` |
| `country` | issuer | `iso_alpha2` |
| `denomination` | a face value | `currency_id`, `face_value` numeric(12,4), `kind` (`coin` \| `note`); unique `(currency_id, face_value, kind)` |
| `series` | design series | `year_start`, `year_end`, `applies_to` (`coin` \| `currency`, text with a check constraint, default `coin`), `denomination_id`, `needs_evidence`, `seal_color_id`, `note_type_id` |
| `mint` | coin mint | `mark` (may be blank), `country_id` |
| `grade_scale` | Sheldon, adjectival, note scale | |
| `strike_type` | business, proof, specimen, reverse proof, … | `prefix`, `suffix` |
| `grade` | condition | `grade_scale_id`, `numeric_value`, `is_plus`, `grade_rank` (**generated**: number + 0.5 for plus) |
| `grade_designation` | DCAM, CAM, RD, RB, BN, FS, FB, … ; EPQ, PPQ | `applies_to` (`coin` \| `currency` \| `any`): the API refuses the other kind's |
| `grading_service` | PCGS, NGC, ANACS, ICG, PMG, SEGS, CACG, SELF | |
| `authenticity` | unverified, genuine, counterfeit, questionable | |
| `item_attribute` | Star Note, No Motto, First Strike, CAC, Details, … | `applies_to`, `attribute_group` (`serial` \| `variety` \| `release` \| `verification` \| `qualifier`) |
| `note_type` | banknote class | |
| `seal_color` | blue, red, brown, green, gold, … | `base_seal_color_id` (what a shade is read as) |
| `fed_district` | A Boston … L San Francisco | `letter`, `city`, `number` |
| `signature_combination` | Treasurer and Secretary; on a large-size note, Register and Treasurer -- a `secretary` or a `register`, never both | `treasurer`, `secretary`, `register`, `term_from`, `term_to` |
| `metal` | silver, gold, platinum, palladium, copper, nickel, zinc, clad (copper-nickel), manganese brass (the golden dollars) | `symbol`, `label_name` (the short name a coin's holder label prints), `is_precious`, `base_metal_id` (what a plated metal is read as for a composition) |
| `valuation_basis` | melt, numismatic, manual | |
| `error_type` | mint or printing error | `applies_to` (`coin` \| `currency` \| `any`) |
| `item_status` | acquisition axis (§7) | |
| `disposition` | sales axis (§7) | |
| `storage_location_kind` | safe_deposit_box, safe, home, in_transit, consigned, sold, unknown | |
| `image_role` | obverse, reverse, edge, detail, slab, certificate, … | |
| `vendor_kind` | marketplace, auction, mint, dealer, private, unknown | |
| `sales_venue_kind` | own_store, marketplace, live_auction, auction_house | |
| `carrier` | USPS, UPS, FedEx, DHL | `tracking_url_template` |
| `sales_order_status` | pending, paid, packed, shipped, delivered, canceled, refunded | |
| `sales_fee_kind` | commission, processing, listing, shipping_label, promotion, other | |
| `shipment_status` | label_created, in_transit, delivered, lost, returned | |

`REFERENCE_MODELS` in `models/__init__.py` lists them in dependency order.
Seeding, export and the `/api/reference/<table>` endpoints all walk it.
`test_every_reference_table_is_registered` fails if a classifier table is
left out.

**Grade is several facts, not one string.** `PR69DCAM PCGS` is a strike
type, a number, a designation and a service. Stored as text, it would make
"all my MS65-and-better Morgans" unanswerable. The SQL function
`grade_display(strike_prefix, strike_suffix, numeric_value, is_plus,
label, sheldon)` composes the display form. The views call it, and
`app.grades` mirrors it in Python. A strike with no prefix takes MS, AU,
XF … from the number.

**Series.** `series.label` is the formal name. Two child tables hang off
it:

- `series_alias` (`series_id`, `alias`, `is_active`, `source`; unique per
  series) carries what people say — "Mercury" for the Winged Liberty Head
  Dime. An item inherits aliases through its series.
- `series_year_range` (`series_id`, `denomination_id`, `year_start`,
  `year_end`, `letters`) holds the runs of years a design was issued in,
  since one span would make every dollar since 1878 a Morgan. `letters`
  narrows a note series by letter, with `*` meaning no letter. Its unique
  constraint is `NULLS NOT DISTINCT`: most ranges have no denomination of
  their own, and a re-load would otherwise duplicate them.

Both child tables cascade on delete from `series`. They are the only
reference foreign keys that do.

**`note_issue`** is a table of facts, not a classifier. It has one row per
small-size issue, with these columns: `denomination_id`, `series_year`,
`series_letter`, `note_type_id`, `seal_color_id`,
`signature_combination_id`, `variant` (Hawaii, North Africa),
`serial_prefix`. `app.classifier_defaults` looks notes up in it instead of
each note being typed by hand.

- A series issued in two classes has two rows.
- `uq_note_issue` (`NULLS NOT DISTINCT`) is unique over denomination, year,
  letter, class and seal.
- The seed file owns the table: a load makes the rows match the file
  exactly.

**`reference_alias`** gives another name to a row of any classifier —
"Legal Tender Note" for United States Note. Its columns are `table_name`,
`row_id`, `alias`, `is_active` and `source`. It names the row by table and
id, because a foreign key cannot point at any table. Seed loads only add,
so a removed shipped alias is kept with `is_active = false`.

**`reference_merge`** records a value merged into another and removed
(`table_name`, `code`, `label`, `merged_into`, `merged_at`,
`merged_by_id`). A later seed load then skips the merged code rather than
resurrecting it.

**Errors** are recorded per item in `item_error` (§5), classified by
`error_type`. `applies_to` exists because coin and note vocabularies barely
overlap: a coin is struck, a note is printed. Errors are never inferred
from description text. Seller prose matches error keywords both falsely and
not at all.

---

## 5. Identification

What an item *is*, beyond its classifiers: its grading certificate, its
errors and attributes, and the catalog type it belongs to
(`models/identification.py`). Five concepts that are routinely conflated
are kept apart:

| Concept | Scope | Lives in |
|---|---|---|
| Grading agency | who certified it | `inventory_item.grading_service_id` |
| Certificate serial | one holder | `item_certification.cert_number` |
| Note serial | printed on the note | `currency_detail.serial_number` |
| Bullion serial | stamped on one bar, round or Goldback | `coin_detail.serial_number` |
| Type number | every item of the type | `friedberg_number`, `pcgs_type` |

- Serials and certificate numbers are text. None is unique across items:
  two pieces may repeat a number.
- A certificate number appears once per item
  (`uq_item_certification_item_number`).
- The type numbers are the catalogs' own keys, and each is unique:
  `friedberg_number.fr_number` (text) and `pcgs_type.pcgs_number`
  (integer).
- Only bullion holds a serial on `coin_detail`. The item edit refuses one
  for any other non-note kind.

### Per-item link tables

| Table | Key and columns | Notes |
|---|---|---|
| `item_certification` | `id`; `inventory_item_id`, `grading_service_id`, `cert_number` (indexed) | one to many: a lot may hold several certified pieces; unique `(inventory_item_id, cert_number)` |
| `item_error` | `id`; `inventory_item_id`, `error_type_id`, `details`, `source`, `noted_by_id`, `noted_at` | unique `(inventory_item_id, error_type_id)`: a miscut and an overprint on one bill are two rows, the same error twice is one |
| `item_attribute_link` | pk `(inventory_item_id, item_attribute_id)`; `source`, `derived_by`, `noted_by_id`, `noted_at`, `removed_at` | many to many; `derived_by` names the rule (`serial_pattern`, `attribute_rule`, `no_cost`) |

**A removed attribute stays removed.** A rule reading the serial would put
a deleted link straight back. So a person removing one sets `removed_at`
instead. Every reader skips such rows, and every rule leaves them alone.

### Type catalogs

A Friedberg or PCGS number identifies a *type*, shared by every matching
piece, not one object. Both are commercial catalogs, so neither table is
seeded (see `docs/reference-data.md`).

- `friedberg_number` is **curated as notes arrive**. Resolving a note
  against it is a proposal, never a derivation. The lookup returns the rows
  that match what is known of the note, in the order they were recorded. A
  person confirms one. Confirmation stamps `verified_by_id` and
  `verified_at`, so the next lookup can trust the row.
- `pcgs_type`, with `coin_detail.pcgs_type_id` and `pcgs_status`, is in the
  schema, and nothing in the application writes or reads it.

| `friedberg_number` | Notes |
|---|---|
| `fr_number` | varchar(32), unconditionally unique (`uq_friedberg_number_fr_number`) |
| `base_number`, `district_letter` | `base_number` (int, indexed) is filled by nothing in the application. `district_letter` is A to L, in capitals |
| `note_type_id`, `denomination_id`, `series_year`, `series_letter`, `seal_color_id`, `signature_combination_id` | |
| `size_class` | `large` \| `small` \| `fractional` (check constraint) |
| `web_press` | boolean null: web-press and sheet-fed printings are different types |
| `printing_facility` | `dc` \| `fw` (check constraint), null when not known. A 2017-A $1 printed in Washington and one printed in Fort Worth are different types |
| `is_star`, `is_mule` | boolean, generated from `fr_number`, read past any seal shade (` LGS`, ` DGS`). A `*` ending the rest is a star note; an `m` before it (or ending the rest) is a mule. `app.fr_format.fr_traits` reads the same rule, and a test holds the two together |
| `description`, `source`, `verified_by_id`, `verified_at` | |

**Identity is partially unique.** `uq_friedberg_number_identity` is unique
on `(denomination_id, series_year, series_letter, note_type_id, district_letter,
web_press, signature_combination_id, seal_color_id, printing_facility,
is_star, is_mule)`
**`NULLS NOT DISTINCT`**, only where denomination, year and note type are
known.

- *Partial*, because a plain unique index would reject two types that are
  each half-known in a different way. That is normal in a catalog built by
  hand.
- *`NULLS NOT DISTINCT`*, because most series have no letter. PostgreSQL
  otherwise treats two NULLs as different, so the index would never fire
  and one type could be recorded twice under two numbers.
- *Every column that tells two types apart is a member.* Many series differ
  only by signatures, and wartime issues only by seal color. A mule differs
  from its plain type only by its plates, and a star note only by its
  serial; neither is a catalog fact. So the number's own `m` and `*` are
  members too: `9907-E`, `9907-Em` and `9907-E*` are three types.

| `pcgs_type` | Notes |
|---|---|
| `pcgs_number` | int, unique (`uq_pcgs_type_number`) |
| `description`, `denomination_id`, `series` (text), `variety`, `year`, `mint_id` | |
| `source`, `verified_by_id`, `verified_at` | |

`uq_pcgs_type_identity` is unique on `(denomination_id, year, mint_id,
variety)` where denomination, year and mint are known.

---

## 6. Money and valuation

What an item cost is stored once and never restated. What it is worth is
computed from the latest spot price (`models/valuation.py`,
`models/core.py`).

### Cost basis: stored

```
sales_tax  = round((item_cost + CASE WHEN tax_includes_shipping
                                     THEN shipping_cost ELSE 0 END) * tax_rate, 2)
total_cost = item_cost + shipping_cost + sales_tax
```

Both are `GENERATED ALWAYS AS … STORED`, so they cannot drift or be
written. PostgreSQL forbids one generated column referencing another. The
tax expression is therefore repeated inside `total_cost`, from one
constant, `_TAX_EXPR` in `core.py`.

`tax_rate` and `tax_includes_shipping` are columns. They are stamped from
the `SALES_TAX_RATE` and `SALES_TAX_INCLUDES_SHIPPING` settings when the
row is inserted, and never read from settings again.

- Tax paid is a historical fact, so changing the setting affects later
  purchases only.
- `tax_rate` deliberately has no server default. A raw `INSERT` that omits
  it fails rather than using a stale rate.
- `0` records a purchase charged no tax.

The names are chosen to avoid confusion:

- `item_cost`, not "price": price is `listing.price`, the asking side.
- `sales_tax`, not "taxes": income tax on a gain is another thing.

Profit is not a column.

### Weight

Weight is on the item because it is an input to a calculation. It is
`NUMERIC(12,6)` troy ounces, never a float. Six places represent every real
figure exactly, down to a silver dime at `0.072340`.

- **Gross and fine differ.** A Morgan dollar weighs `0.859380` ozt and
  contains `0.773440` ozt of silver. Melt (the value of the metal content)
  uses fine weight.
- `weight_note` keeps a weight written as something other than a single
  number.
- Check constraints keep fineness in `(0, 1]`, weights non-negative, and
  fine within gross.

Precious metals are sold by the troy ounce (31.1035 g); copper rounds are
often sold by the avoirdupois ounce (28.35 g). Record the unit a source
meant rather than assuming it. `shipment.weight_oz` (numeric(10,3)) is
unrelated: it is a postal weight in avoirdupois ounces.

### `composition`

A lookup of public facts from legislation and mint specifications: a 1963
US dime is 90% silver because the law said so. Its columns are
`denomination_id`, `series_id`, `set_form_id`, `country_id`, `year_from`,
`year_to` (null = current), `metal_id`, `fineness`, `gross_weight_ozt`,
`fine_weight_ozt`, `note` and `source`.

- A row names a denomination, a design series, or both
  (`ck_composition_names_a_coin`).
- A row naming a series is that design's own, and outranks the
  denomination's (`app.composition`).
- A row naming a set form describes only the coins of that set, and applies
  to no other coin. Example: the Silver Proof Set's silver dime, quarter
  and half, in a year whose other coins are clad.
- Rows are unique on `(denomination_id, series_id, set_form_id, country_id,
  year_from, metal_id)`, nulls not distinct (`uq_composition_span`).

The item's own metal, fineness and weights override the table where the
table cannot know better.

### Value: computed

```
melt_value     = round(fine_weight_ozt * latest spot * piece_count, 2)
reported_value = melt_value        when valuation_basis = melt
                 numismatic_value  when numismatic or manual
profit         = reported_value - total_cost
profit_pct     = profit / nullif(total_cost, 0)
```

These are columns of the `item_valuation` view, not of any table, because
spot price is an input and it moves.

`metal_price` is a time series, so "as of" questions are answerable. Its
columns are `metal_id`, `quoted_at`, `price_per_ozt` numeric(12,4) and
`source` text default `manual`; it is unique per metal and time.
`ix_metal_price_latest` on `(metal_id, quoted_at DESC)` serves the
latest-quote lookup.

### `valuation_snapshot`

Columns: `inventory_item_id`, `captured_at`, `valuation_basis_id`,
`spot_price_used`, `fine_weight_ozt`, `piece_count`, `melt_value`,
`numismatic_value`, `reported_value`.

Recording the inputs makes each figure reproducible. `piece_count` is
copied rather than joined, so a later correction to the item does not
restate a past valuation. Nothing in the application writes or reads it.

---

## 7. Lifecycle, location and per-field state

Keeping track of each object: whether it has arrived, where it is now and
was before, and which of its fields a pass filled in or someone changed
(`models/lifecycle.py`).

### Two axes

How an item **came in** and how it **goes out** are different questions.
One column would make "received and sold" unrepresentable.

```
inventory_item.status_id       ordered → received → (canceled | returned | missing); also unknown
inventory_item.disposition_id  held → listed → sold → shipped → delivered; also returned_by_buyer
```

- `missing` means paid for, not canceled, and never arrived.
- Status is per item, not per order. Split shipments are normal, and
  partial receipt leaves the rest `ordered`.

| `item_status_history` | Notes |
|---|---|
| `inventory_item_id`, `from_status_id`, `to_status_id` | `from_status_id` is null on an item's opening row |
| `changed_at`, `changed_by_id`, `note` | |
| `arrived_on` | date the parcel actually arrived, when that differs from when it was recorded; null on non-arrivals |

History is a table, so "when did this arrive" survives a later correction.
That holds only because of two rules:

- **`app.lifecycle_writes` is the only writer of `status_id` and
  `storage_location_id`**, and writes the history row with every change.
- Every path that creates an item records its opening row.

Disposition has two other writers:

- `app.offering_writes` (§9) owns disposition changes caused by offering.
- `app.order_writes`, which moves the stock, owns the move to `sold` when a
  sale takes a listing's last unit, and back to `listed` when stock
  returns.

### Physical location

| `storage_location` | Notes |
|---|---|
| `storage_location_kind_id`, `institution`, `identifier` (box or container number), `notes` | |

`uq_storage_location_identity` is unique on `(storage_location_kind_id,
lower(coalesce(institution, '')), lower(coalesce(identifier, '')))`. Two
rules follow from it:

- The same place written in another case is the same location.
- An absent institution or box counts as empty rather than NULL. Postgres
  treats two NULLs as distinct, so two concurrent first consignments to one
  auction house would otherwise each create a location.

`location_history` (`inventory_item_id`, `storage_location_id`,
`moved_at`, `moved_by_id`, `note`) answers "where was this in March".
`ix_location_history_storage_location_id` answers "what has been kept
here".

### Per-field state

| Table | A row means | Unique |
|---|---|---|
| `item_field_source` (`field_name`, `derived_by`, `derived_at`) | a pass filled this field from known facts and may refresh it; `derived_by = 'held'` means a person emptied it on purpose and no pass may fill it | `(inventory_item_id, field_name)` |
| `item_field_change` (`field_name`, `old_value`, `new_value` JSONB, `changed_by_id`, `changed_at`) | a person's edit changed this field -- one row per change, never updated | none; indexed on `(inventory_item_id, field_name, changed_at)` |

State is kept per field, because attribution works field by field and a
half-done item is the normal state.

- No `item_field_source` row means the value was recorded rather than
  filled by a pass, and no pass touches it.
- Saving a field by hand deletes its row.
- `field_name` is checked against a whitelist in the API, not by a
  constraint, since which fields matter will change.

The passes are listed in
[system-administration.md](system-administration.md), *The passes over
stored items*.

**Who writes `item_field_change`:**

- `PATCH /api/inventory/{id}` and the bulk edit;
- the four passes run under a named person (`app.ebay_orders`,
  `app.listing_links`, `app.bullion_weights`, `app.seller_titles`);
- a vocabulary merge (`app.reference_merge`), which logs each item whose
  classifier, attributes or errors it moved onto the surviving value;
- three item actions, which log themselves: a delete records `deleted_at`,
  a detach records `parent_item_id` (the lot named by its item code), and a
  split records `split_at` on the lot;
- attaching a Friedberg number to a note or clearing it
  (`routers.friedberg`), which logs the note's number and status the same
  way.

All of them go through `app.field_changes`, in the same transaction as the
change, and only for a field whose value actually moved.

`PUT /api/inventory/{id}/errors` logs the item's error set too. Because
that endpoint replaces the set, it writes one `errors` row holding the
whole set before and after (`[{error_type, details}]`). Saving an
unchanged set logs nothing.

Values are stored as the item editor sees them: codes for classifiers,
strings for money. The editor reads the table to say *who* changed a field
it warns about.

Some changes write no entry, so a field changed that way has none:

- the passes that fill derived defaults with no person named (they mark
  `item_field_source`);
- receiving;
- offering.

The item editor's **History** panel reads the table together with
`item_status_history` and `location_history` (`app.item_history`,
`GET /api/inventory/{id}/history`, manager-only). It shows one list, newest
first. Classifier codes are shown by their labels, and a move's origin is
taken from the previous move's destination.

---

## 8. Images

Photographs of items (`models/images.py`). The **file** and its **use** are
separate, because one photograph may serve several purposes with different
visibility. The schema also has link tables for what is shown on a listing
and for outgoing parcels, `listing_image` and `shipment_image`; nothing in
the application reads or writes either.

| Table | Columns | Notes |
|---|---|---|
| `image` | `sha256` (unique), `storage_key`, `media_type`, `byte_size`, `width`, `height`, `captured_at`, `source_ref`, `source_url` | the file, stored once, content-addressed. `source_ref` is the name the photograph goes by: the uploaded file's name, or its path within an imported library, with the stored format's extension. It is replaced by `<item_code>_<nn>` when the photograph is fetched from a web address or filed on another item (`image_links.name_for_place`). `source_url` is the web address it was fetched from, when it was |
| `image_derivative` | `image_id`, `kind` (`thumb` \| `web`), `storage_key`, `width`, `height` | unique `(image_id, kind)` |
| `item_image` | `inventory_item_id` (**nullable**), `image_id`, `image_role_id`, `is_primary`, `sort_order`, `note` | unique `(inventory_item_id, image_id)` |
| `listing_image` | `listing_id`, `image_id`, `sort_order` | unique pair |
| `shipment_image` | `shipment_id`, `image_id`, `kind` (`packed` \| `label` \| `handover` \| `damage`) | unique triple |

There are three link tables rather than one polymorphic subject, so each
has real foreign keys and is constrained on its own.

- A photograph nobody has placed yet is an `image` row with no `item_image`
  row. `item_image.inventory_item_id` is nullable in the schema, but
  `app.image_links` never leaves it null.
- `app.photo_import` links a file named `<item_code>_<nn>`; the console
  places the rest.
- `uq_item_image_primary` allows at most one `is_primary` per item.
- **`app.image_links` is the only writer of `item_image`**, because
  promoting a photograph means demoting the incumbent first, in the same
  transaction.

Bytes live in file storage, never in the database. `app.storage` defines a
small `StorageBackend` interface (`put`, `get`, `delete`, `exists`). The
one implementation is `LocalStorage`, on local disk. An S3-compatible
bucket can be added behind the same interface without touching callers.

### Metadata is stripped at ingest

Photographs of valuables carry GPS coordinates of where the valuables are
kept. `app.imaging` removes metadata when an image enters the system:

```
1. read     capture DateTimeOriginal into `captured_at`; note the orientation
2. rotate   apply the orientation transform to the pixels
3. strip    drop every metadata segment
4. verify   reopen and assert none remains -- fail the ingest if any does
5. hash     sha256 of the cleansed file; that is the identity
6. store    file storage; database records metadata only
```

- Rotation comes before stripping, because orientation is itself metadata.
- Step 4 re-reads the written bytes rather than trusting the library that
  wrote them.
- Originals are never served. Public requests are answered only from
  `image_derivative`.

---

## 9. Selling

Offering items on the web store and other platforms, grouping them into
lots, running auctions, and recording buyers, orders, fees and shipments
(`models/sales.py`, `models/auctions.py`).

`sales_order_item → listing → inventory_item` is one foreign key chain to
any kind of item. The single inventory table is what makes that possible.
The order tables are named `sales_order` and `sales_order_item` because
`order` is a reserved word.

### `sales_venue`

A platform the business sells through: the web store, eBay, an auction
house. Its rows are installation data, not shipped reference data.

| Column | Notes |
|---|---|
| `code` (unique), `name`, `sales_venue_kind_id` | |
| `is_own_store` | true on exactly one row (`uq_sales_venue_own_store`, partial on `is_own_store`). The baseline migration creates that row (`store`, "Web store") |
| `vendor_id` | fk null, unique: the same business as a purchase source, so eBay is one partner either way |
| `account_handle`, `listing_url_template` | |
| `commission_rate`, `processing_rate` | numeric(6,4) fractions in `[0, 1]` |
| `processing_fixed`, `listing_fee` | numeric(12,2), non-negative |
| `terms_as_of` | date the default fees were read |
| `notes`, `is_active`, `version` | |

The fee columns are **defaults for estimating** a sale's net. They are
never stored per sale; what was actually charged is in `sales_order_fee`.

### `listing`

What is offered, where, and at what price.

| Column | Notes |
|---|---|
| `inventory_item_id` / `sales_lot_id` | exactly one is set (`ck_listing_item_xor_lot`) |
| `price`, `currency_id`, `quantity_available` | a lot listing has quantity ≤ 1 (`ck_listing_lot_quantity_one`) |
| `sales_venue_id` | not null: every offer is attributable to a platform |
| `format` | `fixed_price` \| `auction` |
| `status` | `active` \| `paused` \| `ended` |
| `is_active` | **generated**: `status = 'active'`; cannot be written |
| `external_id`, `external_url` | the platform's listing number and page |
| `paused_by_listing_id` | fk `listing`: the offer this store listing was set aside for; null unless paused |
| `title`, `description` | public text; blank falls back to the item's |
| `listed_at`, `ended_at`, `version` | |

- The shop and checkout accept only listings on the own-store venue, with
  `format = fixed_price` and `status = active`.
- `ix_listing_active` indexes `inventory_item_id WHERE is_active`.
- Relisting always makes a **new** row; an ended one is never reused.
  `ended_at` is set once.

`listing_status_history` (`listing_id`, `from_status`, `to_status`,
`changed_at`, `note`) is the offer timeline: the opening row, each pause,
resumption and ending. `note` says why in words ("sold", "withdrawn",
"paused for listing #12"), which status alone cannot.

### `offer_claim`: an item is offered in one place at a time

One row per listing that holds an item: an item listing has one claim, a
lot listing one per member.

| Column | Notes |
|---|---|
| `inventory_item_id`, `listing_id` | unique pair |
| `state` | `active` \| `paused` \| `released`, following the listing's status one for one |

**`uq_offer_claim_active`** is a partial unique index on `inventory_item_id
WHERE state = 'active'`.

- Released claims accumulate as history.
- Two active claims on one item are impossible. The index is the backstop
  if two requests race.
- A paused claim is a store listing set aside while the item is offered
  elsewhere. It keeps its listing and price, and resumes if that offer ends
  unsold.

**`app.offering_writes` is the only writer of `listing.status`,
`listing.ended_at`, `offer_claim`, `listing_status_history`,
`sales_lot.status`, `sales_lot_item.released_at` and the disposition changes
they cause.** It writes each in the same transaction as the listing it
mirrors. Demo seeding goes through it too.

### Sales lots

A sales lot is a temporary grouping, offered and sold as one thing. It is
deliberately not an inventory item, which would count it beside its own
members.

| Table | Columns | Notes |
|---|---|---|
| `sales_lot` | `title`, `description`, `status` (`assembling` \| `offered` \| `sold` \| `dissolved`), `version` | editable only while `assembling`; never reopened, a re-offer is a new lot |
| `sales_lot_item` | `sales_lot_id`, `inventory_item_id`, `released_at`, `created_at`, `updated_at` | unique pair; `uq_sales_lot_item_open` on `inventory_item_id WHERE released_at IS NULL` keeps an item in one open lot |

Membership is released, not deleted: which coins were in a lot that sold is
part of the sale's record. `app.lot_writes` assembles lots. Once offered,
they belong to `app.offering_writes`.

### Auctions

| Table | Columns | Notes |
|---|---|---|
| `auction` | `sales_venue_id`, `title`, `external_id`, `starts_at`, `ends_at`, `status`, `consigned_on`, `notes`, `version` | status `draft` \| `scheduled` \| `consigned` \| `closed` \| `settled` \| `canceled` |
| `auction_lot` | `auction_id`, `listing_id` (unique), `lot_number` (text), `reserve`, `result`, `hammer_price`, `buyer_customer_id` | unique `(auction_id, lot_number)`; `result` (`sold` \| `unsold` \| `withdrawn`) null until settled |

- An auction-format listing belongs to an auction. A timed eBay auction is
  an auction with one lot.
- `consigned` and `consigned_on` apply to auction houses, which take
  physical custody. Custody is tracked by `consigned_on IS NOT NULL`, not
  by status.

**`app.auctions` is the only writer of every auction transition** --
status, custody, and which `auction_lot` rows exist. It:

- offers and ends through `offering_writes`;
- moves items through `lifecycle_writes.set_location`;
- settles through `sales_writes.record_sale_lines`.

`routers.auctions` writes only what carries no consequence. It creates a
`draft` auction, and edits an auction's wording and dates and a lot's
number and reserve.

### Customers and addresses

| `customer` | Notes |
|---|---|
| `user_id` | fk `users` null, unique: a login has at most one customer |
| `display_name`, `email`, `phone`, `notes` | |
| `sales_venue_id`, `venue_username` | a buyer known on a platform; null for a store customer |

- `uq_customer_venue_username` is unique on `(sales_venue_id,
  lower(venue_username))`, because platforms display one account's name in
  varying case.
- `uq_customer_venue_undisclosed` allows one row per venue with no
  username, for houses that do not name buyers.

`address` has the columns `customer_id`, `address_kind` (`shipping` \|
`billing`), `line1`, `line2`, `city`, `region`, `postal_code`,
`country_id`, `is_default`, `valid_from` and `valid_to`. Addresses are
superseded rather than edited, so a past order still shows where it went.
`uq_address_default` allows one default per customer and kind.

### Orders

| Table | Columns | Notes |
|---|---|---|
| `sales_order` | `customer_id`, `sales_venue_id`, `external_order_id`, `sales_order_status_id`, `shipping_address_id`, `billing_address_id`, `total_amount`, `placed_at`, `notes`, `placed_by_id`, `version` | `placed_by_id` is the buyer or a manager acting for them |
| `sales_order_item` | `sales_order_id`, `listing_id`, `quantity` (> 0), `unit_price`, `item_snapshot` (jsonb), `snapshot_at` | price and item description captured at sale (`app.sale_snapshot`), so later edits never rewrite history |
| `sales_order_item_share` | `sales_order_item_id`, `inventory_item_id`, `amount`, `fee_amount` (default 0) | unique pair; one row per item on every line |
| `sales_order_fee` | `sales_order_id`, `sales_fee_kind_id`, `amount`, `note` | actual fees from the platform's statement |
| `sales_order_change` | `sales_order_id`, `changed_at`, `changed_by_id`, `change`, `listing_id`, `from_value`, `to_value` | the order's edit history; `change` is the `sales_order_change_kind` enum |
| `shipment` | `sales_order_id`, `carrier_id`, `shipment_status_id`, `tracking_number`, `service_level`, `shipped_at`, `delivered_at`, `cost`, `insured_value`, `weight_oz` | unused scaffolding: nothing in the application reads or writes it. It hangs off the order, one to many, so partial shipment would work |

**Shares are the one answer to "which items did this order carry".** A
share is one item's part of an order line. A single-item line has one
share, and a lot line one per member. Shares sum exactly to their line
(`app.allocation`), so no cent is lost.

Net payout is `total_amount − sum(sales_order_fee.amount)`, computed when
asked and never stored.

- `app.order_writes` writes orders, lines and share rows with their
  amounts, and is the one place stock moves.
- `app.sales_writes` writes `sales_order_fee` and fills in `fee_amount`.

---

## 10. Views and access boundaries

Four views are defined in `models/views.py` (`CREATE_VIEWS`, `DROP_VIEWS`).
Migrations create them, since Alembic autogenerate reflects tables only.
All four exclude split and soft-deleted items.

| View | Shows |
|---|---|
| `coin_inventory` | kinds coin, bullion, set, medal, token, with coin detail and the composed grade; an item of kind `other` or `unknown` is in neither inventory view |
| `currency_inventory` | kind currency, with note detail, the Friedberg number, both signers (`secretary` on a small-size note, `register` on a large-size one) and the composed grade |
| `item_valuation` | melt, reported value, profit and profit % from the latest spot price (§6) |
| `public_catalog` | active, fixed-price, own-store **item** listings with `quantity_available > 0`, and the public item fields; lot listings are not in it |

**Nothing in the application reads them.** `app.inventory_search` queries
the base tables with only the joins each query needs, which is far faster
than paying for every join in a view. The views remain the schema's
statement of what each inventory and the public catalog contain.

**`public_catalog` describes the authorization boundary; code enforces it.**

- The view must never expose storage location, `local_catalog_number`,
  cost basis, purchase details, the owner's `rating` or lineage.
  `test_public_catalog_never_exposes_private_columns` asserts its columns
  against `PUBLIC_CATALOG_FORBIDDEN_COLUMNS`. The view selects no image
  column.
- What actually keeps those fields from a buyer is
  `routers/catalog.py:to_catalog_item`. It builds the public shape field by
  field, with `CatalogItemOut` and
  `test_catalog_never_exposes_cost_basis_or_location`.
- The one photograph it adds is the item's primary one, as the URLs of its
  renditions (`image_derivative`, thumb and web). Every image's renditions
  are served publicly, to whoever holds its hash, and an original is never
  served. The shop names no other photograph of the item.

Anything later built on the view inherits the view's rules, which is why it
is kept honest.

---

## 11. Constraints, indexes and conventions

**Naming.**

- Tables are singular and snake_case. The login table, `users`, is the
  exception.
- Foreign keys are `<table>_id`.
- Booleans read as assertions (`is_active`).
- Timestamps are `*_at`, dates `*_on`.
- Constraints are `ck_…`, unique constraints and indexes `uq_…`, other
  indexes `ix_…`.
- Money is `NUMERIC(12,2)`, rates `NUMERIC(6,4)`, weights `NUMERIC(12,6)`,
  and all timestamps `timestamptz`.
- Most tables carry `created_at` and `updated_at` (`TimestampMixin`).
  History rows carry their own event time instead.

**Enumerations.** Closed, code-defined vocabularies are native PostgreSQL
enums, stored by value (`models/base.py:enum_column`). Open vocabularies
are reference tables (§4).

| Enum | Values | Used by |
|---|---|---|
| `provenance_source` | seeded, derived, manual | reference rows, catalogs, links, items |
| `applies_to` | coin, currency, any | `grade_designation`, `item_attribute`, `error_type` |
| `attribute_group` | serial, variety, release, verification, qualifier | `item_attribute` |
| `denomination_kind` | coin, note | `denomination` |
| `derivative_kind` | thumb, web | `image_derivative` |
| `shipment_image_kind` | packed, label, handover, damage | `shipment_image` |
| `listing_format` | fixed_price, auction | `listing` |
| `listing_status` | active, paused, ended | `listing`, `listing_status_history` |
| `offer_claim_state` | active, paused, released | `offer_claim` |
| `sales_lot_status` | assembling, offered, sold, dissolved | `sales_lot` |
| `auction_status` | draft, scheduled, consigned, closed, settled, canceled | `auction` |
| `auction_lot_result` | sold, unsold, withdrawn | `auction_lot` |
| `address_kind` | shipping, billing | `address` |
| `sales_order_change_kind` | placed, line_added, line_removed, quantity, unit_price, customer, notes, status, total | `sales_order_change` |
| `user_role` | manager, customer | `users` |

Five short vocabularies are text columns with a check constraint instead:
`pcgs_status`, `friedberg_status`, `size_class`, `printing_facility` and
`series.applies_to` (`coin` or `currency`: a design belongs to one side).

**Foreign keys.**

- To reference tables: `ON DELETE RESTRICT`.
- Detail, history and link rows owned by an item: `CASCADE`.
- References to `users` from audit columns (`changed_by_id`,
  `noted_by_id`, `verified_by_id`, …): `SET NULL`, so removing a member of
  staff never erases the record of what they did.

**Check constraints worth knowing.**

- Non-negative: `item_cost`, `shipping_cost`, `numismatic_value`, prices,
  fees, share amounts and share fees
  (`ck_sales_order_item_share_fee_non_negative`), an auction lot's
  `reserve` and `hammer_price`, and shipment costs.
- `piece_count > 0`.
- Year ranges ordered.
- `ck_currency_detail_coolness_index` (0 to 100) and
  `ck_currency_detail_star_run_size` (above 0).
- Fineness a fraction; fine weight within gross.
- The `pcgs_status`, `friedberg_status`, `size_class`,
  `printing_facility` and `series.applies_to` vocabularies.
- `ck_listing_item_xor_lot` and `ck_listing_lot_quantity_one`.
- `ck_listing_paused_by_only_when_paused`: only a paused listing names the
  offer that paused it.
- Address validity ordered.

**Partial and special unique indexes.**

| Index | Guarantees |
|---|---|
| `uq_offer_claim_active` | one active claim per item |
| `uq_sales_lot_item_open` | one open lot per item |
| `uq_item_image_primary` | one primary photograph per item |
| `uq_sales_venue_own_store` | one own store |
| `uq_address_default` | one default address per customer and kind |
| `uq_purchase_order_vendor_number` | order numbers unique per vendor when present |
| `uq_friedberg_number_identity`, `uq_pcgs_type_identity` | one catalog row per fully known type |
| `uq_customer_venue_username`, `uq_customer_venue_undisclosed` | one buyer per platform account |
| `uq_vendor_name`, `uq_seller_name`, `uq_storage_location_identity`, `uq_users_email` | on lowered text: one row whatever the case |
| `uq_note_issue`, `uq_series_year_range` | `NULLS NOT DISTINCT` identities for seeded facts |

**Indexes.**

- Every foreign key that is filtered on is indexed, unless a unique
  constraint or composite index on the same table leads with it. A btree
  serves its leading columns, so that index serves every lookup a
  single-column index would, and the column has no index of its own.
- On `inventory_item`: `ix_inventory_item_kind_status`, and partial facet
  indexes on kind, grade, metal, country, status, disposition and bullion
  form `WHERE split_at IS NULL`. The predicate makes each a smaller index
  over live rows. They do not give the default facet query an index-only
  scan, since that query also filters `deleted_at IS NULL`, which is not in
  the predicate.
- `ix_listing_paused_by_listing_id` (partial, `WHERE
  paused_by_listing_id IS NOT NULL`) finds the listings an offer paused.
- `ix_location_history_storage_location_id` counts a location's moves
  before it may be deleted.
- Time-ordered history indexes on `item_status_history`,
  `location_history`, `listing_status_history`, `item_field_change` and
  `valuation_snapshot`; `ix_metal_price_latest`.
- Expression indexes and defaults are written exactly as PostgreSQL stores
  them, casts included, or the drift test reports them changed on every
  run.

There is no full-text, trigram or `attributes` index:

- Nothing queries `attributes` with a JSONB operator.
- The search ORs `ILIKE '%...%'` over four columns with an `EXISTS` on the
  purchase's order number. An OR with a subquery arm cannot become a bitmap
  scan, so pg_trgm GIN indexes go unused there.
- Measured on a synthetic table: about 15 ms for 8,500 items with or
  without them, and 140 ms for 85,000. Dropping the `EXISTS` arm would let
  the indexes cut the larger case to 9 ms.

**Extension.** The baseline enables `fuzzystrmatch`, for `levenshtein()`.
The data-quality check that finds a serial one character off another in
the same order (`app.issues`) uses it. It ships with PostgreSQL's contrib
modules. The role that runs the migrations must be allowed to create it.
It is a trusted extension, so any role with `CREATE` on the database may,
as may a superuser.

**Optimistic concurrency.** `inventory_item`, `listing`, `sales_venue`,
`sales_lot`, `sales_order` and `auction` carry `version`
(`models/base.py:VersionedMixin`), used as SQLAlchemy's `version_id_col`.

- Every UPDATE checks the version it read, so two people editing one
  record cannot silently overwrite each other.
- Editing is a document edit, where a person can resolve a conflict. A row
  lock held across a form would therefore be wrong.
- Every PATCH of these rows must send the version it was made against (an
  item's may send `base` instead). One that sends none is a 422.
- The order path decrements `listing.quantity_available` under a row lock
  it has just re-read, so its own UPDATE never meets a stale version. The
  decrement does move the version, so a listing form opened before a sale
  is refused when saved after it.

**Row locks.** Anything that moves stock or claims locks the affected rows
`FOR UPDATE`, through `offering_writes.lock_for_sale`, in one fixed order —
lot rows, then items by ascending id, then listings by ascending id, each
kind in one statement. Concurrent buyers can therefore neither oversell nor
deadlock. See [lock-order-design.md](specs/lock-order-design.md). Tests
drive these paths from real threads, because a test that serializes its
requests passes with the lock removed.

**Single writers.**

| Module | Only writer of |
|---|---|
| `app.lifecycle_writes` | `inventory_item.status_id`, `storage_location_id`, `item_status_history`, `location_history` |
| `app.offering_writes` | `listing.status`, `listing.ended_at`, `offer_claim`, `listing_status_history`, `sales_lot.status`, `sales_lot_item.released_at`, and the dispositions they cause |
| `app.lot_writes` | lot membership while `assembling` |
| `app.image_links` | `item_image` |
| `app.auctions` | auction transitions (`auction.status`, custody, `auction_lot` rows) |
| `app.order_writes` | order lines, share rows and amounts; stock decrements |
| `app.sales_writes` | `sales_order_fee`, share `fee_amount` |
| `app.field_sources` | `item_field_source` |
| `app.field_changes` | `item_field_change` |

**Migrations.** Their requirements:

- **PostgreSQL 17 or later.** The schema uses `NULLS NOT DISTINCT` unique
  constraints and indexes, and a revision changes generated columns with
  `ALTER COLUMN ... SET EXPRESSION`, which arrived in 17. The baseline
  checks the server's version before creating anything, and stops with
  that message on an older one.
- The `fuzzystrmatch` extension (above).
- **Online only.** The baseline and the data migrations read the database
  as they go, so `alembic upgrade --sql` is refused rather than emitting a
  script.

The first Alembic revision is a baseline: `backend/alembic/baseline.sql`,
generated by `pg_dump` from the schema itself. It holds the tables, views,
types, `grade_display()` and the rows a fresh install needs. Every later
schema change is a revision on top of it in `backend/alembic/versions/`.

`tests/test_migrations.py` builds a database by running the migrations
alone, then asserts that:

- autogenerate finds no difference from the models;
- the baseline's fee kinds load;
- every check constraint, generated column expression and partial index
  predicate equals the `create_all` test database's (autogenerate compares
  none of them);
- the selling check constraints and the `uq_sales_lot_item_open` predicate
  carry the exact text written in the test;
- its views, `grade_display()` and `item_code_format()` equal the
  definitions in `app.models.views`, `app.grades` and `app.models.core`,
  from which the `create_all` test database is built.

A migration that changes a view runs `DROP_VIEWS` and then `CREATE_VIEWS`.
The baseline cannot be downgraded; to go back, restore a backup.

---

## 12. Reference data is shipped, not typed

Most reference rows are facts true everywhere — Sheldon grades, US mints,
the twelve Federal Reserve districts, the composition of a pre-1965 dime.
They live in versioned JSON under `backend/data/reference/` and load into
any installation. Run the commands below from `backend`, with the `ccwebdb`
environment active. Each command is the same on both systems; only the
folder differs.

Load every seed file; idempotent:

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding load
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.seeding load
```

Only the tables named (several may follow `--only`):

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding load --only TABLE
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.seeding load --only TABLE
```

From another folder:

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding load --data-dir FOLDER
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.seeding load --data-dir FOLDER
```

Write seed files; add `--source seeded derived` and `--include-inactive` to widen it:

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding export --out FOLDER
```

Linux (bash):

```console
cd ~/dev/ccweb/backend
python -m app.seeding export --out FOLDER
```

**Foreign keys travel as codes, not ids.** A seed row says
`"metal": "silver"`. The key `metal` resolves through the column
`metal_id` to whatever table it references, so a new classifier needs no
loader change.

**`source` decides what is exported.**

| source | meaning | exported by default |
|---|---|---|
| `seeded` | shipped vocabulary or confirmed public fact | yes |
| `derived` | learned from real data by a rule | only if asked for |
| `manual` | one operator's own decision | only if asked for |

A load never overwrites a `manual` row: a person's correction outranks a
shipped default. A load also skips a merged code (`reference_merge`).

Some closed vocabularies are defined by the product rather than the world:
`sales_venue_kind` and `sales_fee_kind`. The baseline migration seeds them,
along with the own-store `sales_venue` row and the six `strike_type` rows
(business, proof, specimen, reverse proof, enhanced reverse proof, special
mint set).

- `sales_venue_kind` and `strike_type` are in the seed files too
  (`operations.json`, `condition.json`), so a load keeps them current.
- `sales_fee_kind` has no seed rows, and the loader skips a classifier with
  none.

Seed files hold facts only, never a catalog publisher's numbering or prices
(`docs/reference-data.md`).

---

## 13. Users and settings

`users` is the login table (`models/scaffold.py`). Its columns:

- `email`: unique whatever its case (`uq_users_email` on `lower(email)`);
- `full_name`, `hashed_password`;
- `role` (`manager` \| `customer`);
- `is_active`;
- `theme` (`auto` \| `light` \| `dark`): the account's light/dark choice,
  `docs/specs/theme-preference-design.md`;
- `token_version`, `created_at`.

Managers run the console and see cost basis; customers do not. Tokens are
stateless JWTs carrying `token_version`. It is bumped on every password
change, so a reset revokes every token issued before it.

The table is referenced by `customer.user_id` and by the audit columns on
history, catalog, error, attribute, merge and order rows, all `ON DELETE
SET NULL`.

`label_printer_correction` (`models/scaffold.py`) is the installation's
printer correction for holder labels: one row at most (`id` = 1,
`ck_label_printer_correction_one_row`), with `across` and `down` percents,
numeric(4,1) between 90 and 110, and `updated_at`. No row is 100% both
ways (`docs/specs/holder-labels-design.md`, section 4).

---

## 14. Not built

- No per-sale record of a platform's fee *estimate*; estimates are computed
  from `sales_venue` when shown.
- No stored net payout or realized gain; both are computed from shares and
  fees when asked.
- No S3-compatible storage backend yet; images are on local disk (§8).
