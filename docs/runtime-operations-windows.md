# Runtime operations

**What this covers.** Starting, stopping and inspecting the development
runtime: PostgreSQL, the FastAPI backend and the Vite frontend. It also
covers the helper scripts around them: psql, pgAdmin, the quality gate, the
`ccweb_claude.cmd` launcher, and the local SonarQube server.

**Who it is for.** Anyone running the system on this machine, by hand or
from an automated caller.

**Why it matters.** The scripts are the supported way to run the services.
They:

- put the right conda environment in play;
- start PostgreSQL so it survives the shell that started it;
- rotate the logs;
- verify each step rather than assume it.

Starting services another way works, but loses those guarantees (*Running a
service by hand*).

For first-time machine setup, see
[environment-setup-windows.md](environment-setup-windows.md). For backups
and applying a schema release, see
[system-administration.md](system-administration.md). All commands here are
**cmd**, not PowerShell. On Linux, see
[runtime-operations-linux.md](runtime-operations-linux.md): each `.sh` there
does what the `.cmd` of the same name does here.

---

## Quick reference

Run from the repository root (`cd /d %USERPROFILE%\dev\ccweb`).

What is running, and what to run next:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_status.cmd
```

Start PostgreSQL, the API and Vite (run it bare):

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_startup.cmd
```

The same, with Vite answering other machines on the local network too (see
*Opening the console to the local network*):

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_startup.cmd /lan
```

Stop everything:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_shutdown.cmd
```

Stop the servers, leave PostgreSQL running:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_shutdown.cmd /keepdb
```

Every quality gate (code-quality.md); add `fix` to auto-fix first:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_check.cmd
```

Start Claude Code with the env in play; add a session name to resume:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_claude.cmd
```

Psql against ccwebdb; psql's own arguments follow:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_psql.cmd
```

PgAdmin on http://127.0.0.1:5050:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_pgadmin.cmd
```

One proved backup; `/schedule` runs it daily:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_backup.cmd
```

**Run `ccweb_startup.cmd` bare -- never piped or redirected** (no `| more`,
`> file`, `2>&1`). The servers it starts inherit the output handle. A caller
waiting for the pipe to close then waits for as long as the servers run, and
the call hangs. Check the result with `ccweb_status.cmd` instead.

**No need to activate the conda environment first.** Every script that
needs `ccwebdb` puts it in play itself (*The conda environment*). The
scripts locate the repository from their own path, so they work from any
directory when called by full path.

> On a machine with `NoDefaultCurrentDirectoryInExePath` set, a **bare**
> script name (`ccweb_status.cmd`) is not found, even in its own directory.
> Use `.\scripts\...` or the full path, as every command here does. From
> Git Bash, run a script with `cmd //c` and write `--keepdb` for `/keepdb`;
> see [environment-setup-windows.md](environment-setup-windows.md)
> (*Gotchas*).

The addresses, at their defaults, are below. The settings in brackets, in
`.env`, move them, and the scripts and Vite follow:

| | |
|---|---|
| Shop | http://127.0.0.1:5173 (`CCWEB_FRONTEND_HOST`, `CCWEB_FRONTEND_PORT`) |
| Management console | http://127.0.0.1:5173/management |
| API | http://127.0.0.1:8000 (`CCWEB_API_HOST`, `CCWEB_API_PORT`) |
| API docs | http://127.0.0.1:8000/docs |
| Database | localhost:5432/ccwebdb (`DATABASE_URL`; the cluster folder is `CCWEB_DB_CLUSTER_DIR`, default `.pgdata`) |
| Sign in | a manager account: on a trial installation the one named by `FIRST_ADMIN_EMAIL` in `.env`, on a restored one an account from the backup |

### What is live

- **The frontend is the working tree.** Vite serves source files directly.
  So checking out a branch puts that branch's shop and console in front of
  anyone using them -- before it is merged. Never `git stash` or switch
  branches under a running Vite without meaning to.

  A checkout or merge can also leave Vite serving a module from before it,
  even when no content changed. After a merge:
  1. restart Vite;
  2. fetch a changed module
     (`curl -s http://127.0.0.1:5173/src/<path>.jsx`) and find the new code
     in it;
  3. reload any open page.
