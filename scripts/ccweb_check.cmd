@echo off
rem (c) Copyright 2026 Nathaniel Mills
rem Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
rem SPDX-License-Identifier: Apache-2.0
rem ---------------------------------------------------------------------------
rem  Run every quality gate, in the order that fails fastest.
rem
rem    .\scripts\ccweb_check.cmd        format check, lint, types, tests, frontend
rem    .\scripts\ccweb_check.cmd fix    reformat and auto-fix first, then check
rem
rem  Exit code is non-zero if anything failed, so CI can call this directly.
rem
rem  Each stage says when it started and, from the last complete run, about
rem  when it should end; the run ends with every stage's time
rem  (backend\app\gate_clock.py, keeping its times in the logs folder).
rem ---------------------------------------------------------------------------
setlocal enabledelayedexpansion

rem  An unrecognised argument is refused, never ignored: a mistyped "fix"
rem  would otherwise run the plain check and report on files left unfixed.
if not "%~1"=="" if /i not "%~1"=="fix" (
    echo ERROR: unknown argument %1
    echo        .\scripts\ccweb_check.cmd [fix]
    exit /b 2
)

set "REPO=%~dp0.."
rem  Put the ccwebdb conda environment in play and take ENVDIR and PGBIN
rem  from it, rather than from a guessed path. See ccweb_env.cmd.
call "%~dp0ccweb_env.cmd" || exit /b 2
set "PY=%ENVDIR%\python.exe"
set "NODE=%ENVDIR%\node.exe"
set "FAILED="

if not exist "%PY%" (
    echo ERROR: conda environment not found: !ENVDIR!
    echo        see docs\environment-setup-windows.md
    exit /b 1
)
rem  The logs folder, where the stage times are kept, comes from the
rem  settings like every other folder a script uses.
call "%~dp0ccweb_settings.cmd" || exit /b 2
call "%~dp0ccweb_logdir.cmd"
set CLOCK="%PY%" "%REPO%\backend\app\gate_clock.py"

pushd "%REPO%"

if /i "%~1"=="fix" (
    echo [fix] ruff format
    "%PY%" -m ruff format .
    echo [fix] ruff check --fix
    "%PY%" -m ruff check . --fix
    if exist "frontend\node_modules\prettier" (
        echo [fix] prettier
        "%NODE%" frontend\node_modules\prettier\bin\prettier.cjs --write frontend --ignore-path .gitignore --ignore-path frontend\.prettierignore --log-level warn
    )
    echo.
)

%CLOCK% begin "%LOGS%"

echo === python format ===
%CLOCK% stage "%LOGS%" "python format"
"%PY%" -m ruff format --check .
if errorlevel 1 set "FAILED=!FAILED! format"

echo === python lint ===
%CLOCK% stage "%LOGS%" "python lint"
"%PY%" -m ruff check .
if errorlevel 1 set "FAILED=!FAILED! lint"

echo === mutation scaffolding guard ===
%CLOCK% stage "%LOGS%" "mutation scaffolding guard"
rem  An ordered mutation test disables a guard on purpose -- an `if False:`
rem  in place of a shop-guard predicate is the shape this findstr catches
rem  directly. A mutation that leaves no such literal, such as deleting an
rem  `AdminUser` dependency from an endpoint, is invisible to this stage on
rem  its own -- there is nothing here to grep. The rule that makes that
rem  mutation catchable too is a convention, not code: leave a MUTATION
rem  comment at the site of ANY deliberate mutation that would otherwise
rem  leave no trace, and this stage catches the marker even though it
rem  cannot see the mutation itself. A mutation left with no `if False:`,
rem  `if True:`, or MUTATION marker is simply not detectable here -- this
rem  stage enforces the marker convention, not the absence of bugs.
rem  MUTATION is matched case-sensitively (no /I): the convention is to
rem  spell it in caps, and `if False:`/`if True:` have no lowercase form in
rem  Python, so nothing is lost. This is a literal-text check, not a parser:
rem  `if 0:`, `if not True:`, or a `False` with unusual spacing all evade it.
rem  `backend\app` currently contains none of these three, so any match here
rem  is new and real -- there is no backlog to grandfather.
set "MUTATION_HIT="
for /f "delims=" %%L in ('findstr /S /N /C:"if False:" /C:"if True:" /C:"MUTATION" "%REPO%\backend\app\*.py" 2^>nul') do (
    echo   left in place: %%L
    set "MUTATION_HIT=1"
)
if defined MUTATION_HIT (
    echo   FAILED: mutation-test scaffolding was left in backend\app -- see the line^(s^) above
    set "FAILED=!FAILED! mutation-scaffold"
)

