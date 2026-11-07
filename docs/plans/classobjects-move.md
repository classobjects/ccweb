# Moving classobjects onto the ccweb repository

*Written 2026-10-27.*

> **For agentic workers:** steps run on the server `classobjects`, pasted by
> the owner into a cmd window there (elevated where a task says so), or sent
> over SSH only on the owner's word for that step. Verification from outside
> is done from the development computer. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** classobjects serves the site from a clone of
`github.com/classobjects/ccweb` at `%USERPROFILE%\dev\ccweb`, holding the live
database cluster, photographs, settings and logs that now sit in
`%USERPROFILE%\dev\classobjects-ccwebdb`, with nothing left that names the old
folder.

**Architecture:** every relative setting resolves from `REPO_ROOT`, the folder
the code is in (`backend/app/runtime_settings.py`): `.env`, `.pgdata`,
`media`, `logs`, `frontend\dist`. The project is not installed into the conda
environment by path. So the move is: clone beside the live checkout, build,
then, during a short stop, **move** `.pgdata`, `media` and `logs` into the
clone under the same names, and re-point the four things outside the
repository that name the old folder.

**Tech stack:** Windows cmd, PostgreSQL 18 as service `ccwebdb-postgres`,
scheduled tasks `ccwebdb api` and `ccwebdb backup`, Caddy as service `caddy`,
conda environment `ccwebdb`.

**Spec:** none. The installation this produces is the one
[deployment-windows.md](../deployment-windows.md) already describes, at the
folder it already names.

## What the survey found (2026-10-27, read-only over SSH)

- The old checkout is at `e31a3bc` (clean, origin
  `wnmills3/classobjects-ccwebdb`). The `ccweb` repository at `b8a7cf8` has the
  same 679 tracked files. 25 differ, all renames of the project's name in
  docs, scripts, tests, `sonar-project.properties` and a `pyproject.toml`
  comment. **No file under `backend/app` or `frontend/` differs:** the code
  that runs is byte-identical to what is live.
- `.pgdata` is a real folder (not a junction): 1,815 files, 154 MB. Its
  `postgresql.conf` and `postgresql.auto.conf` name no absolute path, and
  `pg_tblspc` is empty, so the cluster does not know where it lives.
- `media` holds 9,168 files (2.46 GB). Everything is on `C:` with 361 GB
  free, so a `move` is a rename, not a copy.
- Four things outside the repository name the old folder:
  1. service `ccwebdb-postgres`:
     `-D "C:\Users\wnmil\dev\classobjects-ccwebdb\.pgdata"`;
  2. `C:\Users\wnmil\dev\ccwebdb-run\api.cmd`, run by task `ccwebdb api`.
     It names the old folder twice, in `cd /d` and in the `>>` log path;
  3. task `ccwebdb backup`, which runs
     `C:\Users\wnmil\dev\classobjects-ccwebdb\scripts\ccweb_backup.cmd` at
     20:00 daily;
  4. `C:\caddy\Caddyfile` lines 51 and 57: `root *
     C:/Users/wnmil/dev/classobjects-ccwebdb/frontend/dist`.
- `.env` sets `SALES_TAX_RATE` and `VITE_SHOP_NAME` twice each. The later
  line wins. The plan copies `.env` unchanged.
- Live bundles in `frontend\dist\assets`: `management-C4sh0D4A.js`,
  `management-dU7OEu-H.css`, `shared-BfThguvQ.js`, `shared-ZoPq-1uC.css`,
  `store-BR8cmZFB.css`, `store-DsZtREMu.js`.

## Decisions

1. **Move the cluster, photographs and logs; don't copy them.** One cluster
   exists at any moment, so no second copy can be started by mistake
   ([runtime-operations-windows.md](../runtime-operations-windows.md), *One
   database, two computers*). On one volume a move is an instant rename. *If
   wrong:* the way back is the same move in reverse plus re-registering the
   service (*Rolling back*), and Task 3's dump stands behind both.
