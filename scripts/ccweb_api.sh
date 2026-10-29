#!/usr/bin/env bash
# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
# ---------------------------------------------------------------------------
#  ccweb_api.sh - run the API in the foreground, as a production host does.
#
#    ./scripts/ccweb_api.sh
#
#  The bash twin of ccweb_api.cmd, which the Windows start-up task runs. A
#  Linux host normally runs the API as the systemd unit
#  deploy/linux/ccwebdb-api.service instead, which logs to the journal and
#  is hardened by systemd (docs/deployment-linux.md); this script is for a
#  host without systemd, or for running the production form by hand. A
#  development machine uses ccweb_startup.sh, which also starts PostgreSQL
#  and the frontend.
#
#  The API listens on CCWEB_API_HOST and CCWEB_API_PORT, behind Caddy:
#  --proxy-headers with --forwarded-allow-ips set to that address makes it
#  see each visitor's address and https from Caddy's headers, and believe
#  no one else's. Its output goes through logpipe.py into backend.log in
#  the log folder, which starts afresh each time the API starts and never
#  grows past CCWEB_LOG_MAX_BYTES (logs/README.md).
#
#  Exit 2, saying why, when the environment or a setting is refused;
#  otherwise the log writer's exit code, once the API has stopped.
# ---------------------------------------------------------------------------
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "${1:-}" ]; then
    echo "ERROR: unknown argument $1"
    echo "       ./scripts/ccweb_api.sh"
    exit 2
fi

if ! . "$here/ccweb_env.sh"; then
    echo "api FAILED - the ccwebdb environment could not be put in play; the API was not started"
    exit 2
fi
if ! . "$here/ccweb_settings.sh"; then
    echo "api FAILED - a setting in .env was refused; the API was not started"
    exit 2
fi
. "$here/ccweb_logdir.sh"
mkdir -p "$LOGS"
export PYTHONUNBUFFERED=1

cd "$CCWEB_REPO/backend" || exit 2
"$ENVDIR/bin/python" -m uvicorn app.main:app --host "$CCWEB_API_HOST" --port "$CCWEB_API_PORT" \
    --proxy-headers --forwarded-allow-ips "$CCWEB_API_HOST" 2>&1 \
    | "$ENVDIR/bin/python" "$CCWEB_REPO/backend/app/logpipe.py" "$LOGS/backend.log"
exit $?
