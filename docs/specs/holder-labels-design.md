# Holder labels, serial patterns and fancy-serial lookups

*2026-11-12. Design approved by the owner; not yet built.*

Four pieces, built in this order, and a one-time review of the existing
records. Each piece is useful on its own; each later one uses what the
earlier ones record.

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

The owner is re-holdering the collection and wants every holder labelled in
print rather than by hand: about 4,500 coins in flips, 1,370 notes and 775
sets on hand. A label must say what the piece is at a glance -- the item's
number, so it can be found in the console, and what makes it worth a look.
For notes that includes fancy-serial designations and a "coolness" figure,
which collectors use and which today exist nowhere in the record.

Success: the whole collection labelled in one run of about 50 sheets; after
that, a sheet at a time as items arrive or change, without labelling
anything twice or missing anything, and without wasting the unused part of a
sheet.

## Goals, non-goals, anti-goals

**Goals**

- Labels on two sheetlabels.com products, printed on the owner's Epson
  inkjet from the console.
- A whole-collection run, and a small batch of items gathered beforehand,
  each starting at any cell of a part-used sheet.
- The system knows which items carry a current label.
- Fancy-serial designations that follow from the serial are recorded
  without anyone typing them.
- An item saved with an empty description gets one.

**Non-goals**

- Barcodes or QR codes: they do not fit the coin label. None on any label.
- The 4" x 6" label printer.
- Labels for bullion, medals, tokens, "other" and "unknown" items.
- Fetching anything from mycurrencycollection.com.

**Anti-goals** -- a build that does these has failed even if it works:

- Text that runs onto a neighbouring label when the printer drifts a little.
  SL564 labels touch edge to edge.
- Marking items labelled when the sheet did not print correctly.
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
(`app.field_changes`), under the person saving. *My call: on the server,
in those two endpoints only. Bulk edit, receiving and splitting do not
write descriptions, so a bulk move of 500 older items does not write 500 of
them; the review in section 5 handles the items already saved without one.*

## 2. Serial patterns derived on save

`app/serial_patterns.py` already derives Star, Solid, Binary, Trinary,
Radar, Repeater, Double Quad, Ladder, Birthday, Low Serial, High Serial and
Fancy Serial from a note's serial, as derived links (`derived_by`
`serial_pattern`) that a person may remove and that then stay removed. Today
it runs only by hand (`python -m app.serial_patterns --commit`).

**On save:** the same derivation runs for the item whenever any save --
the editor's, bulk edit, receiving -- sets or changes a note's serial
number, with the same rules for taking back what it added and for leaving
alone what a person set or removed.

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
whole-dollar amount (`1`); the serial is as recorded, letters and star
included, spaces removed.

**Not yet known, for the builder to settle by trying it in a browser:**
- whether a series with a letter (2017A, 1935-D) is passed as the year
  alone (`2017`) or whole (`2017A`);
- whether a star at the start of the serial (`*12345678A`, older notes)
  works as recorded.
If the site cannot answer for some series, the button is still shown and
the site says so.

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
https://www.sheetlabels.com/labels/SL564); the sums of labels, gaps and
margins come to the sheet exactly.

| | SL597 | SL564 |
|---|---|---|
| Label | 0.625" x 0.5", rounded corners | 1.333" x 0.625", square |
| Grid | 10 across, 16 down: 160 | 6 across, 17 down: 102 |
| Top / bottom margin | 0.3345" | 0.188" |
| Left / right margin | 0.333" | 0.25" |
| Gap across / down | 0.176" / 0.1556" | 0 / 0 |
| Used for | coins | notes and sets |

Cells are numbered left to right, top to bottom, from 1. The layouts are
data in one place, so a third product is a new entry, not new code.

### What each label says

Lines with nothing to say are left out, not printed blank. The item's number
prints without the prefix: `004521` for `CC-004521`, `000412_02` for a piece
of a split lot -- `ITEM_CODE_PREFIX` and its dash removed, zeros kept, so
typing the printed number into the inventory search finds exactly that item.

**Coin** (SL597), three lines -- the owner's list (*my call: version A of the
mockup, without the series name, as the owner listed*):

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
errors. *My call.* Line 4: its errors.

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
width is set smaller, down to a minimum size the builder picks after a test
print, and then cut with an ellipsis -- never wrapped onto a line the label
does not have.

### Printing

A **Labels** page in the console:

1. **What to print**, one of:
   - *The print batch* (below);
   - *Not yet labelled*: every **labelable** item of the chosen label type
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
everything not yet labelled neither reads nor empties it.
2. **Start at cell**: the sheet drawn to scale, every cell clickable, the
   cells this run fills shaded, and a line saying where it ends -- including
   onto further sheets, which always start at cell 1. Default: cell 1.
3. **Print**: opens the browser's print dialog on pages laid out in inches,
   one page per sheet. The page tells the owner to print at 100% ("Actual
   size", not "Fit to page") with no headers or footers.
4. **Did these labels print correctly?** asked when the dialog closes. *Yes*
   records every item in the run as labelled. *No* records nothing; the run
   can be printed again from any cell.

A **test page** prints the same layout on plain paper with every label's
outline, to hold against a sheet and check alignment before using labels.

### Knowing what is labelled

On *Yes*, each item records **when** it was labelled and **the text printed**
on its label. An item **needs a new label** when the text its label would
have now differs from the text printed -- a corrected mint mark, an added
error, a new Coolness index. Comparing the text, rather than watching
fields, means anything that changes the label is noticed and nothing else
is. *My call; the owner asked for the tracking, not for this mechanism.*

The inventory gains a filter for *Labelled* / *Not labelled* / *Needs a new
label*.

### Volume

Received today: 4,522 coins, at most 29 sheets of SL597; 1,366 notes and
775 sets, at most 2,141 labels, 21 sheets of SL564. Fewer once slabs, lots
and items already sold are left out.

## 5. Reviewing the existing records

Once, after pieces 1 to 3 are released, with the owner's word and under the
live-write procedure (dump, rehearsal, live, verify):

- **Serial attributes:** `python -m app.serial_patterns --commit` over every
  note, adding Scattered and Partial Ladder and any designation the
  existing notes earn but lack. Its report is shown to the owner before the
  commit.
- **Descriptions, where there is none:** every item with an empty
  description gets `suggested_description`, recorded as a field change.
- **Descriptions already written:** never replaced without the owner seeing
  them. A review lists each item whose description differs from what would
  be suggested now, the two side by side, and the owner ticks the ones to
  replace. *My call on the form of the review* -- a console page or a
  workbook, whichever the builder finds simpler to read through for a few
  thousand rows.

## Constraints

- Every change follows the project's rules in `CLAUDE.md` and
  `docs/code-quality.md`; the gate (`scripts\ccweb_check.cmd`) passes.
- Schema changes ship as one Alembic migration per release, applied to live
  by the release procedure in `docs/system-administration.md`.
- Serial-rule tests use the synthetic serials already used in tests.
- Documentation describes the result as built; on completion the
  specs this touches -- `item-attributes-design.md`,
  `entry-panels-design.md`, `database-design.md` -- the UI guide and the
  system administration guide are brought up to date, and this document
  becomes the labels spec.

## Left to the builder

- Fonts and point sizes, chosen from a test print on the Epson.
- How the label pages are produced (HTML and CSS in inches is the expected
  route; a PDF is acceptable if the browser's print scaling defeats it).
- Where the Labels page sits in the console's navigation.
- Whether pieces 1 to 3 ship in one schema release or several.
- The exact wording of help texts, within what section 3 requires.