- **The backend is the code it started with.** uvicorn runs without
  `--reload`, so a merge or checkout changes nothing until the servers are
  restarted (`.\scripts\ccweb_shutdown.cmd /keepdb`, then
  `.\scripts\ccweb_startup.cmd`).

---

## The conda environment and the settings

Every script that runs something from the environment first calls
`scripts\ccweb_env.cmd`. The SonarQube stop and MCP scripts use only podman
and do not.

What `ccweb_env.cmd` does:

- **It finds the environment.** The environment is `CCWEB_CONDA_ENV`
  (default `ccwebdb`). Conda is looked for first in `CCWEB_CONDA_ROOT` when
  that is set. The script reads both from the environment or from `.env`
  itself, since Python is what it is looking for.
- **It puts the environment in play.** It uses the environment if it is
  already active, and activates it if not. The activation lasts only as
  long as the script, so your own shell is left as it was.
- **It sets two variables** for the calling script: `ENVDIR` (the
  environment's folder) and `PGBIN` (PostgreSQL's binaries in it,
  `%ENVDIR%\Library\bin`).
- **It reports failure.** When the environment cannot be put in play, the
  calling script stops with exit 2 (`ccweb_claude.cmd` with 1).
  `ccweb_status.cmd` and `ccweb_shutdown.cmd` carry on and report it.

"Already active" is checked against `PATH`, not only the variables that
describe it. Git Bash rebuilds `PATH` and drops the conda entries, while
`CONDA_DEFAULT_ENV`, `CONDA_PREFIX` and `CONDA_SHLVL` survive. So a shell
can claim `ccwebdb` while a bare `python` is base's. The helper accepts the
claim only when the first `python` on `PATH` is the environment's own.

Activating matters even though the scripts name their programs by full
path. The path fixes *which* python runs, not what environment it installs
into or passes on. uv follows `UV_PROJECT_ENVIRONMENT`, conda follows
`CONDA_PREFIX`, and every server a script starts inherits the same
variables.

The helper also fills in `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` when a
shell lacks them: from `HOMEDRIVE`+`HOMEPATH`, then
`%SystemDrive%\Users\%USERNAME%`. Without a home directory,
`conda activate` stops with *Could not determine home directory*. Conda is
found through `CCWEB_CONDA_ROOT`, then `CONDA_EXE`, then `conda.bat` on
`PATH`, then the home directory.

**Then each script calls `scripts\ccweb_settings.cmd`.** It asks the
environment's Python for every port, host and folder the script uses
(`python -m app.runtime_settings`, in `backend`). The values come from
`.env`, then from the defaults written there and in `.env.example`.

- No script writes a port or a folder of its own, so changing one in `.env`
  moves every script with it.
- A variable already set in the shell wins over `.env`, as it does for the
  API.
- A value `.env` gets wrong -- `CCWEB_API_PORT=80a` -- stops the script with
  exit 2 and a message naming the setting, never its value.
  `ccweb_claude.cmd` and `ccweb_shutdown.cmd` exit 1 instead;
  `ccweb_status.cmd` reports it and carries on.

---

