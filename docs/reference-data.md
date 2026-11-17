# Reference data: what may be shipped

*2026-10-02*

**The rule.** Before any retrieved data goes into the repository, the seed
files under `backend/data/reference/`, or the database, establish that it
is free to use.

**Why.** The catalog is sold, so reference data shipped inside the product
is redistributed with it.

**It is enforced, not advisory.** `backend/tests/test_reference_data_rule.py`
scans every key, value and comment of every seed file for a Friedberg- or
Pick-shaped number (`Fr. 9901`, `Friedberg 9901`, `Pick 9901`, `P-9901`).
It fails naming the file and the text.

## Fact versus arrangement

The line is between a **fact** and a publisher's **arrangement** of facts.

| Safe to ship | Not safe to ship |
|---|---|
| Who held an office and when (Treasurer, Secretary of the Treasury) | **Friedberg** numbering, the arrangement published in *Paper Money of the United States* |
| Design series names and their year spans | **Pick** numbering for world notes |
| Mint specifications and legislated compositions | A vendor's price-guide values |
| Collector nicknames in common use | Any catalog's mapping of attributes to its own numbers |

For example: that a note carries a given pair of signatures is a fact. That
the same note has a particular catalog number is one publisher's numbering
scheme.

## What follows from it

- **A catalog number is recorded, never shipped.** The `friedberg_number`
  table models the concept and ships empty. The owner enters a number per
  note, from the note's holder or the owner's own copy of the catalog,
  exactly as a certification number is entered. Rows recorded that way are
  reused by later lookups.
- **The software never fetches, parses or stores search results.** The
  console can build the text of a web search for a note. What the owner
  reads there and types in is theirs to record.
- **The format of a number is not the catalog.** Normalizing how a typed
  number is written (`app/fr_format.py`,
  `frontend/src/management/friedberg-format.js`) restates no mapping.
- **Tests use synthetic numbers.** Friedberg numbers in tests and fixtures
  are in the 9900s, past any real number.
- **A seed file of retrieved facts says where they came from**, in its
  `_comment`:
  - These name their sources: `composition.json`, `issuer.json`,
    `banknote.json`, `condition.json` (the grading services' published
    scales), `note_issue.json`, `signatures.json`, and `series.json` (which
    names the specification that lists its sources).
  - `attribute.json` and `error_type.json` hold terms, and name where the
    terms come from.
  - `classification.json` and `operations.json` hold mostly the product's
    own vocabulary. They also hold two sets of retrieved figures -- the
    bullion products' weights and finenesses, and the carriers' tracking
    addresses -- whose source is not recorded.

  The loader reads no `_comment`, so nothing but a reader checks a source
  line.
- **A garbled retrieval is not a source.** Partial and correct beats
  complete and invented. A vocabulary is seeded with what is known and
  extended by hand.
