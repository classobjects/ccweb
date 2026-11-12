# Holder labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill empty descriptions on save, derive serial patterns on every save (three ladders, Duplicate Serial), add mycurrencycollection.com lookups with two recorded fields, print SL597/SL564 holder labels with a print batch and label tracking, and review the existing records.

**Architecture:** Backend rules stay in their modules (`app/serial_patterns.py`, new `app/duplicate_serials.py`, new `app/labels.py`) and run from the one save hook every item save already calls, `classifier_defaults.refresh_items`. Labels are composed on the server as plain lines; the console lays them out in inches with CSS and prints through the browser. Sheet layouts are data served by the API, so the frontend holds no copy.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, pytest; React 19, Vite, Vitest.

**Spec:** `docs/specs/holder-labels-design.md`

## Global Constraints

- Work on topic branches; `scripts\ccweb_check.cmd` passes before each commit (`fix` first if needed); `CLAUDE.md` rules throughout.
- Every public function has a docstring and annotations (ruff `D`, `ANN`); mypy clean.
- Tests use synthetic serials and the `make_item` factory; Friedberg numbers in tests are in the 9900s.
- Never fetch, parse or store anything from mycurrencycollection.com or any price guide (`docs/reference-data.md`).
- Label safe border: 0.06" inside every label edge. Printed number: `item_code` without `ITEM_CODE_PREFIX` + `-`.
- Labelable = kind `coin`, `currency` or `set`; status `received`; disposition `held` or `listed`; `grading_service_id IS NULL`; and (`piece_count = 1` or kind `set`); not deleted, not split.
- Friedberg number prints when `friedberg_status` is `confirmed` or `proposed`.
- New reference rows reach a database by `python -m app.seeding load`, not by a migration.
- One Alembic migration per task that changes the schema, chained from head `c3a7e1f9d2b4`.
- Help texts name mycurrencycollection.com and dave@mycurrencycollection.com (published on https://www.mycurrencycollection.com/contact under *Anything else*); the Coolness Index is CoolNumbers.com's for-fun score, not a measure of value.

## Review Focus

1. A serial typed with spaces, lower case, or the star first (`*12345678A`, `b0000 0001*`) -- patterns, Duplicate Serial and both lookup links normalise it the same way (tests in Tasks 2, 3, 5).
2. A label line longer than the label -- it never wraps or spills onto the neighbour; it shrinks to the minimum size, then ends in an ellipsis (test in Task 9).
3. A run longer than the cells left after the start cell -- it continues on new sheets from cell 1; start cell 160 with one label works; a start cell past the sheet is refused (test in Task 9).
4. An item in the batch that stops being labelable before printing (sold, slabbed) -- left out of the run with a note, and an unlabelable item is refused when added (tests in Task 8).
5. *No* after printing changes nothing; *Yes* twice records once; an edit after printing that changes the label text marks it as needing a new label, and one that does not change it leaves it alone (tests in Task 8).

---

## Part A -- Description written on save

### Task 1: An empty description is filled on the editor's saves

**Files:**
- Modify: `backend/app/routers/inventory.py` (`create_item` near :1332, `_finish_edit` near :3505)
- Test: `backend/tests/test_inventory_create.py`, `backend/tests/test_inventory_edit.py`
- Docs: `docs/specs/entry-panels-design.md` (Suggest description section), `docs/system-administration.md` (:621), `docs/ui-guide.md` (:152)

**Interfaces:**
- Consumes: `item_descriptions.suggested_description(db, item) -> str`
- Produces: `_fill_blank_description(db: Session, item: InventoryItem) -> bool` in `routers/inventory.py` -- True when it wrote one.

- [ ] **Step 1: Write the failing tests**

```python
def test_a_new_item_without_a_description_gets_one(client, admin_headers, ...):
    # POST /api/inventory with description "" for a 1921-S Morgan Dollar
    assert body["description"] == suggested  # suggested_description of the saved item
    assert body["description"].strip() != ""

def test_an_edit_that_empties_the_description_writes_one(...):
    # PATCH {"description": "   "}
    assert item.description == suggested_description(db, item)
    # and a field change row for "description" under the admin

def test_a_typed_description_is_kept(...):
    # PATCH {"description": "My words"} -> "My words"

def test_bulk_edit_does_not_write_descriptions(...):
    # an item with "" moved by POST /api/inventory/bulk keeps ""
```

- [ ] **Step 2: Run them and see them fail**
Run: `scratchpad\pt.cmd tests/test_inventory_create.py tests/test_inventory_edit.py tests/test_inventory_bulk.py -q`
Expected: the first two FAIL (description stays empty).

- [ ] **Step 3: Implement `_fill_blank_description`** and call it after `refresh_items` in `create_item` and in `_finish_edit`. In `_finish_edit`, add `"description"` to the logged fields when it returns True, the way `by_the_gift_rule` adds its fields.

- [ ] **Step 4: Run the tests; all pass.** Then update the three docs.

- [ ] **Step 5: Commit** -- "An item saved from the editor without a description gets the suggested one".

---

## Part B -- Serial patterns on save

### Task 2: Scattered and Partial Ladder

**Files:**
- Modify: `backend/app/serial_patterns.py` (`_pattern_designations`, `DIGIT_PATTERNS`)
- Modify: `backend/data/reference/attribute.json` (two rows after `ladder`, sort_order 121, 122; alias "Broken Ladder" on `scattered_ladder` in its `reference_alias` section)
- Test: `backend/tests/test_serial_patterns.py`

**Interfaces:**
- Produces: codes `scattered_ladder`, `partial_ladder` in `DIGIT_PATTERNS` (so each adds `fancy_serial`, and `item_descriptions` treats them as named patterns).

- [ ] **Step 1: Write the failing tests** -- extend the `test_designations` table:

```python
("A31452786B", {"scattered_ladder", "fancy_serial"}),
("A67890123B", {"ladder", "fancy_serial"}),            # run through, unchanged
("A00001234B", {"low_serial", "partial_ladder", "fancy_serial"}),  # was {"low_serial"}
("A81234567B", {"partial_ladder", "fancy_serial"}),
("A12345567B", {"partial_ladder", "fancy_serial"}),
("A12345679B", {"partial_ladder", "fancy_serial"}),
("A89012555B", {"partial_ladder", "fancy_serial"}),    # wraps 9 -> 0
("A00112233B", {"partial_ladder", "fancy_serial", ...}),  # plus whatever else it earns today
("A33112200B", {"partial_ladder", "fancy_serial", ...}),
("A99001122B", {"partial_ladder", "fancy_serial", ...}),  # pairs wrap
("A10203040B", <today's set, no ladder>),
("A12321555B", <no partial_ladder>),                   # changes direction
("A11111112B", <no ladder of any kind>),
```

Fill each `...` by running today's `analyse` on the serial first; the new codes are the only additions. Also: `A12345678B` earns `ladder` and neither new code.

- [ ] **Step 2: Run** `pt.cmd tests/test_serial_patterns.py -q` -- the new rows FAIL.

- [ ] **Step 3: Implement** in `_pattern_designations`, after the ladder test:
  - scattered: `len(set(d)) == 8` and the eight digits are the digits of some ladder (a run of 8 consecutive digits mod 10), and not `ladder`;
  - partial (a): any window of 5+ positions where every step is `+1 mod 10`, or every step is `-1 mod 10`;
  - partial (b): `d[0]==d[1]`, `d[2]==d[3]`, `d[4]==d[5]`, `d[6]==d[7]`, the four pair digits distinct and forming 4 consecutive digits mod 10;
  - partial only when not `ladder`.

- [ ] **Step 4: Run; pass.** Add the two seed rows; `pt.cmd tests/test_reference_data_rule.py tests/test_seeding*.py -q` passes.

- [ ] **Step 5: Commit** -- "Scattered and Partial Ladder are derived from the serial".

### Task 3: Duplicate Serial for the Series 2013 $1 B star duplicates

**Files:**
- Create: `backend/app/duplicate_serials.py`
- Modify: `backend/app/serial_patterns.py` (`DESIGNATIONS`, new `designations`)
- Modify: `backend/data/reference/attribute.json` (`duplicate_serial`, "Duplicate Serial", group `variety`, applies_to `currency`)
- Test: `backend/tests/test_duplicate_serials.py`

**Interfaces:**
- Produces:
  - `duplicate_serials.RANGES: tuple[DuplicateRange, ...]` -- frozen dataclass `DuplicateRange(note_type: str, face: Decimal, series_year: int, prefix: str, low: int, high: int)`; the two Series 2013 rows (`"frn"`, `Decimal("1")`, `2013`, `"B"`, 1, 250000) and (..., 3200001, 9600000), with the three source URLs from the spec in a comment.
  - `duplicate_serials.is_duplicate(note_type: str | None, face: Decimal | None, series_year: int | None, serial: str | None) -> bool`
  - `serial_patterns.designations(serial: str | None, *, note_type: str | None, face: Decimal | None, series_year: int | None) -> set[str]` -- `analyse(serial)` plus `duplicate_serial` when `is_duplicate`. `DESIGNATIONS` gains `duplicate_serial`; it is not in `DIGIT_PATTERNS` (no Fancy Serial).

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.parametrize(("serial", "expected"), [
    ("B00000001*", True), ("B00250000*", True), ("B00250001*", False),
    ("B03200000*", False), ("B03200001*", True), ("B09600000*", True),
    ("B09600001*", False), ("B00000001A", False), ("C00000001*", False),
    ("b0000 0001*", True), (None, False),
])
def test_the_two_ranges(serial, expected):
    assert is_duplicate("frn", Decimal("1"), 2013, serial) is expected

def test_other_series_faces_and_classes_are_not_duplicates():
    assert not is_duplicate("frn", Decimal("1"), 2017, "B00000001*")
    assert not is_duplicate("frn", Decimal("5"), 2013, "B00000001*")
    assert not is_duplicate("silver_certificate", Decimal("1"), 2013, "B00000001*")
```

- [ ] **Step 2: Run; fail** (module missing).
- [ ] **Step 3: Implement** both modules' additions. Normalise the serial with `.replace(" ", "").upper()`.
- [ ] **Step 4: Run; pass.**
- [ ] **Step 5: Commit** -- "Series 2013 $1 B star notes in the duplicated ranges are Duplicate Serial".

### Task 4: Serial designations derived on every save

**Files:**
- Modify: `backend/app/serial_patterns.py` -- new `derive(db, item_ids)`; `run` reuses it
- Modify: `backend/app/classifier_defaults.py:1136` -- `refresh_items` calls `serial_patterns.derive`
- Test: `backend/tests/test_serial_patterns.py`
- Docs: module docstring ("Nothing here runs on a save" goes), `docs/specs/item-attributes-design.md` (:88-104)

**Interfaces:**
- Consumes: `designations` (Task 3).
- Produces: `serial_patterns.derive(db: Session, item_ids: Collection[int]) -> Counter` -- adds missing derived links and deletes this rule's stale ones for those items only, without committing; same keep-what-a-person-set-or-removed rules as `run`. `run(db, commit=...)` becomes `derive` over every unsplit note plus the report.

- [ ] **Step 1: Write the failing tests**

```python
def test_saving_a_serial_derives_its_designations(client, admin_headers, make_item, db):
    # PATCH serial_number "A12344321B" -> links radar, fancy_serial, derived_by "serial_pattern"

def test_correcting_the_serial_takes_back_what_was_derived(...):
    # then PATCH "A19472856B" -> radar link gone

def test_a_removed_designation_is_not_put_back_on_save(...):
    # remove radar via the attributes field, then PATCH notes -> still no radar

def test_a_bulk_edit_derives_too(...):
    # POST /api/inventory/bulk setting a serial on two notes -> both derived

def test_series_2013_b_star_gets_duplicate_on_save(...):
    # frn, $1, series 2013, serial "B00000002*" -> duplicate_serial and star
```

- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement `derive`;** call it at the end of `refresh_items(db, item_ids)`. Load note type code, face and series year with the serial in one query.
- [ ] **Step 4: Run** the file plus `tests/test_inventory_edit.py tests/test_inventory_bulk.py tests/test_classifier_defaults*.py -q`; pass. Update the docs.
- [ ] **Step 5: Commit** -- "Serial designations are derived on every save".

---

## Part C -- mycurrencycollection.com lookups

### Task 5: Coolness index and star run size, and the two buttons

**Files:**
- Create: `backend/alembic/versions/<rev>_coolness_and_star_run.py` (down_revision `c3a7e1f9d2b4`)
- Modify: `backend/app/models/core.py` (`CurrencyDetail`)
- Modify: `backend/app/schemas.py` (`InventoryItemUpdate` :1134, `ItemCreate` :1325, `_CURRENCY_ONLY_FIELDS` :1311, `ItemDetailOut` :1001)
- Modify: `backend/app/routers/inventory.py` (wherever `printing_facility` is copied to and from `CurrencyDetail`, do the same for the two fields)
- Create: `frontend/src/management/mcc-links.js`, `frontend/src/management/mcc-links.test.js`
- Modify: `frontend/src/management/pages/inventory/NoteFields.jsx`, `frontend/src/management/fieldHelp.js`
- Test: `backend/tests/test_inventory_edit.py`, `backend/tests/test_migrations.py` (runs as is), `frontend/src/management/pages/inventory/NoteFields.test.jsx`
- Docs: `docs/database-design.md` (currency_detail table), `docs/ui-guide.md`, `docs/system-administration.md`

**Interfaces:**
- Produces:
  - `currency_detail.coolness_index NUMERIC(4,1) NULL`, check `coolness_index BETWEEN 0 AND 100` (`ck_currency_detail_coolness_index`); `currency_detail.star_run_size INTEGER NULL`, check `> 0` (`ck_currency_detail_star_run_size`).
  - API fields `coolness_index: Decimal | None` (ge 0, le 100, one decimal), `star_run_size: int | None` (gt 0).
  - `fancyCheckerUrl(serial: string): string | null` -- null unless the serial has 8 digits; `https://www.mycurrencycollection.com/reference/fancy-serial-number-checker/` + the digits.
  - `starLookupUrl({ face, seriesYear, serial }): string | null` -- null unless the serial has `*`; `https://www.mycurrencycollection.com/reference/star-notes/lookup/${face}/${seriesYear}/${serial without spaces}`; face as a whole number.

- [ ] **Step 1: Write the failing tests**

```python
def test_coolness_and_run_size_are_saved_and_read(...):
    # PATCH {"coolness_index": "96.9", "star_run_size": 320000} -> GET returns both
@pytest.mark.parametrize("bad", ["-0.1", "100.1", "12.34"])
def test_coolness_outside_0_to_100_or_finer_than_one_place_is_refused(bad): ... # 422
def test_run_size_zero_is_refused(...): ...  # 422
```

```js
expect(fancyCheckerUrl('F 0000 3333 A')).toBe('https://www.mycurrencycollection.com/reference/fancy-serial-number-checker/00003333')
expect(fancyCheckerUrl('F1234A')).toBeNull()
expect(starLookupUrl({ face: 1, seriesYear: 2021, serial: 'F01011010*' })).toBe('https://www.mycurrencycollection.com/reference/star-notes/lookup/1/2021/F01011010*')
expect(starLookupUrl({ face: 1, seriesYear: 2021, serial: 'F01011010A' })).toBeNull()
// NoteFields: "Check serial" link has target="_blank", rel="noopener noreferrer";
// "Star note lookup" appears only for a star serial; both carry a title naming the site.
```

- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement** the migration, model, schemas, router copying, the two link helpers, two buttons beside the serial in `NoteFields` (links styled as buttons, opening a new tab), and the two number fields after Printed at. `fieldHelp.js` entries `coolness_index`, `star_run_size`, plus button titles, each naming the site, the address, and for coolness that it is CoolNumbers.com's for-fun score. The star-run help may also point the owner to the price guide https://www.uscurrencyauctions.com/us-currency-star-notes-value-price-guide.html as reading only.
- [ ] **Step 4: Run** backend tests and `npx vitest run src/management`; pass. **By hand in a browser:** open the star link for a Series 2017A note with the year `2017`, then `2017A`; keep whichever the site answers, and adjust `starLookupUrl` and its test. Same for a star-first serial (`*12345678A`). Record the finding in `docs/system-administration.md`.
- [ ] **Step 5: Commit** -- "A note records its Coolness index and star run size, and opens the two lookups".

---

## Part D -- Labels

### Task 6: Sheet layouts and label text

**Files:**
- Create: `backend/app/labels.py`
- Test: `backend/tests/test_labels.py`

**Interfaces:**
- Produces:
  - `SheetLayout` frozen dataclass: `code: str, name: str, columns: int, rows: int, width: Decimal, height: Decimal, top: Decimal, left: Decimal, gap_x: Decimal, gap_y: Decimal, rounded: bool` (inches); `cells` property = columns x rows.
  - `SHEETS: dict[str, SheetLayout]` -- `"SL597"`: 10, 16, 0.625, 0.5, 0.3345, 0.333, 0.176, 0.1556, True; `"SL564"`: 6, 17, 1.333, 0.625, 0.188, 0.25, 0, 0, False.
  - `SHEET_FOR_KIND: dict[str, str]` -- `coin` -> `SL597`; `currency`, `set` -> `SL564`.
  - `printed_number(item_code: str) -> str` -- `CC-004521` -> `004521`; `CC-000412_02` -> `000412_02`.
  - `labelable_clause() -> ColumnElement[bool]` -- the Global Constraints definition, for queries; `is_labelable(db, item) -> bool`.
  - `label_lines(db: Session, item: InventoryItem) -> list[str]` -- the spec's coin, note and set lines, empty lines dropped.
  - `label_text(lines: list[str]) -> str` -- `"\n".join(lines)`.

- [ ] **Step 1: Write the failing tests**

```python
def test_each_layout_fills_letter_exactly():
    for s in SHEETS.values():
        assert s.left * 2 + s.columns * s.width + (s.columns - 1) * s.gap_x == pytest.approx(8.5, abs=0.003)
        assert s.top * 2 + s.rows * s.height + (s.rows - 1) * s.gap_y == pytest.approx(11, abs=0.003)
    assert SHEETS["SL597"].cells == 160 and SHEETS["SL564"].cells == 102

def test_printed_number(): ...  # the two examples
def test_coin_lines(make_item, db):   # 1921, mint S, silver -> ["004521"-style number, "1921-S", "Silver"]
def test_coin_without_mint_or_date(): # no mark -> "1921"; no_date -> no year line
def test_note_lines(...):
    # Fr 9901* proposed, coolness 96.9, attributes star + wide + partial_ladder + fancy_serial + gift,
    # errors "Cut error", "Ink smear"
    assert lines == ["<number>  Fr 9901*  Cool 96.9%", "<name_of>", "Star Note · Wide · Partial Ladder", "Cut error · Ink smear"]
def test_a_conflicting_friedberg_is_not_printed(): ...
def test_set_lines(...):  # ["<number>", "1999 <name>", "San Francisco · 9 pieces"]; no mint -> "9 pieces"
@pytest.mark.parametrize("kind_status_etc", [...])
def test_labelable(...):  # sold, slabbed, roll of 50, ordered, bullion -> False; held coin, listed note, set of 9 -> True
```

- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.** Note line 3: links in force in groups `serial` and `variety`, vocabulary order, vocabulary labels; drop `fancy_serial` when any `DIGIT_PATTERNS` code is shown; drop `error`. Line 2 from `offer_titles.name_of`. Set name: `name_of`, else the set form's label.
- [ ] **Step 4: Run; pass.**
- [ ] **Step 5: Commit** -- "Label layouts and the text each item's label carries".

### Task 7: Label tracking, the print batch, and the stale flag

**Files:**
- Create: `backend/alembic/versions/<rev>_labels.py`
- Modify: `backend/app/models/core.py` (`InventoryItem`)
- Modify: `backend/app/labels.py` -- `refresh_stale`
- Modify: `backend/app/classifier_defaults.py` -- `refresh_items` calls `labels.refresh_stale`
- Test: `backend/tests/test_labels.py`

**Interfaces:**
- Produces:
  - `inventory_item.label_printed_at TIMESTAMPTZ NULL`, `label_text TEXT NULL`, `label_stale BOOLEAN NOT NULL DEFAULT false`, `in_label_batch BOOLEAN NOT NULL DEFAULT false`; partial index `ix_inventory_item_in_label_batch` on `id WHERE in_label_batch`.
  - `labels.refresh_stale(db: Session, item_ids: Collection[int]) -> None` -- for labelled items, `label_stale = label_text != label_text(label_lines(...))`. Not a logged field change.

- [ ] **Step 1: Write the failing tests**

```python
def test_an_edit_that_changes_the_label_marks_it_stale(...):
    # item labelled with its current text; PATCH mint D -> label_stale True
def test_an_edit_that_does_not_change_the_label_leaves_it(...):
    # PATCH storage location -> label_stale False
def test_an_unlabelled_item_is_never_stale(...): ...
```

- [ ] **Step 2: Run; fail.** - [ ] **Step 3: Implement.** - [ ] **Step 4: Run; pass** (with `test_migrations.py`).
- [ ] **Step 5: Commit** -- "Items remember their printed label and know when it is out of date".

### Task 8: The labels API

**Files:**
- Create: `backend/app/routers/labels.py`; register it in `backend/app/main.py` with the other routers
- Modify: `backend/app/inventory_search.py` -- filter `label` = `labelled` | `unlabelled` | `stale` (on `labelable_clause()` and the columns)
- Modify: `backend/app/schemas.py` -- `LabelSheetOut`, `LabelOut`, `LabelRunOut`, `LabelItemsIn`
- Test: `backend/tests/test_labels_api.py`, `backend/tests/test_inventory_search.py`

**Interfaces (all manager-only, under `/api/labels`):**
- `GET /sheets` -> `list[LabelSheetOut]` (every `SheetLayout` field, plus `cells`).
- `GET /run?source=batch|unlabelled|stale` -> `list[LabelRunOut]`, one per sheet code that has labels: `{sheet: str, labels: list[LabelOut]}`; `LabelOut = {item_id, item_code, lines: list[str]}`; item-number order; only labelable items. `stale` first runs `refresh_stale` over every labelled item, so a change no save saw -- a vocabulary label renamed -- is caught too. For `batch`, also `skipped: list[str]` -- item codes in the batch that are no longer labelable.
- `GET /batch` -> `list[LabelOut]`; `POST /batch` body `LabelItemsIn{item_ids}` -> adds; 422 naming every item code that is not labelable, adding none; `DELETE /batch/{item_id}` -> 204.
- `POST /printed` body `LabelItemsIn{item_ids, source}` -> for each labelable id: `label_printed_at = now`, `label_text` from current lines, `label_stale = false`; when `source == "batch"`, `in_label_batch = false`. Returns `{recorded: int}`. Idempotent.

- [ ] **Step 1: Write the failing tests** -- one per bullet above, plus:

```python
def test_a_mixed_batch_prints_as_two_runs(...): # coin + note -> runs for SL597 and SL564
def test_an_item_sold_after_joining_the_batch_is_skipped(...): # skipped == [code], not in labels
def test_printing_the_unlabelled_run_leaves_the_batch_alone(...):
def test_printed_twice_records_once(...): # second call same timestamps? -> label_text unchanged, recorded counts 1 each call, batch empty
def test_inventory_filter_label_stale(...):
def test_a_customer_cannot_read_labels(...): # 403
```

- [ ] **Step 2: Run; fail.** - [ ] **Step 3: Implement.** - [ ] **Step 4: Run; pass.**
- [ ] **Step 5: Commit** -- "The labels API: runs, the print batch, and recording a printed sheet".

### Task 9: The Labels page

**Files:**
- Create: `frontend/src/management/pages/Labels.jsx` (+ `.test.jsx`)
- Create: `frontend/src/management/pages/labels/SheetPicker.jsx` (+ test), `frontend/src/management/pages/labels/LabelSheets.jsx` (+ test), `frontend/src/management/pages/labels/layout.js` (+ test), `frontend/src/management/pages/labels/labels.css`
- Modify: `frontend/src/management/ManagementApp.jsx` (route `/labels`), `frontend/src/management/ConsoleMenu.jsx` (entry beside Inventory), `frontend/src/management/api.js`
- Docs: `docs/ui-guide.md` (a Labels section), `docs/system-administration.md` (printing: 100%, no headers, the test page, sheet products)

**Interfaces:**
- Consumes: Task 8's endpoints.
- Produces:
  - `placeLabels(count: number, startCell: number, cells: number): Array<{sheet: number, cell: number}>` in `layout.js` -- sheet 0 from `startCell`, later sheets from cell 1; throws `RangeError` when `startCell < 1 || startCell > cells`.
  - `<SheetPicker sheet={LabelSheetOut} count={n} start={c} onStart={fn} />` -- the scaled grid of the mockup (`labels-v2.html`), with the caption "N labels from cell C, ending at cell E" or "... X on this sheet, Y on the next".
  - `<LabelSheets sheet labels start outline={bool} />` -- one `.label-page` per sheet, `@page { size: letter; margin: 0 }`, each label absolutely placed in inches; each line in a `.label-line` with `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`; padding 0.06in; `outline` draws every cell's border for the plain-paper test page.

- [ ] **Step 1: Write the failing tests**

```js
expect(placeLabels(3, 159, 160)).toEqual([{sheet:0,cell:159},{sheet:0,cell:160},{sheet:1,cell:1}])
expect(placeLabels(1, 160, 160)).toEqual([{sheet:0,cell:160}])
expect(() => placeLabels(1, 161, 160)).toThrow(RangeError)
// LabelSheets: 23 labels from cell 37 on SL597 -> one page; first label's style left = 0.333 + 6*(0.625+0.176) in, top = 0.3345 + 3*(0.5+0.1556) in
// every line element has class label-line
// Labels page: choosing "Print batch" shows skipped codes; after window.print the dialog
// "Did these labels print correctly?" -> Yes posts /printed with the run's ids; No posts nothing
```

- [ ] **Step 2: Run** `npx vitest run src/management/pages/labels src/management/pages/Labels.test.jsx` -- fail.
- [ ] **Step 3: Implement.** The page: source choice (Print batch, Not yet labelled, Needs a new label) with counts; the batch list with Remove and an item-number lookup box that adds; per run, its SheetPicker and a Print button; a "Print a test page" button (`outline`); the confirmation dialog using `ConfirmDialog`. Print via `window.print()` with the `LabelSheets` of the chosen run the only thing visible under `@media print`; the dialog opens on `afterprint`.
- [ ] **Step 4: Run; pass.** By hand: print the test page on plain paper on the Epson, hold it against an SL597 and an SL564 sheet, and set the font sizes (the spec leaves them to this test). Record the sizes in `labels.css` comments.
- [ ] **Step 5: Commit** -- "The Labels page prints holder labels from any starting cell".

### Task 10: Adding items to the batch, and the label filter

**Files:**
- Modify: `frontend/src/management/pages/inventory/BulkEditBar.jsx` (an "Add to label batch" button for the selected ids)
- Modify: `frontend/src/management/pages/inventory/ItemEditForm.jsx` (an "Add to label batch" button)
- Modify: `frontend/src/management/pages/inventory/FilterPanel.jsx` (Label: any / labelled / not labelled / needs a new label)
- Test: their `.test.jsx` files

- [ ] **Step 1: Write the failing tests** -- the bulk button posts `/api/labels/batch` with the selected ids and shows "N added"; a 422 shows the refused item codes; the editor button does the same for one item; the filter sends `label=stale`.
- [ ] **Step 2: Run; fail.** - [ ] **Step 3: Implement.** - [ ] **Step 4: Run; pass.** Update `docs/ui-guide.md`.
- [ ] **Step 5: Commit** -- "Items join the label batch from the search and the editor".

---

## Part E -- Reviewing the existing records

### Task 11: Fill empty descriptions, and review the written ones

**Files:**
- Create: `backend/app/description_review.py`
- Test: `backend/tests/test_description_review.py`
- Docs: `docs/system-administration.md` (a "Bringing records up to date" section: the order below, and that each runs under the live-write procedure)

**Interfaces:**
- Produces (CLI, `--by EMAIL` names the person, as the other passes do):
  - `python -m app.description_review fill [--commit]` -- every unsplit, undeleted item whose description is empty gets `suggested_description`, recorded with `field_changes.record`; prints the count.
  - `python -m app.description_review export WORKBOOK.xlsx` -- one row per item whose non-empty description differs from the suggestion: `item_code`, `current`, `suggested`, `replace` (empty). Text cells written through `app.cell_text` so `=` stays text.
  - `python -m app.description_review apply WORKBOOK.xlsx [--commit]` -- rows with `replace` = `x` (any case) get the suggestion *as computed now*; a row whose `current` no longer matches the item is skipped and reported.

- [ ] **Step 1: Write the failing tests** -- fill writes and logs only empty ones, and nothing without `--commit`; export round-trips a description beginning with `=`; apply replaces only `x` rows; a changed-since-export row is skipped.
- [ ] **Step 2: Run; fail.** - [ ] **Step 3: Implement.** - [ ] **Step 4: Run; pass.**
- [ ] **Step 5: Commit** -- "Descriptions: fill the empty ones, review the written ones in a workbook".

### Task 12: Release and the live review (owner-run, with the owner's word)

No code. The order, each under the live-write procedure (dump, rehearsal, live, verify):

- [ ] Deploy; `python -m alembic upgrade head`; `python -m app.seeding load` (the three new attributes).
- [ ] `python -m app.serial_patterns` (report) -> show the owner -> `--commit`.
- [ ] `python -m app.description_review fill` -> show the count -> `--commit`.
- [ ] `export` the workbook for the owner; `apply` what they mark.
- [ ] Finish: `docs/specs/holder-labels-design.md` rewritten as the spec of what was built (no "design, not yet built"); this plan deleted.

---

## Self-review notes

- Spec coverage: section 1 -> Task 1; 2 -> Tasks 2-4; 3 -> Task 5; 4 -> Tasks 6-10; 5 -> Tasks 11-12.
- One decision beyond the spec: the "needs a new label" state is a stored `label_stale` flag, refreshed on every save (Task 7), so the inventory filter is a plain query; the spec's text comparison is how the flag is computed.
