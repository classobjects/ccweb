# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
r"""Print the PID of the process listening on a TCP port, for the cmd scripts.

    python backend\app\portpid.py 8000
    python backend\app\portpid.py 5173 0.0.0.0

Prints one PID, or nothing when no process listens there (or, with an
address, none listens on that address). The scripts used `netstat -ano`
and took its LISTENING rows, but Windows 26300.9818 reports a listening
socket's state as 0 -- or as a different wrong state on each read -- and
netstat leaves a row out when it cannot name the state, so a held port
read as free. The rest of each row is right, so a listener is told by
its shape rather than its state: no remote address, no remote port, and
an owning process. An established connection always has a remote port.

Reads the table netstat reads (`GetExtendedTcpTable`), IPv4 and IPv6.
Run as a plain script, like `logpipe.py`, so it needs nothing but the
standard library.
"""

from __future__ import annotations

import ctypes
import socket
import struct
import sys
from collections.abc import Iterable

__all__ = ["Row", "listening_pid", "main", "tcp_rows"]

#: A TCP table row: local address, local port, remote port, owning PID.
Row = tuple[str, int, int, int]

_AF_INET = 2
_AF_INET6 = 23
_TCP_TABLE_OWNER_PID_ALL = 5
#: MIB_TCPROW_OWNER_PID and MIB_TCP6ROW_OWNER_PID, after the row count.
_ROW4 = struct.Struct("<I4sI4sII")
_ROW6 = struct.Struct("<16sII16sIIII")


def _port(raw: int) -> int:
    """A port as the table stores it: network order, in a DWORD's low half."""
    return socket.ntohs(raw & 0xFFFF)


def tcp_rows() -> list[Row]:
    """Every row of the machine's IPv4 and IPv6 TCP tables (Windows only)."""
    if sys.platform != "win32":
        raise OSError("portpid reads the Windows TCP table; on Linux use ss")
    get_table = ctypes.WinDLL("iphlpapi").GetExtendedTcpTable
    rows: list[Row] = []
    for family in (_AF_INET, _AF_INET6):
        size = ctypes.c_ulong(0)
        buffer = ctypes.create_string_buffer(0)
        # The table can grow between asking its size and reading it.
        while get_table(
            buffer, ctypes.byref(size), False, family, _TCP_TABLE_OWNER_PID_ALL, 0
        ):
            buffer = ctypes.create_string_buffer(size.value + 4096)
            size = ctypes.c_ulong(len(buffer))
        raw = buffer.raw
        (count,) = struct.unpack_from("<I", raw, 0)
        for at in range(count):
            if family == _AF_INET:
                _state, local, lport, _remote, rport, pid = _ROW4.unpack_from(
                    raw, 4 + at * _ROW4.size
                )
                address = socket.inet_ntoa(local)
            else:
                local, _scope, lport, _remote, _rscope, rport, _state, pid = (
                    _ROW6.unpack_from(raw, 4 + at * _ROW6.size)
                )
                address = socket.inet_ntop(socket.AF_INET6, local)
            rows.append((address, _port(lport), _port(rport), pid))
    return rows


def listening_pid(
    rows: Iterable[Row], port: int, address: str | None = None
) -> int | None:
    """The PID listening on `port` (on `address` alone, if given), else None.

    A listener has no remote port; PID 0 is the system's idle process,
    which Windows names as the owner of rows that belong to no one, such as
    a connection in TIME_WAIT.
    """
    for local, lport, rport, pid in rows:
        listens = lport == port and rport == 0 and pid != 0
        if listens and (address is None or local == address):
            return pid
    return None


def main(argv: list[str]) -> int:
    """Print the PID listening on `argv[0]` (on address `argv[1]`, if given)."""
    if not 1 <= len(argv) <= 2 or not argv[0].isdigit():
        print("usage: portpid.py PORT [ADDRESS]", file=sys.stderr)
        return 2
    pid = listening_pid(tcp_rows(), int(argv[0]), argv[1] if len(argv) == 2 else None)
    if pid is not None:
        print(pid)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
