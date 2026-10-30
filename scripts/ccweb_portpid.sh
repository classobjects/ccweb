# shellcheck shell=bash
# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
# ---------------------------------------------------------------------------
#  ccweb_portpid.sh - define portpid PORT: the PID listening on PORT.
#
#  The bash twin of ccweb_portpid.cmd. Prints the PID, "?" when the port is
#  held by a process this account may not see (ss names no pid for another
#  user's socket), or nothing when the port is free. Sourced by
#  ccweb_startup.sh, ccweb_shutdown.sh and ccweb_status.sh.
# ---------------------------------------------------------------------------
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    echo "ERROR: ccweb_portpid.sh is sourced by the other scripts, not run" >&2
    exit 2
fi
portpid() {
    local listing pid
    listing="$(ss -Hltnp "sport = :$1" 2>/dev/null)"
    [ -n "$listing" ] || return 0
    pid="$(printf '%s\n' "$listing" | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
    printf '%s\n' "${pid:-?}"
}
