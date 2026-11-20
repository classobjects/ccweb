# System administration

**What this covers.** How to run the business system day to day, not how to
build it. That means:

- accounts and roles, and settings;
- the command-line passes that keep the collection record correct;
- how items are entered, changed, received, offered and sold;
- reports and reference vocabularies;
- backups, and applying a schema release.

**Who it is for.** Whoever administers the system: a manager using the
console, or someone at the command line on the machine that runs it.

**Why it matters.** The `ccwebdb` database *is* the record of the collection
and its cost basis. Most of this guide is about keeping that record true:

- who may change it;
- which code paths are allowed to write each part of it;
- how to take and prove a backup before anything risky.

Related documents:

- [runtime-operations-windows.md](runtime-operations-windows.md) and
  [runtime-operations-linux.md](runtime-operations-linux.md): starting and
  stopping the services;
- [environment-setup-windows.md](environment-setup-windows.md) and
  [environment-setup-linux.md](environment-setup-linux.md): installing them;
- [database-design.md](database-design.md): how the record is structured.

## Contents

1. [Accounts](#accounts) -- roles, creating accounts, passwords
2. [Settings](#settings) -- `.env`; every setting is in
   [settings.md](settings.md)
3. [The collection record](#the-collection-record) -- the command-line passes
4. [Finding items](#finding-items) -- the inventory search panel
5. [Inventory items](#inventory-items) -- creating, editing, receiving, removing,
   holder labels
6. [Entering a purchase](#entering-a-purchase)
7. [Sales](#sales) -- sales orders
8. [Selling](#selling) -- platforms, offers, sales lots, auctions
9. [Reports](#reports)
10. [Reference vocabularies](#reference-vocabularies) -- values, aliases,
    attributes, errors, seed files
11. [Lists](#lists-friedberg-numbers-sellers-vendors-storage-locations) --
    Friedberg numbers, sellers, vendors, storage locations
12. [Backing up and restoring](#backing-up-and-restoring)
13. [Applying a schema release](#applying-a-schema-release)
14. [Things that are deliberately not configurable](#things-that-are-deliberately-not-configurable)

**Where things are done.** All console work happens in the **management
console** at `/management`. It is a separate application from the shop, and
none of it can be reached from the storefront
(`docs/specs/management-console-separation-design.md`).

The console's menu is one row of groups, named for what the work is for.
Each group opens a list of its pages:

| Group | Pages |
|---|---|
| **Inventory** | Coins, Currency, Labels, Photos, Order lookup |
| **Procurement** | Purchases, Receive |
| **Selling** | Listings, Lots, Auctions, Sales, Platforms, Spot prices |
| **Settings** | People, Vocabularies, Lists |

**Reports** is a single page, so it is a plain link between Selling and
Settings. A group's list closes when you choose a page, press Escape, or click
elsewhere. The group holding the page on screen is underlined.

**Command-line examples are cmd.** Run `python -m` commands from `backend\`
with the `ccwebdb` conda environment active. Run `.\scripts\...` commands
from the repository root.

**On Linux** each command runs the same in bash, with three changes:

- The folder is `~/dev/ccweb`: `cd ~/dev/ccweb/backend` for
  `cd /d %USERPROFILE%\dev\ccweb\backend`.
- A script is `./scripts/NAME.sh` for `.\scripts\NAME.cmd`, with `--option`
  for `/option`.
- A variable is set with `export NAME=value` for `set "NAME=value"`, and
  cleared with `unset NAME` for `set "NAME="`. For a password that is asked
  for, use `read -rs PGPASSWORD` and then `export PGPASSWORD` for
  `set /p PGPASSWORD=...`.

Blocks that differ in more than that show the Linux form beside the Windows
one.

## Accounts

### The two roles

| Role | Sees | Reaches |
|---|---|---|
| `customer` | the shop; their own orders | nothing under `/management`, no cost basis |
| `manager` | everything | the whole console, including what each item cost |

There is no third role and no per-permission grid. The one line the system
enforces is that **cost basis and provenance are not customer-visible**, and
a single yes/no flag expresses it.

**Sign-in is throttled.** In any 15 minutes, the system allows ten failed
attempts from one address and twenty naming one account. Past either limit,
the answer is a 429 with `Retry-After`. That refusal comes before the
password is looked at, so even a right guess is refused.

- A successful sign-in clears the account's failures.
- An address's failures age out on their own. So one right password cannot
  wipe out the failures an address ran up against other accounts.
- The counts are held in the API's memory, and a restart clears them.
- An unknown address takes as long to refuse as a wrong password.

Email addresses are matched without regard to case, both at sign-in and when
an account is created. `Someone@Example.com` and `someone@example.com` are one
account.

Under the hood: sign-in is `POST /api/auth/login`; the throttle is
`app.throttle`.

**Sign-out signs the account out everywhere.** It invalidates every token
issued to the account, on every device, just as a password change does
(`POST /api/auth/logout`).

**Access control lives in the API.** Every manager-only endpoint carries
`require_admin` (`backend/app/deps.py`). That check, not the console's
separate bundle, is what controls access. Splitting the bundle removes an
information leak; it does not enforce anything.

### How accounts come to exist

- **Self-service registration** always creates a `customer`. This is the
  shop's **Register** page (`POST /api/auth/register`). An address already in
  use gets a 409, which reveals that it has an account. So each caller
  address gets five attempts an hour, whatever the answer; a sixth is a 429
  with `Retry-After` (`app.throttle`).
- **A manager creates it** under **People → Accounts → New account**, giving
  email, name, role and an initial password (`POST /api/users`). The role
  has no default in the API, so a manager is never created by omission. An
  email already in use is refused with 409. There is no mail configuration,
  so pass the password on out of band.
- **Promotion**: a manager changes an account's role under **People**.
- **The first manager** of a new installation is created by
  `python -m app.create_admin --email` followed by the address. Run it after
  `python -m app.seeding load` has loaded the reference vocabularies.
  - It asks for the password twice, or takes `FIRST_ADMIN_PASSWORD` when that
    is set.
  - It refuses a password under 12 characters, or one published in this
    repository.
  - It refuses to run when a manager already exists, unless `--another` is
    given.
  - It creates no demo data.
- **A trial installation's** administrator is created by `python -m app.seed`,
  from `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`, with the same password
  rules. It also creates five demo items, each offered in the web store. So
  it is never run against a database holding a real collection: it refuses
  one that already holds a purchase, or an item other than its own demo
  items, and writes nothing. `--into-existing` overrides that refusal.

There is no default password: neither command makes an account without one of
your own.

### What a manager may change

On someone else's account a manager may change exactly three fields
(`PATCH /api/users/{id}`):

| Field | Notes |
|---|---|
| `full_name` | display only |
| `role` | `manager` or `customer` |
| `is_active` | `false` suspends sign-in without deleting anything |

A request naming any other field is refused (the schema is
`extra="forbid"`).

**Email is not editable.** It is the account's identity, and the audit trail
points at the user id behind it (`item_status_history`, `location_history`
and `item_field_change`).

To place an order for someone, the console fetches the customer record behind
their account. It creates that record if the account has never bought
anything (`POST /api/users/{id}/customer`).

### Passwords

A manager sets a password directly; the minimum is eight characters
(`POST /api/users/{id}/password`). There is no reset-by-email flow.

**Changing a password invalidates every token already issued for that
account.** It does this by bumping the account's `token_version`. Tokens are
stateless JWTs, so without that counter every token issued before a reset
would keep working until it expired.

### The last-manager guard

Demoting or deactivating the final active manager is refused with 409.

The check is about the **result, not the actor**: demoting yourself is fine
while somebody else is still a manager. Without the guard, one click locks
everyone out, and recovery means editing the database by hand.

To hand over management:

1. Promote the new person.
2. Confirm they can sign in.
3. Demote the old account.

## Settings

Settings decide:

- where the database, images and photographs are;
- how sessions are signed;
- how purchases are taxed.

They are set in the repository's `.env` (template: `.env.example`).
**[settings.md](settings.md) lists every setting**: whether it is required,
its default, the values it takes, and what must happen before a change is
seen. It also lists the environment variables that are not settings.

Two rules to know:

- A name in `.env` that is not a setting stops the API, and the error names
  it.
- Most settings are read when the API starts. Change them, then restart it.

### Sales tax on acquisitions

Two settings govern tax on purchases ([settings.md](settings.md)):

- `SALES_TAX_RATE` is the rate a newly recorded purchase is taxed at.
- `SALES_TAX_INCLUDES_SHIPPING` says whether shipping is part of the taxed
  amount.

**Both are copied onto each item when it is created, and never read again for
that item.** Tax paid is a historical fact. So a change governs purchases
recorded afterwards, and rewrites none before.

Every item keeps its own `tax_rate` and `tax_includes_shipping`. The database
computes `sales_tax` and `total_cost` from them, and neither can be written
directly.

**A purchase charged no tax has a tax rate of 0.** Set it in any of three
ways:

- tick **No sales tax charged** on the item edit form;
- send `tax_rate` through `PATCH /api/inventory/{id}`;
- use `POST /api/inventory/bulk` for a batch.

Unticking the box restores the rate the item was bought at. For an item
recorded as untaxed, it restores the configured rate.

A rate cannot reproduce a marketplace's own rounding: the marketplace may
charge a cent more or less than rate x price. Those pennies stay as computed.

### Images and the photograph library

Where photographs are kept, and how large their renditions are, is set by
`MEDIA_ROOT`, `PHOTO_LIBRARY_ROOT`, `THUMBNAIL_MAX_PX`, `WEB_MAX_PX`,
`MAX_UPLOAD_BYTES` and `MAX_IMAGE_PIXELS` ([settings.md](settings.md)).

**The image bytes are never stored in the database**, so no database backup
includes them. Back them up with `python -m app.media_backup copy` (*Backing
up and restoring*).

## The collection record

**The `ccwebdb` database is the record.** Data is improved in two ways: in
the console, or by the passes below. The passes fill what is empty and never
overwrite what a person set.

There is no importer. The only bulk way in or out is the workbook backup
(*Backing up and restoring*). Recovery from a data problem is a restore from
a verified backup.

### The passes over stored items

A *pass* is a command that applies a rule to every stored item at once. It
does the work the console does as each item is saved, but for everything
already recorded.

**Each pass is a dry run unless given `--commit`.** A dry run prints what it
would change and writes no database rows.

**Before any pass with `--commit` on the live database**, take a verified
backup and read the dry-run counts.

`--by EMAIL` names the account each change is logged under in the item's
**History**. Where a pass takes `--by`, `--commit` without it is refused.

The passes, with their options:

- **`python -m app.classifier_defaults`** (`--commit`) fills note class,
  seal, signatures, Reserve Bank, composition and No Motto from the facts.
  Run it again after `app.series_classify` assigns a coin a series, since the
  coin's composition may follow from the series.
- **`python -m app.series_match`** (`--commit`) assigns a coin's series from
  the design its title or description names.
- **`python -m app.series_classify`** (`--commit`) assigns series from
  denomination and year, for the coins the text left unassigned and for all
  notes.
- **`python -m app.serial_patterns`** (`--commit`) derives star, radar,
  repeater and similar designations from a note's serial. It also takes back
  a designation it derived that the serial no longer earns (because the
  serial was corrected); the dry run lists those too. A designation a person
  set or removed is never touched.
- **`python -m app.bullion_weights`** (`[--list] --commit --by EMAIL`) guesses
  the weight and fineness of a bar, round or medal that has no fine weight.
  It works from the item's own words, or from what most items of its form
  and metal hold. Each guess is marked "suggested" in the editor (*Weight*).
- **`python -m app.listing_links`** (`--commit --by EMAIL`) fills an item's
  listing address and seller's item id, each from the other. Outside eBay and
  Whatnot, an item and its purchase share one lot page, and each takes it
  from the other when missing. An eBay purchase takes its order page, built
  from its order number (`docs/specs/entry-panels-design.md`, *Listing
  links*).
- **`python -m app.seller_titles`** (`[--show N] [--commit --by EMAIL]`)
  fixes items whose title is only a face value (ten characters or fewer) and
  whose description is the seller's listing text (thirty or more). It moves
  that text into the title, and writes the description the editor's Suggest
  would.
  - The description is suggested after what a save fills from the facts,
    which a commit keeps, as the editor's Save does.
  - Title and description change together.
  - An item with nothing in its record to describe it by is left alone.
  - A second run changes nothing.
- **`python -m app.ebay_orders`**
  (`FILE... [--review FILE.xlsx] [--commit --by EMAIL]`) fills eBay purchases' missing order numbers and items'
  listing ids from eBay's purchase history (*eBay order numbers and listing
  ids*).
- **`python -m app.photo_import`** (`[--root DIR] [--commit]`) links
  photographs to items by filename (*Filing photographs*).
- **`python -m app.image_sources`** (`MANIFEST.csv FOLDER [--commit]`)
  records the web address stored photographs were fetched from. It matches
  each downloaded file to its image by content
  (`docs/specs/item-photographs-design.md`, *From a web address*).
- **`python -m app.image_enlarge`**
  (`[--commit] [--limit N] [--pause SECONDS] [--list]`) replaces a stored photograph that is a scaled copy (an
  eBay or NGC thumbnail added by its address) with the full-size picture. It
  replaces it in place, so each item keeps the photograph where it was. It
  leaves alone one that is on an item for sale
  (`docs/specs/item-photographs-design.md`, *From a web address*).
- **`python -m app.vendor_cleanup`** merges, renames, re-kinds or deletes
  purchase sources, by explicit instruction. Its options are under *Cleaning
  up purchase sources*.

**Order matters for two of them.** Run `classifier_defaults` before
`series_classify`, because note class is evidence for series.

**The other command-line modules are not passes**, and none of them takes
`--commit`:

- `app.seeding` -- the shipped reference data;
- `app.create_admin` -- a new installation's first manager;
- `app.seed` -- a trial installation's administrator and demo items; it
  refuses a database that already holds a collection;
- `app.backup`, `app.workbook_backup`, `app.media_backup` and
  `app.backup_run` -- *Backing up and restoring*. `app.media_backup prune`
  only lists unless given `--delete`;
- `app.reports` -- *Reports*.

### Bringing records up to date

Three passes bring stored items in line with what the editor does on a save.
Run them in this order, each to completion before the next. The order matters
because a description is suggested from the record as the earlier passes
leave it.

1. `app.serial_patterns` -- the dry run, then `--commit` (it takes no
   `--by`).
2. `app.description_review fill` -- the dry run, then `--commit --by EMAIL`.
   Every item whose description is empty gets the description the editor's
   Suggest would write (split and deleted items excepted). An item whose
   record holds nothing to say is left empty and counted.
3. `app.description_review export`, then `app.description_review apply`:
   - `export` writes a workbook of the items whose written description
     differs from the suggestion. Its columns are `item_code`, `current`,
     `suggested` and an empty `replace`.
   - Put an `x` in `replace` on each row that should give way to the
     suggestion, and save the workbook.
   - Run `app.description_review apply` on it -- the dry run, then
     `--commit --by EMAIL`. The suggestion is computed again at that moment.
   - A row is skipped, and named, when its `current` is no longer the item's
     description (it was edited after the export; line endings aside). So is
     a code no live item holds -- one deleted or split since.
   - A `replace` holding anything but `x` is ignored, and the rows so ignored
     are counted.

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.description_review fill
python -m app.description_review export review.xlsx
python -m app.description_review apply review.xlsx
```

On Linux:

```console
cd ~/dev/ccweb/backend
python -m app.description_review fill
python -m app.description_review export review.xlsx
python -m app.description_review apply review.xlsx
```

**Each writing step runs under the live-write procedure:**

1. a verified `pg_dump` of live, and a rehearsal of the `--commit` on a
   restored copy (*Applying a schema release*, steps 1 and 2);
2. the same `--commit` on live;
3. a check afterwards: the item count unchanged, and a few items' History
   showing the changes under the person named.

### eBay order numbers and listing ids

Two eBay numbers matter here:

- An eBay purchase is found and receipted by its **order number**.
- A **listing id** links an item back to the page it was bought from.

`app.ebay_orders` fills both in from eBay's own purchase history. That
history comes from the Chrome extension named in the README (*Useful tools*):
one workbook per year, with a row per item bought.

First look at what the pass would do. Name the workbooks in place of
`WORKBOOK.xlsx` (several may be given):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.ebay_orders WORKBOOK.xlsx --review ..\logs\ebay_orders_review.xlsx
```

Then write it, with your email in place of `EMAIL`:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.ebay_orders WORKBOOK.xlsx --commit --by EMAIL
```

The first command is a dry run. It prints what it would do and, with
`--review`, writes the review workbook (the only file a dry run writes).

`--commit` does the work in one transaction. It records each changed item's
order number and listing id in its **History**, under the account named by
`--by`.

It matches by **eBay's item id**, not by words or price: every eBay purchase
links its listing (`ebay.com/itm/<id>`). With that match, it:

- sets **Seller's item id** (`sellers_item_id`) on each item from its own
  listing link, or its purchase's -- only where empty;
- gives an eBay purchase with no order number the one order its listings were
  bought on;
- **merges the purchases one order was split into**. An order of several
  listings becomes one purchase that holds every item and links the order's
  page on eBay. Each item keeps its own listing's id.

The review workbook lists three things:

- what it numbered;
- what it could not number (a listing in no order, or in several);
- **stored order numbers eBay contradicts**. The pass never changes these;
  correct them on the purchase's **Edit details**.

Run it again after a new download: it only fills what is still empty.

**For an item the pass could not fill**, type the id into **Seller's item
id** in the item editor. The editor links it to the listing on eBay. "Add
another like it" on a purchase keeps the id for the next piece of the same
listing.

An order number belongs to the purchase, not the item. The editor's
**Purchase:** link opens the purchase, and **Edit details** there changes it.

### Series

A nickname finds an item through its **series** (its design, such as
Winged Liberty Head). So an unclassified item is found only if its own text
happens to contain the word.

**A hand correction always stands.** Neither series pass touches an item
that already has a series.

`series_classify` assigns a design when the facts allow only one: a 1942 dime
is a Winged Liberty Head, a $1 Series 1963B a Barr Note. Its report lists, by
item code, what it leaves for a person:

- **boundary** -- a year two designs share (a 1916 dime is Barber or Mercury;
  a 1921 dollar Morgan or Peace), unless the text names one;
- **conflict** -- the text names only designs the facts rule out, such as a
  note rated "funnyback" but recorded as Series 1923. Only the item in hand can
  say which is wrong;
- **disagrees** -- a series already set that the facts rule out (a Kennedy
  half recorded as $1). Nothing there is changed; fix it by hand.

**Rare designs need evidence.** Some designs share a face value and years
with a far commoner one: Hawaii and North Africa notes, commemorative halves
and dollars, gold dollars, American Innovation dollars. These are assigned
only on evidence: text naming them, or, for a note, also a brown or yellow
seal. A piece that says nothing is taken for the common design.

**Series 1929 National Bank Notes** share their series and brown seal with the
Series 1929 Federal Reserve Bank Notes. A note is filed as a National Bank
Note when its text names a national bank ("National", "Natl"), or when its
class is National Bank Note. It is never filed so when its class is Federal
Reserve Bank Note. The class is filled first, which is why
`classifier_defaults` runs before `series_classify`.

**Lot pieces.** A lot's pieces carry the lot's listing text. So a title and
description shared with another piece of the same order are not read as
evidence about the piece; only its rating is. If the lot's text names an
evidence-only design, the piece goes to the review list.

Designs, year ranges and nicknames are seeded from
`backend/data/reference/series.json`. The facts and their sources are in
`docs/specs/series-classification-design.md`.

### Classifier defaults

*Classifiers* are the descriptive fields of an item, such as note class,
seal or composition. Most follow from a few facts:

- a $1 note of Series 1957 is a Silver Certificate with a blue seal, signed
  Priest and Anderson;
- a Federal Reserve Note's serial names its Reserve Bank;
- a 1964 dime is 90% silver.

The design is in `docs/specs/classifier-defaults-design.md`.

| Filled | From | Facts |
|---|---|---|
| note class, seal, signatures | denomination, series year and letter | `note_issue.json` (Series 1928-2021) |
| Reserve Bank | a Federal Reserve Note's serial | BEP's serial rules |
| composition, metal, fineness, weights | denomination or design series, country and year -- the series alone where the design was struck in one composition; the set for a Silver Proof Set's coins | `composition.json` |
| the No Motto attribute | a $1 Silver Certificate's series | `app/attribute_rules.py` |

**No Motto** ("Godless"):

- Every $1 Silver Certificate of Series 1928 through 1935F lacks "In God We
  Trust". These get the attribute (marked *read*).
- Series 1935G was printed both ways. A 1935G is listed as **needs evidence**
  unless its rating or a person already says No Motto.
- Series 1935H on carries the motto. A later note marked No Motto is listed
  as **disagrees**.

**A person always wins.** A filled-in value shows a *suggested* mark in the
item editor, with a tooltip saying where it came from. Change the field and
save, and the value is yours: nothing fills that field again.

A recorded value is never replaced, but it narrows the facts. For example, a
$1 Series 1928 note recorded with a red seal is a United States Note.

**When defaults are filled.** Defaults are brought up to date whenever an
item is created or saved: correct a note's series year, and its class
follows. The item editor also shows them as the facts are typed, before
anything is saved (`POST /api/inventory/{id}/preview`, which writes nothing).

For everything already recorded, run the pass. Its report lists, by item
code:

- **ambiguous** -- the series was issued in more than one class and nothing
  recorded says which;
- **disagrees** -- a recorded class, seal, signature, Reserve Bank or
  composition the facts rule out. A weight typed to four places, rounded or
  cut short, still agrees;
- **unknown issue** -- a series the facts table has no such note for, usually
  a mistyped series year;
- **serial prefix** -- a $5-or-higher note from Series 1996 on whose serial
  does not start with its series' letter.

A filled-in value the facts no longer support is withdrawn.

Note classes use BEP's names: United States Note ("Legal Tender Note" is an
alias), National Bank Note, Federal Reserve Note, Federal Reserve Bank Note,
Silver and Gold Certificate, Fractional Currency, Demand Note, Treasury Note.

### Weight

Everything but a note has four weight fields in the item editor:

- **Gross weight**
- **Fineness**
- **Fine weight**
- **Weight as written**

A weight is per piece; Pieces multiplies it in the reports. Type it in troy
ounces or grams, chosen by the unit picker beside the box. Either way it is
kept in troy ounces (a gram is 0.032151 troy ounces).

#### Coins

A coin's weight comes from its composition (*Classifier defaults*):

- from its denomination and year;
- or from its **Series**, where the design has figures of its own -- a Silver
  Eagle, a commemorative dollar, a Morgan of 2021;
- or from the series alone, when the coin has no year and its design was
  struck in one composition (a Morgan dollar, a Franklin half; not a
  Roosevelt dime, which was silver and then clad).

A Gold Eagle, a Platinum Eagle or a 2008 Gold Buffalo also needs its
denomination, which says the size. (2008 is the only year the Buffalo was
struck in fractional sizes.)

Only an item whose kind is Coin is read this way from a coin's design. A
round that bears the Walking Liberty design is not a half dollar.

#### Bars, rounds and medals

A bar, a round or a medal has no composition to read, so its weight is
entered: gross weight and fineness. The fine weight is worked out as their
product when it is left empty. Type the fine weight when that is what is
known. Emptying it keeps it empty.

#### Guessing missing weights

For an item with no fine weight, `python -m app.bullion_weights` guesses. It
looks only at bullion, medals and tokens with no fine weight, and fills only
empty fields. It takes:

- a weight ("5 oz", "1/2 oz", "10 grams", "1 Kilo", "One Ounce") and a
  fineness (".999", "sterling", "22K") from the item's own title, description
  and weight as written, when they state exactly one;
- otherwise, the weight most items of the same bullion form and metal already
  hold, when at least six in ten of them (and at least five) agree. It never
  puts that weight onto an item whose own fineness differs.

It is a dry run by default. `--list` names every item and the reason for its
guess.

Each guess shows as "suggested" beside the field in the editor, with where it
came from, until someone saves that field by hand. Guesses are never counted
as evidence for later guesses.

### Filing photographs: the photo import pass

`python -m app.photo_import` walks a directory and links each photograph to
the item its filename names. The directory is `--root`, by default
`PHOTO_LIBRARY_ROOT`. It uses the same writer the console uses
(`app.image_links.attach`).

**Every run on a new batch of photographs starts as a dry run the owner
watches.** The dry run decodes and validates every file, so it names any file
the imaging layer would refuse. It writes no rows and no bytes.

**The filename convention** is `<item_code>_<nn>.<ext>` (`app.photo_names`),
for example `CC-000412_01.jpg`:

- `01` is the obverse, and becomes the primary photograph;
- `02` is the reverse;
- anything past that is `unassigned`.

Nothing repairs a filename that misses the convention. A lowercase `cc-` is a
miss.

**Every file is stored; only the link is ever withheld.** An import step must
never be the reason a photograph is lost. A photograph is stored unattached,
and reported, when:

- its name does not match the convention;
- its item code is unknown;
- its item was deleted or split;
- two files in the run claim the same slot (a collision links *neither*);
- an earlier run already filled the slot.

An item that already has a primary photograph keeps it. The `_01` is filed at
sequence 1 but not as primary, and is reported under `primary`. A photograph
linked onto an item that is for sale is reported by item code.

File unattached photographs by hand on the console's **Photos** page
(`/management/photos`).

On that page and in the item editor's photographs, clicking a picture opens
it enlarged in a window of its own. **Cancel** or Escape closes that window
and leaves the editor beneath it open.

## Finding items

Most console work starts by finding the right items: to edit them, offer
them, group them into a lot, or bulk-edit them. The **Coins** and
**Currency** screens share one search panel.

The console opens on the screen for `DEFAULT_ITEM_KIND`: Currency when it is
`currency`, Coins for any other kind.

Under the hood: the screens are `/management/inventory/coins` and
`/management/inventory/currency`; the panel calls
`GET /api/inventory/{view}/search`, `view` being `coins` or `currency`; the
console (`/management`) reads the default kind from
`GET /api/defaults/item-kind`.

#### The search box

**The search box has no field syntax.** What you type is one term. It is
matched anywhere in these, ignoring case:

- an item's title, description, rating or item code;
- its purchase's order number.

So an eBay order number pasted into the box (`31-24680-13579`, or part of it)
finds what was bought on that order. A term of six or more letters and
digits, at least one of them a digit, also matches order numbers with their
separators removed, so `312468013579` works too.

**It also matches the name or alias of what the item is**: design series,
strike type, grade designation and attributes; on coins, mint; on currency,
note class and serial features. So:

- `mercury` finds Winged Liberty Head dimes whose listings never say
  "Mercury";
- `denver` finds coins whose listings give only the D;
- `legal tender` finds United States Notes;
- `funnyback` finds every classified $1 Series 1928 and 1934 note.

A term under three letters must be a whole name. `PR` finds proofs and `D`
Denver, but `s` does not match every strike containing an s.

**Search tips**, under the box, lists examples; clicking one runs it.

The rating is searched because it is often the only descriptive text an item
has. (The rating is the owner's own rating text, `rating`.) Many items'
titles are only a denomination, and their descriptions a lot number.

| Type | Finds |
|---|---|
| `1921 morgan` | several words are **one phrase, in that order** -- `morgan 1921` finds none |
| `morgan%1921` | `%` matches anything, so the words can be apart |
| `19_5` | `_` matches exactly one character: 1905, 1915 ... 1995 |
| `funny%back` | both `Funnyback` and `Funny Back` |

Text is matched as written: `ms65` and `ms-65` find different items.

#### Filters

**The dropdowns and year boxes narrow whatever the search finds.** Each
dropdown lists the values present among the items the *other* filters find,
with a count beside each. So a dropdown already set still offers its other
values: with Status on Received, Returned is still there to choose.

A dropdown reading **None recorded** is disabled, because no matching item
has that field filled in.

The **Item code**, **Seller's item id** and **Serial number** boxes match
part of the value, and take the same `%` and `_` wildcards. Serial number is
a note's serial on currency, and a bullion item's on coins.

Seller's item id is the seller's own id for the listing an item was bought
from -- eBay's item number. So one number finds every piece split from that
listing.

The **Error** and **Attribute** dropdowns find the items recorded with one
mint or printing error, or holding one attribute (Star Note, Gift, First
Strike). Like the others, each lists only what the matching items hold.

**Sorting.** Click a column's header to sort the table by that column; click
again to sort it the other way. Items with nothing in the column come last
either way. Items equal in it are in item-code order.

#### Grade

The **Grade** box takes a grade, not text:

| Type | Finds |
|---|---|
| `55` | exactly 55 -- not 55+ |
| `55+` | exactly 55+ |
| `55%` | 55 and 55+ |
| `BU`, `BU+`, `BU++` | 60-62, 63-64, 65-66 (pluses included) |
| `BU%` | all three: 60 to 66+ (`UNC` reads the same) |
| `MS65`, `PR69+`, `PR69%` | the number, with that strike |
| `AU`, `AU+` | 50 to 58+, or only the plus grades in it |
| `PROOF` | every proof |

Anything else is refused, and the refusal shows the examples.

#### Data-quality checks

Under the filters, the page lists the view's named data-quality checks as
chips -- `no year`, `no grade`, `zero cost`, `repeated identity` and the
rest. Each chip shows the number of matching items it finds; a check that
finds none is not shown. Click one to narrow the list to those items
(`issue=<code>`), and click it again to remove it.

#### Filters a link can bring

Reports' drill-down links open this page with filters set. The page shows a
`missing` or `item_codes` filter that a link brought as a chip, which removes
the filter when clicked.

Under the hood: the API's `grade_min` and `grade_max` read the same grade
terms, so `grade_max=64` stops below 64+. The API also takes `issue`,
`missing`, `lot`, `item_codes` (a list of item codes, matched exactly),
`item_from` and `item_to` (an item-number range) and
`deleted` (`no`, `only`, `any`) as filters (`app/inventory_search.py`), and
the drill-down links use several of them. An unknown filter name is refused,
and so is a `sort` naming a column the table does not show.

#### Keyboard shortcuts

**Every field but Seller's item id, Error and Attribute has an Alt+letter
shortcut**, underlined in its label:

- Alt+S the search box, Alt+H the tips, Alt+C clear;
- Alt+Y and Alt+O the years;
- Alt+P the coins' **Strike type**.

No field uses D, E or F, which the browser keeps. A shortcut on a disabled
dropdown does nothing.

## Inventory items

An inventory item is one thing owned: a coin, a note, a set, or a lot bought
as one. This section covers every way an item is created, changed, received
and removed. It also covers the rules that keep the item's history and cost
basis true while that happens.

### How an item comes into being

| Path | When | Notes |
|---|---|---|
| **Entering an item on a purchase** | every new acquisition | requires a purchase order; see *Entering a purchase* (`POST /api/inventory`) |
| **Splitting a lot** | a bought lot becomes individual pieces | see below (`POST /api/inventory/{id}/split`) |
| **`python -m app.seed`** | a new, empty database | five demo items; never on real data -- refused where items or purchases exist, unless `--into-existing` |

**Splitting a lot.** The children inherit the parent's claims and a share of
its cost. The share is either `equal`, or `relative` to a value per piece.
The parent gets `split_at` and drops out of every count.

In the console, use **Split into pieces...** in the item editor. It shows a
row per piece, each with its own description, year and design series. The
series' name is added to the piece's description.

Every path records an opening `item_status_history` row, so every item has a
lifecycle from its first row. Putting an owned item up for sale is a separate,
later step (*Offering an item for sale*).

**The item code is permanent.** It is drawn from a database sequence and
assigned once. It is never reused and never changed. It survives listing,
sale, return and relisting, because a returned item resumes its own history.

### How an item changes

| What | Use |
|---|---|
| Edit one item (`PATCH /api/inventory/{id}`) | any editable field. An item saved at an item cost of $0 is given the Gift attribute, and the change log names what that moved -- see *Attributes* |
| Bulk edit (`POST /api/inventory/bulk`) | the same change across many items, in one transaction, all or nothing. A `storage_location_id` moves each item there and records the move in its location history. The Coins and Currency pages' bulk bar offers this as **Location**, with the item editor's picker |
| Receive (`POST /api/inventory/receive`) | record what arrived -- see *Receiving* |
| Errors (`PUT /api/inventory/{id}/errors`) | replace the item's recorded errors -- see *Errors* |
| Serial pairs (`GET /api/inventory/{id}/serial-pairs`) | the star notes of this note's serial number already in the collection, or a star note's plain twins. `serial_number` matches a serial being typed in place of the saved one (`docs/specs/identify-first-entry-design.md`) |

The rest of this section describes the fields an edit can set, and the rules
each one follows.

#### Editable fields

**Editable scalars** (plain values): `source_title`, `description`, `rating`,
`sellers_item_id`, `listing_url`, `year_start`, `year_end`, `fineness`,
`gross_weight_ozt`, `fine_weight_ozt`, `weight_note`, `piece_count`,
`item_cost`, `shipping_cost`, `tax_rate`, `tax_includes_shipping`
(`EDITABLE_SCALARS`, `routers/inventory.py`).

- Seven of them are NOT NULL: `source_title`, `description`, `piece_count`,
  `item_cost`, `shipping_cost`, `tax_rate` and `tax_includes_shipping`
  (`REQUIRED_SCALARS`). A null for any is refused, naming the field.
- `storage_location_id` moves the item through `set_location` (*Status and
  location have one door*). It never needs `acknowledge_for_sale`, since a
  location does not show to a buyer.
- A banknote holds no year of its own. `year_start`/`year_end` sent for a
  note is refused (422); send `series_year` instead.
- `no_date: true` says a piece has no date at all (a gold bar). It clears
  the years and takes the piece off "No year recorded". It is refused beside
  a year in the same request, and on a note. A year sent later clears it.
- Bulk edit refuses `no_date`, `mint`, `variety` and `cert_numbers` by name;
  each is set one item at a time.

**Editable classifiers** are set by code rather than id: `item_kind`,
`country`, `denomination`, `bullion_form`, `set_form`, `strike_type`,
`grade`, `grade_designation`, `grading_service`, `metal`, `series`,
`storage_form`, `authenticity`, `status`, `disposition`.

- A coin's `mint` (by code) and `variety` are also editable. They live on its
  coin detail, which is created if it has none. They are refused for a
  banknote.
- Five are NOT NULL (`item_kind`, `storage_form`, `authenticity`, `status`,
  `disposition`) and refuse a null or empty code.
- A grade designation of the other kind is refused, naming the item: EPQ or
  PPQ on anything but a note; DCAM, FBL and the rest on a note. This holds
  even for a bare `item_kind` change to an item that holds one.

**Banknote fields** live on the note's detail, and are refused by name for
any other kind:

- by code: `note_type`, `seal_color`, `fed_district` and
  `signature_combination`;
- `series_year`, `series_letter`, `serial_number`, `face_plate_number`,
  `back_plate_number`;
- `printing_facility` (`dc` or `fw`). It is read from the face plate when one
  is sent. A location sent beside a face plate that says otherwise is
  refused.

**Two more note fields** are typed by the owner from
mycurrencycollection.com, and are never filled in by the system. Each is
optional:

- `coolness_index`: 0 to 100, two decimal places. A third decimal is
  refused.
- `star_run_size`: a whole number above 0.

Beside the serial number, the editor offers two links that open that site in
a new tab:

- *Check serial*, when the serial has eight digits;
- *Star note lookup*, when the serial has a `*`.

The software never reads the site's answer. The star lookup's address
carries:

- the denomination's whole dollars;
- the series year's digits alone (`2017` for a 2017A note);
- the serial as recorded, with its spaces removed. A star-first serial such
  as `*12345678A` is passed as it is.

Whether the site answers a lettered series or a star-first serial is for the
owner to confirm in a browser. The address for questions about the site's
data is dave@mycurrencycollection.com, published at
https://www.mycurrencycollection.com/contact under *Anything else*.

**Attributes** (`attributes`, a list of codes) replace the item's whole set.
One the item had that the list omits is marked removed, so no rule adds it
back. `[]` clears them; null is refused. They are single-item edits only:
bulk edit refuses them. (One set applied to many items would wipe whatever
each carried that the others do not.)

**Certificate numbers** (`cert_numbers`, a list) replace the item's
`item_certification` rows as a set:

- a number kept keeps its row;
- one omitted is deleted;
- a new one is recorded as graded by the item's grading service.

`[]` clears them; null, a blank or a repeat is refused. The item editor has
**Grade designation**, **Grading service** and **Certificate no.** (comma
separated) beside the grade. Each change is logged in `item_field_change`.

#### Suggest description

**Suggest description**, under the Description box, fills the draft with a
description written from what the editor shows, unsaved changes included.
The button writes nothing; Save keeps it.
(`POST /api/inventory/{id}/suggested-description`, `app.item_descriptions`.)

It writes in the owner's style:

- **Grade, designation, grading service and attributes first**, then what
  it is. For a note: "Superb Gem Unc 67 EPQ PMG Radar 1999 $1 S/N F12344321R.
  Federal Reserve Note Green Seal." For a coin: "MS64 First Strike 1921-S
  Morgan Dollar. Silver, 0.7734 ozt fine."
- **Recorded errors** go beside the attributes, right after the grade ("Error
  Note, Misaligned Print (Reverse) 1963A $1 ...").
- **Certificate numbers** follow in a sentence of their own, before the
  packaging ("PR70 DCAM PCGS 1975-S Roosevelt Dime. Copper-Nickel Clad. Cert
  #44012345."). This includes numbers typed in the editor and not yet saved.
- **A note's Friedberg number** is a sentence of its own after the note type
  and seal, before the certificate ("Federal Reserve Note Green Seal. Fr
  1921-L. Cert #8012345-001."). It appears only when the number's status is
  confirmed or proposed, the same rule as the holder label.
- The owner's own grading (SELF) is not named. There are no field labels,
  district or signatures.
- **A note's design series** follows its face value ("1963B $1 Barr Note S/N
  ..."). It takes the place of the face value's unit when named for it ("½
  Florida Goldback"). It is left out when it only repeats the series year,
  the class or an attribute already said ("Series 1929 National Bank Note" on
  a 1929 National Bank Note).
- **Another country** is named after the year ("1882 Spain Peseta", "1970
  Spain 100 Pesetas S/N ..."). With no series or face value recorded, the
  year and country are what it is ("MS62 1913 Denmark. Gold, 0.1296 ozt
  fine."). At home, the year alone is ("2012. Silver, 1 ozt fine. Proof
  Set."). A description never loses the year.
- **Bullion** is named by its form where nothing else names it ("Copper
  Round. Copper, 0.999 ozt fine. Tube of 20."). A round or bar carrying a
  coin's design keeps its form after the series ("Walking Liberty Half Dollar
  Copper Round"). The listing title and the holder label name it the same
  way.
- The United States and Unknown are not named.

**An empty description is filled on Save.** Saving the item from the editor,
as a new item or an edit, with the Description empty or only spaces writes
this description for it. The change is logged under the person saving. Bulk
edit, receiving and splitting do not do this.

The button is never disabled: unsaved edits, photographs and errors are
described as shown. The server makes a dry run of Save, defaults included,
and rolls it back. So the wording matches what Save would give, and nothing
is kept. The item's row is locked only for that request.

A listing's suggested title carries the designation too ("PMG 64 EPQ"), and
another country's name ("1964 Canada Half Dollar"). A year and a country
alone do not make a title, and the seller's wording stays.

#### Changing an item's kind

**A kind change moves the detail row** (`app.item_kinds`). Coins and notes
keep their kind-specific fields in a separate detail row:

- An item made a banknote loses its coin row (mint, variety, PCGS type) and
  gains a note row. So its serial number and other note fields can be sent in
  the same request.
- An item made anything else is refused while its note row still holds a
  value -- the serial above all, or an attached Friedberg number -- until the
  request clears it.
- The serial alone is kept across a change between note and bullion, which
  holds one too: it moves to the other row.
- Bullion made a coin, set, medal or token is refused while it holds a
  serial, until the serial is cleared.

The item editor's **Kind** picker does that clearing in the draft. Choosing
a kind empties every field that does not fit it, and names each one on
screen. For a coin those are its metal, strike type, weights and coin-side
denomination, series, grade and attributes; for a note, its own fields.
Choosing the original kind again puts them all back.

A note's fields appear as soon as Currency is chosen. Its Friedberg panel
appears once the note is saved.

#### Grades

**A grade is a number and a strike type.** `grade` takes `65` or `64+`. A
compound grade such as `MS65` or `PR69+` is split into the number and the
`strike_type` (business, proof, specimen, reverse_proof,
enhanced_reverse_proof, sms), unless the request names a strike type itself.
Responses carry `grade`, `strike_type` and `grade_display` (`PR69+`).

Adjectival words are read at the bottom of their range: BU is 60, BU+ 63,
BU++ 65, PROOF PR63, AU 55.

#### Unknown fields

**An unknown field name in an edit is refused (422).** The edit schema
(`InventoryItemUpdate`) forbids extra fields. So a misspelt field in a
`PATCH` or bulk edit never answers 200 for a change that was not made.
Creating an item (`POST /api/inventory`) refuses one too.

#### The keyboard in edit windows

In the console's edit windows:

- A field whose label underlines a letter is reached with Alt plus that
  letter.
- Not every field has one. The customer row, the address form and some
  auction dialogs hold fields with no letter, which are reached with Tab.
- A window whose button shows "Ctrl+S" beside it saves on Ctrl+S or
  Ctrl+Enter (`management/SaveButton.jsx`). That button underlines its S and
  has no Alt letter of its own, so the underlined S means Ctrl+S, not Alt+S.
- No letter is D, E or F, which the browser keeps.
- Escape closes a dialog.

### Status and location have one door

Everything that touches an item's lifecycle goes through
`backend/app/lifecycle_writes.py`:

| Function | Records |
|---|---|
| `record_initial_status` | the opening row, `from_status_id = NULL` |
| `set_status` | a transition, carrying the previous status |
| `set_location` | a move, with its `location_history` row |

`status_id` and `storage_location_id` are written **only** through these.
Assign either anywhere else and the history silently stops being true.

The opening row has a separate function because `set_status` does nothing
when the status is unchanged, and a new item already has one.

Correcting a status through the console is itself recorded, with who did it
and when.

### Receiving

Receiving records what a parcel contained. One request covers one item or
many, all or nothing (`POST /api/inventory/receive`).

There are four outcomes: `received`, `missing`, `returned`, `canceled`.
`missing` means paid for, not canceled, and never arrived. A missing item can
still be received when it turns up.

- `arrived_on` is a **calendar date**, not a timestamp: a parcel that arrived
  on the 9th arrived on the 9th in every timezone. It is optional. A date more
  than one day ahead of UTC's today is refused.
- A storage location is recorded only for `received`, with its
  `location_history` row.
- Receiving something already received is refused with 409, naming its
  current status and arrival date. So a double submission can be told apart
  from picking the wrong row.

#### Finding what arrived

**In the console** (`/management/receiving`) there is one search form. Search
by either or both of:

- part of an order number -- matched anywhere in it, in any case, with or
  without its dashes;
- what the item is: kind, denomination, year, mint, serial, series year.

By default it finds only what has not arrived (`ordered` or `missing`).
**Any status** shows a whole order.

Results come 200 at a time per kind and status. Anything beyond that is
counted on screen, so narrow the search to see it.

Purchases' **Receive these** opens a link naming one order
(`/management/receiving?order=<id>`). It opens with that order's header and
its items already found. It searches by the order's id, because an order
number is not unique across vendors and is sometimes not recorded.

#### Receiving one item

Clicking a line opens a dialog for that one item. It holds:

- the Identify section: a note's series year and letter, denomination,
  serial and plates, or a coin's year, mint and denomination -- saved only
  with Receive;
- arrival date, storage location and note;
- photographs;
- the four outcome buttons;
- the "Confirm or correct fields" pane and the errors panel;
- for a banknote, the Friedberg lookup.

After each receipt the search repeats, so what arrived drops off the list.

#### Receiving a whole parcel

When the whole parcel arrived, use **Receive all N still ordered**. It is
shown:

- on a purchase itself;
- on a linked order with two or more lines still `ordered`;
- after a search whose items are all on one purchase, naming its order
  number.

It opens one dialog over all of them: one arrival date, one location, one
note, and the four outcome buttons, recorded in one all-or-nothing request.
Photographs and the Friedberg lookup are off there, since each belongs to one
object. Lines already received, or closed out as missing, are not included.

#### What carries over

The **arrival date and storage location carry to the next item**, so a
parcel of twenty into one box is picked once.

The **note does not carry**. It describes one object ("corner bent"), and
repeating it would record a fact about a coin nobody checked.

If a **photograph fails to upload**, the receipt still stands: the arrival is
the fact, and the photograph is evidence added to it. The dialog stays open,
naming the file that failed. Add the photograph afterwards from the item
editor's **Photographs** panel.

Receiving only moves an item forward. Correct a mistaken receipt from the
item editor's status field, which writes a history row like any other
transition.

### Optimistic concurrency

*Optimistic concurrency* means two people can open the same record, and the
second save is checked against the first instead of silently overwriting it.

These carry a `version`: `inventory_item`, `listing`, sales orders, sales
lots, auctions and platforms. Purchase orders do not.

- An update sends the version it read. The write is refused with 409 if
  somebody changed the row first.
- An update that sends no version is refused (422). Made against nothing, it
  would overwrite whatever was saved since, unseen. The item editor may send
  `base` in its place.

PostgreSQL's MVCC does not give this protection. Without it, the second of
two people saving the same item silently overwrites the first, with values
loaded before the change.

**The item editor merges field by field.** Its save also sends `base`: the
value each changed field had when the edit began. The server then refuses
only where someone else has changed one of *those* fields since. The refusal
is a 409 with `conflicts`, giving each field with what it was, theirs and
yours, and who changed it when. A change to any other field does not stop
the save. Callers that send no `base` (scripts) keep the whole-item version
check.

**Every field an edit or bulk edit changes is logged** in `item_field_change`,
with who and when. That is how a conflict names the other person.

The editor's **History** panel lists those edits together with the item's
status and location moves, newest first. It shows 20 at a time, with **Show
all** for the rest, and re-reads after every save.

**While the form is open**, it checks for changes made elsewhere every 15
seconds, and whenever the window gets focus back:

- A field not being edited takes the new value, with a note saying so.
- A field being edited that was changed elsewhere is listed with both values
  and who changed it when, with **Keep mine** or **Use theirs**. Save waits
  for a choice.

### Changing an item that is for sale

An item is *for sale* while either:

- an active listing with stock offers it; or
- an order that has not shipped (pending, paid or packed) holds it.

Once an order ships, the item is ordinary again.

**In the item editor**, a for-sale item says so at the top, naming the
listing or order. Saving it needs **Change it anyway** ticked first. Save
pressed before that says the box must be ticked, and saves nothing. Saving
nothing needs no confirmation.

**In bulk edit**, a selection with for-sale items is refused whole, naming
the items. It then offers **Change the items for sale too**.

The API refuses such a save with 409 unless it carries
`acknowledge_for_sale`.

**A new status or disposition takes an offered item off sale.** The editor
warns before the change is confirmed ("saving ends its offer"), and the box
reads **Change the status and end the offer**. The save then ends every offer
holding the item, as receiving an item `missing` does. Bulk edit does the
same for each selected item whose status or disposition changes. An item in
an auction lot is refused: take the lot out of the auction first.

**The same 409-unless-acknowledged rule guards:**

- a receipt whose outcome is not `received`;
- splitting a listed lot. An item already in an order refuses
  unconditionally, since the split cannot be made at all;
- recording errors;
- attaching, re-linking or deleting a photograph (`/api/images`,
  `/api/image-links`);
- merging a vocabulary value that moves it. The merge preview names up to
  ten such items.

Editing the listing itself (`PATCH /api/listings/{id}`) is not affected. See
`docs/specs/for-sale-guards-design.md`.

### Removing an item

Deleting an item means *this row should never have existed*: a typo, a
duplicate. It is a **soft delete** (`DELETE /api/inventory/{id}`).

Something sold, lost or given away is not deleted. Change its `disposition`
or `status` instead, and it keeps its history.

In the console, use **Delete item...** at the foot of the item editor. It
asks first, and shows a refusal's reason beside the button.

Three cases are refused with 409:

- **A lot with pieces split from it.** It holds the cost basis its children
  were allocated from; detach them first.
- **An item that has ever been offered**, on its own or inside a sales lot,
  ended offers included. The offer is part of the sales history, and nothing
  removes a listing row, so this is permanent.
- **An item in a sales lot.** Take it out of the lot first.

Deleting twice is not an error.

**Detaching a split piece.** When the lineage itself was wrong, a split
child can be detached from its parent (`DELETE /api/inventory/{id}/parent`).
The piece keeps the cost it was allocated, and repeating it is harmless.

### Holder labels

The console's **Labels** page (Inventory menu) prints a label for each item,
to stick on its holder (`docs/specs/holder-labels-design.md`, section 4).

An item takes a label -- is **labelable** -- when it is all of these:

- a coin, a note or a set;
- received, held or listed;
- not in a grading service's holder;
- a single piece or a set, not a roll, tube, bag or box of several.

Nothing else is offered a label or counted as needing one.

**The sheets.** Two products from sheetlabels.com, both US Letter, in the
inkjet material ("Spectacle White Matte Inkjet"):

| | SL597 | SL564 |
|---|---|---|
| Used for | coins | notes and sets |
| Label | 0.625" x 0.5", rounded corners | 1.333" x 0.625", square |
| Grid | 10 across, 16 down: 160 | 6 across, 17 down: 102 |

Their layouts are data in `backend/app/labels.py` (`SHEETS`); a third
product is a new entry there.

**Printing.** In the browser's print dialog:

- Print at **100%**: Scale "Actual size" or 100, never "Fit to page" or
  "Shrink to fit", which moves every label off its cell.
- Turn **headers and footers** off.
- Leave Margins at Default: the page sets its own, none.

**Test page.** Before the first run on a new printer, or whenever labels seem
to drift, print **Print a test page** on plain paper. It is the same layout
with every cell's outline. Hold it against a sheet of labels, up to the
light: the outlines should sit on the labels' edges. Text keeps 0.06" inside
each label's edge, so a small drift stays on the label.

**What printed.** When the print dialog closes, the page asks whether the
labels printed correctly.

- **Yes** records, for every item in the run, the time and the text printed,
  as a label **waiting to be applied**. When the run was printed from the
  print batch, it also takes those items out of the batch.
- **No** records nothing.

A waiting label is on the sheet, not the holder. The holder keeps whatever it
carried. The *Not yet labeled* and *Needs a new label* runs leave the item
out, so it is not printed twice.

**What is on the holder.** **To apply**, on the Labels page, lists the
waiting labels: one list per *Yes* and sheet, newest first, unticked.

1. Tick each label once it is stuck on. **Select all** / **Deselect all**
   work for a list or the whole page.
2. Press **Applied**. The label becomes the holder's, with the time.

**Not used** forgets a spoiled or lost label, so the next run prints the item
again. In the inventory, the label filter's *Printed, not applied* and the
selection's **Mark label applied** do the same for stragglers.

All of this is bookkeeping, not an edit. The item's version and last-changed
time do not move, so a form open on the item still saves.

An item **needs a new label** when the text its holder's label would have
now differs from the text applied. The *Needs a new label* run rechecks every
labeled item first, so a change no save saw -- a vocabulary label renamed --
is caught too.

**Font sizes** are in `frontend/src/management/pages/labels/labels.css`: 7.5pt
on both sheets, every line bold on a coin's. The text is centered on the
label both ways. A coin's metal prints by its **Label name** in
Vocabulary (Clad, 24K Plate), else its label: give a new metal with a
long label a short label name. A long line is set smaller, down to 5pt, and
then cut with an ellipsis, never wrapped. These sizes are provisional until a
test print on the Epson sets them.

## Entering a purchase

**Purchases** (`/management/purchases`) is the one door for an acquisition.
No item is entered outside a purchase, so a standalone buy is a purchase
holding one item (`docs/specs/entry-panels-design.md`).

**Starting.** The page opens on **Start a new purchase**.

**Adding to a purchase already recorded.** **Add to an existing purchase**
lists the purchases already recorded. Filter them by order number, vendor or
seller, and, when ticked, to those with items not yet received. Choosing one
opens it for more items (`GET /api/purchase-orders`).

**Order lookup** finds a purchase by what is remembered of it. It is in the
Inventory group (`/management/order-lookup`). Search by:

- part of an order number, a vendor or a seller -- or a purchase number,
  exactly, as `3974` or `#3974`;
- a range of order dates, either end included;
- whether anything on it has still to arrive.

It reads the same list, which gives each purchase its seller, its item count,
the count not yet received, and `total_cost` (the sum of its items' costs).
The page says how many purchases match and what they cost together. It sorts
by any column, and opens a purchase on the Purchases page from its order
number. A purchase with no order date is listed only while both dates are
empty.

#### The purchase

- **Vendors** are picked from a list, or added inline with a web address,
  name and kind. Names are unique, ignoring case. (`GET /api/vendors`,
  `POST /api/vendors`.)
- **The purchase needs only a vendor**, so a walk-in or show purchase needs
  nothing else (`POST /api/purchase-orders`).
  - Left blank, the order number is generated (`Order-0001` and up).
  - Vendor and order number together must be unique.
  - The date, if given, must be no later than tomorrow.
- **The seller** a marketplace purchase was bought from is optional. It is
  picked from a list, or added inline with a store web address and name
  (`GET /api/sellers`, `POST /api/sellers`).
- **Edit details**, on an open purchase, changes its order number, date, web
  address, seller and notes (`PATCH /api/purchase-orders/{id}`).

#### Its items

- **Items are entered on the purchase.** A kind and a title make the item, as
  `ordered`, and open it in the item editor (`POST /api/inventory`). The rest
  is entered there, photographs and the description included. Mark it
  `received` there when it is already in hand. Closing the editor without
  saving removes the item again.
- A **lot** is an item with a piece count above 1.
- **Tax fields** are per item, pre-filled from the purchase's controls:
  - a rate that starts empty (the configured default);
  - "No sales tax charged" (rate 0);
  - "Tax on shipping" (As configured / Taxed / Not taxed).

  An explicit rate must be 0-1, with up to four decimal places; `.0635` is
  accepted.
- **Add another like CC-######** is shown whenever the purchase has an item.
  It starts the next piece from what it usually shares with the item it
  names, plus the purchase-wide tax defaults. The item named is the one last
  opened on the purchase (from the table, or just entered), or the latest
  when none was opened. The exact list of what is copied is in
  [specs/entry-panels-design.md](specs/entry-panels-design.md) (*New item*).
- **The items are listed as Coins and Currency list them**
  (`PurchaseItems.jsx`, the inventory search with `purchase_order_id`):
  - for a coin: year, mint, denomination, series, grade and metal;
  - for a note: serial, Fr#, series, grade and seal;
  - for both: status and cost, and the description under each -- the
    seller's title where there is none yet.

  A purchase holding both kinds has a table for each. The list starts in
  item-code order, and sorts by any header the search can sort by. An item's
  code opens it in the editor.
- **The total** under the items adds up the lines' item cost, shipping and
  sales tax, and their `total_cost`. That is what was paid: the same figure
  Order lookup shows as the purchase's Cost. (`GET /api/purchase-orders/{id}`
  returns each line's four amounts.)

#### Receiving from the purchase

- **Receive all N still ordered** appears under the items table when two or
  more lines are still `ordered`. It receives them in place, with the same
  dialog and all-or-nothing request as Receiving's (*Receiving*). The
  purchase is then read again.
- **Receive these** opens Receiving for that purchase, to receive line by
  line.
- **Start another purchase** returns to step one.

**The help band** at the bottom of the console window explains whichever
field has focus, on this form and every other. When a form shows an error,
the band repeats it in red, so it is seen however far down a long page you
are. The × beside it hides the error, to show the field help again.

Every endpoint above is manager-only.

## Sales

A sales order records what a customer bought, at what price, and where it is
in fulfillment.

**Sales** (`/management/sales`) lists every sales order, newest first, with:

- when it was placed;
- the customer, and who entered it when that was someone else;
- its lines at the price paid;
- its total and status.

(`GET /api/orders`.) Order administration lives in the console alone. The
shop's **Your orders** page shows only the signed-in person's own orders, and
has no status control (`GET /api/orders?mine=true`).

**Status** is changed from the order's row, through pending, paid, packed,
shipped, delivered, canceled, refunded (`PATCH /api/orders/{id}`).

#### Canceling and refunding

**Canceling is one way.** A canceled order cannot move to any other status
(409); place a new order instead. Re-sending `canceled` is harmless.

- Canceling an order that is pending or paid returns its stock to the
  catalog. That is why the order cannot come back: it would stand on stock
  already offered to the next buyer.
- Canceling once it is packed, shipped or delivered returns no stock. That is
  how a refund is recorded.

**Refunding works the same way.**

- Refunding a pending or paid order returns its stock (the page asks first).
  The order can then only be canceled, never shipped.
- Refunding once it is packed, shipped or delivered returns no stock. The
  order may still be moved on if the refund was a mistake.

**Two kinds of pending or paid order cannot be canceled or refunded:**

- a sale recorded from an outside platform;
- an order that bought a **sales lot**.

The listing they sold has already ended, so there is nothing to put the stock
back on. The API refuses with a 409 naming what is in the way, and the Sales
page grays out **canceled** and **refunded** on both. Once such an order is
packed, it can be canceled like any other (no stock returns).

There is no "undo an outside sale" path. If one falls through, restore the
item's status and disposition by hand and offer it again.

#### Placing and revising orders

**Placing an order for a customer.** **New order** opens an editor that
searches customers (and accounts with no customer record yet) and the
catalog. Prices default to the listing's current price, and can be
overridden line by line. (`POST /api/customers/{id}/orders`.)

**Revising a pending or paid order.** The same editor opens from the order's
**Edit** button. It sends the whole desired contents of the order, because
stock moves by the difference between the old and new lines, all or nothing
(`PUT /api/orders/{id}`). The request carries the order's `version`. A save
over someone else's change is refused, and the editor asks for a reload.
Orders past `paid` cannot be revised.

**Payment adjustments.** `payment_adjustment_due` flags a paid order whose
total changed after payment. It stays set until someone handles the refund
or extra charge outside the system; nothing in ccwebdb moves money.

**History.** Every save -- placement and each revision -- is recorded: who
made it, and for a revision, what changed line by line and the total's old
and new value. **History** on a row groups one save's rows into one entry
(`GET /api/orders/{id}/changes`). Order notes, and who entered an order, are
console-only.

#### What a sale keeps

**Each sale keeps the item as it was sold.** A line is made by checkout, an
order placed for a customer, a revision adding a line, a recorded outside
sale, or a settled auction. When it is made, it copies the item and its
listing into `sales_order_item.item_snapshot`:

- title, description, year, denomination, series;
- grade with strike, designation and grader;
- mint, certificates, attributes, metal and weights, note details, costs;
- the listing's title, description and price.

Correcting the item later, or reselling it after a return, never changes that
copy. A quantity or price change to an existing line keeps it too. The copy
holds costs, so only the console sees it.

The item editor lists an item's **Sales**, each "sold as" it was then
(`GET /api/inventory/{id}/sales`).

**The copy says which shape it is:**

- `snapshot_version` 1 always has `item`.
- Version 2 has either `item`, for a single coin, *or* `lot` (id, title,
  description) and `items` (one entry per member), for a sales lot -- never
  both.

Older copies are never rewritten; a reader asks for `lot` first. The lot half
is the only lasting record of which coins a sold group held.

## Selling

This section covers how an owned item is put up for sale -- in the web store,
on another platform, grouped into a sales lot, or in an auction -- and how a
sale made elsewhere is recorded.

**The rule underneath all of it: an item is offered in one place at a time,
so it can never be sold twice.**

Under the hood: `app.offering_writes` is the only code that changes a
listing's status, the claim recording where an item is offered, or a sales
lot's status (`docs/specs/selling-design.md`).

### Sales platforms

**Platforms** (`/management/platforms`) lists every platform the business
sells through: the web store, eBay, Whatnot, an auction house. For each it
shows:

- its kind;
- an optional link to the purchase source of the same name;
- the account handle;
- the listing-link template;
- default fees.

A purchase source not yet recorded is added from the picker's "+ Add a
vendor...".

**The web store platform** is created by the migration, and every store
listing and order names it. Checkout and the public catalog are defined by
it, so its kind cannot be changed and it cannot be retired. The console hides
those controls, and the API refuses both with 422. Every other platform is
added here, and may be retired.

**Default fees** are estimates for pricing an item before it sells:
commission and processing rates, a fixed processing charge, and a per-listing
fee.

- **Nothing is seeded.** Terms differ by account and category, and they
  change. So an administrator enters them from their own account, with the
  date they were read (**Fees as of**). That date is shown beside every
  estimate.
- Rates are typed as a percentage (`13.25`) and stored as a fraction
  (`0.1325`).
- A fee of zero shows as `0%` or `$0.00`. A blank means nobody has looked the
  terms up.

### Spot prices

**Spot prices** (`/management/spot-prices`) lists every metal in use, with:

- the price a troy ounce of it is quoted at, and when that was recorded;
- the fine ounces held;
- what they melt for at that price.

**Held means in hand**: items received and either held or listed, since a
coin on offer is still in the drawer. An item sold, returned, canceled,
missing or still on order is not counted. This is wider, on purpose, than the
**Precious metal** report's default of received and held, which leaves out
what is on offer.

A retired metal stays on the page while any of it is held. The metal with the
most fine ounces held is first, and those with none held are last, so the
prices that matter are at the top.

**To record a price**, type it in a metal's **New price** box and press
**Record** (or Enter).

- A price is dollars per troy ounce, with up to four decimal places: `31.50`
  for silver, `0.2875` for copper. A dollar sign in front and commas between
  thousands are read as written: `$4,012.50` is 4012.50.
- **Record** pressed with an empty box, or with something that is not a
  price, says what to type and records nothing.
- **A price is never edited.** Recording one adds a quote and makes it the
  metal's price. The one before is kept, so what the holdings were worth at
  an earlier date can still be worked out. Put right a price typed wrong by
  recording the right one.
- A metal never quoted shows `--` and `never`, and no melt value: not quoted
  is not worth nothing. A price of `0` is a price, and values the holding at
  nothing.
- **Melt value is never stored.** It is the newest price times each item's
  fine weight and piece count, worked out where it is shown: this page, the
  **Precious metal** report (`cb_metal`) and the `item_valuation` view. So
  one new price revalues everything at once. Only an item with a fine weight
  counts.

| Endpoint | Purpose |
|---|---|
| `GET /api/metal-prices` | each metal in use or held: newest price, when, source, fine ounces held, melt value |
| `POST /api/metal-prices` | record a price now -- `metal` (its code), `price_per_ozt`; answers the whole table. 422 for an unknown metal or a price that is not one |

Both are manager-only.

### Cleaning up purchase sources

The vendor list can hold one business under several spellings. (A platform
also links to a `vendor` row as its purchase source.) `app.vendor_cleanup`
tidies them. Each change is named on the command line, because which vendors
are the same business is the owner's call.

It runs from `backend` (`cd /d %USERPROFILE%\dev\ccweb\backend`). Each change
is an option naming vendors by id. Nothing is written without `--commit`, so
run it first without, to see what it would do.

| Option | What it does |
| --- | --- |
| `--merge FROM_ID:INTO_ID` | moves the purchases of one vendor onto another |
| `--kind ID:KIND_CODE` | sets the vendor's kind |
| `--rename ID:NAME` | renames it |
| `--delete ID` | removes a vendor with no purchases |
| `--commit` | writes; without it the run only says what it would do |

For example, this shows what merging vendor 15 into vendor 12 and deleting
vendor 6 would do. The same command with `--commit` added does it:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.vendor_cleanup --merge 15:12 --delete 6
```

The ids 15, 12 and 6 are only examples: use the ones the query below finds.
To find the ids, from the repository:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_psql.cmd -c "select id, name from vendor order by name;"
```

Details of each option:

- `--merge` moves the purchase orders from one vendor onto another, and
  removes the duplicate. It is refused if both used the same order number.
- `--kind` sets `vendor_kind`.
- `--rename` applies after the merges.
- `--delete` removes a vendor with no purchase orders.
- Each option may be repeated.

Removing a vendor that a platform names as its purchase source is refused,
naming the platform. Unlink it on the Platforms page first.

### Offering an item for sale

**To offer items**, select them on the **Coins** or **Currency** screen and
choose **Offer for sale...** in the bulk bar. For one item, its editor's
**Offers** panel has the same button.

The panel hides the button in two cases:

- while the item is held -- active or paused -- by a listing on a platform
  other than the web store;
- while it is in a sales lot that is on offer, on any platform.

**Moving an item from the shop to another platform is one step.** Offering an
item that is active in the web store pauses that store listing. The store
listing resumes when the new offer ends.

**The offer dialog** takes one platform and one format (fixed price or
auction). It has a row per item with:

- price, title and description (pre-filled);
- an optional listing number;
- cost, estimated fees, net and margin, for reference.

**Offer** submits the batch (`POST /api/offers`). If it is refused, nothing
is written. The refusal names every affected item inside the dialog, which
stays open with the typed prices kept. Reasons for refusal: already offered
on another platform or already in the shop; deleted; not received; split; or
the platform retired.

#### Listings

**Listings** (`/management/listings`) shows every offer: active and paused
by default, or **All, including ended**. Filter it by platform and format.
Each row shows price, cost, margin, status and a link to the platform's own
page.

**Edit** (active rows only) changes price, title, description or listing
number, and nothing else (`PATCH /api/listings/{id}`).

The item editor's **Offers** panel shows the same rows for one item, ended
ones included.

**A paused listing** is a store listing set aside because its item was
offered elsewhere. It keeps its price, is not for sale, and does not appear
in the public catalog. The Listings page names the offer that caused the
pause. It resumes on its own, at its old price, when that offer ends.

**Ending an offer.** **End** is on the Listings page (active and paused rows)
and the Offers panel (active rows only). It confirms first, naming listing,
item and platform (`POST /api/listings/{id}/end`). Ending is a withdrawal:
the listing is `ended`, and any store listing it paused resumes. Ending is
not reversible; offering again makes a new listing.

#### Recording a sale made elsewhere

**Record sale...** enters a sale that happened on another platform. It is on
active rows of any platform other than the web store. The dialog takes:

- the sale price;
- the buyer's username on that platform (blank where the platform does not
  name buyers);
- the platform's order number;
- the fees actually charged, one row per kind (commission, processing,
  listing, shipping label, promotion, other).

It shows gross, fees, net and margin.

Saving records the order and ends the listing as sold, in one transaction
(`POST /api/listings/{id}/sale`). The order records the buyer (matched or
created), price, fees and per-item shares. A store listing it had paused ends
too, rather than resuming. The order appears on Sales already `paid`, or
`delivered` for an auction house.

A shop item sells through checkout. An in-person sale of one is an order
placed for the customer (*Sales*). **Record sale...** refuses store listings.

### Sales lots

A **sales lot** is a group of coins offered and sold as one thing: three
Morgan dollars in one eBay listing, or a type set in the web store.

- The coins stay individually owned, costed and reportable throughout.
- The lot exists only as long as the offer does.
- It is unrelated to a **purchase lot**, which records how something came in
  and is permanent. A coin can be in one of each.

**Putting a lot together.** On the **Coins** or **Currency** screen, select
coins and choose **Group into lot...**. Start a new lot with a title, or add
to a lot still assembling. The whole selection goes in, including any part
off the current page.

**Sales lots** (`/management/lots`) shows each assembling lot with:

- its coins, with cost and value;
- the group's running cost basis and value;
- **Remove** per coin, **Edit wording...**, **Discard...** and **Offer for
  sale...**.

The group's **value is a floor**: an unvalued coin contributes nothing, so
the page says how many coins are **Not yet valued**.

**What cannot go in:** a coin that is deleted, split, not received, already
sold or shipped, or already in another open lot. Nor a coin that is not a
*whole* item to claim -- one with a listing offering more than one unit of
it, or an unshipped order holding units. Each refusal names the coin.

**Offering a lot** uses the same dialog as a single item, with one price for
the group.

- Any coin that cannot be offered refuses the whole lot.
- An empty lot cannot be offered.
- Offering **freezes** the lot's title, description and membership.
- Members' web store listings are paused, and come back if the lot is
  dissolved.
- A coin in an offered lot cannot be offered on its own anywhere, the web
  store included. End the lot's offer first.

**Ending a lot's offer dissolves the lot.** The listing ends, every coin is
released, and paused store listings resume. Nothing brings a dissolved lot
back. **Re-offer as a lot**, on a dissolved row, copies its title,
description and coins into a new assembling lot. It says if a coin has since
been offered on its own.

**A sold lot** is one sold by **Record sale...** or a shop checkout. It:

- is marked sold, and releases its members;
- ends, rather than resumes, their paused store listings;
- files every coin as sold.

The order has **one line** for the lot, and behind it **one share per
coin**. Each share is that coin's part of the money and fees, divided by
cost basis, which keeps per-coin gain answerable. Each member's **Sales**
list shows the lot and that coin's share.

**A lot once offered is never deleted.** The **Offered, sold and dissolved**
table keeps it, as the record of which coins went out together. Only a lot
never offered can be discarded. An order that bought a lot cannot be canceled
(*Sales*). If the sale falls through, restore the coins by hand and group
them again.

**In the shop**, a store lot is one card and one detail page, with one price
and an **Add to cart** of one.

- It has no grade, year, country or metal, so filters on those never match
  it. Text search finds its title.
- Its picture is one of its coins, captioned as such.
- Its page lists the coins in the lot, still after it sells.
- Its piece count is the **sum** of its members'.

### Auctions

**Auctions** (`/management/auctions`) runs an auction from draft to settled.

An auction belongs to a platform: a live auction, an auction house, or a
marketplace for a single timed auction. It moves `draft` -> `scheduled` ->
[`consigned`] -> `closed` -> `settled`, or `canceled`.

- **Add lot...** offers an assembling sales lot, or a single item as a lot of
  one, in auction format. The same refusals and pausing apply as for any
  offer. Lot numbers and reserves are editable while the auction is draft,
  scheduled or consigned. Removing a lot ends its listing and deletes its
  row, so the number is free again.
- **Mark consigned...** (auction houses only) moves every member item to that
  house's `consigned` storage location, created on first use.
- **Close** allows results to be entered. The settlement grid takes each
  lot's result (sold, unsold, withdrawn), hammer price and buyer; fees per
  buyer order; and, for an auction house, the location returned items go to.
- **Settle** applies the results in one transaction: one order per buyer,
  with fees and per-coin shares. Unsold and withdrawn lots dissolve, and
  their store listings resume.
- **Cancel**, and removing a lot while the items are at the house, require a
  return location. That picker, and the settlement grid's, list the storage
  locations and offer "+ Add a location..." for one not yet recorded.

The `consigned` storage location kind is reference data loaded by
`python -m app.seeding load`, not by the migration. Without it, consigning
fails, naming the missing code.

Under the hood: `app.auctions` is the only writer of an auction's status and
custody, and of which `auction_lot` rows exist. `routers/auctions.py` creates
a draft, and edits wording, dates, lot numbers and reserves directly.

## Reports

**Reports** (`/management/reports`) answers questions about the whole
collection, without a spreadsheet or a one-off script:

- what is missing or wrong in the record;
- what the collection is made of;
- what has been bought and not yet arrived;
- what is on offer, and what has sold;
- what it all cost.

**Reports read only.** Nothing here writes. Fix what a report finds where it
is always fixed: the item editor, a bulk edit, Receiving, or a pass.

Reports are **manager only**, like anything that shows cost, value or
location. The design is in `docs/specs/reporting-design.md`.

### The catalog

The menu lists every report by group. Choosing one shows its purpose, its
parameters and its table. Groups appear in the order the API lists them:

| Id | Group | Title | What it shows | Parameters |
|---|---|---|---|---|
| `cb_holdings` | Collection | Holdings | What the collection is made of: kind x denomination, with items, pieces and total cost | Status (default received), Disposition (default held) |
| `cb_designs` | Collection | Coins by design | Design series held, across every non-currency kind: items, year span, total cost | Status, Disposition |
| `cb_notes` | Collection | Notes | Note type x series designation: items, seal colors, Federal Reserve districts, star notes and fancy serials, total cost | Status, Disposition |
| `cb_grades` | Collection | Grades | Grade band x strike type x grading service, across coins and currency, with items and total cost | Status, Disposition |
| `cb_metal` | Collection | Precious metal | Metal x form, over items with a fine weight: items, ounces, cost, and melt value at the latest spot price | Status, Disposition |
| `cb_attributes` | Collection | Attributes and errors | Every attribute and error type a live item carries, split by view, with items | Status, Disposition |
| `cb_id_numbers` | Collection | Serial and certificate numbers | Every held item a number identifies -- a note's or a bullion item's serial, or a grading certificate: what it is, kind, metal, fine weight, serial, grading service, certificate numbers and whether it has a photo; the list for a theft report or an insurer. A row opens the item | Status, Disposition |
| `cb_serials` | Collection | Matching serial numbers | Sets of notes whose serial numbers match one another, a row per set, which opens the list of its notes | Status, Disposition, Denomination (any, or must match), Letters (ignore, or must match), Star notes (match plain notes, or only other stars) |
| `dq_issues` | Data quality | Open issues | Every named data-quality check, counted across coins and currency | none |
| `dq_completeness` | Data quality | Field completeness | Percent of live items with each field filled in, by kind | none |
| `dq_photos` | Data quality | Photographs | Live items with no photograph, by kind and status, plus photographs filed against no item | none |
| `dq_derived` | Data quality | Filled by a rule | Fields that still hold what a machine pass filled in, and the rule that filled each one | none |
| `dq_purchases` | Data quality | Purchases with gaps | Purchases with a placeholder number, a missing or implausible order date, no web address, a zero-cost item, or no items | none |
| `dq_locations` | Data quality | Where items are | Live items by storage location, with items and total cost | none |
| `dq_series_years` | Data quality | Coins dated outside their series | Coins whose year falls outside their design series' years -- a typo, a tribute piece, or the wrong series; each row opens that coin | none |
| `dq_series_review` | Data quality | Series to review | Items whose design series a person must settle: the description names a design the recorded denomination and year rule out, the series already set is ruled out by them, or they allow several designs (a boundary year); each row opens that item | Show (all, conflict, disagrees or boundary; default all) |
| `pr_outstanding` | Purchasing and receiving | Not yet arrived | Purchases with items still ordered or missing: vendor, seller, order date, days waiting, items outstanding and their cost; oldest first | Overdue after (days) (default 21) |
| `pr_outstanding_items` | Purchasing and receiving | Not yet arrived items | One row per item still ordered or missing, oldest order first: order, vendor, seller, order date, days waiting, item, a coin's year and mint, a note's series and serial number, title, status and total cost. Click an item to open it | none |
| `pr_spend` | Purchasing and receiving | Spending | Period x vendor: purchases, items, item cost, shipping, sales tax and total, over purchases with a live item | From, To, Period (month/quarter/year, default month) |
| `pr_sources` | Purchasing and receiving | Vendors and sellers | One row per vendor, and per seller a purchase has named: purchases, items, total spent, first/last order date | none |
| `pr_received` | Purchasing and receiving | Received | Arrival day x vendor, newest first, from acquisition-status history: items and total cost. Click a day to list the items that row counts | From, To |
| `pr_received_items` | Purchasing and receiving | Received items | One row per item received, newest first: day, item, a coin's year and mint, a note's series and serial number, title, vendor, seller, order and total cost. Click an item to open it | From, To, Vendor (a vendor's name, or `all`, the default) |
| `sl_offered` | Selling | On offer | Active and paused listings, items and sales lots, by venue: asking price against cost basis, and days listed | none |
| `sl_sales` | Selling | Sales | Month x venue: orders, gross, fees, net, cost basis and gain, for sales orders placed in range | From, To |
| `sl_fulfillment` | Selling | To ship | Orders still open and unshipped -- pending, paid or packed -- oldest first | none |
| `sl_aging` | Selling | Held and not offered | Live items received and held, not on offer or in an open lot, by months since received and kind | none |
| `sl_auctions` | Selling | Auctions | One row per auction, by status; for a settled one: lots, sold, unsold, hammer total and fees | none |
| `sl_ready` | Selling | Ready to sell | By kind: items in hand and not offered, and how many have an own photograph, a grade or weight, a location and a cost -- and all four | none |
| `mn_basis` | Money | Cost basis | Status x disposition of every live item: items and total cost | none |
| `mn_tax` | Money | Sales tax paid | Period x vendor: purchases and sales tax paid, over purchases with a live item | From, To, Period (month/year, default month) |
| `mn_value` | Money | Recorded value | Per item kind: live items, the ones with a recorded value, their cost and value, the difference, and items without one | Status (default received), Disposition (default held) |

The console needs no change to show a report added later: it renders
whatever the API lists (`GET /api/reports`).

### Parameters and drill-downs

**Parameters.** A report's own parameters -- `cb_holdings`'s status and
disposition, `pr_outstanding`'s "Overdue after (days)" -- are a dropdown or a
box, as on the inventory filter panel. The help band explains each one.

- An emptied From or To date means no bound on that side. An open range is a
  normal question.
- Leaving any other parameter empty is refused ("Enter a value for ..."),
  rather than silently running that parameter's default.

**The address keeps the report.** The report and its parameters are kept in
the address, so a result can be bookmarked or reopened
(`/management/reports?report=pr_outstanding&overdue_days=30`). Run writes
only the parameters that differ from their defaults.

**Run.** Pressing **Run** on an unchanged form runs the report again. The
time beside the button ("Ran ...") is when the answer on screen was run. The
help band explains Run, Export workbook and Print while the pointer is over
them, as it does any console button that has help.

**Drill-downs.** A row that names items links to where they are: the
inventory search narrowed to that row's values, or Receiving's
`?order=<id>`.

- A percent cell in `dq_completeness` links to the inventory search with
  `missing=<field>` added. That finds the items with that field empty,
  kind-aware, by the same test the report itself counts by. The inventory
  page shows that filter as a chip reading "Missing: <field>"; clicking the
  chip removes it.
- A row standing for exactly one item, rather than a count of many, opens
  that item's editor over the report itself. Closing the editor returns to
  the report. Saving runs the report again, since the item may no longer
  belong in it.

The same item can be reached by address,
`/management/inventory/coins?item=CC-######`. Opening the inventory search on
that address opens the item on load, not only from a click in the table.

### Export workbook and Print

**Export workbook** downloads the same result as an `.xlsx`:

- the report's title and the parameters it ran with, above the table (an
  empty From or To reads "any");
- a totals row below, in bold;
- then any notes.

It is the same layout `python -m app.reports run ... --workbook` writes.

**Print** opens the browser's print dialog on the report as shown: the same
rows, sort and parameters.

- The console menu, help band and parameter form are hidden on paper.
- A heading printed only on paper names the report, its parameters in words,
  when it ran and its row count.
- The table's header row repeats on every page, and a row is never split
  across pages.
- A report of more than six columns prints landscape.
- Nothing is carried by color alone; it is marked in words. An overdue row
  reads "Overdue" in its own cell.

### The command line

The same reports can be run from a script, or before the console is open.
Run them from `backend\` with the `ccwebdb` conda environment active:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.reports list
python -m app.reports run pr_outstanding --param overdue_days=30 --workbook OUT.xlsx
```

On Linux:

```console
cd ~/dev/ccweb/backend
python -m app.reports list
python -m app.reports run pr_outstanding --param overdue_days=30 --workbook OUT.xlsx
```

Put the workbook's path in place of `OUT.xlsx`.

- `list` prints every registered report's id, group and title.
- `run <id>` prints the report as a plain-text table: title, parameters,
  header, rows, totals, notes.
- `--param name=value` (repeatable) sets its parameters.
- `--workbook FILE` also writes the same `.xlsx` the console's Export
  downloads.

It is read-only, like everything here, so there is no `--commit`.

## Reference vocabularies

Classifiers -- grades, mints, denominations, metals and the rest -- are rows
in reference tables, not free text. A *vocabulary* is one such table, and a
*value* is one of its rows.

Add values from the dropdown where they are needed, or on the
**Vocabularies** page (`/management/vocabularies`). That page also renames,
retires, merges and reorders them. Its picker lists the vocabularies
alphabetically.

- **Add a value...** asks for a label, and whatever the vocabulary's values
  need: a denomination's currency, face value and whether it is a coin or a
  note; a mint's mark.
  - Position, where the vocabulary is in a meaningful order, is a number
    between the positions shown in the list. Dime is 30 and Twenty Cents 35,
    so a fifteen-cent piece would go at 32.
  - The code is worked out, unless one is typed.
  - Nothing can be added to a vocabulary the application acts on value by
    value -- statuses, kinds, dispositions -- and the page says so.
- **Edit details...** changes what a vocabulary records about a value besides
  its label: which items a series is offered for, a denomination's face
  value, a mint's mark.
- **Rename** changes the label, which is what people read. The code never
  changes: saved searches, the data and the API use it. A renamed value is
  marked `manual`, so a later seed load keeps your wording.
- **Retire** stops a value being offered. Every record keeps it, shown marked
  *(retired)*. **Restore** offers it again. A value the application looks up
  by code cannot be retired (409), though it can be renamed. Pressing Retire
  or Merge into... on one says so in its row. Those values are:
  - every value of `item_status`, `disposition`, `sales_order_status`,
    `shipment_status`, `strike_type`, `item_kind`, `grade_scale`,
    `valuation_basis`, `authenticity`, `sales_venue_kind` and
    `sales_fee_kind`;
  - vendor kind `unknown`, storage form `single`, bullion form `round`,
    storage location kind `consigned`, currency `USD`, country `US`, note type
    `frn`, and image roles `obverse`, `reverse` and `unassigned`.

  (`app/references.py`, `retirable`.)
- **Merge into...** replaces a value with another for good. The page previews
  the effect:
  - every item holding the old value moves to the kept one;
  - the old label, code and aliases become aliases of the kept value, so
    ratings and searches using the old word still find it;
  - the old value is deleted.

  The merge is remembered (`reference_merge`), so a seed load does not bring
  it back. A merge is refused when another vocabulary or a facts table uses
  the value: change those first, or retire instead. Values that cannot be
  retired cannot be merged away.

**Retire or merge?** Retire a value you no longer want offered whose records
are right. Merge a duplicate or a mistake, so no record keeps it.

### What a picker offers, and in what order

**Order.** Values are listed alphabetically by label, ignoring case, except
in nine tables ordered by `sort_order`:

- `grade` -- the scale's own order;
- `denomination` -- face value, coins then notes;
- the lifecycles `item_status`, `disposition`, `sales_order_status` and
  `shipment_status`;
- `item_kind` -- by how often each kind occurs;
- `signature_combination` -- chronological. `?year=` narrows it to the pairs
  in office that year, which no picker asks for;
- `sales_fee_kind` -- the order a platform statement reads, "Other" last.

The order is decided once, in the API, so the shop, console and entry panels
agree (`GET /api/reference/{table}`).

**Fit.** Some values apply only to coins or only to notes, and a picker
offers only those that fit the item. A banknote's denomination picker never
lists a coin's, and its error-type picker never lists mint errors.

Under the hood: `denomination.kind` (`coin` or `note`), and `applies_to`
(`coin`, `currency` or `any`) on `series`, `error_type`, `item_attribute` and
`grade_designation`, tell a picker which values apply.
`frontend/src/shared/kinds.js`'s `fitsKind(entry, itemKind)` is the one place
that mapping is written; every picker that needs it passes it as its
`filter`.

**Adding a value while entering.** Every descriptive vocabulary's picker
opens with "+ Add a new value...", under "--"
(`POST /api/reference/{table}`).

- An arrow key on a closed picker steps over it to the next value, so the
  form opens only when chosen from the open list.
- Escape in its form cancels the form and leaves the editor open.
- Attributes and error types ask for the label alone; the rest ask for a code
  and a label.
- Choosing it puts the cursor in the label box, in either form. The code is
  optional, derived from the label when left empty.

Where the label is enough:

- **The code is derived** -- lower-cased, punctuation to underscores
  ("Mismatched Serial" becomes `mismatched_serial`) -- and shown before
  saving.
- **If that code already names a value**, the existing one is selected rather
  than a duplicate created.
- **The kind is inferred** from the item being entered, so the new value is
  offered by the same picker. A value with no marker would fit no kind, and
  vanish from its own list.
- **An attribute also asks for its group** (Serial, Variety, Release,
  Qualifier, Verification). The column is required with no default, so the
  form asks rather than picking one.

A value added this way is marked `manual`. That keeps it distinct from the
shipped catalog, and out of a seed export by default (below).

### Provenance and reference data

Every reference row records how it came to exist:

- `seeded` -- shipped;
- `derived` -- inferred from the collection's data;
- `manual` -- typed by a person.

A machine guess must never be indistinguishable from a curated fact. Review
`derived` rows before anyone exports them.

**Before adding reference data, check it is free to use.** The catalog is
sold, so reference data shipped inside it is redistributed.

- Facts are safe: who held an office and when, design series names and year
  spans, mint specifications, legislated compositions, common collector
  nicknames.
- A publisher's *arrangement* is not: Friedberg numbering, Pick numbering,
  price-guide values, or any catalog's mapping of attributes to its own
  numbers.

See [reference-data.md](reference-data.md).

**Loading and exporting seed files.** The shipped vocabularies live in
`backend\data\reference\`. A seed load adds and updates rows. It never:

- brings back a merged value;
- overwrites a row marked `manual`;
- restores a retired alias.

From `backend` (`cd /d %USERPROFILE%\dev\ccweb\backend`):

Load every seed file:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding load
```

Only those tables (several may follow `--only`):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding load --only TABLE
```

From another folder:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding load --data-dir FOLDER
```

Write seed files, seeded rows only:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding export --out FOLDER
```

The manual and retired rows too:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.seeding export --out FOLDER --source seeded manual --include-inactive
```

`--source` takes any of `seeded`, `derived` and `manual` (default `seeded`).
`--include-inactive` also exports retired values. A schema release runs
`load` after `alembic upgrade head` (*Applying a schema release*).

### Other names (aliases)

A value's label is the standard term: UCAM, United States Note, Walking
Liberty Half Dollar. What people write is an **alias**: Ultra Cameo, Legal
Tender, Walker.

The Vocabularies page lists and edits every vocabulary's aliases. An alias
works at once:

| Where | What it does |
|---|---|
| The search box | finds items of that value |
| Dropdowns | a long list has a **Find** box; typing an alias offers the value with the alias in brackets, and Enter picks the first |

**Two values may share an alias** ("Cartwheel" is any large silver dollar).
Search finds both, and the console marks a shared alias.

**An alias may not be a value's own label or code**, since those are matched
first.

**Removing a shipped alias retires it**, because seed loads only add, and a
deleted one would come back. A retired alias is shown struck through, and a
click restores it. An alias added in the console is deleted outright.

### Attributes

An item's **attributes** say what it is beyond its grade, and it may have any
number of them. A note can be a Star Note, a Fancy Serial and No Motto; a
coin First Strike and CAC.

The item editor lists them under **Attributes**. × removes one, and the
picker adds one, offering only attributes for that kind of item. They are
also editable in Receiving's "Confirm or correct fields" pane.

**Removing one keeps it removed**: no rule adds it back. Setting it again
restores it.

An attribute marked **read** was found by a rule (the serial, the rating, the
series, the cost) rather than set by a person.

**Gift** is the cost's rule:

- Any item -- coin or note -- saved in the editor at an item cost of $0 is
  given Gift, and the word Gift leaves its title.
- No description names Gift. It is how the item was acquired, not something
  for the customers who read a description or a label.
- An item later given a cost loses the Gift the rule gave it, and keeps one a
  person set.
- The rule reaches the kinds of item Gift's **Applies to** admits. Change that
  with **Edit details...** on the Vocabularies page
  (`docs/specs/item-attributes-design.md`).

Search finds items by an attribute's name or alias (`godless`,
`first strike`).

### Errors

An item can record mint and printing errors. It may carry any number, each
with its own free-text note ("miscut at 3 o'clock, 4mm"), but not the same
type twice (`item_error`).

`GET` and `PUT /api/inventory/{id}/errors` read and replace the whole set.
Both screens send `base`, the set as they read it. A save is refused (409)
when someone else has changed the set since, into something other than what
this save sends. So neither change is lost unseen.

One panel is mounted in two places:

| Where | Saving |
|---|---|
| The item editor, beside Attributes | held in the draft and sent by Save, in its own `PUT` after the fields; an item entered on a purchase is entered in this editor, so its errors are recorded the same way |
| **Receiving**, in the item's dialog | its own `PUT` on every change, once the item's record has loaded (its kind decides which types are offered) |

The type picker offers a note the currency error types and those that apply
to both, never the coin ones. It never offers a type already recorded on the
item.

**In the item editor, the fields are saved first and the errors second.** If
the errors call fails, the editor stays open and says so ("Not all was saved
-- the errors were not recorded: ..."), keeping the rows on screen. Save sends
them again.

## Lists: Friedberg numbers, sellers, vendors, storage locations

These four lists are not vocabularies, but they grow the same way: a row is
added inline while something else is being done.

- a Friedberg number, while a note is identified;
- a seller or vendor, while a purchase is entered;
- a storage location, from the location picker in the item editor or
  Receiving.

**Lists** (`/management/lists`) is where a slip made there is corrected, and
where a row is added ahead of the purchase or item that will use it. It has a
tab for each list, named by `?tab=` in the address
(`docs/specs/list-maintenance-design.md`).

Each tab lists its rows, with a search box and how many records use each
row.

- **Add** opens a form for a new row.
- **Edit** changes a row in place.
- **Delete** is offered only for a row nothing uses. The server refuses the
  rest (every foreign key into these tables is `RESTRICT`).

A storage location any item has ever been in stays, as part of that item's
history. Two kinds of location cannot be added from the picker or edited
here:

- a location of kind `consigned` is made by the auction code;
- the kind `sold` is reserved, and nothing makes one.

Merging duplicate vendors is done by `app.vendor_cleanup` (*Cleaning up
purchase sources*).

## Backing up and restoring

A backup is only as good as the proof that it restores. This section says
which kind of backup to take for which purpose, how to prove it, and how to
restore.

**Photograph bytes are in no database backup.** They live under `MEDIA_ROOT`
([settings.md](settings.md)), and `app.media_backup` copies them
(*Photographs*, below). The workbook export runs that copy itself; a
`pg_dump` file and a database copy do not.

| Kind | Command | Use it for |
|---|---|---|
| **`pg_dump` file** | `pg_dump -Fc` (see *Applying a schema release*, step 1) | **the** backup before a migration or any risky `--commit`; a file that can leave the machine |
| **Workbook** | `python -m app.workbook_backup export` | a backup a person can open, read and correct, and the only bulk way in or out of the database |
| **Database copy** | `python -m app.backup` | a working copy beside live, on this server or any SQLAlchemy URL |
| **Photographs** | `python -m app.media_backup copy` | the image bytes, which none of the three above holds |
| **The whole backup, proved** | `.\scripts\ccweb_backup.cmd` | the routine backup: workbook and photographs, proved, with what is obsolete removed |

### The routine backup

Run these from the repository (`cd /d %USERPROFILE%\dev\ccweb`).

Back up now:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_backup.cmd
```

Every day at `CCWEB_BACKUP_TIME` (20:00 unless `.env` says otherwise):

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_backup.cmd /schedule
```

Every day at the time given:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_backup.cmd /schedule 06:30
```

Stop the daily run:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_backup.cmd /unschedule
```

Show the daily task:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_backup.cmd /scheduled
```

On Linux, `./scripts/ccweb_backup.sh` takes the same actions, as
`--schedule [HH:MM]`, `--unschedule` and `--scheduled`, from `~/dev/ccweb`.
The daily run there is a systemd user timer rather than a scheduled task:

```console
cd ~/dev/ccweb
./scripts/ccweb_backup.sh --schedule
```

#### What one run does

One command does what the sections below describe step by step
(`python -m app.backup_run <folder> [--keep N]`):

1. **Exports** the database to `ccwebdb_<time>.xlsx` in the backup folder,
   and copies the photographs into `media\` beside it.
2. **Proves the workbook.** It loads the workbook into a new database on the
   same server (`ccwebdb_proof_<time>`), and compares that with live, every
   row of every table. The proof database is built by the migrations, as a
   restore is, and dropped afterwards.
3. **Checks the photograph copy** against the image rows.
4. **Tidies up**, only when all of that held:
   - It removes the older workbooks, keeping the newest `--keep` (default 1).
     Only workbooks named `ccwebdb_<date>_<time>.xlsx` are ever removed; one
     saved under any other name stays.
   - When only one workbook is kept, it prunes the photograph files no image
     names. With `--keep` above 1 nothing is pruned, because the older
     workbooks kept still name those photographs.
   - It keeps the `pg_dump` files taken before each schema release or live
     write until the next release, then removes them. These are named
     `ccwebdb_pre_<change>_<date>.dump`, and are in the archive folder
     `CCWEB_ARCHIVE_DIR` -- `ccwebdb-backups` beside the repository, where
     *Applying a schema release* writes them -- whatever the backup folder
     is. A release's dump is `ccwebdb_pre_release_<date>.dump`. The newest
     one stays, with every dump taken after it (live writes since that
     release); the dumps before it go, and the proved workbook covers them.
     With no release dump, nothing goes. None goes while the newest release
     dump is under an hour old (it may still be being written), or is not a
     whole `pg_dump` archive; the run says so, and the next one tidies. A
     dump under any other name stays.

**When any step fails, nothing is removed**: the workbooks already there are
the proved ones. The reason is printed, and the exit code is 1. The exit code
is 2 when the script could not start the backup at all: the environment
could not be put in play, or the argument is unknown.

An edit made between the export and the comparison shows as a difference and
fails that run. The next run sets it right.

#### Where it goes, and its log

**The folder** is `CCWEB_BACKUP_DIR` in `.env`. Unset, it is
`ccwebdb-backup` in your home folder (`%USERPROFILE%\ccwebdb-backup`,
`~/ccwebdb-backup`). Choose one whose files leave the machine -- a synced
folder or a network share -- or copy it off yourself. The example
installation uses a OneDrive folder.

**The log.** Every run is appended to `backup.log` in the logs folder, under
a line with its date and time. Read it after a failure. Also read it now and
then, to see that the daily runs say `proved`. A run that cannot put the
conda environment in play cannot read the log folder's setting. It says so
on its console, and in its scheduler's record, instead.

#### The daily schedule

**On Windows**, `/schedule`, run from an administrator cmd, makes a scheduled
task named `ccwebdb backup`.

- It runs as you, whether or not you are signed in, with no password stored.
  So it reaches only this machine, which is all the backup needs.
- It reads `.env` itself, so the folder set there is the one a signed-out run
  uses.
- A OneDrive client is not running while you are signed out. So when the
  folder is inside OneDrive, `/schedule` pins it to stay on the device
  (`attrib +P`), and the run's files sync at the next sign-in. A folder
  outside OneDrive is left as it is.
- A run the machine was off or asleep for is not made up later.

**On Linux**, `--schedule` installs `ccwebdb-backup.service` and
`ccwebdb-backup.timer` (from `deploy/linux/`) as systemd user units. It turns
on lingering for your account, so the timer runs whether or not you are
signed in.

- The timer is persistent: a run the machine was off for happens when it is
  next up.
- `journalctl --user -u ccwebdb-backup` shows its runs.
- Where there is no systemd user manager (WSL without systemd, for one),
  `--schedule` installs nothing, prints the `crontab -e` line to add instead,
  and fails.

Either way, PostgreSQL has to be running.

### Photographs

Run these from `backend` (`cd /d %USERPROFILE%\dev\ccweb\backend`). Each
takes a folder after the action, `ccwebdb-backups\media` when none is given.

Media storage copied to the folder:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.media_backup copy
```

The folder checked against the image rows:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.media_backup check
```

Lists files in the folder no image row names:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.media_backup prune
```

Removes them, not only lists them:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.media_backup prune --delete
```

**`copy`** writes every file the image rows name -- each original and its
two renditions -- under the same path it has in `MEDIA_ROOT`.

- One folder serves every backup. A photograph is named by its content, so a
  file already copied is kept, and a run copies only what is new.
- Each original is hashed as it is copied. One that is missing from
  `MEDIA_ROOT`, or is no longer the bytes its row describes, is named, and
  the command exits 1.

**`check` is the proof.** It re-reads the folder, hashes every original
against its row, and confirms every rendition is there. It exits 1 naming
anything missing or damaged. Run it after a copy that matters.

**`prune` clears out old files.** A copy only grows: a photograph replaced by
a better picture (`app.image_enlarge`), or removed, leaves its old files in
the folder with nothing naming them.

- `prune` lists the files in a folder that no image row names, with their
  size, and deletes nothing. `prune --delete` removes them.
- It judges nothing obsolete, and exits 1 saying why, in a folder that is
  missing a file the rows name, or when the database records no photographs.
  Such a folder is not a complete copy for this database, and may be another
  collection's. Run `copy` first on a copy that has fallen behind.
- The folder may be `MEDIA_ROOT` itself, which gathers such files the same
  way -- but only with the server stopped. A photograph's files are written
  before its rows are committed, so one being stored while the prune runs is
  a file no row names yet.

**To restore**, copy the folder's contents into `MEDIA_ROOT`, keeping the
layout:

```console
robocopy "%USERPROFILE%\dev\ccwebdb-backups\media" "%USERPROFILE%\dev\ccweb\media" /E
```

On Linux:

```console
rsync -a ~/dev/ccwebdb-backups/media/ ~/dev/ccweb/media/
```

Backups are kept beside the repository, in `ccwebdb-backups`: the folder
`CCWEB_ARCHIVE_DIR` names, by default beside the repository folder. The
workbook export and the photograph copy write there when given no folder.

#### Why `pg_dump` before a migration

**Use `pg_dump`, not `app.backup`, before a migration.** `pg_dump` copies the
database exactly as it is, `alembic_version` included. `app.backup` builds
the copy's schema from the *checked-out SQLAlchemy models*. With a release's
code checked out before live is migrated, the copy holds the new schema under
the old revision, and cannot be migrated or restored faithfully.

#### Proving a backup

**A backup is proved by restoring it and comparing, never by listing it.** A
`pg_restore --list` or `python -m app.backup --list` shows that a file or
copy exists, and its size. It does not show that it holds the collection: a
copy that aborted partway still lists at a plausible size while holding no
inventory items at all.

Restore into a new database, then compare it with live. First enter the
database password -- the one in `DATABASE_URL` in `.env`. It is asked for on
its own, so nothing else pasted is taken as the answer:

```console
set /p PGPASSWORD=Database password: 
```

Then, with the restored database's name in place of `RESTORED_NAME`:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.workbook_backup compare postgresql+psycopg://ccwebdb:%PGPASSWORD%@localhost:5432/RESTORED_NAME
```

`compare` reads both databases' tables from the databases themselves, not
the models, so it works whatever code is checked out. It checks:

- the migration revision;
- every row of every table, through a digest;
- the item-code sequence. A restore whose next item would take a code
  already held is not a restore.

It prints `identical` and exits 0. Otherwise it prints
`DIFFERS <table>: <n> rows vs <m>` for each table that differs (`missing`
for a side that has no such table), and exits 1. For a backup taken moments
ago, any difference is a failed backup.

### The database copy (`app.backup`)

Run these from `backend` (`cd /d %USERPROFILE%\dev\ccweb\backend`).

Copy to a new `ccwebdb_bak_` database named for the local time (`TIME_ZONE`'s,
as a workbook's name is):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.backup
```

Copy to a new database of that name:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.backup --name before_split
```

Copy anywhere SQLAlchemy reaches:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.backup --to DATABASE_URL
```

List the local `ccwebdb_bak*` databases and their size:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.backup --list
```

Row counts of a local copy against live:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.backup --verify NAME
```

**What is copied.** Every table is copied, `alembic_version` too. (It has no
model, so it is read from the database itself.) The item-code sequence is set
past the highest code copied.

Some things the models do not hold: the four views, the `grade_display()`
function the inventory search uses, and the `fuzzystrmatch` extension. In a
PostgreSQL copy these are built from the migrations' own definitions, so the
copy can run the application.

The copy is portable: another engine is a different `--to` URL, and there
those three are left out.

**`--verify`** compares each table's row count -- the counts only, not what
the rows hold; `app.workbook_backup compare` does that. It prints
`<name>: row counts match the source on every table`, or `MISMATCH` with the
tables that differ and exits 1.

- A copy that predates a migration reports
  `OLDER SCHEMA -- <name> has no <table>`. It records its own moment, but
  cannot be compared table for table.
- An older copy is expected to differ in counts; it records the collection
  as it was.

**`--list`** only lists names beginning `ccwebdb_bak`, so a copy made with
`--name` is not listed.

### Restoring

A restore is always **into a new database**, never over the live one. The
original stays untouched until the replacement is checked, and switching back
is a one-line edit.

- **From a `pg_dump` file:** `createdb` a new database and `pg_restore` into
  it, as in *Applying a schema release*, step 1.
- **From a workbook:** see *The workbook backup* below.
- **From an `app.backup` copy:** point `DATABASE_URL` at the copy and copy it
  again:

  ```console
  set /p PGPASSWORD=Database password:
  ```

  Then, with the copy's name in place of `COPY_NAME`:

  ```console
  cd /d %USERPROFILE%\dev\ccweb\backend
  set "DATABASE_URL=postgresql+psycopg://ccwebdb:%PGPASSWORD%@localhost:5432/COPY_NAME"
  python -m app.backup --name ccwebdb_restored
  set "DATABASE_URL="
  ```

Then:

1. Check the result with `compare` (above).
2. Set `DATABASE_URL` in `.env` to the new database.
3. Restart the servers (`.\scripts\ccweb_shutdown.cmd /keepdb`, then
   `.\scripts\ccweb_startup.cmd`).

### The workbook backup

The workbook is the only bulk way in or out of the database. It is a backup
a person can read. It is also how many rows are corrected at once: export,
edit the sheets, import into a new database, `compare`, then switch to it.

`app.workbook_backup` writes every table to one `.xlsx`:

- an **About** sheet: format, time, migration revision, rows per table;
- a **Columns** sheet: each column's type, whether it may be empty, what it
  references;
- then one sheet per table, in foreign-key order.

Ids and foreign keys are exactly as stored, so relationships survive. The
tables are read from the database itself, not the models, so none is missed.

Run these from `backend` (`cd /d %USERPROFILE%\dev\ccweb\backend`).

Live to `ccwebdb-backups\ccwebdb_` and the time `.xlsx`:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.workbook_backup export
```

To a file you name:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.workbook_backup export --out FILE.xlsx
```

Its photographs to that folder (`--no-media` for none):

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.workbook_backup export --media FOLDER
```

A workbook into an empty database:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.workbook_backup import FILE.xlsx --to DATABASE_URL
```

A vocabulary link to nothing becomes Unknown:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.workbook_backup import FILE.xlsx --to DATABASE_URL --unknown-for-missing
```

Live against that database, every row of every table:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.workbook_backup compare DATABASE_URL
```

**Photographs.** An export also copies the photographs (*Photographs*,
above) into a `media` folder beside the workbook, or the folder `--media`
names. It exits 1 when one could not be backed up. `--no-media` writes the
workbook alone. An import loads rows only: the pictures come back by copying
that folder to `MEDIA_ROOT`.

**Reading and editing it.**

- An empty cell is NULL; an empty string is written `""`.
- Timestamps are ISO text with their time zone. One typed with no zone is
  read as local time.
- JSON is JSON text, and `null` there is JSON's null, not an empty value.
- Columns headed `(computed)` -- `total_cost`, `sales_tax`, ... -- are for
  reading. The import ignores them, and the database recomputes them.
- Change values freely; keep the header row and the id columns as they are.

**Column widths are remembered.** Each export sizes its columns from
`backend\data\workbook_widths.json`, by sheet and column name. So a width
stays with its column when a migration adds or moves one. To change them,
resize the columns in an export, save it, and run:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.workbook_backup widths FILE.xlsx
```

with the saved workbook in place of `FILE.xlsx`.

A sheet you resized replaces that sheet's remembered widths; the others stay.
Commit the widths file so the next export uses them.

#### Restoring from it

**Restore from a workbook always into a new database.** First enter the
database password -- the one in `DATABASE_URL` in `.env`. It is asked for on
its own, so nothing else pasted is taken as the answer:

```console
set /p PGPASSWORD=Database password: 
```

Then, with the workbook in place of `FILE.xlsx`:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
set PGDATABASE=postgres
..\scripts\ccweb_psql.cmd -c "create database ccwebdb_restored"
set PGDATABASE=
set "DATABASE_URL=postgresql+psycopg://ccwebdb:%PGPASSWORD%@localhost:5432/ccwebdb_restored"
python -m alembic upgrade head
set "DATABASE_URL="
python -m app.workbook_backup import FILE.xlsx --to postgresql+psycopg://ccwebdb:%PGPASSWORD%@localhost:5432/ccwebdb_restored
python -m app.workbook_backup compare postgresql+psycopg://ccwebdb:%PGPASSWORD%@localhost:5432/ccwebdb_restored
```

On Linux, the password the same way, on its own:

```console
read -rs PGPASSWORD
```

Then:

```console
export PGPASSWORD
```

Then:

```console
cd ~/dev/ccweb/backend
PGDATABASE=postgres ../scripts/ccweb_psql.sh -c "create database ccwebdb_restored"
DATABASE_URL="postgresql+psycopg://ccwebdb:$PGPASSWORD@localhost:5432/ccwebdb_restored" python -m alembic upgrade head
python -m app.workbook_backup import FILE.xlsx --to "postgresql+psycopg://ccwebdb:$PGPASSWORD@localhost:5432/ccwebdb_restored"
python -m app.workbook_backup compare "postgresql+psycopg://ccwebdb:$PGPASSWORD@localhost:5432/ccwebdb_restored"
```

**The import refuses:**

- a database at a different migration revision than the workbook's;
- the live database (recognized by the server, not by how the URL is
  spelled);
- any database that already holds inventory items.

Otherwise it clears any other rows the migrations put there, and loads
everything in one transaction. It sets the item-code sequence past the
highest code loaded. A refused row (a value that does not fit its column, a
duplicate) names its table and reason, and loads nothing.

`compare` then says `identical`, or names each table that differs. After
edits, that is exactly the tables edited.

#### Links that point at nothing

Before anything is written, every link is checked against the workbook's own
rows. By default, the import refuses, and lists each row whose link finds
nothing -- for example, after a vocabulary row was deleted from its sheet.

Fix the sheet, or add `--unknown-for-missing`. A link into a vocabulary
(grade, mint, status and the like) is then pointed at that vocabulary's
**Unknown** row, and each substitution is printed:

```
  UNKNOWN inventory_item id 1: grade_id 99999 -> grade Unknown (0)
  1 link(s) set to Unknown
```

The Unknown row is the vocabulary's own `unknown` row, if its sheet has one
(item status does). Otherwise it is added with id 0 -- real ids start at 1 --
labeled Unknown, sorted last, and marked `manual`, so a seed load leaves it
alone. Find the items that point at it, and correct them in the console.

Two cases get no Unknown row:

- A vocabulary whose rows need more than a code and a label -- a
  denomination's currency and face value, a mint's mark -- gets no invented
  row. The import names the columns, and you add an `unknown` row to that
  sheet yourself.
- A link to anything that is not a vocabulary (an item, an order, a
  purchase) is always refused. There is no Unknown item.

## Applying a schema release

A schema release is a code change that adds an Alembic migration. It is the
riskiest routine operation, because it rewrites the live record in place. So
it is applied to live only:

- after it has been rehearsed on a restored copy of live; and
- with a proven backup in hand.

**The migrations.** `backend\alembic\versions\` holds one baseline revision,
`3f9d1c7a2b64`, and ordinary revisions on top of it. The baseline builds the
whole schema from `backend\alembic\baseline.sql`. From `backend\`:

- `python -m alembic heads` names the newest revision;
- `python -m alembic current` names what a database is at.

Reference data a feature needs is loaded by `python -m app.seeding load`, not
by the migration. So every release is schema first, reference data second.

**Connection variables.** `pg_dump`, `pg_restore`, `createdb` and `dropdb`
connect with the standard `PG*` variables, set in step 1. Set them in each
window you use. `scripts\ccweb_psql.cmd` fills in any it finds unset from
`DATABASE_URL`, `PGPASSWORD` included.

1. **Back up with `pg_dump`, and prove the dump by restoring it.** Do this
   with the code that live is running still checked out. First enter the
   database password -- the one in `DATABASE_URL` in `.env`. It is asked for
   on its own, so nothing else pasted is taken as the answer:

   ```console
   set /p PGPASSWORD=Database password:
   ```

   Then, with today's date in place of `YYYYMMDD`:

   ```console
   cd /d %USERPROFILE%\dev\ccweb\backend
   set "PGBIN=%CONDA_PREFIX%\Library\bin"
   set "PGHOST=localhost"
   set "PGUSER=ccwebdb"
   if not exist "%USERPROFILE%\dev\ccwebdb-backups" mkdir "%USERPROFILE%\dev\ccwebdb-backups"
   set "DUMP=%USERPROFILE%\dev\ccwebdb-backups\ccwebdb_pre_release_YYYYMMDD.dump"
   "%PGBIN%\pg_dump.exe" -Fc -d ccwebdb -f "%DUMP%"
   "%PGBIN%\createdb.exe" ccwebdb_rehearsal
   "%PGBIN%\pg_restore.exe" -d ccwebdb_rehearsal --no-owner "%DUMP%"
   python -m app.workbook_backup compare postgresql+psycopg://ccwebdb:%PGPASSWORD%@localhost:5432/ccwebdb_rehearsal
   ```

   On Linux, with `PGPASSWORD` read and exported as above:

   ```console
   cd ~/dev/ccweb/backend
   export PGBIN="$CONDA_PREFIX/bin" PGHOST=localhost PGUSER=ccwebdb
   mkdir -p ~/dev/ccwebdb-backups
   DUMP=~/dev/ccwebdb-backups/ccwebdb_pre_release_YYYYMMDD.dump
   "$PGBIN/pg_dump" -Fc -d ccwebdb -f "$DUMP"
   "$PGBIN/createdb" ccwebdb_rehearsal
   "$PGBIN/pg_restore" -d ccwebdb_rehearsal --no-owner "$DUMP"
   python -m app.workbook_backup compare "postgresql+psycopg://ccwebdb:$PGPASSWORD@localhost:5432/ccwebdb_rehearsal"
   ```

   `PGBIN` is PostgreSQL's binaries inside the active `ccwebdb` environment,
   the same place `scripts\ccweb_env.cmd` finds them.

   **`compare` must print `identical`.** It checks the revision and every row
   of every table (*Backing up and restoring*). Anything else means the dump
   is not usable, and nothing is applied.

   The dump is the way back from this release. Name it
   `ccwebdb_pre_release_<date>` as above: the routine backup keeps it, and
   every dump taken after it, until the next release's dump is taken. A dump
   taken before a live write is named for that change instead and is kept
   the same way.

2. **Rehearse on the restore.**
   1. Check out the release's code.
   2. Point both the application and psql at the rehearsal database.
   3. Record the item count and cost basis.
   4. Migrate and seed.
   5. Record the item count and cost basis again.

   In the same window, so the password from step 1 is still set:

   ```console
   cd /d %USERPROFILE%\dev\ccweb\backend
   set "PGDATABASE=ccwebdb_rehearsal"
   set "DATABASE_URL=postgresql+psycopg://ccwebdb:%PGPASSWORD%@localhost:5432/ccwebdb_rehearsal"
   ..\scripts\ccweb_psql.cmd -c "select count(*), sum(total_cost) from inventory_item where split_at is null and deleted_at is null;"
   python -m alembic upgrade head
   python -m app.seeding load
   ..\scripts\ccweb_psql.cmd -c "select count(*), sum(total_cost) from inventory_item where split_at is null and deleted_at is null;"
   python -m alembic current
   set "DATABASE_URL="
   set "PGDATABASE="
   ```

   The two results must be identical, and `alembic current` must name the
   new head.

   Clear both variables before going on: they are what point the commands at
   the rehearsal rather than at live. Drop the rehearsal afterwards
   (`"%PGBIN%\dropdb.exe" ccwebdb_rehearsal`); it is a full copy of the
   collection.

3. **Stop the API, keeping PostgreSQL**, so nothing writes while the
   schema changes.

   On a development machine (Windows), from the repo root:

   ```console
   cd /d %USERPROFILE%\dev\ccweb
   .\scripts\ccweb_shutdown.cmd /keepdb
   ```

   On a development machine (Linux):

   ```console
   cd ~/dev/ccweb
   ./scripts/ccweb_shutdown.sh --keepdb
   ```

   **On a server, never use the `ccweb_` scripts**: stop the API's own
   service. Windows, from an administrator cmd
   ([deployment-windows.md](deployment-windows.md), step 6):

   ```console
   net stop ccwebdb-api
   ```

   Linux ([deployment-linux.md](deployment-linux.md), step 6):

   ```console
   sudo systemctl stop ccwebdb-api
   ```

4. **Upgrade and seed live**, from `backend\`, with `DATABASE_URL` pointing
   at `ccwebdb` (the `.env` value):

   ```console
   cd /d %USERPROFILE%\dev\ccweb\backend
   python -m alembic upgrade head
   python -m app.seeding load
   ```

   Do not skip the seed step. Without it, a feature that needs new reference
   data fails on a missing code.

5. **Check:**
   - `python -m alembic current` names the new head;
   - the item count and cost basis match step 2's;
   - every table the migration added is empty.

6. **Restart**, once the release's code is checked out.

   On a development machine (Windows), from the repo root, in a shell
   nothing else depends on:

   ```console
   cd /d %USERPROFILE%\dev\ccweb
   .\scripts\ccweb_shutdown.cmd
   .\scripts\ccweb_startup.cmd
   ```

   On a development machine (Linux):

   ```console
   cd ~/dev/ccweb
   ./scripts/ccweb_shutdown.sh
   ./scripts/ccweb_startup.sh
   ```

   Run the startup script bare -- never piped or redirected, or the call
   hangs ([runtime-operations-windows.md](runtime-operations-windows.md),
   [runtime-operations-linux.md](runtime-operations-linux.md)). Then confirm
   with the status script (`.\scripts\ccweb_status.cmd` or
   `./scripts/ccweb_status.sh`, exit 0).

   On a server, build the frontend again as the deployment document's
   *An update* says, then start the API's service. Windows, from an
   administrator cmd:

   ```console
   net start ccwebdb-api
   ```

   Linux:

   ```console
   sudo systemctl restart ccwebdb-api
   ```

   **Either way, the API runs uvicorn without `--reload`.** Until it
   restarts, it serves the code that was running before, whatever the
   database's schema. After the restart, open the shop catalog
   (`GET /api/catalog`) and the console, and reload any open page.

## Things that are deliberately not configurable

- **Per-permission roles.** Two roles, one boundary.
- **Password reset by email.** No mail configuration exists.
- **Editing an account's email.** It is the account's identity.
- **Deleting a user.** The console never deletes an account. To remove a
  person, deactivate their account on **People**: they can no longer sign
  in, everything they did stays recorded under their name, and the account
  can be made active again. Deleting is different: it takes the row out of
  `users`, which only happens outside the console (in `psql`, say). History
  rows reference the user id, and `ON DELETE SET NULL` on those columns
  means even a deletion never erases the record that the work was done --
  only the name of who did it.
- **A storage location customers can see.** This is an authorization
  boundary: a public listing that leaked the safe-deposit box holding an item
  would be a security failure. It is enforced by `routers/catalog.py`, which
  builds every public response field by field, and by the test asserting the
  result carries no location. It is not enforced by the `public_catalog`
  view, which forbids the columns but which no endpoint reads.
