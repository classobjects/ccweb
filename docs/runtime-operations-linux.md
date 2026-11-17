# Runtime operations on Linux

**What this covers.** Starting, stopping and inspecting the development
runtime on Linux -- PostgreSQL, the FastAPI backend and the Vite frontend --
plus the helper scripts around them.

This is the Linux counterpart of
[runtime-operations-windows.md](runtime-operations-windows.md). Each
`scripts/*.sh` does what the `.cmd` of the same name does there, with the
same output and exit codes. The reasons behind each step are written there,
and hold here too.

For first-time setup see [environment-setup-linux.md](environment-setup-linux.md);
for backups and applying a schema release see
[system-administration.md](system-administration.md). All commands here are
**bash**.

---

## Quick reference

What is running, and what to run next:

```console
cd ~/dev/ccweb
./scripts/ccweb_status.sh
```

Start PostgreSQL, the API and Vite:

```console
cd ~/dev/ccweb
./scripts/ccweb_startup.sh
```

The same, with Vite answering other machines on the local network too:

```console
cd ~/dev/ccweb
./scripts/ccweb_startup.sh --lan
```

Stop everything:

```console
cd ~/dev/ccweb
./scripts/ccweb_shutdown.sh
```

Stop the servers, leave PostgreSQL running:

```console
cd ~/dev/ccweb
./scripts/ccweb_shutdown.sh --keepdb
```

Run every quality gate (code-quality.md); add `fix` to auto-fix first:

```console
cd ~/dev/ccweb
./scripts/ccweb_check.sh
```

Run psql against the database `DATABASE_URL` names; psql's own arguments
go after it:

```console
cd ~/dev/ccweb
./scripts/ccweb_psql.sh
```

Take one backup and prove it; `--schedule` runs it daily:

```console
cd ~/dev/ccweb
./scripts/ccweb_backup.sh
```

The others -- `ccweb_claude.sh`, `ccweb_pgadmin.sh`, `ccweb_testdb.sh` and
the SonarQube scripts -- are described below.

- **No need to activate the conda environment first.** Every script puts it
  in play itself.
- **Unlike the Windows scripts, these may be piped or redirected.** The
  servers they start run in sessions of their own and keep no handle of the
  caller's.

The addresses, at their defaults. The settings in brackets, set in `.env`,
move them:

| | |
|---|---|
| Shop | http://127.0.0.1:5173 (`CCWEB_FRONTEND_HOST`, `CCWEB_FRONTEND_PORT`) |
| Management console | http://127.0.0.1:5173/management |
| API | http://127.0.0.1:8000 (`CCWEB_API_HOST`, `CCWEB_API_PORT`) |
| API docs | http://127.0.0.1:8000/docs |
| Database | localhost:5432/ccwebdb (`DATABASE_URL`; the cluster folder is `CCWEB_DB_CLUSTER_DIR`, default `.pgdata`) |

Under WSL, a browser on Windows reaches them at the same addresses.

**What is live** is as on Windows. Vite serves the working tree, so a
checkout changes at once what anyone using the console sees. uvicorn runs
without `--reload`: it serves the code it started with until the servers
are restarted.

---

## The conda environment and the settings

To work in a terminal with the environment active, source the environment
script yourself:

```console
cd ~/dev/ccweb
. scripts/ccweb_env.sh
```

Every script that runs something from the environment starts this way:

1. **It sources `scripts/ccweb_env.sh`.** This finds conda (through
   `CCWEB_CONDA_ROOT`, `CONDA_EXE`, `conda` on `PATH`, then
   `~/miniforge3`), activates `CCWEB_CONDA_ENV` (default `ccwebdb`) unless
   it is already active, and sets `ENVDIR` and `PGBIN` (`$ENVDIR/bin`).
2. **Then `scripts/ccweb_settings.sh`** asks the environment's Python for
   every port, host and folder (`python -m app.runtime_settings`). Each
   comes from `.env`, else from its default. A variable already exported in
   the shell wins over `.env`.

A value `.env` gets wrong stops the script with exit 2 and a message naming
the setting, never its value.

---

## What the scripts do differently from Windows

