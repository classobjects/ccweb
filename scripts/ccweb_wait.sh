# shellcheck shell=bash
# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
# ---------------------------------------------------------------------------
#  ccweb_wait.sh - define the readiness checks the scripts share:
#    pgready         PostgreSQL at CCWEB_DB_HOST:CCWEB_DB_PORT accepts
#                    connections now (0) or not (1)
#    waitpg TRIES    poll pgready until it is (0), or give up (1)
#    waiturl URL TRIES
#                    poll URL until it answers (0), or give up (1)
#
#  The bash twin of ccweb_wait.cmd. A second passes between tries; a URL try
#  that gets no answer takes up to two seconds. Sourced by ccweb_startup.sh,
#  ccweb_pgadmin.sh and ccweb_claude.sh after ccweb_settings.sh.
# ---------------------------------------------------------------------------
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    echo "ERROR: ccweb_wait.sh is sourced by the other scripts, not run" >&2
    exit 2
fi
pgready() { "$PGBIN/pg_isready" -h "$CCWEB_DB_HOST" -p "$CCWEB_DB_PORT" >/dev/null 2>&1; }
waitpg() {
    local tries=0
    until pgready; do
        tries=$((tries + 1))
        [ "$tries" -ge "$1" ] && return 1
        sleep 1
    done
}
waiturl() {
    local tries=0
    until curl -s -o /dev/null --max-time 2 "$1"; do
        tries=$((tries + 1))
        [ "$tries" -ge "$2" ] && return 1
        sleep 1
    done
}