## Checking what is running

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_status.cmd
```

Run this first when something seems wrong, and to check a start or stop. It
starts and stops nothing. It reports the environment and each service, then
either the URLs or the command to start what is missing.

**The first line** says whether `ccwebdb` was **active in this shell** or
**activated for this check**; the second is normal. **NOT AVAILABLE** means
the environment could not be put in play. Every service is then *UNKNOWN*,
with no address, for two reasons:

- without the environment's Python, there are no settings to say which
  ports to look at;
- with no `pg_isready`, a failed check would look exactly like "stopped".

A setting `.env` gets wrong gives the same *UNKNOWN*, saying so.

**Each service is checked twice** where it can be, because a listening port
says only that something holds it.

- The backend is also asked for `/api/reference/item_kind`, which is public
  and reads the database. A 200 means the API is up *and* talking to
  PostgreSQL.
- The frontend is asked for `/management`.
- A port held with no answer is reported as **LISTENING but not
  answering**, never rounded up to RUNNING.

**On a server**, no Vite runs: Caddy serves the build. So when nothing holds
the frontend's port and `CCWEB_SITE_DOMAIN` is set, `/management` is asked
of this machine's own Caddy instead. This uses curl's `--connect-to`, which
still checks the certificate against the domain. An answer reads
**RUNNING   the build, served by Caddy**. With no answer there either, the
frontend reads stopped, as on a development machine with Vite not started.

**SonarQube** (`CCWEB_SONAR_PORT`, default 9000) is listed but never counted
as down. It is inspected on demand, not part of the runtime.

| Exit code | Meaning |
|---|---|
| 0 | everything required is up |
| 1 | something required is down or degraded |
| 2 | the environment itself is not ready -- `ccwebdb` cannot be activated, a setting in `.env` is refused, or, with something down, no PostgreSQL cluster or no `node_modules` |

---

## What startup does

`.\scripts\ccweb_startup.cmd` brings up whatever is not already running.

1. **Preflight.** The conda environment, the cluster
   (`CCWEB_DB_CLUSTER_DIR`) and `frontend\node_modules` must exist.
   Otherwise it stops (exit 1) with a pointer to the setup doc or, for
   `node_modules`, the `npm install` to run. An environment that cannot be
   activated, or a setting `.env` gets wrong, exits 2.
2. **PostgreSQL.** Started in a console of its own
   (`scripts\ccweb_pgstart.cmd`), unless `pg_isready` says it is up.
3. **Backend.** `uvicorn app.main:app` on
   `CCWEB_API_HOST`:`CCWEB_API_PORT` (127.0.0.1:8000), in a minimized
   window, with no `--reload`.
4. **Frontend.** Vite on `CCWEB_FRONTEND_HOST`:`CCWEB_FRONTEND_PORT`
   (127.0.0.1:5173), in a minimized window.
5. **Waits** for PostgreSQL, the backend's `/health` and Vite to answer, up
   to 60 tries each, then reports. A try that gets no answer takes up to two
   seconds, and a second passes before the next. So a service that never
   answers is given up on after one to three minutes. A service that does
   not answer stops the script with exit 1 and the log to read. That
   includes a backend that holds its port without answering `/health`.
6. **Records PIDs** in `.runtime\ccweb.pids`.

**It is safe to re-run.** Anything already listening is left alone and
reported as `already running`. On the API's port, that means only a
listener that answers `/health` with `{"status":"ok"}`. Any other program
holding that port is reported as taking it. Startup then exits 1 without
starting the frontend, which would send `/api` to it.

## What shutdown does

`.\scripts\ccweb_shutdown.cmd` stops the servers and, unless given
`/keepdb` (or `--keepdb`), PostgreSQL.

1. **Stops the backend and frontend** by the PIDs in `.runtime\ccweb.pids`,
   with `taskkill /T` so child processes go too. A recorded PID is used only
   while it is still that program: `python.exe` for the backend, `node.exe`
   for the frontend. The file outlives a reboot, and Windows gives a freed
   PID to whatever starts next.
2. **Sweeps the API and frontend ports** for survivors. This is the safety
   net when the PID file is missing or stale, or a service was started by
   hand. A survivor is stopped only when it is the program startup runs
   there: `python.exe` or `uvicorn.exe` on the API's port, `node.exe` on the
   frontend's. Any other is named (`which is not uvicorn - left alone`) and
   left running, and the port is reported still held.
3. **Stops PostgreSQL** with `pg_ctl -m fast` (skipped with `/keepdb`).
4. **Verifies**, and exits 1 if anything still holds a port, or the
   database still accepts connections when it should not.

An unrecognized argument is refused (exit 2) rather than ignored. Git Bash
rewrites `/keepdb` into a path, and ignoring it would stop a database the
caller asked to keep.

If the conda environment cannot be activated, or `.env` holds a setting it
refuses, the servers in the PID file are still stopped. The port sweep and
PostgreSQL, whose addresses are then unknown, are reported as skipped, and
the exit code is 1.

## Starting a Claude Code session

This is optional. It needs Claude Code installed for this account: the
launcher expects `claude` on `PATH` or in `%USERPROFILE%\.local\bin` (see
https://docs.anthropic.com/en/docs/claude-code).

New session:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_claude.cmd
```