- **Detached servers.** Startup runs PostgreSQL, uvicorn and Vite each with
  `setsid nohup`, in a session of its own with its log writer, so each
  outlives the terminal that started it. `.runtime/ccweb.pids` records the
  process group of each server it started (`backend=`, `frontend=`). The
  entry is empty for one that was already running.
- **Stopping.** Shutdown works in three passes:
  1. It stops each recorded group, but only while `pgrep` still finds
     `uvicorn` or `vite` in it, because a process group number is reused
     after a reboot. It sends `TERM`, then `KILL` after ten seconds, so the
     log writer goes with its server.
  2. It sweeps the API and frontend ports. It stops a listener only when
     its command line names `uvicorn` (the API's port) or `vite` (the
     frontend's), and names any other as left alone.
  3. It stops PostgreSQL with `pg_ctl -m fast`.
- **Starting again.** A listener already on the API's port counts as the
  API only when `/health` answers `{"status":"ok"}`. Any other program
  there is reported as taking the port, and startup exits 1.
- **Ports.** `ss` says which process holds a port. A port held by another
  user's process has no pid in `ss`. `ccweb_portpid.sh` prints `?` for it,
  and the port is reported as held, never as free.

`ccweb_status.sh` checks and reports exactly as its Windows twin does, exit
codes included: [runtime-operations-windows.md](runtime-operations-windows.md),
*Checking what is running*.

## Starting a Claude Code session

Optional. It needs Claude Code installed for this account: the launcher
expects `claude` on `PATH` or in `~/.local/bin` (see
https://docs.anthropic.com/en/docs/claude-code).

```console
cd ~/dev/ccweb
./scripts/ccweb_claude.sh
```

It starts PostgreSQL when it is not running, as the Windows twin does. What
may follow it:

- a session name resumes that session;
- `--check` reports the environment and the database and starts nothing,
  PostgreSQL included;
- `--nodb` leaves PostgreSQL alone.

## The other scripts

- **`ccweb_psql.sh`** runs psql with every argument passed through. It
  connects with `DATABASE_URL`'s host, port, database, user and password,
  unless `PG*` variables say otherwise.
- **`ccweb_backup.sh`** takes one whole backup into `CCWEB_BACKUP_DIR`
  (unset: `~/ccwebdb-backup`). It proves the backup, and only then removes
  what is obsolete. It logs to `backup.log`.
  - `--schedule [HH:MM]` installs a systemd user timer
    (`ccwebdb-backup.timer`, from `deploy/linux/`) at `CCWEB_BACKUP_TIME`,
    and turns on lingering, so the timer runs whether or not you are signed
    in. Where there is no systemd user manager, it prints the crontab line
    to add instead.
  - `--unschedule` removes the timer; `--scheduled` shows it.
- **`ccweb_pgadmin.sh`** starts pgAdmin 4 on http://127.0.0.1:5050
  (`CCWEB_PGADMIN_PORT`), with the connection to `DATABASE_URL`'s database
  registered, and opens a browser (`wslview` under WSL, else `xdg-open`).
  Install pgAdmin once with `uv tool install --python 3.13 pgadmin4`. Stop
  it with `pkill -f pgadmin4`.
- **`ccweb_check.sh`** runs every quality gate; `fix` reformats and
  auto-fixes first. See [code-quality.md](code-quality.md).
- **`ccweb_testdb.sh`** is the test cluster (below).
- **`ccweb_api.sh`** runs the API alone in the foreground, as the Windows
  service runs `ccweb_api.cmd`. Use the script on a host without systemd.
  A Linux server runs the systemd unit instead
  ([deployment-linux.md](deployment-linux.md)), and development uses
  `ccweb_startup.sh` instead.
- **Sourced helpers:** `ccweb_env.sh`, `ccweb_settings.sh`,
  `ccweb_logdir.sh`, `ccweb_portpid.sh` (`portpid`: the process listening
  on a port), `ccweb_wait.sh` (`pgready`, `waitpg`, `waiturl`).
  `ccweb_pgstart.sh` starts PostgreSQL detached.

## Files it produces

```
.runtime/ccweb.pids            backend / frontend process groups and start time
logs/backend.log               uvicorn output
logs/frontend.log              Vite output
logs/postgres.log              pg_ctl start output, then the server log
logs/pg_stop.log               pg_ctl stop output
logs/backup.log                what each ccweb_backup.sh run did
```

[logs/README.md](../logs/README.md) describes every log file and how they
rotate.

---

## A cluster for the tests

The tests build and drop their databases in a cluster of this computer's
own, as on Windows
([runtime-operations-windows.md](runtime-operations-windows.md), *A cluster
for the tests*). It is in `CCWEB_TEST_DB_CLUSTER_DIR` (default
`.pgdata.test`), on `CCWEB_TEST_DB_PORT` (default 5433). The first run
creates it; later runs start it:

```console
cd ~/dev/ccweb
./scripts/ccweb_testdb.sh
```

- `stop` and `status` do what they say.
- `ccweb_check.sh` and `ccweb_sonar_scan.sh` use the cluster by themselves
  once it exists.

For `pytest` on its own, source the script with `use`, so it sets
`TEST_DATABASE_URL` in your shell:

```console
cd ~/dev/ccweb
. scripts/ccweb_testdb.sh use
```

---

## SonarQube (local server)

Optional, as on Windows. Podman runs natively on Linux, so there is no
podman machine. Install it once with `sudo apt-get install -y podman`.

Start the server, run a scan, and stop the server:

```console
cd ~/dev/ccweb
./scripts/ccweb_sonar_start.sh
```

```console
cd ~/dev/ccweb
./scripts/ccweb_sonar_scan.sh
```

```console
cd ~/dev/ccweb
./scripts/ccweb_sonar_stop.sh
```

The scan needs `SONAR_TOKEN` in the environment. Read it with `read -rs`,
which keeps it off the screen and out of the shell's history:

```console
read -rs SONAR_TOKEN
```

Then export it:

```console
export SONAR_TOKEN
```

On a Linux machine, the MCP launcher in `.mcp.json` (machine-local and
gitignored) is the `.sh` twin:

```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "scripts/ccweb_sonar_mcp.sh"
    }
  }
}
```

The SonarQube secrets hooks under `.claude/` are machine-local too. On
Linux they run under bash (`"command": "sonar hook claude-pre-tool-use"`,
each guarded by `command -v sonar`), not through `powershell -File`.

---

## Opening the console to the local network

`./scripts/ccweb_startup.sh --lan` binds Vite to `0.0.0.0`; the API and
PostgreSQL stay on this machine. At the end, it lists the machine's
addresses.

With the `ufw` firewall active, allow the port from the local network
only. `YOUR_SUBNET` is this network's range, such as `192.168.1.0/24`. 5173
is `CCWEB_FRONTEND_PORT`'s default.

```console
sudo ufw allow from YOUR_SUBNET to any port 5173 proto tcp
```

Never open it to the internet. Under WSL, other machines cannot reach
WSL's ports through Windows without a port proxy; use a real Ubuntu machine
for that.

---

## Running a service by hand

Run the servers by hand for `--reload` during active backend work. Use a
separate terminal for each, with the environment active:

```console
cd ~/dev/ccweb
pg_ctl -D .pgdata -l logs/postgres-by-hand.log start
```

```console
cd ~/dev/ccweb/backend
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```console
cd ~/dev/ccweb/frontend
npm run dev
```

`./scripts/ccweb_shutdown.sh` still cleans these up through its port sweep.

---

## Troubleshooting

**`[Errno 98] Address already in use`** -- something holds the port.
`ss -ltnp 'sport = :8000'` names it; `./scripts/ccweb_shutdown.sh` stops
ours.

**`postmaster.pid` exists but nothing runs** after a crash or a hard stop
-- `ccweb_pgstart.sh` refuses to start, in case another computer sharing
the cluster folder runs it. Once that is ruled out, delete
`.pgdata/postmaster.pid` and start again.

**`$'\r': command not found`** -- a script with Windows line endings; see
[environment-setup-linux.md](environment-setup-linux.md), *Gotchas*.

**The console shows old frontend code after a merge** -- restart Vite
(`./scripts/ccweb_shutdown.sh --keepdb`, then `./scripts/ccweb_startup.sh`)
and reload the page.
