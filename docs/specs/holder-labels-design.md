# Holder labels, serial patterns and fancy-serial lookups

*2026-11-12. The labels spec: what the console does.*

Four pieces and a review of the existing records. Each piece is useful on
its own; each later one uses what the earlier ones record.

1. **A description written on save** when the item has none.
2. **Serial patterns derived on save**, with Ladder split into three, and
   the Series 2013 and 1995 $1 star duplicates flagged.
3. **Two lookup buttons on a note** for mycurrencycollection.com, and two
   fields for what the owner reads there.
4. **Printed labels** for coin flips, currency holders and sets, with a
   print batch.
5. **A review of the existing records**: serial attributes and
   descriptions brought up to date.

## Why

The owner is re-holdering the collection and wants every holder labeled in
print rather than by hand: about 4,500 coins in flips, 1,370 notes and 775
sets on hand. A label must say what the piece is at a glance -- the item's
number, so it can be found in the console, and what makes it worth a look.
For notes that includes fancy-serial designations and a "coolness" figure,
which collectors use and which today exist nowhere in the record.

Success: the whole collection labeled in one run of about 50 sheets; after
that, a sheet at a time as items arrive or change, without labeling
anything twice or missing anything, and without wasting the unused part of a
sheet.

## Goals, non-goals, anti-goals

**Goals**

- Labels on two sheetlabels.com products, printed on the owner's Epson
  inkjet from the console.
- A whole-collection run, and a small batch of items gathered beforehand,
  each starting at any cell of a part-used sheet.
- The system knows which items carry a current label **on the holder**:
  printed, and then confirmed applied.
- Fancy-serial designations that follow from the serial are recorded
  without anyone typing them.
- An item saved with an empty description gets one.

**Non-goals**

- Barcodes or QR codes: they do not fit the coin label. None on any label.
- The 4" x 6" label printer.
- Labels for bullion, medals, tokens, "other" and "unknown" items.
- Fetching anything from mycurrencycollection.com.

**Anti-goals** -- a build that does these has failed even if it works:

- Text that runs onto a neighboring label when the printer drifts a little.
  SL564 labels touch edge to edge.
- Marking items labeled when the sheet did not print correctly.
- Counting an item labeled while its label is still on the sheet: a
  printed label is not an applied one, and *Not labeled* must be a list the
  owner can trust when picking up the next coins.
- The software fetching, parsing or storing a website's results. Forbidden
  by `docs/reference-data.md`: the owner reads the page and types what they
  choose to record.
- A derived attribute coming back after the owner removed it.

## 1. A description written on save

`app/item_descriptions.py` already writes a description from an item's
fields (`suggested_description`), behind the item editor's **Suggest
description** button.