Resume, searching for "ccweb":

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_claude.cmd ccweb
```

Extra flags pass through:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_claude.cmd ccweb --effort high
```

Report the environment and the database, starting nothing:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_claude.cmd /check
```

Skip the database check; other arguments may follow:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_claude.cmd /nodb
```

The launcher:

1. activates `ccwebdb`;
2. starts PostgreSQL if it is not running, since nearly any work here needs
   it;
3. changes to the repository root;
4. starts Claude Code.

It does not start the API or Vite. `/check` starts nothing, PostgreSQL
included: it reports whether the database is running and stops. With an
argument, the launcher runs `claude --resume` with every argument passed
on. `--resume` takes a session id or any other value as a search term, so a
session name works.

PostgreSQL gets its own console because the postmaster spawns a process per
connection, each inheriting its console. Started from a shell that later
exits, such as Claude Code's, the server keeps running while every new
connection dies.

## The other scripts

- **`ccweb_psql.cmd`** runs psql against the database `DATABASE_URL` names,
  with every argument passed through (`-c "select ..."`, `-f file.sql`).
  Unset `PG*` variables default to that database's host, port, database,
  user and password. Set `PGDATABASE` (or any other) first to point it
  elsewhere.
- **`ccweb_backup.cmd`** takes one whole backup into `CCWEB_BACKUP_DIR`
  (unset: `%USERPROFILE%\ccwebdb-backup`). It proves the backup, and only
  then removes what is obsolete. It appends what it did to `backup.log` in
  the logs folder, and exits 1 when the backup could not be proved. Its
  options:
  - `/schedule [HH:MM]` creates the daily scheduled task `ccwebdb backup`,
    at `CCWEB_BACKUP_TIME` (20:00) when no time is given. It needs an
    administrator cmd, and exits 1 without one.
  - `/unschedule` deletes the task; `/scheduled` shows it.
  - Any other argument, or an environment or setting that is refused,
    exits 2.

  The task reads `.env` like the script, so a folder set there reaches a
  run made while signed out. See `system-administration.md`, *The routine
  backup*.
- **`ccweb_pgadmin.cmd`** starts pgAdmin 4 on http://127.0.0.1:5050
  (`CCWEB_PGADMIN_PORT`) and opens the browser. The connection to
  `DATABASE_URL`'s database is registered (from the template
  `scripts\pgadmin-servers.json`), and there is no login screen. Close the
  "pgAdmin 4" window to stop it. pgAdmin is not a project dependency:
  install it once with `uv tool install --python 3.13 pgadmin4`. It needs
  3.13 because a dependency has no wheel for newer Pythons.
- **`ccweb_check.cmd`** runs every quality gate; `fix` reformats and
  auto-fixes first. See [code-quality.md](code-quality.md).
- **`ccweb_testdb.cmd`** creates and starts a cluster for the tests alone
  (`stop`, `status`, `use`); see *A cluster for the tests*.
- **`ccweb_api.cmd`** runs the API alone in the foreground, as a production
  server's service does
  ([deployment-windows.md](deployment-windows.md), step 6). Development
  uses `ccweb_startup.cmd` instead.
- **Helpers** are called by the scripts above rather than run directly:
  - `ccweb_env.cmd`: the conda environment;
  - `ccweb_settings.cmd`: the settings;
  - `ccweb_logdir.cmd`: sets the log folder from `CCWEB_LOG_DIR`;
  - `ccweb_portpid.cmd`: the process listening on a port, through
    `backend\app\portpid.py`;
  - `ccweb_wait.cmd`: waits for a URL to answer or PostgreSQL to accept
    connections;
  - `ccweb_pgstart.cmd`: starts PostgreSQL in its own console.

---

## Files it produces

```
.runtime\ccweb.pids            backend / frontend PIDs and start time
logs\backend.log               uvicorn output
logs\frontend.log              Vite output
logs\postgres.log              pg_ctl start output, then the server log
logs\pg_stop.log               pg_ctl stop output
logs\backup.log                what each ccweb_backup.cmd run did
```

