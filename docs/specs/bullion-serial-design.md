# Bullion serial numbers and the identifying-numbers report

Last revised: 2026-10-29.

## Why

Many bars, some rounds and every Goldback (a small gold-bearing note sold as
bullion) carry a serial number unique to the piece. The owner wants it
recorded and searchable. The chief reason is theft: a stolen piece can be
described to the police or an insurer by a number no other piece shares. A
graded coin's certificate number serves the same purpose. It is printed on
the holder and visible in every sale listing.

## Goals

- A bullion item holds one serial number. It is typed in the item editor and
  stored exactly as written.
- The Coins view (where bullion lives) finds an item by its serial.
- A kind change never drops a serial. A note that becomes bullion keeps its
  serial, and a bullion item that becomes a note keeps it too.
- One report lists every held item that a number identifies -- a serial, a
  certificate, or both. It is ready to hand over after a theft.

## Non-goals

- No uniqueness rule and no duplicate-serial issue check. A repeated serial
  is not proof of a duplicate (owner's ruling).
- No serial on coins, sets, medals or tokens. Bullion is what carries one,
  and widening it later is one guard.
- No serial-pattern attributes (solid, radar, repeater, fancy) on bullion.
  Those attributes are note-side vocabulary, and the pattern pass reads notes
  only. A Goldback's fancy serial is still recorded as its serial.
- Nothing in the public catalog. A serial is never shown to shoppers.
- Receiving's identify step does not ask for a bullion serial.

## Anti-goals

- A serial lost silently: on a kind change, an edit, or a save sent without
  the field.
- A serial changed in form: no upper-casing, no trimming, no dropped leading
  zeros. It is stored as sent, as a note's is. Only a blank means no serial.

## Storage

The column is `coin_detail.serial_number`: `String(64)`, nullable, indexed.
It has the same shape as `currency_detail.serial_number`. `coin_detail` is
the row every non-note item has.

The `coin_inventory` view does not carry the serial. The inventory search
reads the base tables, not the view (`app/inventory_search.py`).

## Rules

- **Where it is accepted.** Only where the item is bullion, or becomes
  bullion in the same request. On a coin, set, medal or token it is a 422
  naming the field, as any note field on a coin is. A blank sent for any kind
  is no change.
- **One API name.** The field is `serial_number` for both notes and bullion.
  The server routes it by the item's resulting kind: to `currency_detail` for
  a note, to `coin_detail` for bullion.
- **Blank is NULL.** Blank or whitespace alone is stored as NULL
  (`_serial_or_none`, shared with notes).
- **History.** A change is logged in History like any other field and moves
  the item's version. Sent unchanged, it moves nothing.
- **Single item only.** Single-item edit and create accept it. Bulk edit
  refuses it, as it refuses mint and variety.
- **Kind change** (`item_kinds.match_detail_to_kind`):
  - Note to bullion: the note's serial moves to the bullion row. The note's
    other facts still refuse the change until they are cleared.
  - Bullion to note: the serial moves to the note row.
  - Bullion to any other non-note kind: refused while a serial is held, and
    the refusal names it. Clearing the serial in the same request lets the
    change through.
- **Description.** The suggested description of a bullion item ends with
  `S/N <serial>`, as a note's does (`app/item_descriptions.py`).

## Search

The Coins view's search (`app/inventory_search.py`) returns `serial_number`
with each row and can sort by it. Its filter **Serial number** (Alt+B)
matches all or part of a serial, ignoring case.

- The Coins grid shows no serial column.
- Free-text search does not read the serial.

## Report: Serial and certificate numbers

- **Group and code:** Collection group, `cb_id_numbers`
  (`app/reports/id_numbers.py`).
- **Parameters:** status and disposition (`LiveParams`; default received and
  held).
- **Rows:** one per live item that holds a serial number (note or bullion) or
  at least one certificate number.
- **Columns:** item code, description, kind, metal, fine weight (ozt), serial
  number, grading service, certificate numbers (several joined with ", "),
  photo (yes/no).
- **Order:** by item code. Each row opens the item's editor.
- **Totals:** the count of items and the fine weight.