2. **`.env` is copied, not moved.** The old folder keeps a working copy for
   rollback until it is retired.
3. **`api.cmd` changes only in its two paths and stays where it is.** The
   task needs no re-registration, so nobody has to type a password with
   `schtasks /rp *`. *If wrong:* the API keeps its older `>>` logging rather
   than the documented `logpipe.py` rotation. Changing that is a separate,
   later step (*Afterwards*).
4. **The Caddyfile is re-rendered from the new clone, not hand-edited.** A
   comparison must show only lines 51 and 57 changing. Anything more means
   the old file had drifted from the template, and the switch stops there.
5. **The old checkout is renamed `classobjects-ccwebdb.retired`, not
   deleted.** That happens after one proved nightly backup from the new
   folder. The owner deletes it later. `.pgdata.pre-onedrive` (6 files,
   42 KB) stays in it.
6. **The switch runs away from 20:00**, so the daily backup never meets a
   stopped database or a half-moved folder.

## Global constraints

- cmd only. Every command block pastes as written. A command that prompts
  stands alone in its block.
- No live write except the folder moves. The data are not touched: the item
  count and cost basis after the switch must equal the ones before it.
- Never `ccweb_startup.cmd` or `ccweb_shutdown.cmd` on the server
  ([deployment-windows.md](../deployment-windows.md), top).
- `NoDefaultCurrentDirectoryInExePath` trap: scripts as `.\scripts\x.cmd`.

## Review focus

1. **A target folder already exists.** `move A\.pgdata B\.pgdata` with
   `B\.pgdata` present puts the cluster *inside* it, as `B\.pgdata\.pgdata`.
   Every move in Task 4 is guarded by `if exist`, and Task 2 checks that the
   fresh clone has none of `.pgdata`, `media`, `logs`.
2. **The service registered from a window without the conda environment.**
   `pg_ctl` is then not found, or a different one is registered. Task 4 reads
   `sc qc` and requires the `BINARY_PATH_NAME` shown below.
3. **An old API still running after `schtasks /end`.** It would hold port
   8000 and files in `logs`. Task 4 checks with `netstat` that nothing
   listens on 8000 before moving anything.
4. **`net stop caddy` hanging in `STOP_PENDING`**, which has happened once.
   Task 4 gives the `taskkill` way out.
5. **A move refused with "Access is denied"** because a file is open. A
   folder move is all or nothing, so nothing is half-moved. Find what holds
   the folder, close it, and repeat.

---

### Task 1: Baseline (no change)

Record what "unchanged" means before anything moves.

- [ ] **Step 1: On classobjects, record the item count and cost basis.** In
  a cmd window:

```console
conda activate ccwebdb
cd /d %USERPROFILE%\dev\classobjects-ccwebdb
.\scripts\ccweb_psql.cmd -c "select count(*), sum(total_cost) from inventory_item where split_at is null and deleted_at is null;"
```

  Write both numbers into this plan, here: count `______`, sum `______`.

- [ ] **Step 2: Confirm last night's backup proved.** The last block of
  `logs\backup.log` ends in success with tonight's date:

```console
notepad %USERPROFILE%\dev\classobjects-ccwebdb\logs\backup.log
```

- [ ] **Step 3: From the development computer, record what the outside
  sees.** Status codes of `https://classobjects.com/`,
  `https://classobjects.com/api/shop`,
  `https://classobjects.com/management`, and one photo's
  `/api/images/.../thumb` address (the hash of any file under `media`). Also the bundle
  names in the served `index.html` and `management.html`. They should be the
  six listed above.

### Task 2: Clone and build beside the live checkout (no downtime)

**Files:** creates `%USERPROFILE%\dev\ccweb` on classobjects. Nothing live
changes.

- [ ] **Step 1: Clone.**