When something fails to start, the scripts print the log to read first.
[logs/README.md](../logs/README.md) describes every log file, which of them
rotate and how, and the `CCWEB_LOG_DIR`, `CCWEB_LOG_KEEP` and
`CCWEB_LOG_MAX_BYTES` settings. `.runtime\`, `.pgdata\` and everything in
`logs\` but its README are gitignored.

---

## SonarQube (local server)

A self-hosted SonarQube keeps the code-quality dashboard and backs the
`mcp__sonarqube__*` tools. It is optional: nothing in the runtime needs it.

**Before the first start**, install Podman, which is a prerequisite: install
Podman for Windows (podman.io) and run `podman machine init` once.

Start the server and its database:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_sonar_start.cmd
```

Run tests with coverage and publish an analysis:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_sonar_scan.cmd
```

Stop the server, keeping its data:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_sonar_stop.cmd
```

The dashboard is at http://localhost:9000 (`CCWEB_SONAR_PORT`), project
`ccweb`.

- The server and its database run as podman containers (`sonarqube`,
  `sonar-db`) on the `sonar-net` network.
- The server is bound to 127.0.0.1, and the database publishes no host
  port.
- The start script starts the podman machine if it is not running.
- All state is in four named volumes: `sonar-db-data`, `sonarqube-data`,
  `sonarqube-extensions` and `sonarqube-logs`. Stopping keeps them;
  `podman volume rm` destroys the analysis history and admin account.

`ccweb_sonar_scan.cmd` needs the server running and `SONAR_TOKEN` in the
environment. The scanner runs in a container and cannot read the host
keychain. Set the token in the window first:

```console
set /p SONAR_TOKEN=SonarQube token:
```

**On a fresh server**, get a token this way:

1. Log in at http://localhost:9000 as `admin` / `admin`.
2. Complete the forced password change.
3. Generate a token at http://localhost:9000/account/security.

The scan runs the Python and frontend test suites first, with coverage, and
refuses to publish if either fails.

`scripts\ccweb_sonar_mcp.cmd` launches the SonarQube MCP server behind the
`mcp__sonarqube__*` tools. It also needs `SONAR_TOKEN`. Why it exists rather
than `sonar run mcp` is in
[specs/self-hosted-sonarqube-design.md](specs/self-hosted-sonarqube-design.md).

`.mcp.json` at the repo root points the MCP client at it. The file is
gitignored and hand-managed. **Re-running `sonar integrate claude`
overwrites it** with `sonar run mcp`. That cannot reach the server unless
this user's CLI configuration names `sonar-net` and
`http://sonarqube:9000`. Restore the file to:

```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "scripts\\ccweb_sonar_mcp.cmd"
    }
  }
}
```

---

## Design notes

**PostgreSQL is stopped with `pg_ctl`, never `taskkill`.** A forced stop
leaves the cluster needing crash recovery. `-m fast` rolls back open
transactions and writes a shutdown checkpoint. The log should end with
`database system is shut down`.

**Success is verified, not assumed.**

