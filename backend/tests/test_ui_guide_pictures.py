# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""The screen guide's pictures and the tool that takes them agree.

`ui_guide.pictures.PICTURES` is the list `scripts/ccweb_ui_guide` retakes.
A picture the guide shows with no entry there goes stale at the next
change to its screen and is never retaken; an entry the guide does not
show is taken for nobody. Neither runs the tool: these read its table.
"""

from __future__ import annotations

import re
from pathlib import Path

from ui_guide.pictures import PICTURES
from ui_guide.stack import DEMO_DATABASE

REPO_ROOT = Path(__file__).resolve().parents[2]
GUIDE = REPO_ROOT / "docs" / "ui-guide.md"

#: An image the guide embeds from its own picture folder.
_SHOWN = re.compile(r"!\[[^\]]*\]\(images/ui-guide/([\w-]+)\.png\)")


def _shown() -> set[str]:
    """The names of the pictures docs/ui-guide.md embeds."""
    return set(_SHOWN.findall(GUIDE.read_text(encoding="utf-8")))


def test_every_picture_the_guide_shows_is_one_the_tool_takes() -> None:
    taken = {picture.name for picture in PICTURES}
    assert sorted(_shown() - taken) == [], "shown in the guide, never retaken"
    assert sorted(taken - _shown()) == [], "retaken, shown nowhere"


def test_each_picture_is_named_once() -> None:
    names = [picture.name for picture in PICTURES]
    assert len(names) == len(set(names))


def test_every_picture_the_guide_shows_is_in_the_repository() -> None:
    folder = REPO_ROOT / "docs" / "images" / "ui-guide"
    assert sorted(n for n in _shown() if not (folder / f"{n}.png").exists()) == []


def test_the_demo_database_is_one_nothing_else_drops() -> None:
    """The test gate drops `ccwebdb..._test`; backups drop `ccwebdb_proof_*`."""
    assert not DEMO_DATABASE.startswith("ccwebdb")
    assert not DEMO_DATABASE.endswith("_test")
