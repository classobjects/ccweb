# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""gate_clock.py: the gate's stage times, and when a run should end."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import pytest
from app import gate_clock
from app.gate_clock import begin, duration, end, stage

HELPER = Path(__file__).resolve().parents[1] / "app" / "gate_clock.py"

#: 12:00:00 local time today, so the clock times read plainly.
NOON = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0).timestamp()


@pytest.mark.parametrize(
    ("seconds", "text"),
    [(0, "0s"), (41.4, "41s"), (60, "1m00s"), (152.6, "2m33s"), (3780, "1h03m")],
)
def test_a_duration_reads_as_the_gate_prints_it(seconds: float, text: str) -> None:
    assert duration(seconds) == text


def test_a_first_run_has_nothing_to_estimate_from(tmp_path: Path) -> None:
    assert begin(tmp_path, NOON) == (
        "Gate started at 12:00; no complete earlier run to estimate from."
    )
    assert stage(tmp_path, "tests", NOON) == "    started 12:00"


def test_a_complete_run_sets_the_next_runs_estimates(tmp_path: Path) -> None:
    begin(tmp_path, NOON)
    stage(tmp_path, "lint", NOON)
    stage(tmp_path, "tests", NOON + 30)
    summary = end(tmp_path, NOON + 30 + 150)

    assert summary.splitlines() == [
        "Gate times:",
        "    lint      30s",
        "    tests   2m30s",
        "    total   3m00s",
    ]
    later = NOON + 3600
    assert begin(tmp_path, later) == (
        "Gate started at 13:00. The last complete run took 3m00s: "
        "expect this one to finish about 13:03."
    )
    assert stage(tmp_path, "tests", later + 30) == (
        "    started 13:00; took 2m30s last time, so about 13:03"
    )


def test_a_run_stopped_part_way_keeps_the_last_complete_runs_times(
    tmp_path: Path,
) -> None:
    """A stopped run never reached its slow stages: it must not set the estimate."""
    begin(tmp_path, NOON)
    stage(tmp_path, "tests", NOON)
    end(tmp_path, NOON + 600)

    begin(tmp_path, NOON + 1000)
    stage(tmp_path, "tests", NOON + 1000)
    # Stopped here: no `end`.
    message = begin(tmp_path, NOON + 2000)

    assert "took 10m00s" in message


def test_an_unreadable_record_costs_only_the_estimate(tmp_path: Path) -> None:
    (tmp_path / gate_clock.TIMES_FILE).write_text("{not json", encoding="utf-8")

    assert "no complete earlier run" in begin(tmp_path, NOON)
    stage(tmp_path, "tests", NOON)
    assert "total" in end(tmp_path, NOON + 5)
    kept = json.loads((tmp_path / gate_clock.TIMES_FILE).read_text(encoding="utf-8"))
    assert kept["last"]["stages"] == {"tests": 5}


def test_the_scripts_call_runs_and_a_wrong_one_is_refused(tmp_path: Path) -> None:
    """Run as the gate runs it: a plain script, by path, with the env's python."""
    ran = [
        subprocess.run(
            [sys.executable, str(HELPER), *args],
            capture_output=True,
            text=True,
            check=False,
        )
        for args in (
            ["begin", str(tmp_path)],
            ["stage", str(tmp_path), "tests"],
            ["end", str(tmp_path)],
            ["stage", str(tmp_path)],
        )
    ]

    assert [result.returncode for result in ran] == [0, 0, 0, 2]
    assert ran[2].stdout.startswith("Gate times:")
    assert "usage:" in ran[3].stderr
