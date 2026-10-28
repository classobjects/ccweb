# Settings

Every setting the code reads, in one place: whether it must be set, its
default, the values it takes, and what has to happen before a change is
seen. The template is [`.env.example`](../.env.example), which lists the
same keys; a test fails when either names a key the code does not read, or
leaves one out.

**Where they come from.** The repository's `.env`, or an environment
variable of the same name, which wins over `.env`. The names are the fields
of `backend/app/config.py` (the API's) and `backend/app/runtime_settings.py`
(the ones the scripts read too), upper-cased.

**What is refused.** Each refusal stops the API (or the script) at start-up
with a message naming the setting -- never its value, which may be a
secret:

- **A name that is no setting.** A misspelt `JWT_SECRET` would otherwise
  leave the key unset without a word. This is also why a new setting goes
  into a server's `.env` only after the code that reads it is pulled.
- **A value out of range**, as each row below says.
- **For a setting the scripts read**, a value cmd cannot carry intact: one
  holding `"`, `%`, `!` or a line break.

**Empty is the default.** `KEY=` with nothing after it means unset for a
number, a folder or a true/false. For text it is an empty value, which
several settings below give a meaning of its own (`TIME_ZONE=`: the
computer's zone).

**A relative folder** is taken from the repository root, except
`PHOTO_LIBRARY_ROOT` and `MEDIA_ROOT` as noted.

**When a change is seen** -- the last column:

- *API restart*: read once when the API starts. On a development machine
  `.\scripts\ccweb_shutdown.cmd /keepdb` then `.\scripts\ccweb_startup.cmd`
  (Linux: `./scripts/ccweb_shutdown.sh --keepdb`, then
  `./scripts/ccweb_startup.sh`); on a server `schtasks /end /tn "ccwebdb
  api"` then `schtasks /run /tn "ccwebdb api"` from an administrator cmd
  (Linux: `sudo systemctl restart ccwebdb-api`).
- *Next script run*: each script reads it as it starts.
- *Frontend build*: written into the pages when they are built, so
  `npm run build` in `frontend` (a running development server: restart it).
- *Caddyfile render*: written into the web server's configuration when it
  is rendered for a public server, then Caddy is restarted
  ([deployment-windows.md](deployment-windows.md), step 7).

## Required

Two settings have no usable default:

- **`JWT_SECRET`**, everywhere: the API does not start without it.
- **`DATABASE_URL`**, on any machine whose database another machine can
  reach: the default's password is published in this repository, and the
  API refuses it for a database that is not on this machine.

`FIRST_ADMIN_PASSWORD` is needed only by `python -m app.seed`, on a trial
installation. Everything else may be left out.

**Before anything outside this machine can reach the system**, also set
`SHOP_OPEN` (`false` until opening day), `CORS_ORIGINS` if the pages are
served from anywhere but the API's own address, and change the password of
any account still on a development one (**People**).

## Database

| Setting | Required | Default | Values | Seen |
|---|---|---|---|---|
| `DATABASE_URL` | on a server | `postgresql+psycopg://ccwebdb:devpassword@localhost:5432/ccwebdb` | a SQLAlchemy address, `postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE`; one that is no database address is refused. Holds the database password. The published password `devpassword` is refused unless the host is this machine (`localhost`, `127.0.0.1`, `::1`). The scripts start the local cluster on its port | API restart; next script run |
| `CCWEB_DB_CLUSTER_DIR` | no | `.pgdata` | the folder of the cluster this machine's scripts start and stop | next script run |
| `CCWEB_TEST_DB_CLUSTER_DIR` | no | `.pgdata.test` | the folder of the tests' own cluster, which they build and drop databases in | next script run |
| `CCWEB_TEST_DB_PORT` | no | `5433` | a port, 1-65535; refused when it is `DATABASE_URL`'s own port on this machine, which would put the tests' databases in the collection's cluster | next script run |
| `TEST_DATABASE_URL` | no | unset: `ccwebdb_test` on the test cluster | an address like `DATABASE_URL`'s, whose database name ends in `_test` and is not the application's own; the tests refuse anything else | next test run |

## Sign-in

| Setting | Required | Default | Values | Seen |
|---|---|---|---|---|
| `JWT_SECRET` | **yes** | none | signs every session: anyone who knows it can make a manager's. At least 32 characters, and not one published in this repository (`config.PUBLISHED_SECRETS`). Make one with `python -c "import secrets; print(secrets.token_hex(32))"`; a different one on every machine | API restart (signs everyone out) |
| `JWT_ALGORITHM` | no | `HS256` | `HS256`, `HS384` or `HS512`: the secret is a shared key, so only an HMAC algorithm works. Leave it | API restart (signs everyone out) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | `30` | whole minutes a session lasts before the browser renews it | API restart |
| `REFRESH_TOKEN_EXPIRE_DAYS` | no | `14` | whole days someone stays signed in without typing a password | API restart |
| `FIRST_ADMIN_EMAIL` | no | `admin@example.com` | the sign-in of the administrator `python -m app.seed` creates | next `app.seed` |
| `FIRST_ADMIN_PASSWORD` | for `app.seed` | none | that administrator's password; `python -m app.create_admin` takes it too, when set, instead of asking. At least 12 characters, and not one published in this repository (`seed.PUBLISHED_PASSWORDS`). Neither command checks an account that already exists | next `app.seed` or `app.create_admin` |

## The shop and purchases

| Setting | Required | Default | Values | Seen |
|---|---|---|---|---|
| `SHOP_OPEN` | no | `true` | `true` or `false`. `false` until opening day: a visitor who is not signed in sees only a coming-soon page and sign-in, and the API refuses them the catalog (403 *The shop is not open yet*) and registration. Signed-in accounts and the console are unaffected; the pages ask `/api/shop`, so no rebuild | API restart |
| `SALES_TAX_RATE` | no | `0`: no tax | a fraction from 0 to 1, not a percentage: `0.0635` is 6.35%. Outside 0-1 is refused, so `6.35` cannot multiply every cost by 7.35. Copied onto each item when it is created (*Sales tax on acquisitions* in [system-administration.md](system-administration.md)) | API restart; items created afterwards |
| `SALES_TAX_INCLUDES_SHIPPING` | no | `true` | `true` or `false`: whether shipping is part of the taxed amount. Copied onto each item like the rate | API restart; items created afterwards |
| `DEFAULT_ITEM_KIND` | no | `coin` | the kind a new item on a purchase starts as; any item can still be given another. An active `item_kind` code -- as shipped: `coin`, `currency`, `bullion`, `set`, `medal`, `token`, `other`, `unknown`. Any other, or a retired one, is refused, naming the kinds there are (not checked when the database is down at start-up) | API restart |
| `TIME_ZONE` | no | empty: the computer's own zone | an IANA zone name, such as `America/New_York`; an unknown name is refused. Decides which day a moment falls on in reports and backup names; stored times are UTC either way. Set it on a server whose clock runs on UTC | API restart |
| `VITE_SHOP_NAME` | no | empty: `Coin Shop` | the shop's name, in its header, page titles and coming-soon page | frontend build |
| `VITE_SHOP_OWNER` | no | empty: no one named | the legal name the footer's copyright line names | frontend build |
| `VITE_DIGICERT_SEAL_ID` | no | empty: no seal | the eight characters after `DigiCertClickID_` in DigiCert's seal code, for the certificate the shop is served under | frontend build |

## The API

| Setting | Required | Default | Values | Seen |
|---|---|---|---|---|
| `API_PREFIX` | no | `/api` | the path every endpoint is under. Changing it moves every endpoint, and the frontend and Caddyfile expect `/api`: leave it | API restart |
| `CORS_ORIGINS` | when served elsewhere | the development server's two: `http://localhost` and `http://127.0.0.1` at `CCWEB_FRONTEND_PORT` | a JSON list of the addresses whose pages may call the API from a browser, such as `["https://classobjects.com"]`. Not needed when Caddy serves the pages and the API at one address | API restart |

## Photographs

| Setting | Required | Default | Values | Seen |
|---|---|---|---|---|
| `MEDIA_ROOT` | no | `media` in the repository | the folder holding `originals` and `derivatives`, best as a full path. **The bytes are not in the database**, so no database backup holds them (`python -m app.media_backup copy` does). The API refuses to start when the folder holds none of the five newest photographs the database names (`MEDIA_ROOT is ..., which holds none of the 5 newest photographs` in `backend.log`); with the database down it logs `photograph folder not checked` and starts | API restart; next script run |
| `PHOTO_LIBRARY_ROOT` | no | `photos` in the repository | where `python -m app.photo_import` looks for files. Give a full path: a relative one is taken from wherever the command was started | next `app.photo_import` |
| `THUMBNAIL_MAX_PX` | no | `320` | pixels, the longest edge of the small rendition | API restart; new photographs only |
| `WEB_MAX_PX` | no | `1600` | pixels, the longest edge of the large rendition. Originals are never served | API restart; new photographs only |
| `MAX_UPLOAD_BYTES` | no | `26214400` (25 MB) | bytes; a larger upload is refused before anything is decoded | API restart |
| `MAX_IMAGE_PIXELS` | no | `50000000` | pixels; a larger image is refused, so a small file that decodes to gigabytes cannot be opened | API restart |

Changing the rendition sizes does not regenerate the photographs already
stored.

## Development server

| Setting | Required | Default | Values | Seen |
|---|---|---|---|---|
| `CCWEB_API_HOST` | no | `127.0.0.1` | the address the scripts start the API on; `frontend/dev-server.json` holds the default, which the frontend reads too | next script run |
| `CCWEB_API_PORT` | no | `8000` | a port, 1-65535 | next script run |
| `CCWEB_FRONTEND_HOST` | no | `127.0.0.1` | the address of the development server | next script run |
| `CCWEB_FRONTEND_PORT` | no | `5173` | a port, 1-65535 | next script run |
| `CCWEB_PGADMIN_PORT` | no | `5050` | a port, 1-65535, for pgAdmin when used | next script run |
| `CCWEB_SONAR_PORT` | no | `9000` | a port, 1-65535, for SonarQube when used | next script run |
| `CCWEB_CONDA_ENV` | no | `ccwebdb` | the conda environment the scripts activate | next script run |
| `CCWEB_CONDA_ROOT` | no | found: from `CONDA_EXE`, then `conda` on `PATH`, then a `miniforge3` folder in the home folder | the conda installation's folder | next script run |

## Logs and backups

| Setting | Required | Default | Values | Seen |
|---|---|---|---|---|
| `CCWEB_LOG_DIR` | no | `logs` | the folder the scripts write logs to ([logs/README.md](../logs/README.md)) | next script run |
| `CCWEB_LOG_KEEP` | no | `3` | how many files of each log are kept, at least 1 | next script run |
| `CCWEB_LOG_MAX_BYTES` | no | `1073741824` (1 GiB) | the size, in bytes and at least 1024, at which a log rolls over | next script run |
| `CCWEB_BACKUP_DIR` | no | `ccwebdb-backup` in the home folder | where the routine backup writes. Somewhere that leaves the machine: a synced folder or a network share | next backup |
| `CCWEB_BACKUP_TIME` | no | `20:00` | the local time of day the scheduled backup runs, `HH:MM` from `00:00` to `23:59`; anything else is refused | `ccweb_backup /schedule` again |
| `CCWEB_ARCHIVE_DIR` | no | `ccwebdb-backups` beside the repository folder | where database dumps, workbook exports and media copies go when a command is given no folder | next command |

## Public site

| Setting | Required | Default | Values | Seen |
|---|---|---|---|---|
| `CCWEB_SITE_DOMAIN` | on a public server | empty | the domain, without `https://` or `www.`, such as `classobjects.com` | Caddyfile render |
| `CCWEB_TLS_CERT` | no | empty | the full path of the certificate chain (`fullchain.pem`). Both empty: Caddy obtains and renews a free certificate itself. One without the other is refused | Caddyfile render |
| `CCWEB_TLS_KEY` | no | empty | the full path of the certificate's key; set with `CCWEB_TLS_CERT` | Caddyfile render |
| `CCWEB_SITE_ROOT` | no | `frontend/dist` | the built pages Caddy serves: a copy it can read where it cannot read the repository | Caddyfile render |
| `CCWEB_CADDY_IMPORT` | no | empty: nothing imported | a Caddyfile, or a pattern such as `C:/caddy/sites/*.caddy`, of other sites the server runs beside the shop, kept outside the repository | Caddyfile render |

## Environment variables that are not `.env` settings

Nothing the API needs to run comes from anywhere but the settings above.
The variables below are read too, but none belongs in `.env`: they are
the system's own, or are set in a command window for one task and gone
when it closes.

### Set for one task, never stored

| Variable | Read by | Why not in `.env` |
|---|---|---|
| `PGPASSWORD`, `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` | PostgreSQL's own commands -- `psql`, `pg_dump`, `pg_restore`, `createdb`, `dropdb` -- and `.\scripts\ccweb_psql.cmd`, which fills in any left unset from `DATABASE_URL` | they point those commands at one database for one task, such as the rehearsal copy of *Applying a schema release* ([system-administration.md](system-administration.md)). Stored, they would point every later command there too, and `PGPASSWORD` would be a second copy of the password |
| `FIRST_ADMIN_PASSWORD` | `python -m app.seed`, `python -m app.create_admin` | a setting, so it may be in `.env` -- but it is wanted once, when the first account is made, and a password left in a file after its use is one more to keep safe. Give it in the window instead and clear it after; see below |

In cmd, a value asked for stands alone, so nothing pasted with it is taken
as the answer:

```console
set /p FIRST_ADMIN_PASSWORD=First administrator's password:
```

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.create_admin --email YOUR_EMAIL
set "FIRST_ADMIN_PASSWORD="
```

In bash, `read -rs FIRST_ADMIN_PASSWORD && export FIRST_ADMIN_PASSWORD`,
then the command, then `unset FIRST_ADMIN_PASSWORD`.

**Any setting can be given this way**: a variable of the same name wins
over `.env`. That is also the trap in it. A variable stored for the whole
account -- with `setx`, in Windows' *Environment Variables* dialog, or in
a shell profile -- silently overrides `.env` for every program started
afterwards, the API task included, and no message says so. Keep the
settings in `.env` and nowhere else. A stored variable is not safer
either: Windows keeps it in the registry, readable by the account, as
`.env` is readable by the accounts its folder allows.

### Provided by the system: do not set

| Variable | Read by |
|---|---|
| `USERPROFILE` (Windows), `HOME` (Linux) | the scripts, for the defaults in the home folder (`CCWEB_BACKUP_DIR`, the conda search) |
| `HOMEDRIVE`, `HOMEPATH`, `SystemDrive`, `USERNAME` | `ccweb_env.cmd`, to find the home folder when a scheduled task starts without `USERPROFILE` |
| `OneDrive`, `OneDriveConsumer`, `OneDriveCommercial` | `ccweb_backup.cmd`, to pin a backup folder inside OneDrive so it stays on the device when no one is signed in |
| `XDG_CONFIG_HOME` | `ccweb_backup.sh --schedule`, for where systemd's user units go |
| `CONDA_EXE`, `CONDA_PREFIX`, `CONDA_DEFAULT_ENV` | the scripts, to find conda and to tell whether the `ccwebdb` environment is already active |
| `TEMP`, `SystemRoot` | the scripts, for scratch files and Windows' own commands |
| `USER` | `ccweb_backup.sh --schedule`, to let the account's backup timer run while signed out |
| `TZ` | the frontend's tests, which set it themselves to prove dates come out the same in any zone. Use `TIME_ZONE` for the business's zone |