On the item editor's saves -- `POST /api/inventory` and `PATCH
/api/inventory/{id}` -- when the description the item would be left with is
empty or only whitespace, the save stores `suggested_description` of the
item as saved, in the same transaction. Every item kind. A description the
owner typed is never touched. The field change is recorded like any other
(`app.field_changes`), under the person saving. It is done on the server,
in those two endpoints only: bulk edit, receiving and splitting do not
write descriptions, so a bulk move of 500 older items does not write 500 of
them; the review in section 5 handles the items already saved without one.
The description is written after the save's derived links (section 2), so
it names the designations the same save derived.

## 2. Serial patterns derived on save

`app/serial_patterns.py` already derives Star, Solid, Binary, Trinary,
Radar, Repeater, Double Quad, Ladder, Birthday, Low Serial, High Serial and
Fancy Serial from a note's serial, as derived links (`derived_by`
`serial_pattern`) that a person may remove and that then stay removed.

**On every save:** every save of an item -- the editor's, bulk edit, item
creation -- derives its designations in the save's own transaction
(`serial_patterns.derive`, called from `classifier_defaults.refresh_items`),
after the note's class is filled, so Duplicate Serial reads a note type the
same save set. It takes back what it added and the note no longer earns,
and leaves alone what a person set or removed. For the records already
stored the same rules run by hand, over every note:
`python -m app.serial_patterns`, then `--commit` (section 5).

**Ladder becomes three attributes.** The owner's definitions, checked
against the Banknote Serial Checker guide
(https://banknoteserialchecker.com/us/guides/collectable-fancy-and-special-serial-numbers/;
the owner also points to its index, https://banknoteserialchecker.com/sitemap/,
as a reference for these terms):

| Attribute | Rule | Earns it | Does not |
|---|---|---|---|
| Ladder (`ladder`, exists) | All eight digits step by one, up or down; running past 9 to 0 or past 0 to 9 counts ("run through" ladder) -- today's rule, unchanged | 12345678, 87654321, 67890123, 32109876 | |
| Scattered Ladder (`scattered_ladder`, new) | Eight distinct digits that would form a ladder (run through included), in any other order. Alias: Broken Ladder | 31452786 | 12345678 (a Ladder) |
| Partial Ladder (`partial_ladder`, new) | Not a Ladder, and either (a) a stretch of five or more consecutive positions whose digits step by one in **one direction** throughout, up or down, running past 9 to 0 or past 0 to 9 allowed, or (b) the serial is four pairs of the same digit -- `aabbccdd` -- whose four digits are consecutive, running past 9 to 0 allowed, in any order | (a) 00001234, 81234567, 12345567, 12345679, 89012xxx; (b) 00112233, 33112200, 99001122 | 10203040, 11111112, 12321xxx (changes direction) |

A note may earn Scattered and Partial both; both are recorded. Both new
attributes are digit patterns: each adds Fancy Serial, as the others do.
Both are seeded in `backend/data/reference/attribute.json` in the `serial`
group, `applies_to` currency, beside Ladder; Broken Ladder is a
`reference_alias` of Scattered Ladder. They are terms in common use, so they
may ship (`docs/reference-data.md`).

**Duplicate Serial** (`duplicate_serial`, new; the owner's request). In
2014-2016 the Bureau of Engraving and Printing printed the same 6,650,000
serials of the Series 2013 $1 New York (B) star notes at both Washington
and Fort Worth. A note is a Duplicate Serial when it is a Federal Reserve
Note, face $1, Series 2013, and its serial is `B` + eight digits + `*`
with the digits in

- 00000001 to 00250000, or
- 03200001 to 09600000.

The two ranges hold 250,000 and 6,400,000 serials, matching the BEP's
count of 6,650,000. Sources, which agree on both ranges:
https://www.2013b.com/2021/10/welcome.html,
https://project2013b2.com/ (a registry matching Washington and Fort Worth
halves), and https://www.numismaticnews.net/paper-money/duplicated-frn-serial-numbers
(for the BEP's count). One site, serialworth.com, gives 06400000 as the
second range's end, which does not match the count; it is not followed.

Both halves of a pair are duplicates, so the rule does not depend on where
the note was printed. Which half it is, is already recorded:
`currency_detail.printing_facility` (`dc` or `fw`, read from the face
plate). The attribute is seeded in the `variety` group, `applies_to`
currency, so it prints on the label's attributes line. It is a derived link
like the serial patterns -- added on save, taken back if the serial or
series is corrected out of the range, never re-added once a person removes
it. The ranges are a fact about a printing error, not a publisher's
arrangement, so they may ship (`docs/reference-data.md`); they are kept
as data with their sources beside them.

**Series 1995 too.** The same Numismatic News article's Table 1
(https://www.numismaticnews.net/uploads/MTc4MTgxMjk1MDk5MDk0NjMy/table1.jpg,
found by the owner) lists the Series 1995 $1 star printings, all at
Washington, whose serials repeated an earlier run's:

| District | Duplicated serials | How |
|---|---|---|
| New York (B) | `B00000001*` to `B00640000*` | four press runs (Sep 1995, May 1996, May 1997, Sep 1997) each began at B00000001*; their overlaps cover these 640,000 serials, the first 320,000 printed four times |
| Atlanta (F) | `F09856001*` to `F10240000*` | two Aug 1996 runs overlapped: 384,000 serials |

A Federal Reserve Note, face $1, Series 1995, whose serial falls in one of
these is a Duplicate Serial as well. Since all were printed at Washington,
the printing facility does not tell the copies apart.

**Existing notes** get the new attributes from the review in section 5;
the save rule keeps them current after.

## 3. Lookups on mycurrencycollection.com

Two buttons on a note's editor, beside the serial number, each opening a new
browser tab. The site fills its results in with JavaScript; the software
never reads them.

| Button | Shown | Opens |
|---|---|---|
| **Check serial** | the serial has eight digits | `https://www.mycurrencycollection.com/reference/fancy-serial-number-checker/{the eight digits}` |
| **Star note lookup** | the serial has a `*` | `https://www.mycurrencycollection.com/reference/star-notes/lookup/{face value}/{series year}/{serial}` |

