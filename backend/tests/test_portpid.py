# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""portpid.py: the PID listening on a port, told by a row's shape, not its state.

Windows 26300.9818 reads a listener's state wrong, so netstat drops the row
and the cmd scripts saw every held port as free.
"""

from __future__ import annotations

import os
import re
import socket
import subprocess
import sys
from pathlib import Path

import pytest
from app import portpid

REPO_ROOT = Path(__file__).resolve().parents[2]
HELPER = REPO_ROOT / "backend" / "app" / "portpid.py"
windows_only = pytest.mark.skipif(
    sys.platform != "win32", reason="reads the Windows TCP table"
)


def test_a_listener_is_the_row_with_no_remote_port() -> None:
    rows = [
        ("127.0.0.1", 8000, 61411, 500),  # a connection to it
        ("127.0.0.1", 8000, 0, 400),  # the listener
    ]
    assert portpid.listening_pid(rows, 8000) == 400


def test_pid_0_owns_nothing() -> None:
    """Windows names the idle process as owner of rows that have none."""
    rows = [("127.0.0.1", 8000, 0, 0), ("::1", 8000, 0, 400)]
    assert portpid.listening_pid(rows, 8000) == 400


def test_another_port_and_another_address_are_not_it() -> None:
    rows = [("127.0.0.1", 8001, 0, 300), ("127.0.0.1", 5173, 0, 200)]
    assert portpid.listening_pid(rows, 8000) is None
    assert portpid.listening_pid(rows, 5173, "0.0.0.0") is None
    assert portpid.listening_pid(rows, 5173, "127.0.0.1") == 200


def test_a_bad_argument_is_refused(capsys: pytest.CaptureFixture[str]) -> None:
    assert portpid.main([]) == 2
    assert portpid.main(["http"]) == 2
    assert "usage: portpid.py PORT [ADDRESS]" in capsys.readouterr().err


def _helper(*args: str) -> str:
    """What the helper prints, run as the scripts run it."""
    return subprocess.run(
        [sys.executable, "-I", str(HELPER), *args],
        capture_output=True,
        text=True,
        check=True,
    ).stdout


@windows_only
def test_it_finds_a_real_listener_and_not_a_connection() -> None:
    """Against this machine's own table, whatever state Windows gives the row."""
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = server.getsockname()[1]
        with socket.create_connection(("127.0.0.1", port)) as client:
            accepted, _ = server.accept()
            with accepted:
                me = str(os.getpid())
                assert _helper(str(port)).strip() == me
                assert _helper(str(port), "127.0.0.1").strip() == me
                assert _helper(str(port), "0.0.0.0") == ""
                assert _helper(str(client.getsockname()[1])) == ""


#: A netstat call outside a `rem` line.
_NETSTAT = re.compile(r"^(?!\s*rem\b).*\bnetstat\b", re.IGNORECASE | re.MULTILINE)


def test_no_script_reads_listeners_from_netstat() -> None:
    """Netstat cannot see them on 26300.9818; every lookup is portpid.py."""
    scripts = sorted((REPO_ROOT / "scripts").glob("*.cmd"))
    assert scripts
    calling = [
        p.name for p in scripts if _NETSTAT.search(p.read_text(encoding="utf-8"))
    ]
    assert calling == []