echo === python types ===
%CLOCK% stage "%LOGS%" "python types"
rem Fails the build like the rest: with no findings standing, a single new
rem one is the signal.
"%PY%" -m mypy
if errorlevel 1 set "FAILED=!FAILED! types"

echo === tests ===
%CLOCK% stage "%LOGS%" "tests"
rem  Where this computer has a test cluster of its own, the tests run there
rem  (ccweb_testdb.cmd); elsewhere TEST_DATABASE_URL is left as it was.
rem  In parallel (pytest-xdist), one worker per core up to eight: each worker
rem  builds a test database of its own (tests\conftest.py), and eight stay
rem  well inside PostgreSQL's 100 connections; more saved little when
rem  measured. Here only: a test file run by hand stays one process.
call "%~dp0ccweb_testdb.cmd" use
if errorlevel 1 set "FAILED=!FAILED! testdb"
pushd backend
"%PY%" -m pytest -n auto --maxprocesses 8
if errorlevel 1 set "FAILED=!FAILED! tests"
popd

if exist "frontend\node_modules\eslint" (
    echo === frontend lint ===
    %CLOCK% stage "%LOGS%" "frontend lint"
    "%NODE%" frontend\node_modules\eslint\bin\eslint.js --max-warnings 0 frontend
    if errorlevel 1 set "FAILED=!FAILED! eslint"

    echo === frontend format ===
    %CLOCK% stage "%LOGS%" "frontend format"
    rem  Both ignore files are named: prettier looks for them only in the
    rem  directory it is run from, which is the repository root, and the
    rem  frontend's own is one level down.
    "%NODE%" frontend\node_modules\prettier\bin\prettier.cjs --check frontend --ignore-path .gitignore --ignore-path frontend\.prettierignore --log-level warn
    if errorlevel 1 set "FAILED=!FAILED! prettier"

    echo === frontend tests ===
    %CLOCK% stage "%LOGS%" "frontend tests"
    rem  Run from frontend so vitest picks up vite.config.js. Invoked with
    rem  the environment's node by full path, like every other tool here,
    rem  not via npm.
    pushd frontend
    "%NODE%" node_modules\vitest\vitest.mjs run
    if errorlevel 1 set "FAILED=!FAILED! vitest"
    popd

    echo === frontend bundle isolation ===
    %CLOCK% stage "%LOGS%" "frontend bundle isolation"
    rem  Builds both entries and asserts neither reaches the other's tree.
    rem  The eslint boundary rules check the source; this checks the artefact,
    rem  so a build-configuration mistake cannot pass unnoticed.
    pushd frontend
    rem  Clear dist first: a failed build can leave a previous good
    rem  build's dist\.vite\bundle-graph.json on disk, and the isolation
    rem  check has no way to tell that graph is stale rather than
    rem  current. Removing it here means a failed build leaves nothing
    rem  for the check to misread, on this run or a later manual one.
    if exist dist rmdir /s /q dist
    "%NODE%" node_modules\vite\bin\vite.js build
    if errorlevel 1 (
        set "FAILED=!FAILED! build"
    ) else (
        "%NODE%" scripts\check-bundle-isolation.mjs
        if errorlevel 1 set "FAILED=!FAILED! isolation"
    )
    popd
) else (
    rem  Every frontend gate lives in the block above, so a missing
    rem  node_modules runs none of them -- including the bundle-isolation
    rem  check. It fails the run: an unrun check is not a passed one.
    echo === frontend === SKIPPED: frontend\node_modules is missing
    echo     run: cd frontend ^&^& npm install
    set "FAILED=!FAILED! frontend-not-installed"
)

popd

echo.
%CLOCK% end "%LOGS%"
echo.
if defined FAILED (
    echo FAILED:!FAILED!
    exit /b 1
)
echo All checks passed.
exit /b 0