```console
cd /d %USERPROFILE%\dev
git clone https://github.com/classobjects/ccweb.git ccweb
cd /d %USERPROFILE%\dev\ccweb
git log -1 --format="%h %s"
```

  Expected: `b8a7cf8`, or a later `main` commit if one has been merged.
  Whatever it is, Task 2 Step 4's bundle names must still match.

- [ ] **Step 2: Check the clone has no data folders.** Each line must say
  `none`:

```console
cd /d %USERPROFILE%\dev\ccweb
if exist .pgdata (echo .pgdata EXISTS - stop) else (echo .pgdata none)
if exist media (echo media EXISTS - stop) else (echo media none)
if exist logs\backend.log (echo logs has a backend.log - stop) else (echo logs none)
```

  (`logs\` itself exists in the clone: it holds the tracked `README.md`.)

- [ ] **Step 3: Copy the settings.**

```console
copy "%USERPROFILE%\dev\classobjects-ccwebdb\.env" "%USERPROFILE%\dev\ccweb\.env"
```

- [ ] **Step 4: Build the frontend and compare bundle names.**

```console
conda activate ccwebdb
cd /d %USERPROFILE%\dev\ccweb\frontend
npm ci
npm run build
dir /b dist\assets
```

  Expected: the same six names as the live `dist\assets` (survey). The source
  and `.env` are identical, so the content hashes must be too. A different
  name means something differs, and that has to be found before Task 4.
  Python needs no step: `uv.lock` is unchanged, and the environment already
  holds every dependency.

- [ ] **Step 5: Render the Caddyfile and compare.** Into the home folder,
  since writing `C:\caddy` needs an elevated window:

```console
conda activate ccwebdb
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.runtime_settings --render ..\deploy\Caddyfile > %USERPROFILE%\Caddyfile.new
fc C:\caddy\Caddyfile %USERPROFILE%\Caddyfile.new
```

  Expected: `fc` shows only the two `root *` lines, old path versus
  `C:/Users/wnmil/dev/ccweb/frontend/dist`. Anything else stops the switch
  until it is explained (Decision 4).

### Task 3: A proved recovery point

The release procedure's step 1
([system-administration.md](../system-administration.md), *Applying a schema
release*), run from the new clone. Its code is identical, and its `.env`
points at live.

- [ ] **Step 1: The database password, on its own:**

```console
set /p PGPASSWORD=Database password:
```

- [ ] **Step 2: Dump, restore into a scratch database, compare.**

```console
cd /d %USERPROFILE%\dev\ccweb\backend
set "PGBIN=%CONDA_PREFIX%\Library\bin"
set "PGHOST=localhost"
set "PGUSER=ccwebdb"
set "DUMP=%USERPROFILE%\dev\ccwebdb-backups\ccwebdb_pre_ccweb_move_YYYYMMDD.dump"
"%PGBIN%\pg_dump.exe" -Fc -d ccwebdb -f "%DUMP%"
"%PGBIN%\createdb.exe" ccwebdb_rehearsal
"%PGBIN%\pg_restore.exe" -d ccwebdb_rehearsal --no-owner "%DUMP%"
python -m app.workbook_backup compare postgresql+psycopg://ccwebdb:%PGPASSWORD%@localhost:5432/ccwebdb_rehearsal
```

  Put the switch day's date in place of `YYYYMMDD` first. Expected:
  `identical`.

- [ ] **Step 3: Drop the scratch database.**

```console
"%PGBIN%\dropdb.exe" ccwebdb_rehearsal
```

### Task 4: The switch (downtime: a few minutes; elevated cmd)

The shop is closed (`SHOP_OPEN=false`) and has no listings, so only the
console is unavailable while this runs. Open an **administrator** cmd and
run `conda activate ccwebdb` in it first.

- [ ] **Step 1: Stop the API and prove it stopped.**

```console
schtasks /end /tn "ccwebdb api"
netstat -ano | findstr ":8000 " | findstr LISTENING
```

  Expected: `netstat` prints nothing. If a line remains, end the process
  whose PID ends that line with `taskkill /PID` and `/T /F`, then check
  again.

- [ ] **Step 2: Stop PostgreSQL.**

```console
sc stop ccwebdb-postgres
sc query ccwebdb-postgres | findstr STATE
```

  Expected: `STOPPED`. Repeat the query if it says `STOP_PENDING`.

- [ ] **Step 3: Move the cluster, photographs and logs.** Each line checks
  first that its target doesn't exist (Review focus 1):

```console
cd /d %USERPROFILE%\dev
if not exist ccweb\.pgdata move classobjects-ccwebdb\.pgdata ccweb\.pgdata
if not exist ccweb\media move classobjects-ccwebdb\media ccweb\media
robocopy classobjects-ccwebdb\logs ccweb\logs /MOVE /E /XF README.md
if exist ccweb\.pgdata\PG_VERSION (echo cluster moved) else (echo CLUSTER NOT MOVED - stop)
if exist classobjects-ccwebdb\.pgdata (echo OLD CLUSTER STILL THERE - stop) else (echo old cluster gone)
if exist classobjects-ccwebdb\media (echo OLD MEDIA STILL THERE - stop) else (echo old media gone)
```

  `robocopy /MOVE` merges the old log files into the clone's `logs\` beside
  its `README.md`. Exit codes 1 to 3 mean files were moved.

- [ ] **Step 4: Re-register the service at the new folder.**

```console
pg_ctl unregister -N ccwebdb-postgres
pg_ctl register -N ccwebdb-postgres -D "%USERPROFILE%\dev\ccweb\.pgdata" -S auto
sc qc ccwebdb-postgres | findstr BINARY_PATH_NAME
```

  Expected (Review focus 2): `"C:\Users\wnmil\miniforge3\envs\ccwebdb\Library\bin\pg_ctl.exe"
  runservice -N "ccwebdb-postgres" -D "C:\Users\wnmil\dev\ccweb\.pgdata" -w`.

- [ ] **Step 5: Start it and compare the data with Task 1.**

```console
sc start ccwebdb-postgres
pg_isready -h localhost -p 5432
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_psql.cmd -c "select count(*), sum(total_cost) from inventory_item where split_at is null and deleted_at is null;"
```

  Expected: `accepting connections`, then exactly Task 1's count and sum.

- [ ] **Step 6: Point `api.cmd` at the new folder.**

```console
notepad %USERPROFILE%\dev\ccwebdb-run\api.cmd
```

  Replace `classobjects-ccwebdb` with `ccweb` in both places and nothing
  else, so the file reads:

```
@echo off
cd /d "%USERPROFILE%\dev\ccweb\backend"
"%USERPROFILE%\miniforge3\envs\ccwebdb\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips 127.0.0.1 >> "%USERPROFILE%\dev\ccweb\logs\backend.log" 2>&1
```

- [ ] **Step 7: Start the API.** Its start-up photo check
  (`app/media_check.py`) refuses to start if `media` doesn't hold the five
  newest photographs, so an answer here also proves the photographs arrived:

```console
schtasks /run /tn "ccwebdb api"
ping -n 6 127.0.0.1 >nul
curl -s -f -o nul http://127.0.0.1:8000/health
if errorlevel 1 echo The API is not answering: read %USERPROFILE%\dev\ccweb\logs\backend.log
```

- [ ] **Step 8: Put the new Caddyfile in place and restart Caddy.**

```console
copy C:\caddy\Caddyfile C:\caddy\Caddyfile.pre-ccweb
copy /y %USERPROFILE%\Caddyfile.new C:\caddy\Caddyfile
net stop caddy
net start caddy
```

  If `net stop` hangs in `STOP_PENDING` (Review focus 4): `sc queryex caddy`
  shows its PID. End it with `taskkill /PID` and `/F`, then `net start caddy`.

- [ ] **Step 9: Move the daily backup to the new folder.**

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_backup.cmd /schedule 20:00
.\scripts\ccweb_backup.cmd /scheduled
```

  Expected: `Task To Run` is
  `"C:\Users\wnmil\dev\ccweb\scripts\ccweb_backup.cmd"`.

### Task 5: Verify from outside (development computer)

- [ ] **Step 1:** Repeat Task 1 Step 3. Every status code must equal the
  baseline. The photo must return an image. The served bundle names must
  equal Task 2 Step 4's.
- [ ] **Step 2:** Over SSH, read-only: `logs\backend.log` in the new folder
  shows this start, and `sc qc`, `schtasks /query` and `C:\caddy\Caddyfile`
  name `ccweb` and no longer `classobjects-ccwebdb`.
- [ ] **Step 3:** Sign in to `https://classobjects.com/management` and open
  one item with a photo (owner).

### Task 6: After the first nightly backup

- [ ] **Step 1:** The 20:00 run is proved in
  `%USERPROFILE%\dev\ccweb\logs\backup.log`, and a newer `ccwebdb_*.xlsx`
  is in the OneDrive backup folder.
- [ ] **Step 2: Retire the old checkout.** Rename it, so anything still
  naming it fails loudly rather than reading stale files:

```console
cd /d %USERPROFILE%\dev
ren classobjects-ccwebdb classobjects-ccwebdb.retired
```

- [ ] **Step 3:** Restart the API once more (`schtasks /end /tn "ccwebdb
  api"`, then `schtasks /run /tn "ccwebdb api"`) and repeat Task 5 Step 1.
  This proves nothing still reads the old folder.
- [ ] **Step 4:** Delete `%USERPROFILE%\Caddyfile.new`. Keep
  `C:\caddy\Caddyfile.pre-ccweb` and the Task 3 dump until the owner retires
  the old folder for good.

## Rolling back

Possible at any point before Task 6 Step 2. Administrator cmd, `conda
activate ccwebdb`:

```console
schtasks /end /tn "ccwebdb api"
sc stop ccwebdb-postgres
cd /d %USERPROFILE%\dev
if not exist classobjects-ccwebdb\.pgdata move ccweb\.pgdata classobjects-ccwebdb\.pgdata
if not exist classobjects-ccwebdb\media move ccweb\media classobjects-ccwebdb\media
pg_ctl unregister -N ccwebdb-postgres
pg_ctl register -N ccwebdb-postgres -D "%USERPROFILE%\dev\classobjects-ccwebdb\.pgdata" -S auto
sc start ccwebdb-postgres
copy /y C:\caddy\Caddyfile.pre-ccweb C:\caddy\Caddyfile
```

Then put `classobjects-ccwebdb` back in `api.cmd`, run `schtasks /run /tn
"ccwebdb api"` and `net stop caddy` / `net start caddy`. From the old
checkout, run `.\scripts\ccweb_backup.cmd /schedule 20:00`. If the cluster
itself were damaged, restore Task 3's dump into a new database instead
([system-administration.md](../system-administration.md)).

## Afterwards (not part of this plan; each the owner's call)

- Archive or delete GitHub `wnmills3/classobjects-ccwebdb`. Deleting it does
  not clear GitHub support ticket 4888830 (cached pre-rewrite commits), so
  check that ticket first.
- On the development computer: the old `%USERPROFILE%\dev\classobjects-ccwebdb`
  folder, the WSL test clone whose origin is that folder, and the self-hosted
  SonarQube project still keyed `classobjects-ccwebdb` (the repo now says
  `ccweb`).
- Switch `api.cmd` to the documented form (`logpipe.py` rotation,
  [deployment-windows.md](../deployment-windows.md) step 6).
- Remove the duplicate `SALES_TAX_RATE` and `VITE_SHOP_NAME` lines in the
  server's `.env`.
- Delete this plan once the move is done; nothing in it describes the system
  beyond what deployment-windows.md already does.
