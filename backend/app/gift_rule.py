# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Gift: the attribute of an item that cost nothing.

docs/specs/item-attributes-design.md, section 2, "Attributes from facts: Gift".
An item saved in the item editor at an item cost of $0 is a gift, so the save
gives it the attribute and takes the word out of its title -- the attribute
says it now. A description never names it: how an item was acquired is not
for the customers who read one. Making the row (`POST /api/inventory`)
does not run this: a new item is made before its cost is typed, and opens
in the editor.
Anything can be given, so the rule reaches every item whose kind the
attribute's `applies_to` admits: with Gift's `any`, coins and notes alike.

The link is a derived one (`derived_by` `no_cost`). Like every rule's, it is
added only where the item has no link for the attribute at all, so a person
who removes Gift keeps it removed, and it is taken back only while it is
still the rule's own: an item given a cost later loses the Gift this rule
gave it and keeps one a person set.
"""

from __future__ import annotations

import re
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .item_attributes import allowed_scopes
from .models import (
    InventoryItem,
    ItemAttribute,
    ItemAttributeLink,
    ProvenanceSource,
)

__all__ = ["GIFT", "RULE", "apply", "earns", "without_the_word"]

#: The attribute's code.
GIFT = "gift"

#: `item_attribute_link.derived_by` for the links this rule adds.
RULE = "no_cost"

#: The word in a title. The white space and punctuation that set it apart
#: are trimmed by hand (`_SEPARATORS`): a pattern that took them too would
#: try every run of them as a start, which is slow on a long run.
_WORD = re.compile(r"\bgift\b", re.IGNORECASE)

#: What sets the word apart, besides white space.
_SEPARATORS = "-:,"


def earns(db: Session, item: InventoryItem, attribute: ItemAttribute) -> bool:
    """Whether the item cost nothing and is of a kind the attribute fits."""
    return item.item_cost == Decimal("0") and attribute.applies_to in (
        allowed_scopes(db, item)
    )


def _attribute(db: Session) -> ItemAttribute | None:
    """The Gift attribute, where the vocabulary has it in use."""
    return db.scalar(
        select(ItemAttribute).where(
            ItemAttribute.code == GIFT,
            ItemAttribute.is_active.is_(True),
        )
    )


def _link(
    db: Session, item: InventoryItem, attribute: ItemAttribute
) -> ItemAttributeLink | None:
    """The item's link for the attribute, a removed one included."""
    return db.get(ItemAttributeLink, (item.id, attribute.id))


def _separator(char: str) -> bool:
    """Whether `char` sets a word apart: white space, a dash, colon or comma."""
    return char.isspace() or char in _SEPARATORS


def _trimmed(text: str, *, left: bool, right: bool) -> str:
    """`text` less the separators at the ends named."""
    start, end = 0, len(text)
    while left and start < end and _separator(text[start]):
        start += 1
    while right and end > start and _separator(text[end - 1]):
        end -= 1
    return text[start:end]


def without_the_word(title: str) -> str:
    """A title less the word Gift; unchanged where nothing else would be left.

    Each Gift goes with the separators either side of it, and a space stands
    in its place.
    """
    pieces = _WORD.split(title)
    last = len(pieces) - 1
    kept = " ".join(
        _trimmed(piece, left=index > 0, right=index < last)
        for index, piece in enumerate(pieces)
    ).strip()
    return kept or title


def apply(db: Session, item: InventoryItem) -> list[str]:
    """Bring the item's Gift in step with its cost; the editor fields it moved.

    Called by a save once everything else is written and flushed. Returns
    the names, as the change log knows them, of what this changed:
    `attributes`, `source_title`. The description is left alone: Gift is a
    purchasing fact, and no description names it
    (`item_descriptions.UNDESCRIBED_ATTRIBUTES`).
    """
    attribute = _attribute(db)
    if attribute is None:
        return []
    moved: list[str] = []
    link = _link(db, item, attribute)
    free = earns(db, item, attribute)
    held = link is not None and link.removed_at is None
    adds = free and link is None
    takes_back = not free and held and link is not None and link.derived_by == RULE
    if adds or takes_back:
        if adds:
            db.add(
                ItemAttributeLink(
                    inventory_item_id=item.id,
                    item_attribute_id=attribute.id,
                    source=ProvenanceSource.derived,
                    derived_by=RULE,
                )
            )
        else:
            db.delete(link)
        db.flush()
        held = adds
        moved.append("attributes")
    if free and held and _drop_the_word(item):
        moved.append("source_title")
    return moved


def _drop_the_word(item: InventoryItem) -> bool:
    """Take Gift out of the item's title; whether that changed it."""
    if not item.source_title:
        return False
    title = without_the_word(item.source_title)
    if title == item.source_title:
        return False
    item.source_title = title
    return True
