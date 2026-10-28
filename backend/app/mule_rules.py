"""Whether a note is a mule, from its series and its back plate number.

docs/specs/item-attributes-design.md, "Attributes from facts: Mule". A mule
is a note printed from a face plate and a back plate made for different
series. Where that can be read from what is printed on the note, the series
says which face plates it has and the back plate number which back:

**Micro and macro plate numbers, 1938 to 1953.** Late in 1937 the BEP
enlarged plate numbers from micro (about 0.6 mm) to macro (about 1 mm) and
used up the plates on hand. Every face plate given macro numbers took the
next series letter, so the series says whether the face is micro or macro;
the back plate number says the same of the back, against the last micro
back plate made. A note with one size on each side is a mule:

| Class, face value         | Micro faces  | Macro faces            | Last micro back |
|---------------------------|--------------|------------------------|-----------------|
| $1 Silver Certificate     | 1935         | 1935A                  | 929             |
| $2 United States Note     | 1928C        | 1928D                  | 288             |
| $5 Silver Certificate     | 1934         | 1934A to 1934C         | 938             |
| $5 United States Note     | 1928B        | 1928C to 1928E         | 938             |
| $5 Federal Reserve Note   | 1934         | 1934A to 1934C         | 938             |
| $10 SC and FRN            | 1934         | 1934A                  | 584             |
| $20 Federal Reserve Note  | 1934         | 1934A                  | 317             |
| $50 Federal Reserve Note  | 1934         | 1934A to 1934D, 1950   | 162             |
| $100 Federal Reserve Note | 1934         | 1934A to 1934D, 1950   | 112             |

Two backs break the run: $20 back 204 was finished late, with macro
numbers; $1 back 470 has numbers of neither size and is left to a person.
The series listed are the ones in which these mules exist (Huntoon's
complete list); in any other the rule says nothing. Sources: P. Huntoon,
Paper Money (SPMC) No. 138 (1988) Table 2, the last micro and first macro
plates from the BEP's records; No. 133 (1988) Table 1, the mules by type;
No. 111 (1984), No. 233 (2004), No. 147 (1990), No. 161 (1992), No. 309
(2017, J. Yakes, back 204); papermoneyproject.com; panix.com/~clay/currency
/mule.html, which also gives the series where each class turned macro.

**$1 Federal Reserve Notes from 1963.** The plate numbers match in size; a
mule's back is one numbered in another series' run:

| Series | Mule backs                                                      |
|--------|-----------------------------------------------------------------|
| 1963   | 447 and below, the $1 Silver Certificates' run (448 on is not)  |
| 1977A  | 3 to 6, of the 1981 run                                         |
| 1981A  | 301, 305, 306, 416, 417, 674, 678-680, 697-702, 705, 706        |

Sources: panix.com/~clay/currency/1-FRN.html; Paper Money No. 310 (2017),
citing Azpiazu, for 1963 and 1977A; No. 33 (1970). The 1977A and 1981A
lists rest on one source each. Nothing is said of later series: from 1981
the BEP restarted back plate numbers within a series, and from 1996 with
every series, so a number alone no longer says whose run a back is from.

Facts only -- plate numbers, series and classes, no catalog's numbers
(`docs/reference-data.md`).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .attribute_rules import ALWAYS, EVIDENCE, NEVER

__all__ = ["MULE_RULES", "MuleRule", "mule_rule", "mule_verdict"]

#: Higher than any plate number: plates carry up to five digits.
_TOP = 99_999

#: A series as it is printed: year and letter, "" for none.
Series = tuple[int, str]


@dataclass(frozen=True)
class MuleRule:
    """The back plates that make a note of these series a mule."""

    note_types: tuple[str, ...]
    face: Decimal
    series: tuple[Series, ...]
    #: Inclusive ranges of back plate numbers that make a mule; any other
    #: back on a note of these series is not one.
    mule_backs: tuple[tuple[int, int], ...]
    #: Backs a number cannot decide: left to a person.
    unread_backs: frozenset[int] = frozenset()


def _micro_face(
    note_types: tuple[str, ...], face: str, series: Series, last_micro: int
) -> MuleRule:
    """A micro-face series: a mule on any macro back."""
    return MuleRule(note_types, Decimal(face), (series,), ((last_micro + 1, _TOP),))


def _macro_face(
    note_types: tuple[str, ...], face: str, series: tuple[Series, ...], last_micro: int
) -> MuleRule:
    """Macro-face series: a mule on any micro back."""
    return MuleRule(note_types, Decimal(face), series, ((1, last_micro),))


def _backs(*numbers: int) -> tuple[tuple[int, int], ...]:
    """Single back plates as ranges."""
    return tuple((n, n) for n in numbers)


_SC, _US, _FRN = ("silver_certificate",), ("us_note",), ("frn",)
_SC_FRN = ("silver_certificate", "frn")
_LATER_1934 = ((1934, "A"), (1934, "B"), (1934, "C"), (1934, "D"), (1950, ""))

MULE_RULES: tuple[MuleRule, ...] = (
    _micro_face(_SC, "1", (1935, ""), 929),
    MuleRule(_SC, Decimal("1"), ((1935, "A"),), ((1, 929),), frozenset({470})),
    _micro_face(_US, "2", (1928, "C"), 288),
    _macro_face(_US, "2", ((1928, "D"),), 288),
    _micro_face(_SC_FRN, "5", (1934, ""), 938),
    _macro_face(_SC_FRN, "5", ((1934, "A"), (1934, "B"), (1934, "C")), 938),
    _micro_face(_US, "5", (1928, "B"), 938),
    _macro_face(_US, "5", ((1928, "C"), (1928, "D"), (1928, "E")), 938),
    _micro_face(_SC_FRN, "10", (1934, ""), 584),
    _macro_face(_SC_FRN, "10", ((1934, "A"),), 584),
    # Back 204: finished late, with macro numbers.
    MuleRule(_FRN, Decimal("20"), ((1934, ""),), ((204, 204), (318, _TOP))),
    MuleRule(_FRN, Decimal("20"), ((1934, "A"),), ((1, 203), (205, 317))),
    _micro_face(_FRN, "50", (1934, ""), 162),
    _macro_face(_FRN, "50", _LATER_1934, 162),
    _micro_face(_FRN, "100", (1934, ""), 112),
    _macro_face(_FRN, "100", _LATER_1934, 112),
    MuleRule(_FRN, Decimal("1"), ((1963, ""),), ((1, 447),)),
    MuleRule(_FRN, Decimal("1"), ((1977, "A"),), ((3, 6),)),
    MuleRule(
        _FRN,
        Decimal("1"),
        ((1981, "A"),),
        _backs(301, 305, 306, 416, 417, 674, *range(678, 681), *range(697, 703))
        + _backs(705, 706),
    ),
)


def mule_rule(
    note_type: str | None,
    face: Decimal | None,
    series_year: int | None,
    series_letter: str | None,
) -> MuleRule | None:
    """The rule for notes of this class, face value and series; None if none."""
    if note_type is None or face is None or series_year is None:
        return None
    series = (series_year, (series_letter or "").strip().upper())
    return next(
        (
            r
            for r in MULE_RULES
            if note_type in r.note_types and face == r.face and series in r.series
        ),
        None,
    )


def mule_verdict(
    note_type: str | None,
    face: Decimal | None,
    series_year: int | None,
    series_letter: str | None,
    back_plate: str | None,
) -> str | None:
    """ALWAYS (a mule), NEVER, or EVIDENCE for this note; None where no rule speaks.

    A rule speaks only of its own classes, face value and series, and only
    once the back plate number is known as digits.
    """
    rule = mule_rule(note_type, face, series_year, series_letter)
    back = (back_plate or "").strip()
    if rule is None or not back.isascii() or not back.isdigit():
        return None
    number = int(back)
    if number in rule.unread_backs:
        return EVIDENCE
    return (
        ALWAYS if any(low <= number <= high for low, high in rule.mule_backs) else NEVER
    )