- Both scripts create `.runtime\` and the log directory before anything
  writes there. In cmd, a failed redirect skips the command attached to it
  and reports the redirect's exit code.
- Shutdown trusts `pg_isready` over `pg_ctl`'s exit code.

**Every server writes through a pipe** into `backend\app\logpipe.py`, which
rotates the files ([logs/README.md](../logs/README.md), *How the files
rotate*).

- PostgreSQL's own logging collector is turned off for this. It can bound a
  file's size, but not how many files it leaves.
- `pg_ctl stop` writes to `pg_stop.log`, because the running server holds
  the start pipe.
- `PYTHONUNBUFFERED=1` keeps uvicorn's lines from lagging.

**No `--reload`.** uvicorn runs as one process, so the PID holding the port
is the one to kill. `--reload` adds a supervisor and a worker, and killing
the wrong one leaves the other to respawn.

**Pure cmd.** The scripts themselves use no PowerShell. (Conda's own
activation calls it to name a temporary file, and succeeds without it.)
Instead:

- the process on a port comes from `backend\app\portpid.py`;
- readiness comes from `curl`;
- sleeps come from `ping -n 2 127.0.0.1 >nul`. `timeout` needs a real
  console, and returns at once, with no pause, when stdin is redirected;
- process trees are stopped with `taskkill /T`.

Not `netstat`: on some Windows builds it misreads a listening socket's
state and leaves the row out, so a held port reads as free. `portpid.py`
reads the same table and tells a listener by its empty remote address
instead.

---

## Opening the console to the local network

By default Vite answers `127.0.0.1` only, so no other machine can reach it.
`/lan` (or `--lan` from Git Bash) binds it to `0.0.0.0` instead.

- The API and PostgreSQL stay on this machine.
- The browser reaches the API through Vite's `/api` proxy, as it always
  does.
- Sign-in works from another machine: the tokens live in that browser.

`/lan` applies only when the startup script starts Vite. If Vite is already
running on loopback, the script says `/lan changed nothing`. Stop the
servers and start again:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_shutdown.cmd /keepdb
```

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_startup.cmd /lan
```

At the end, the script lists an address for each network adapter, such as
`http://192.168.1.20:5173/management`. The address is `http`, not `https`:
Vite's dev server has no certificate.

**Allow the port through the firewall, once.** Windows blocks the port from
other machines until a firewall rule allows it. The script says when the
rule is missing. Run this in a cmd window run as administrator:

```console
netsh advfirewall firewall add rule name="ccweb frontend LAN" dir=in action=allow protocol=TCP localport=5173 remoteip=localsubnet
```

5173 is the default; the rule the script prints names `CCWEB_FRONTEND_PORT`
when `.env` sets another. `remoteip=localsubnet` admits only machines on the
same network.

Never forward the port on the router: the dev server serves the source tree
and is not built to face the internet. Reaching the system from outside is
[deployment-windows.md](deployment-windows.md).

To close the port again:

```console
netsh advfirewall firewall delete rule name="ccweb frontend LAN"
```

The next start without `/lan` puts Vite back on loopback.

---

## A cluster for the tests

The test suite builds and drops its own databases. On a computer whose
`DATABASE_URL` names a cluster it shares, or one it does not run, the tests
should not build them there. `ccweb_testdb.cmd` gives the computer a cluster
of its own for them:

