# Identify first: receiving and new-item entry

2026-09-29

A piece is identified by a handful of facts, written the way collectors
write them: "1921-D $1", "Series 1934-A $5". Most of its other classifiers
follow from those facts (`classifier-defaults-design.md`,
`series-classification-design.md`). So entry starts with those facts, and
what they decide is filled in from them.

- **Receiving.** When staff receive an item on the management console's
  Receiving page (`/management/receiving`), the **Identify** fields come
  first.
- **Purchases.** An item entered on the Purchases page is entered in the
  item editor (`entry-panels-design.md`). The same facts are filled there
  when it is saved.

Typing less is faster. Typing the facts before the conclusions also removes
a class of mismatch, such as a note whose class contradicts its series.

## The Identify fields

`management/identify.js` (`identifyKeys`) is the one list:

| Kind | Fields, in order |
|---|---|
| Banknote (`currency`) | Series year, Series letter, Denomination, Serial number, Face plate, Back plate |
| Any other kind | Year, Mint (where the kind has one: `fieldFitsKind('mint', kind)`), Denomination |

The kind decides the list, so it is shown first and must be right first.

The fields are the same ones as the item editor's and
`POST /api/inventory`'s, with the same names, help keys and validation. The
denomination picker offers only the kind's own denominations.

## What the facts decide

| From | Filled | Rule |
|---|---|---|
| Denomination, series year and letter (note) | note class, seal, signatures | `note_issue` (`app.classifier_defaults`) |
| Serial number, series year (Federal Reserve Note) | Reserve Bank | `serial_district`; from Series 1996, $5 and up read the second prefix letter |
| Face plate | printing location | an `FW` prefix is Fort Worth (`app.plates`), applied when the item is saved |
| Denomination, country, year (coin) | metal | `composition` |
| Denomination, year, series letter; seal and class for a note | **design series** | `app.series_classify.suggest_series`, with no text evidence |

The Identify section asks `GET /api/defaults/note` or `/coin` after a 250 ms
pause in typing.

**Design series.** It is decided by the same rules as the batch pass, from
the facts alone:

- One candidate that needs no evidence is suggested.
- A boundary year (1921 $1: Morgan or Peace) or an evidence-only design is
  left open.
- Text is not read at entry. A title is the seller's words; the save and the
  batch pass weigh it.

**No such issue.** The note lookup also returns a `warning` when no issue of
that denomination has that series. The warning names the series on record,
so a mistyped letter (1953E for 1953B) is caught at once.

Saving the item then runs the same rules for real (`refresh_items` and
`refresh_series`; `series-classification-design.md`, "On save").

## The other half of a star-note pair

A star note (a replacement note, marked with a star in its serial) whose
eight digits match those of an ordinary note in the collection is a pair to
keep together. It is easy to own one without knowing it.

Wherever a note's serial number is entered -- the Identify section and the
item editor -- `SerialPair` asks `GET /api/inventory/{id}/serial-pairs`
(`app.serial_pairs`) after a 250 ms pause in typing. When there is a pair, it
says so:

- for a note, it names the star notes with its digits;
- for a star note, it names the notes with those digits and no star.

Each is named by item code and serial, with its denomination and series.

- **Only the digits are compared.** The letters around them say which Bank
  and block. A pair across two Banks or two denominations is still reported;
  the denomination and series shown help judge which it is.
- **The serial as typed is matched** (`serial_number` on the request). So
  the notice shows before the note is saved, and stays after. Without the
  parameter, the saved serial is matched.
- **Eight digits or nothing.** Nothing is asked or matched until the serial
  has exactly eight digits. A serial cut short would match every other serial
  cut short the same way.
- **Deleted and split items are not offered.**
- **A failed search shows nothing.** It is a convenience, and never stands in
  the way of a save.

## Receiving

The receipt dialog (`receiving/ReceiptPanel.jsx`) opens with an **Identify**
section (`IdentifySection.jsx`), above Arrived and Storage location, for a
single item.

**What it shows**

- The kind, read-only, then the Identify fields, filled from the item.
- Below them, **From these facts**: what the suggestion endpoint says the
  facts decide (class, seal, signatures, Reserve Bank, metal, series), and
  the no-such-issue warning where there is one. It shows what the facts alone
  decide. A value a person set on the item stands when saved.
- A coin whose years are a range shows its Year box disabled. One box cannot
  hold a range; the full editor can.

**Saving**

- **Saved with Receive, and only with Receive.** The changed fields go in one
  `PATCH /api/inventory/{id}` carrying `base` (the values the section
  loaded), sent before the receipt is posted.
- **Missing, Canceled and Returned save nothing.** Missing and Canceled mean
  nobody held the piece; Returned means it is going back. None of them saves
  Identify edits, and the section says so while it has any.
- **A refused PATCH stops the receipt.** Nothing is received, the error is
  shown, and every field keeps what was typed.
- **A PATCH that succeeds before a receipt that fails** leaves the Identify
  values saved. The section takes the saved values as its new starting
  point, so a retry does not resend them.
- **One for-sale acknowledgement covers both.** The PATCH's 409 is answered
  by the same dialog as the receipt's, and the resubmission sends
  `acknowledge_for_sale` with both.

**The full editor**

- **Confirm or correct fields** stays live while Identify has unsaved edits.
  Pressing it then does not open the editor; it says to receive or undo the
  edits first. The full editor never opens over values it cannot see.
- Identify is hidden while the editor is open. It reads the item again when
  the editor closes, so its `base` is what the editor saved.

**The next line**

- Nothing typed in Identify is carried to the next line. The facts belong to
  the piece, unlike the arrival date and location.

## Tests

Backend: `tests/test_entry_suggestions.py`, `tests/test_series_refresh.py`,
`tests/test_series_classify.py`, `tests/test_serial_pairs.py`.

Frontend: `management/identify.test.js`, `pages/receiving/ReceiptPanel.test.jsx`,
`pages/inventory/SerialPair.test.jsx`.
