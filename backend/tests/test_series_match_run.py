# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Characterization tests for `series_match.run`.

test_series covers `build_rules` and `match`; this covers `run` -- the
function that walks the collection and writes the classification, the part a
refactor could break silently.

Written against the code as it stands: their job is to detect a change, not to
argue what the behavior ought to be.
"""

from __future__ import annotations

from app.models import Country, ProvenanceSource, Series
from app.series_match import run
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.builders import ItemFactory, code_id

# Nothing in the seeded series vocabulary matches this.
UNRECOGNIZABLE = {"title": "Plain metal disc", "description": "No series here."}


def _series_id(db: Session, code: str) -> int:
    """The id of the series with this code."""
    return db.execute(select(Series.id).where(Series.code == code)).scalar_one()


def test_a_recognizable_description_is_matched(
    db: Session, make_item: ItemFactory
) -> None:
    item = make_item(title="1881-S Morgan Silver Dollar", description="Nice strike.")

    stats = run(db, commit=False)

    assert stats["matched"] >= 1
    # A dry run reports without writing.
    db.refresh(item)
    assert item.series_id is None


def test_a_commit_writes_the_series(db: Session, make_item: ItemFactory) -> None:
    item = make_item(title="1881-S Morgan Silver Dollar", description="Nice strike.")

    stats = run(db, commit=True)

    assert stats["written"] >= 1
    db.refresh(item)
    assert item.series_id == _series_id(db, "morgan_dollar")


def test_a_retired_series_is_never_matched(db: Session, make_item: ItemFactory) -> None:
    # Retiring a design takes it off every picker; the matcher is a picker
    # too, so text naming a retired design leaves the item unclassified.
    db.get_one(Series, _series_id(db, "morgan_dollar")).is_active = False
    db.flush()
    item = make_item(title="1881-S Morgan Silver Dollar", description="Nice strike.")

    run(db, commit=True)

    db.refresh(item)
    assert item.series_id is None


def test_a_nickname_covering_two_series_is_left_alone(
    db: Session, make_item: ItemFactory
) -> None:
    # "Cartwheel" is any large silver dollar, so it names both the Morgan and
    # the Peace. Two candidates is a mixed lot, not a classification. Dated
    # 1921, when both were struck: in any other year the date would decide.
    item = make_item(
        title="Cartwheel", description="A big silver dollar.", year_start=1921
    )

    stats = run(db, commit=True)

    assert stats["ambiguous"] >= 1
    db.refresh(item)
    assert item.series_id is None


def test_an_unrecognizable_item_is_counted_not_guessed(
    db: Session, make_item: ItemFactory
) -> None:
    item = make_item(**UNRECOGNIZABLE)

    stats = run(db, commit=True)

    assert stats["no_match"] >= 1
    db.refresh(item)
    assert item.series_id is None


def test_an_already_classified_item_is_not_revisited(
    db: Session, make_item: ItemFactory
) -> None:
    peace = _series_id(db, "peace_dollar")
    # Deliberately the "wrong" series for the text: run must not correct it,
    # because the query only looks at items with no series at all.
    item = make_item(
        title="1881-S Morgan Silver Dollar", description="x", series_id=peace
    )

    run(db, commit=True)

    db.refresh(item)
    assert item.series_id == peace


def test_a_seeded_item_becomes_derived_once_classified(
    db: Session, make_item: ItemFactory
) -> None:
    # The provenance has to move: a value the matcher worked out is not one
    # that shipped with the catalog.
    item = make_item(
        title="1881-S Morgan Silver Dollar",
        description="Nice strike.",
        source=ProvenanceSource.seeded,
    )

    run(db, commit=True)

    db.refresh(item)
    assert item.source is ProvenanceSource.derived


def test_counts_cover_every_item_examined(db: Session, make_item: ItemFactory) -> None:
    make_item(title="1881-S Morgan Silver Dollar", description="a")
    # Dated 1921, when both the designs it names were struck.
    make_item(title="Cartwheel", description="b", year_start=1921)
    # Names a design not struck in the item's year.
    make_item(title="Franklin Half Dollar", description="c")
    make_item(**UNRECOGNIZABLE)

    stats = run(db, commit=False)

    # Each item under exactly one outcome: none dropped, none counted twice.
    assert dict(stats) == {
        "matched": 1,
        "ambiguous": 1,
        "contradicted": 1,
        "no_match": 1,
    }


def test_a_face_the_words_state_stands_in_for_one_not_recorded(
    db: Session, make_item: ItemFactory
) -> None:
    # With no denomination recorded, "$1" in the words is the dollar that
    # decides "Presidential", and "Half Dollar" is a face an America the
    # Beautiful quarter does not fit, though its year does.
    presidential = make_item(
        kind="set",
        title="2010-P/D (8) United States Mint Presidential $1 Coin Uncirculated Set",
        description="In the Mint's packaging.",
        year_start=2010,
    )
    pierce = make_item(
        title="2010 D FRANKLIN PIERCE PRESIDENTIAL DOLLAR ANACS",
        description="Slabbed.",
        year_start=2010,
    )
    parks = make_item(
        title="2016-D 100th Anniversary National Parks 50c Half Dollar",
        description="First strike.",
        year_start=2016,
    )

    stats = run(db, commit=True)

    for item in (presidential, pierce, parks):
        db.refresh(item)
    assert presidential.series_id == _series_id(db, "presidential_dollar")
    # Franklin is a half's name; on a dollar it is the president's.
    assert pierce.series_id == _series_id(db, "presidential_dollar")
    assert parks.series_id is None
    assert stats["contradicted"] == 1


def test_words_naming_two_faces_state_none(db: Session, make_item: ItemFactory) -> None:
    # A lot of dimes and quarters names no one face, so "Barber" stays
    # unresolved rather than taking whichever face was read first.
    lot = make_item(
        title="Barber dimes and quarters, 12 pieces",
        description="Mixed lot.",
        year_start=1900,
    )

    stats = run(db, commit=True)

    db.refresh(lot)
    assert lot.series_id is None
    assert dict(stats) == {"no_match": 1}


def test_a_medal_reads_no_face_from_its_words(
    db: Session, make_item: ItemFactory
) -> None:
    # A medal is not struck at a face value, whatever its words say.
    medal = make_item(
        kind="medal",
        title="Presidential $1 Inaugural Medal",
        description="Bronze.",
        year_start=2009,
    )

    run(db, commit=True)

    db.refresh(medal)
    assert medal.series_id is None


def test_a_lot_or_another_countrys_coin_reads_no_face(
    db: Session, make_item: ItemFactory
) -> None:
    # A lot is many pieces, not one face; and a dollar of another issuer is
    # not a US dollar, so its words name no US design.
    lot = make_item(
        kind="other",
        title="Estate lot: silver dollars, proof sets, commemoratives",
        description="Mixed.",
        year_start=None,
    )
    canadian = make_item(
        title="1984 RCM Proof Silver Dollar Commem",
        description="In its capsule.",
        year_start=1984,
        country_id=code_id(db, Country, "CA"),
    )

    run(db, commit=True)

    for item in (lot, canadian):
        db.refresh(item)
    assert lot.series_id is None
    assert canadian.series_id is None


def test_a_round_or_medal_is_not_a_coin_design_for_sharing_its_name(
    db: Session, make_item: ItemFactory
) -> None:
    # A bar, round or medal has no denomination or year to check a name
    # against, so a design struck at one face value is not believed of it;
    # a bullion design, which has none recorded, still is.
    buffalo = make_item(
        kind="bullion",
        title="1 oz Silver Buffalo Round",
        description="Generic round.",
        year_start=None,
    )
    medal = make_item(
        kind="medal",
        title="Abraham Lincoln Medal",
        description="Bronze.",
        year_start=None,
    )
    eagle = make_item(
        kind="bullion",
        title="American Silver Eagle 1 oz",
        description="In a capsule.",
        year_start=None,
    )

    stats = run(db, commit=True)

    for item in (buffalo, medal, eagle):
        db.refresh(item)
    assert buffalo.series_id is None
    assert medal.series_id is None
    assert eagle.series_id == _series_id(db, "american_silver_eagle")
    assert stats["contradicted"] == 2