- in `CCWEB_TEST_DB_CLUSTER_DIR` (default `.pgdata.test`);
- on `CCWEB_TEST_DB_PORT` (default 5433, which must not be
  `DATABASE_URL`'s).

The first run creates it; later runs start it:

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_testdb.cmd
```

Once it exists, `ccweb_check.cmd` and `ccweb_sonar_scan.cmd` start it when
needed and run the tests there. So the tests never build their databases in
the collection's cluster. It holds only what a test session builds and
drops, under the development password.

- `.\scripts\ccweb_testdb.cmd stop` stops it, and `status` reports it.
- For `pytest` on its own, set `TEST_DATABASE_URL` to the line it prints.
  Or let `call .\scripts\ccweb_testdb.cmd use` start the cluster if needed
  and set it in the current cmd, as the gate does.

---

## One database, two computers

A cluster folder can be shared between two computers -- through OneDrive,
say, with `.pgdata` on each a junction to the shared folder. Either computer
can then run the one database, one at a time. The scripts guard against the
danger this brings, but a server open to the public should not work this
way. The example installation does not:

- its cluster is on the server's own disk;
- the service starts with the machine;
- the development computer reaches the collection through the site.

**Two servers on the one cluster would ruin it**, and PostgreSQL cannot see
the other computer. Finding a `postmaster.pid` with no server of its own
behind it, PostgreSQL takes the file for a crash's leftover, deletes it and
starts.

- So `ccweb_pgstart.cmd` refuses to start while `.pgdata\postmaster.pid`
  exists. That is the file a running server keeps, synced from the other
  computer. When the other computer has certainly stopped and the file is
  still there (a crash leaves it too), delete it and start again.
- The `ccwebdb-postgres` service does not go through that script.
  Registered to start with the machine, it would start under the other
  computer after any reboot. So a shared cluster's service has to start by
  hand (`sc.exe config ccwebdb-postgres start= demand`, from an
  administrator cmd). The server is then down after every reboot until
  someone starts it.

**The sync service brings troubles of its own.**

- It locks files as it uploads them. Dropping a database can leave its
  folder behind in `base` (PostgreSQL warns `could not remove directory`).
- It copies files while the server writes them. The other computer can
  hold a half-written cluster until the server stops and the folder syncs
  again.
- OneDrive runs only while someone is signed in. A server started at boot
  writes to a folder that syncs nothing until then.

To move the work from one computer to the other:

1. Stop PostgreSQL where it runs.
2. Wait until the sync service shows the folder up to date on both
   computers.
3. Only then start it on the other.

The tests never use the shared cluster: each computer has a test cluster of
its own, outside the shared folder (*A cluster for the tests*, above).

---

## Running a service by hand

Do this for `--reload` during active backend work, or to watch output
directly. Start the database first, then each of the others in a window of
its own.

The database:

```console
cd /d %USERPROFILE%\dev\ccweb
conda activate ccwebdb
start "ccweb-postgres" /min pg_ctl -D .pgdata -l logs\postgres-by-hand.log start
pg_isready -h localhost -p 5432
```

The backend, with auto-reload, in a second window:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
conda activate ccwebdb
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The frontend, in a third:

```console
cd /d %USERPROFILE%\dev\ccweb\frontend
conda activate ccwebdb
npm run dev
```

What to know about servers started this way:

- A server started this way belongs to that window's console, and breaks
  when the window closes (see *Troubleshooting*). Prefer
  `ccweb_startup.cmd` for the database.
- In a non-interactive shell, `pg_ctl start` can appear to hang, because
  the server inherits stdout. Check with `pg_isready` rather than waiting.
- A log written this way is not rotated.
- `.\scripts\ccweb_shutdown.cmd` still cleans these up: the port sweep
  catches what the PID file does not know about.

---

## Troubleshooting

**`[WinError 10013] An attempt was made to access a socket in a way forbidden
by its access permissions`** -- this is almost never permissions. Either
something is already listening, or Windows has reserved the port range
(Hyper-V / WSL). The first command below prints the process ID holding the
port, or nothing. The second lists the reserved ranges:

```console
cd /d %USERPROFILE%\dev\ccweb
conda activate ccwebdb
python backend\app\portpid.py 8000
netsh interface ipv4 show excludedportrange protocol=tcp
```

`.\scripts\ccweb_shutdown.cmd` clears the first. For the second, change the
port or remove the reservation.

**`ccweb_startup.cmd` never returns** -- it was piped or redirected. The
servers are probably running. Check with `.\scripts\ccweb_status.cmd`, and
run startup bare next time.

**`pg_ctl` not recognized** -- the conda environment is not active.
Activate it, or use the scripts.

**Startup reports FAILED but the service seems fine** -- the wait is 60
tries, one to three minutes. A first Vite run after `npm install` can
exceed it while it pre-bundles dependencies. Check `logs\frontend.log` and
re-run startup; it adopts whatever is already listening.

**The console shows old frontend code after a merge** -- Vite is serving a
stale module. Restart it (`.\scripts\ccweb_shutdown.cmd /keepdb`, then
`.\scripts\ccweb_startup.cmd`) and reload the page.

**Stale PID file** after a reboot without a clean shutdown -- shutdown
reports `pid N is not a running python.exe - left alone` (or `node.exe`).
It says so whether nothing has that PID or another program does, and falls
through to the port sweep.

**PostgreSQL holds port 5432 but `pg_isready` gets no response**, and the
log shows children dying with `0xC0000142` -- the server was started from a
console that has since closed. `pg_ctl stop` will not work. No reboot is
needed:

1. Kill the postmaster with `taskkill /PID <pid> /T /F`.
2. Kill any surviving `postgres.exe` (it keeps the listening socket).
3. Start again with `.\scripts\ccweb_startup.cmd`.

*Rejecting connections* during the next start is WAL recovery, not failure.
