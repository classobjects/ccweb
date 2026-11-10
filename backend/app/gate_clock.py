# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
r"""Time the quality gate's stages, and say when each should end.

    python backend/app/gate_clock.py begin LOGDIR
    python backend/app/gate_clock.py stage LOGDIR NAME
    python backend/app/gate_clock.py end LOGDIR

Called by ccweb_check.cmd and ccweb_check.sh. `begin` says how long the
last complete run took, and so about when this one will finish; `stage`
ends the stage before it and says when this one should end, going by its
time last run; `end` ends the last stage and prints every stage's time and
the total. A gate runs for minutes with nothing else to say how far it has
got, and whoever waits on it -- or relays it -- can now give a time.

The times are kept in LOGDIR/gate-times.json. Only a run that reached
`end` replaces the times an estimate is made from: a stopped run would
otherwise teach the next one that its stages are short. Run as a plain
script, like portpid.py, so it needs nothing but the standard library.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

__all__ = ["begin", "duration", "end", "main", "stage"]

TIMES_FILE = "gate-times.json"


def duration(seconds: float) -> str:
    """`seconds` as the gate prints it: `41s`, `2m32s`, `1h03m`."""
    whole = round(seconds)
    if whole < 60:
        return f"{whole}s"
    minutes, secs = divmod(whole, 60)
    if minutes < 60:
        return f"{minutes}m{secs:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h{minutes:02d}m"


def _clock(moment: float) -> str:
    """A moment as the local time of day, to the minute."""
    return datetime.fromtimestamp(moment).strftime("%H:%M")


def _read(logdir: Path) -> dict[str, Any]:
    """The kept times; an empty record when there are none, or none readable.

    An unreadable file costs only the estimate, never the gate.
    """
    try:
        data = json.loads((logdir / TIMES_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write(logdir: Path, data: dict[str, Any]) -> None:
    """Keep the record; a folder that cannot be written costs only the estimate."""
    try:
        logdir.mkdir(parents=True, exist_ok=True)
        (logdir / TIMES_FILE).write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError:
        pass


def _close_stage(run: dict[str, Any], now: float) -> None:
    """Record how long the open stage took, if one is open."""
    name = run.get("stage")
    if name:
        run["times"][name] = now - run["stage_started"]
    run["stage"] = None


def begin(logdir: Path, now: float) -> str:
    """Start a run's clock; what to say about when it should finish."""
    data = _read(logdir)
    data["run"] = {"started": now, "stage": None, "stage_started": now, "times": {}}
    _write(logdir, data)
    total = data.get("last", {}).get("total")
    if total is None:
        return (
            f"Gate started at {_clock(now)}; no complete earlier run to estimate from."
        )
    return (
        f"Gate started at {_clock(now)}. The last complete run took "
        f"{duration(total)}: expect this one to finish about {_clock(now + total)}."
    )


def stage(logdir: Path, name: str, now: float) -> str:
    """End the stage before `name` and start `name`; when it should end."""
    data = _read(logdir)
    run = data.get("run")
    if not isinstance(run, dict):
        # Called without `begin`: time this stage all the same.
        run = {"started": now, "stage": None, "stage_started": now, "times": {}}
        data["run"] = run
    _close_stage(run, now)
    run["stage"] = name
    run["stage_started"] = now
    _write(logdir, data)
    last = data.get("last", {}).get("stages", {}).get(name)
    if last is None:
        return f"    started {_clock(now)}"
    return (
        f"    started {_clock(now)}; took {duration(last)} last time, "
        f"so about {_clock(now + last)}"
    )


def end(logdir: Path, now: float) -> str:
    """End the run: every stage's time and the total, kept for the next run."""
    data = _read(logdir)
    run = data.get("run")
    if not isinstance(run, dict):
        return "Gate times: none recorded (the run was not begun)."
    _close_stage(run, now)
    total = now - run["started"]
    data["last"] = {"total": total, "stages": run["times"]}
    del data["run"]
    _write(logdir, data)
    width = max((len(name) for name in run["times"]), default=0)
    lines = [
        f"    {name.ljust(width)}  {duration(secs):>6}"
        for name, secs in run["times"].items()
    ]
    return "\n".join(
        ["Gate times:", *lines, f"    {'total'.ljust(width)}  {duration(total):>6}"]
    )


def main(argv: list[str]) -> int:
    """Run one of begin, stage or end; 2 for anything else."""
    if len(argv) == 2 and argv[0] == "begin":
        print(begin(Path(argv[1]), time.time()))
    elif len(argv) == 3 and argv[0] == "stage":
        print(stage(Path(argv[1]), argv[2], time.time()))
    elif len(argv) == 2 and argv[0] == "end":
        print(end(Path(argv[1]), time.time()))
    else:
        print(
            "usage: gate_clock.py begin LOGDIR | stage LOGDIR NAME | end LOGDIR",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