The owner's examples: `.../fancy-serial-number-checker/00003333`,
`.../star-notes/lookup/1/2021/F01011010*`. Face value is the denomination's
whole-dollar amount (`1`); the series is passed as its year digits alone
(`2017` for 2017A, `1935` for 1935-D); the serial is as recorded, letters
and star included, spaces removed (`frontend/src/management/mcc-links.js`).
Whether the site answers for a lettered series given as its year, and for
a star at the start of the serial (`*12345678A`, older notes), is for the
owner to confirm in a browser. If the site cannot answer for some series,
the button is still shown and the site says so.

**Two new fields on the note** (`currency_detail`), each typed by the
owner, each with help text:

| Field | Type | Meaning |
|---|---|---|
| Coolness index | a percentage, 0 to 100, one decimal place, optional | the "Coolness Index" the checker shows |
| Star run size | a whole number above 0, optional | the size of the star note's print run, from the star lookup |

Help text, on each button's tooltip and each field: where the value comes
from (mycurrencycollection.com; the Coolness Index is CoolNumbers.com's
for-fun score, which the site says does not measure value) and whom to ask
about the site's data: dave@mycurrencycollection.com, the address the site
publishes under *Anything else* on https://www.mycurrencycollection.com/contact
(the owner checked it there; the page hides it from programs).

A typed value is a fact the owner recorded about their note, like a
certification number: stored per note, never seeded or shipped.

## 4. Printed labels

### The sheets

Both are US Letter, 8.5" x 11", from sheetlabels.com; the inkjet material
("Spectacle White Matte Inkjet") suits the Epson. Measured from the
products' pages (https://www.sheetlabels.com/labels/SL597,
https://www.sheetlabels.com/labels/SL564).

| | SL597 | SL564 |
|---|---|---|
| Label | 0.625" x 0.5", rounded corners | 1.333" x 0.625", square |
| Grid | 10 across, 16 down: 160 | 6 across, 17 down: 102 |
| Top / bottom margin | 0.3345" | 0.188" |
| Left / right margin | 0.333" | 0.25" |
| Gap across / down | 0.176" / 0.1556" | 0 / 0 |
| Used for | coins | notes and sets |

