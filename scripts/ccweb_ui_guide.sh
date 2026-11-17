#!/usr/bin/env bash
# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
# ---------------------------------------------------------------------------
#  ccweb_ui_guide.sh - retake the pictures in docs/ui-guide.md.
#
#    ./scripts/ccweb_ui_guide.sh all              rebuild the demo, take all
#    ./scripts/ccweb_ui_guide.sh shots NAME ...   take only these pictures
#    ./scripts/ccweb_ui_guide.sh seed             only rebuild the demo
#    ./scripts/ccweb_ui_guide.sh serve            run the demo stack to look
#    ./scripts/ccweb_ui_guide.sh list             name every picture
#
#  The bash twin of ccweb_ui_guide.cmd. Starts the test cluster if it is
#  not running, then runs python -m ui_guide in backend/ with the arguments
#  given. The demo database lives in the test cluster; the API, frontend
#  and headless Chrome it starts use the CCWEB_GUIDE_* ports, beside any
#  development server, and stop when it is done. See backend/ui_guide/README.md.
# ---------------------------------------------------------------------------
set -u
here="$(dirname "${BASH_SOURCE[0]}")"
. "$here/ccweb_env.sh" || exit 2
if [ "${1:-}" != "list" ]; then
    "$here/ccweb_testdb.sh" start || exit 1
fi

cd "$here/../backend" || exit 2
"$ENVDIR/bin/python" -m ui_guide "$@"
exit $?
