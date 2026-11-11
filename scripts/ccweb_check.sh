#!/usr/bin/env bash
# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
# ---------------------------------------------------------------------------
#  Run every quality gate, in the order that fails fastest.
#
#    ./scripts/ccweb_check.sh        format check, lint, types, tests, frontend
#    ./scripts/ccweb_check.sh fix    reformat and auto-fix first, then check
#
#  The bash twin of ccweb_check.cmd; the reasons for each gate are written
#  there. Exit code is non-zero if anything failed.
#
#  Each stage says when it started and, from the last complete run, about
#  when it should end; the run ends with every stage's time
#  (backend/app/gate_clock.py, keeping its times in the logs folder).
# ---------------------------------------------------------------------------
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$here/.." && pwd)"

# An unrecognised argument is refused, never ignored: a mistyped "fix" would
# otherwise run the plain check and report on files left unfixed.
case "${1:-}" in
    ""|fix) ;;
    *)
        echo "ERROR: unknown argument $1"
        echo "       ./scripts/ccweb_check.sh [fix]"
        exit 2 ;;
esac

. "$here/ccweb_env.sh" || exit 2
PY="$ENVDIR/bin/python"
NODE="$ENVDIR/bin/node"
FAILED=""

if [ ! -x "$PY" ]; then
    echo "ERROR: conda environment not found: $ENVDIR"
    echo "       see docs/environment-setup-linux.md"
    exit 1
fi
# The logs folder, where the stage times are kept, comes from the settings
# like every other folder a script uses.
. "$here/ccweb_settings.sh" || exit 2
. "$here/ccweb_logdir.sh"
clock() { "$PY" "$REPO/backend/app/gate_clock.py" "$@"; }

cd "$REPO" || exit 2

if [ "${1:-}" = "fix" ]; then
    echo "[fix] ruff format"
    "$PY" -m ruff format .
    echo "[fix] ruff check --fix"
    "$PY" -m ruff check . --fix
    if [ -d frontend/node_modules/prettier ]; then
        echo "[fix] prettier"
        "$NODE" frontend/node_modules/prettier/bin/prettier.cjs --write frontend \
            --ignore-path .gitignore --ignore-path frontend/.prettierignore --log-level warn
    fi
    echo
fi

clock begin "$LOGS"

echo "=== python format ==="
clock stage "$LOGS" "python format"
"$PY" -m ruff format --check . || FAILED="$FAILED format"

echo "=== python lint ==="
clock stage "$LOGS" "python lint"
"$PY" -m ruff check . || FAILED="$FAILED lint"

echo "=== mutation scaffolding guard ==="
clock stage "$LOGS" "mutation scaffolding guard"
# A deliberate mutation is marked `if False:`, `if True:` or MUTATION; none
# may be left in backend/app. See ccweb_check.cmd.
hits="$(grep -rn --include='*.py' -e 'if False:' -e 'if True:' -e 'MUTATION' backend/app || true)"
if [ -n "$hits" ]; then
    # Each hit on a line of its own, as the cmd twin prints them.
    printf '%s\n' "$hits" | sed 's/^/  left in place: /'
    echo "  FAILED: mutation-test scaffolding was left in backend/app -- see the line(s) above"
    FAILED="$FAILED mutation-scaffold"
fi

echo "=== python types ==="
clock stage "$LOGS" "python types"
"$PY" -m mypy || FAILED="$FAILED types"

echo "=== tests ==="
clock stage "$LOGS" "tests"
# Where this computer has a test cluster of its own, the tests run there
# (ccweb_testdb.sh); elsewhere TEST_DATABASE_URL is left as it was. In
# parallel, one worker per core up to eight -- see ccweb_check.cmd.
. "$here/ccweb_testdb.sh" use || FAILED="$FAILED testdb"
(cd backend && "$PY" -m pytest -n auto --maxprocesses 8) || FAILED="$FAILED tests"

if [ -d frontend/node_modules/eslint ]; then
    echo "=== frontend lint ==="
    clock stage "$LOGS" "frontend lint"
    "$NODE" frontend/node_modules/eslint/bin/eslint.js --max-warnings 0 frontend || FAILED="$FAILED eslint"

    echo "=== frontend format ==="
    clock stage "$LOGS" "frontend format"
    "$NODE" frontend/node_modules/prettier/bin/prettier.cjs --check frontend \
        --ignore-path .gitignore --ignore-path frontend/.prettierignore --log-level warn \
        || FAILED="$FAILED prettier"

    echo "=== frontend tests ==="
    clock stage "$LOGS" "frontend tests"
    (cd frontend && "$NODE" node_modules/vitest/vitest.mjs run) || FAILED="$FAILED vitest"

    echo "=== frontend bundle isolation ==="
    clock stage "$LOGS" "frontend bundle isolation"
    # A failed build must not leave an older build's graph for the check
    # to misread: dist is cleared first.
    if (cd frontend && rm -rf dist && "$NODE" node_modules/vite/bin/vite.js build); then
        (cd frontend && "$NODE" scripts/check-bundle-isolation.mjs) || FAILED="$FAILED isolation"
    else
        FAILED="$FAILED build"
    fi
else
    # An unrun check is not a passed one.
    echo "=== frontend === SKIPPED: frontend/node_modules is missing"
    echo "    run: cd frontend && npm install"
    FAILED="$FAILED frontend-not-installed"
fi

echo
clock end "$LOGS"
echo
if [ -n "$FAILED" ]; then
    echo "FAILED:$FAILED"
    exit 1
fi
echo "All checks passed."
exit 0