The published figures do not sum to the sheet exactly: SL597's rows come
to 11.003" down, SL564's columns to 8.498" across (and its rows to
11.001"). Each cell's place is computed from the margins, label size and
gaps for that cell alone, so the difference does not accumulate across the
sheet.

Cells are numbered left to right, top to bottom, from 1. The layouts are
data in one place (`app.labels` and the `GET /api/labels/sheets` the page
reads), so a third product is a new entry, not new code.

### What each label says

Lines with nothing to say are left out, not printed blank. The item's number
prints without the prefix: `004521` for `CC-004521`, `000412_02` for a piece
of a split lot -- `ITEM_CODE_PREFIX` and its dash removed, zeros kept, so
typing the printed number into the inventory search finds exactly that item.

**Coin** (SL597), three lines -- the owner's list, without the series name:

```
004521
1921-S
Silver
```

The year, with the mint mark after a dash; a range of years as recorded;
nothing for an item marked No date. The metal's label.

**Note** (SL564):

```
000412  Fr 1613*  Cool 96.9%
Series 1935-D $1 Silver Certificate
Star Note · Wide · Partial Ladder
Cut error · Ink smear
```

Line 1: number, Friedberg number, Coolness index. The Friedberg number
prints when its status is `confirmed` or `proposed` (the owner's ruling),
not `unknown` or `conflicting`. Line 2: what the note is
(`offer_titles.name_of`). Line 3: the note's attributes in force from the
`serial` and `variety` groups only, in vocabulary order, under their
vocabulary labels;
Fancy Serial is left out where a named digit pattern is shown, as
`item_descriptions` already does; Error Note is left out, line 4 being the
errors. Gift is left out too (the owner's ruling): it is how
the note was acquired, a purchasing matter, and labels are read by
customers. Line 4: its errors.

**Set** (SL564), the owner's list:

```
000775
1999 Silver Proof Set
San Francisco · 9 pieces
```

The year and what the set is (`name_of`, else the set form's label); the
mint where the record holds one; the piece count.

**Fitting:** text keeps 0.06" inside each label's edge on every side (the
safe border), so a small drift stays on the label. A line too long for the
width is set smaller, down to 5pt, and then cut with an ellipsis -- never
wrapped onto a line the label does not have. Text starts at the top of the
label, so a label with more lines than fit loses its bottom line, never the
item number. Type is 7pt on SL597 and 7.5pt on SL564
(`frontend/src/management/pages/labels/labels.css`), provisional until the
owner's test print on the Epson sets them. The pages are HTML and CSS laid
out in inches.

### Printing

A **Labels** page in the console, in the Inventory menu (`/labels`):

1. **What to print**, one of:
   - *The print batch* (below);
   - *Not yet labeled*: every **labelable** item of the chosen label type
     that carries no label;
   - *Needs a new label*: labelable items whose label no longer matches
     (below).
   The label type is Coin (SL597) or Note and set (SL564); a batch holding
   both kinds prints as two runs. Items print in item-number order.

**Labelable** (the owner's ruling): an item of kind coin, currency or set,
with status `received` and disposition `held` or `listed`, that is not in a
grading service's holder (no grading service recorded) and is a single
piece or a set -- not a roll, tube, bag or box of several pieces. Anything
else is never offered for a label and never counted as needing one.

**The print batch** is a short list of items the owner builds up for the
next small run, kept in the database until it prints, so it survives
closing the browser. An item is added to it from:
- a lookup on the Labels page: type an item number, as in the inventory's
  search, and *Add to batch*;
- the inventory's search, whose ticked rows gain an *Add to label batch*
  action;
- the item editor, with an *Add to label batch* button.
The Labels page lists the batch with a *Remove* beside each item. Only
labelable items can be added. A *Yes* after printing the batch empties it;
a *No* keeps it. The batch is separate from the other two choices: printing
everything not yet labeled neither reads nor empties it.
2. **Start at cell**: the sheet drawn to scale, every cell clickable, the
   cells this run fills shaded, and a line saying where it ends -- including
   onto further sheets, which always start at cell 1. Default: cell 1.
3. **Print**: opens the browser's print dialog on pages laid out in inches,
   one page per sheet. The page tells the owner to print at 100% ("Actual
   size", not "Fit to page") with no headers or footers.
4. **Did these labels print correctly?** asked when the dialog closes. *Yes*
   records every item in the run as printed, waiting to be applied
   (below). *No* records nothing; the run
   can be printed again from any cell.

The page reads a run from `GET /api/labels/run?source=batch|unlabeled|stale`:
one list of labels per sheet product (`runs`, each a `sheet` code and its
labels' lines in item-number order) and, for the batch, the item codes no
longer labelable (`skipped`), which are not printed and stay in the batch.
*Yes* posts the lines each label printed to `POST /api/labels/printed`,
with the run's source.

A **test page** prints the same layout on plain paper with every label's
outline, to hold against a sheet and check alignment before using labels.

### Applying

A printed label is on a sheet, not on a holder. The owner confirms each one
once it is stuck on, in either of two places:

- **To apply**, on the Labels page: every run answered *Yes* and not yet
  fully applied, newest first, each label listed in the order it printed
  (the order on the sheet) with its item number and lines, each with a
  tick box, unticked: finding the coins can take days, and a label is
  marked applied only when the owner ticks it. *Select all* and *Deselect
  all* tick or clear the whole list, and each run has the same pair. The
  owner ticks the labels stuck on and presses *Applied*. *Not used*
  instead returns the ticked ones -- a label spoiled, lost or set aside --
  and each goes back to what its holder carries, so the next run prints it
  again. Unticked labels stay in the list.
- **The inventory**: with the label filter on *Printed, not applied*, the
  ticked rows' *Mark label applied* action. Only items with a printed label
  waiting are marked; any other ticked row is named and left alone.

*Applied* records **when** the label went on and **its text** as the label
the holder carries. Until then the holder carries whatever it carried
before: nothing, or its earlier label.

### Knowing what is labeled

Each labelable item is in exactly one label state, the first that fits:

1. **Printed, not applied** -- a label answered *Yes* and not yet applied
   or returned.
2. **Not labeled** -- nothing on the holder.
3. **Needs a new label** -- the text the holder's label would have now
   differs from the text applied: a corrected mint mark, an added error, a
   new Coolness index. Comparing the text, rather than watching fields,
   means anything that changes the label is noticed and nothing else is.
   Every save of an item, and a save of its errors, rechecks its flag.
4. **Labeled** -- applied, with the text it would print now.

The inventory's label filter offers all four
(`label=printed|unlabeled|stale|labeled`), each among labelable items only.
The *Not yet labeled* and *Needs a new label* runs print items in those
states, so a label waiting to be applied is never printed twice. The
*Needs a new label* run first rechecks every labeled item, so a change no
save saw -- a vocabulary label renamed -- is caught too.

Printing, applying or returning a label, joining or leaving the batch, and
the needs-a-new-label flag are bookkeeping, not edits of the item: none of
them moves the item's version or last-changed time, so a form open on an
item still saves. The text recorded is what the page printed, sent back
with *Yes*, so an item edited between printing and applying is recorded as
needing a new label once applied. *Yes* on a run already recorded records
nothing new.

### Volume

Received today: 4,522 coins, at most 29 sheets of SL597; 1,366 notes and
775 sets, at most 2,141 labels, 21 sheets of SL564. Fewer once slabs, lots
and items already sold are left out.

## 5. Reviewing the existing records

Run once, with the owner's word and under the live-write procedure (dump,
rehearsal, live, verify), in this order; the commands are in
`docs/system-administration.md` (*Bringing records up to date*):

- **Serial attributes:** `python -m app.serial_patterns --commit` over every
  note, adding Scattered and Partial Ladder, Duplicate Serial and any
  designation the existing notes earn but lack. Its dry-run report is shown
  to the owner before the commit.
- **Descriptions, where there is none:** `python -m app.description_review
  fill` gives every item with an empty description `suggested_description`,
  recorded as a field change.
- **Descriptions already written:** never replaced without the owner seeing
  them. `description_review export` writes a workbook listing each item
  whose description differs from what would be suggested now, the two side
  by side; the owner marks `x` on the ones to replace, and
  `description_review apply` replaces those with the suggestion as computed
  then, skipping and naming a row edited since the export.

## Constraints

- Every change follows the project's rules in `CLAUDE.md` and
  `docs/code-quality.md`; the gate (`scripts\ccweb_check.cmd`) passes.
- The schema for all four pieces ships as Alembic migrations
  `a4d7c2e9b1f6_holder_labels` and `b7e1d4a9c3f2_label_applied` (the
  waiting label), each applied to live by the
  release procedure in `docs/system-administration.md`.
- Serial-rule tests use the synthetic serials already used in tests.
- Help texts are in `frontend/src/management/fieldHelp.js`.
