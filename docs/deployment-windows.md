# Deploying on a Windows server

Last revised: 2026-11-16.

How to run the system on a Windows server that the public reaches over
`https://` at a domain of your own. Every command here is cmd; none is
PowerShell. For an Ubuntu server, see
[deployment-linux.md](deployment-linux.md).

A development machine runs everything from `scripts\ccweb_startup.cmd`, with
Vite serving the frontend. A server runs none of that.

**This document is for the server only.** It creates three Windows
services: `ccwebdb-postgres`, `ccwebdb-api` and `caddy`. They exist on the
server and nowhere else. A development computer has none of them and never
needs them.

- A development computer is set up by
  [environment-setup-windows.md](environment-setup-windows.md). Its `.env`
  leaves `CCWEB_SITE_DOMAIN`, `CCWEB_TLS_CERT` and `CCWEB_TLS_KEY` unset.
- A computer that only edits code and runs the tests needs no collection
  database at all. The tests run on their own cluster
  (`scripts\ccweb_testdb.cmd`).

**The example installation.** Where a value has to be shown, it is the
owner's:

- a server named `classobjects`, serving `https://classobjects.com`;
- a DigiCert certificate;
- the repository in `%USERPROFILE%\dev\ccweb`;
- backups into a OneDrive folder.

Put your own domain, certificate files and folders where those appear. The
setting each one belongs to is named alongside.

**On the server, do not use `ccweb_startup.cmd` or `ccweb_shutdown.cmd`
once step 6 is done.**

- The shutdown script stops the API listening on the API's port -- on the
  server, the live API -- and stops PostgreSQL. That takes the site down.
- The startup script finds the API and PostgreSQL already running and
  leaves them alone. But it also starts Vite, which the server has no use
  for.

The server's own controls are under *Keeping it running*.

## The shape

```
browser --https:443--> Caddy --+-- /api/...   --> uvicorn CCWEB_API_HOST:CCWEB_API_PORT --> PostgreSQL (DATABASE_URL)
                               +-- everything else --> CCWEB_SITE_ROOT (the built frontend)
```

- **Caddy** is the only thing that listens to the outside. It:
  - holds the TLS certificate;
  - sends `http://` visitors to `https://`;
  - serves the built frontend;
  - passes `/api/...` to the API.

  Caddy is open source and is one program, `caddy.exe`. It is configured by
  one short text file, rendered from `deploy\Caddyfile` in the repository.
  IIS can do the same job, but needs the URL Rewrite and Application Request
  Routing modules and a `.pfx` in the Windows certificate store. nginx's
  Windows build is not meant for production.
- **The API** (FastAPI under uvicorn) listens only on `CCWEB_API_HOST`,
  which is `127.0.0.1` unless `.env` says otherwise. The application never
  reads the certificate: TLS ends at Caddy.
- **The frontend** is built once into static files (`frontend\dist`). After
  the build, no Vite and no Node run on the server. The shop is
  `index.html`; the console is `management.html`.
- **Photographs** are served by the API (`/api/images/...`, by content
  hash), so the `/api` rule covers them. Their bytes live under
  `MEDIA_ROOT`, never in the database.
- **Browser and API share one origin.** No cross-origin request is ever
  made, and `CORS_ORIGINS` needs no change.

## 1. The certificate

A server needs three things:

- the site's certificate;
- the intermediate certificate that signed it;
- the private key.

A certificate authority's download holds the first two. It often holds the
root as well, which browsers already have. It never holds the key. The
example's DigiCert zip:

| File | In the zip | Needed by Caddy |
|---|---|---|
| `classobjects.com.pem` -- the site's certificate (`classobjects.com` and `www.classobjects.com`) | yes | yes |
| `GeoTrustTLSRSACAG1.pem` -- the intermediate that signed it | yes | yes, sent with the certificate |
| `DigiCertGlobalRootG2.pem` -- the root | yes | no: browsers already hold it |
| **the private key** | **no** | **yes** |

The private key was made wherever the certificate request (CSR) was made.
It never leaves there on its own. There are two ways to get one onto the
server.

**Reissue from the server.** This is the simplest way when you are unsure
where the key is.

1. Make a new key and request on the server, with the commands below.
2. In the certificate authority's portal, use *Reissue* on the order and
   paste in the request. Ask for the `www.` name as an additional name.
3. DigiCert reissues at no charge and sends a new zip. The key never
   travels.

The commands are the example's. Put your own domain where
`classobjects.com` appears. In `-subj`, put your organization's country,
state, town and name in place of the stand-ins: `COUNTRY` (a two-letter
code), `STATE`, `TOWN`, `BUSINESS` and `DOMAIN`. openssl refuses them until
they are replaced.

`openssl` is in the conda environment
(`%USERPROFILE%\miniforge3\envs\ccwebdb\Library\bin\openssl.exe`), so run
these in a window where `conda activate ccwebdb` has been run.

```console
if not exist C:\caddy\certs mkdir C:\caddy\certs
cd /d C:\caddy\certs
openssl req -new -newkey rsa:2048 -nodes -keyout classobjects.com.key -out classobjects.com.csr -subj "/C=COUNTRY/ST=STATE/L=TOWN/O=BUSINESS/CN=DOMAIN"
type classobjects.com.csr
```

**Or export the key from the machine that made the request.** Use this when
the request was made with IIS or `certreq`:

1. Complete the request on that machine.
2. Export the certificate *with its private key* as a `.pfx`: `certlm.msc`
   -> Personal -> Certificates -> the certificate -> All Tasks -> Export.
3. Carry the `.pfx` across to the server.
4. Take the key out of it (the example's file names):

```console
cd /d C:\caddy\certs
openssl pkcs12 -in classobjects.com.pfx -nocerts -nodes -out classobjects.com.key
```

**Either way, join the two certificates.** Caddy wants the certificate and
the intermediate in one file, site certificate first (the example's files):

```console
cd /d C:\caddy\certs
copy /b classobjects.com.pem + GeoTrustTLSRSACAG1.pem fullchain.pem
type fullchain.pem
```

`type` should show two `BEGIN CERTIFICATE` blocks, each on its own line. If
the two run together on one line, add a line break between them in a text
editor.

**Lock down the key.** Allow only the administrators and the account Caddy
runs as to read it. Caddy as a service runs as `SYSTEM`:

```console
icacls C:\caddy\certs\classobjects.com.key /inheritance:r /grant:r SYSTEM:R Administrators:F
```

Keep every certificate and key file out of the repository. Two settings
name the certificate and key files to Caddy: `CCWEB_TLS_CERT` and
`CCWEB_TLS_KEY` (step 4).

### No certificate to buy

A bought certificate is optional. To do without one, leave `CCWEB_TLS_CERT`
and `CCWEB_TLS_KEY` both empty in `.env`. The Caddyfile rendered in step 7
then has no `tls` line, and Caddy:

- obtains a free certificate for the domain and its `www.` name from a
  public authority (Let's Encrypt or ZeroSSL) when it starts;
- renews it by itself before it expires.

Nothing in this step is needed, and nothing has to be done at expiry.
Setting only one of the two settings is refused when the Caddyfile is
rendered.

The authority checks that the domain is the server's by connecting to it.
So before Caddy starts, the DNS records must point at the server, and ports
80 and 443 must reach it (step 8). Until they do, Caddy logs a failed
attempt and tries again.

Such a certificate carries no organization's name and comes with no site
seal: leave `VITE_DIGICERT_SEAL_ID` unset.

## 2. Install the system

On the server, follow
[environment-setup-windows.md](environment-setup-windows.md) steps 0 to 7.
They cover Git, Miniforge, the `ccwebdb` conda environment, uv, Node and
PostgreSQL in the environment, the code and the database cluster, `.env`,
and the dependencies.

Then make PostgreSQL a Windows service, `ccwebdb-postgres`. On a server it
has to run apart from any console.

**1. Stop any server already running on the cluster.** A service cannot
start while another server holds the cluster -- one started by
`ccweb_startup.cmd`, or by hand in environment-setup-windows.md step 5. This
prints `server stopped`, or `Is server running?` when none was:

```console
conda activate ccwebdb
cd /d %USERPROFILE%\dev\ccweb
pg_ctl -D .pgdata -m fast stop
```

**2. Register the cluster as a service, once.** Run this from an
administrator cmd in which `conda activate ccwebdb` has been run.

- `-S auto` starts the service with the machine.
- `-o` gives it the port of `DATABASE_URL`, as the development scripts and
  the Linux unit do. 5432 is the default; put yours if it differs.
- The `-c` options have the server write its own log files, one per
  weekday, each overwritten a week later (*Logs*, under *Keeping it
  running*).

```console
pg_ctl register -N ccwebdb-postgres -D "%USERPROFILE%\dev\ccweb\.pgdata" -S auto -o "-p 5432 -c logging_collector=on -c log_filename=postgresql-%a.log -c log_truncate_on_rotation=on"
```

Keep the cluster on the server's own disk, never in a folder that OneDrive
or another service syncs. A cluster that starts with the machine must be
one that no other computer can start
([runtime-operations-windows.md](runtime-operations-windows.md), *One
database, two computers*).

**3. Start it:**

```console
sc.exe start ccwebdb-postgres
pg_isready -h localhost -p 5432
```

`pg_isready` says `accepting connections` within a few seconds. If it says
`no response` at first, run it again. The cluster folder and port shown are
the defaults; with `CCWEB_DB_CLUSTER_DIR` or another port in
`DATABASE_URL`, use those.

The service tool is written `sc.exe` here and throughout, never `sc`.
Pasted into PowerShell -- Windows Terminal's default tab -- a bare `sc` is
`Set-Content`, which writes a file named `start` and never reaches the
service.

`sc.exe qc ccwebdb-postgres` shows what was registered. The service runs as
`LocalSystem`, which can read a cluster in the user's folder. It runs
`pg_ctl.exe` from the conda environment by its full path. So re-creating
the `ccwebdb` environment breaks it until the service is registered again:
`pg_ctl unregister -N ccwebdb-postgres`, then the `register` line above.

## 3. The collection

There are two paths:

- **A new installation** starts with an empty collection and one manager.
- **An existing collection** is restored from the machine that holds it.

Never run `app.seed` on the server: it adds demo items.

### A new installation

This makes the schema, the reference vocabularies and the first manager
account, with no demo data. `.env` must exist with its own `JWT_SECRET`
first (environment-setup-windows.md step 6), because every command here
reads it.

**1. Make the schema and load the vocabularies:**

```console
conda activate ccwebdb
cd /d %USERPROFILE%\dev\ccweb\backend
uv run alembic upgrade head
uv run python -m app.seeding load
```

**2. Give the manager's sign-in address.** It is asked for on its own:

```console
set /p ADMIN_EMAIL=Manager's email address:
```

**3. Make the account.** It asks for a password twice (12 characters or
more) and shows nothing as it is typed, so the command is given alone:

```console
cd /d %USERPROFILE%\dev\ccweb\backend && uv run python -m app.create_admin --email %ADMIN_EMAIL%
```

It refuses a password under 12 characters, or one published in this
repository. It refuses to run once a manager exists, unless given
`--another`.

Once the site answers (step 9), sign in to the console with that account
and make the other accounts there.

### Restore an existing collection

Skip this if the collection is already on the server. A collection restored
from the backup workbook by environment-setup-windows.md step 8 (*A
collection, on a new machine*) is complete.

**1. On the development machine, dump the current collection.** With
nothing writing to the database, dump it and prove the dump exactly as
[system-administration.md](system-administration.md#applying-a-schema-release)
(*Applying a schema release*, step 1) does. That step:

- signs in as the `ccwebdb` account;
- writes the dump to `ccwebdb-backups` in `%USERPROFILE%\dev`;
- restores it into `ccwebdb_rehearsal` to compare it.

Afterwards, in the same window, drop that database with
`"%PGBIN%\dropdb.exe" ccwebdb_rehearsal`.

**2. Copy the photographs** to a folder you can carry across. The example
uses `D:\to_server`:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
conda activate ccwebdb
if not exist D:\to_server mkdir D:\to_server
python -m app.media_backup copy D:\to_server\media
python -m app.media_backup check D:\to_server\media
```

**3. Carry the dump and the `media` folder to the server.**

**4. On the server, restore the dump into an empty database**
(`createdb`, then `pg_restore -d ccwebdb` and the dump), as in
[system-administration.md](system-administration.md) (*Applying a schema
release*, step 1). Copy `media` to the folder `MEDIA_ROOT` will name.

**5. Check the photographs on the server.** Replace `MEDIA_FOLDER` with the
folder `MEDIA_ROOT` names:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.media_backup check MEDIA_FOLDER
```

`check` exits 1 naming any photograph missing or damaged.

## 4. Settings for the server

Fill in the server's `.env` as below. Its template is `.env.example`, which
lists every setting with its default; [settings.md](settings.md) says what
each one takes.

| Setting | On the server |
|---|---|
| `JWT_SECRET` | a new value (`python -c "import secrets; print(secrets.token_hex(32))"`), never the development one. The API will not start without one |
| `DATABASE_URL` | the server's database, with a password that is not `devpassword`: change it first, as below |
| `MEDIA_ROOT` | the folder the photographs were copied to, as a full path |
| `SALES_TAX_RATE`, `SALES_TAX_INCLUDES_SHIPPING` | as on the development machine |
| `DEFAULT_ITEM_KIND` | as on the development machine. The example: `currency` |
| `SHOP_OPEN` | `false` until opening day; then `true`, and restart the API, to open the shop |
| `CCWEB_SITE_DOMAIN` | the domain, without `https://` or `www.` (the example: `classobjects.com`) |
| `CCWEB_TLS_CERT`, `CCWEB_TLS_KEY` | the full paths of `fullchain.pem` and the key from step 1 (the example: `C:\caddy\certs\fullchain.pem`, `C:\caddy\certs\classobjects.com.key`); both empty when Caddy is to obtain the certificate (*No certificate to buy*) |
| `CCWEB_SITE_ROOT` | unset: the repository's `frontend\dist`, which Caddy, running as `SYSTEM`, can read |
| `CCWEB_CADDY_IMPORT` | unset, unless the server runs sites of its own beside the shop (step 7, *Other sites on the server*); the example: `C:\caddy\sites\*.caddy` |
| `CCWEB_CADDY_LOG` | `C:\caddy\logs\caddy.log`. A Windows service has no console, so without a file Caddy's log is lost (*Logs*, below) |
| `VITE_DIGICERT_SEAL_ID` | the eight characters after `DigiCertClickID_` in DigiCert's seal code for the certificate, or unset for no seal. Read when the frontend is built (step 5) |
| `VITE_SHOP_NAME`, `VITE_SHOP_OWNER` | the shop's name and its owner's legal name. Read when the frontend is built (step 5) |
| `CCWEB_BACKUP_DIR`, `CCWEB_BACKUP_TIME` | a folder that leaves the machine, and the time of the daily backup (*Keeping it running*). The example: its OneDrive folder, 20:00 |
| `TIME_ZONE` | the business's zone (`America/New_York`) if the server's clock runs on another; otherwise unset |

Two settings are read only when accounts are made:

- `FIRST_ADMIN_EMAIL` and `FIRST_ADMIN_PASSWORD` are read by `app.seed`,
  which is never run on the server.
- `FIRST_ADMIN_PASSWORD`, when set, is also read by `app.create_admin`
  (step 3, *A new installation*). Leave the password empty once the first
  manager exists.

A restored database already holds its accounts. Sign in with one of them,
and change the password of any account still using a development password.

### The database passwords

environment-setup-windows.md step 5 gives both database accounts the
password `devpassword`. Change both on the server:

- `ccwebdb`, which the application signs in as;
- `postgres`, the administrator.

**1. Make a new password**, once for each account. This prints 32 random
characters -- letters, digits, `-` and `_` -- that go into `.env` as they
are. `DATABASE_URL` is a web-style address, so a password with `@ # : / %`
in it would break it unless those characters were encoded.

```console
conda activate ccwebdb
python -c "import secrets; print(secrets.token_urlsafe(24))"
```

**2. Start psql as the administrator.** It asks for the `postgres`
password, which is still `devpassword`:

```console
cd /d %USERPROFILE%\dev\ccweb
psql -h localhost -U postgres -d postgres
```

**3. At the `postgres=#` prompt, set each password.** `\password` asks for
the new one twice and shows nothing as it is typed or pasted:

```console
\password ccwebdb
```

```console
\password postgres
```

Then type `\q` to leave.

`\password` keeps the password out of psql's history file and the server's
log; `ALTER ROLE ... PASSWORD '...'` would not. The application never uses
the `postgres` password. Keep it somewhere safe, for psql and for schema
releases.

**4. Put the `ccwebdb` password into `.env`.** Change only the part between
`ccwebdb:` and `@`. The line then reads
`DATABASE_URL=postgresql+psycopg://ccwebdb:NEWPASSWORD@localhost:5432/ccwebdb`,
with the new password in place of `NEWPASSWORD`:

```console
cd /d %USERPROFILE%\dev\ccweb
notepad .env
```

**5. Check that the application signs in.** This prints the database's
schema revision, ending `(head)`. A `password authentication failed` means
`.env` does not match what was typed in 3:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
uv run alembic current
```

An API already running read the old `.env` when it started, so restart it
(*Keeping it running*, below). The backup, `scripts\ccweb_psql.cmd`, Alembic
and every `python -m app...` command read `.env` each time they start, and
need nothing more.

## 5. Build the frontend

Set `VITE_DIGICERT_SEAL_ID` (step 4) before building. The build reads it
from `.env`. If it is unset, the shop has no seal, and the build prints a
`WARNING` naming it.

```console
conda activate ccwebdb
cd /d %USERPROFILE%\dev\ccweb\frontend
npm ci
npm run build
```

This writes `frontend\dist`: `index.html`, `management.html`, the
favicons, `brand\` and `assets\`. Build again after every update.

`brand\` holds the project's own ClassObjects pictures. A site of your own,
before building:

- replaces `frontend\public\brand\logo.svg` (the logo in every header) with
  its own;
- removes or replaces the `classobjects-*.png` files there.

## 6. Run the API at start-up

The API runs as the Windows service `ccwebdb-api`. The service runs
`scripts\ccweb_api.cmd` at boot, whether or not anyone is signed in, and
starts it again if it dies. The script is part of the repository, so an
update to how the API starts arrives with the code.

The script takes everything from the settings:

- It listens on `CCWEB_API_HOST` and `CCWEB_API_PORT`.
- Its output goes through `backend\app\logpipe.py` into `backend.log` in
  the log folder, as `ccweb_startup.cmd` sends it on the development
  machine. So `backend.log` starts afresh each time the service starts, and
  never grows past `CCWEB_LOG_MAX_BYTES`, with `CCWEB_LOG_KEEP` files kept
  ([logs/README.md](../logs/README.md)).

Two details of how it runs:

- It runs `python -m uvicorn` rather than `uvicorn.exe`, because Smart App
  Control blocks unsigned `.exe` wrappers on some machines.
- `--proxy-headers`, with `--forwarded-allow-ips` set to the API's own
  address, makes the API see the visitor's address and `https` from Caddy's
  headers, and trust those headers from Caddy alone.

A service needs a program that speaks to the service manager, and a `.cmd`
does not. So [WinSW](https://github.com/winsw/winsw) runs it. WinSW writes
its own log to `C:\ccwebdb-api\logs`.

The service's account is `NT SERVICE\ccwebdb-api`. It has no password to
store, and it can reach only the folders granted below. The API takes
requests from the internet, so it holds no administrator rights and cannot
read the database's files.

**1. Make the service's folder and download WinSW into it.** Run this from
an administrator cmd. The folder is closed to other accounts' changes:

```console
mkdir C:\ccwebdb-api\logs
icacls C:\ccwebdb-api /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX"
curl -L -o C:\ccwebdb-api\ccwebdb-api-service.exe https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe
copy "%USERPROFILE%\dev\ccweb\deploy\windows\ccwebdb-api.xml" C:\ccwebdb-api\ccwebdb-api-service.xml
```

**2. Name the account's folder in the copy.** Open it and replace `OWNER`
with this account's folder name under `C:\Users`:

```console
notepad C:\ccwebdb-api\ccwebdb-api-service.xml
```

**3. Install the service.** This installs it, gives it its account, and
tells the service manager to restart it when it fails:

```console
C:\ccwebdb-api\ccwebdb-api-service.exe install
sc.exe config ccwebdb-api obj= "NT SERVICE\ccwebdb-api"
sc.exe failure ccwebdb-api reset= 3600 actions= restart/10000/restart/30000/restart/60000
```

**4. Grant the account what the API uses.**

- The photograph folder does not exist on a new installation, so the first
  line makes it.
- The checkout's own folder is granted without inheritance. Nothing new at
  its top level -- `.pgdata` above all -- becomes readable.
- If `.env` moves `MEDIA_ROOT` or `CCWEB_LOG_DIR`, keep the moved folders
  in the grant.

```console
if not exist "%USERPROFILE%\dev\ccweb\media" mkdir "%USERPROFILE%\dev\ccweb\media"
icacls C:\ccwebdb-api\logs /grant "NT SERVICE\ccwebdb-api:(OI)(CI)M"
icacls "%USERPROFILE%\miniforge3" /grant "NT SERVICE\ccwebdb-api:(OI)(CI)RX" /Q
icacls "%USERPROFILE%\dev\ccweb" /grant "NT SERVICE\ccwebdb-api:RX" /Q
icacls "%USERPROFILE%\dev\ccweb\backend" /grant "NT SERVICE\ccwebdb-api:(OI)(CI)RX" /Q
icacls "%USERPROFILE%\dev\ccweb\scripts" /grant "NT SERVICE\ccwebdb-api:(OI)(CI)RX" /Q
icacls "%USERPROFILE%\dev\ccweb\frontend" /grant "NT SERVICE\ccwebdb-api:(OI)(CI)RX" /Q
icacls "%USERPROFILE%\dev\ccweb\.env" /grant "NT SERVICE\ccwebdb-api:R" /Q
icacls "%USERPROFILE%\dev\ccweb\logs" /grant "NT SERVICE\ccwebdb-api:(OI)(CI)M" /Q
icacls "%USERPROFILE%\dev\ccweb\media" /grant "NT SERVICE\ccwebdb-api:(OI)(CI)M" /Q
```

A program that replaces `.env` rather than saving over it drops that file's
grant. The API then stops at start-up, saying it cannot read its settings.
Run the `.env` line again.

**5. Start the service:**

```console
net start ccwebdb-api
```

**6. Check that it answers.** It can take a few seconds to answer, so this
gives it five before checking. The address is the default; use
`CCWEB_API_HOST` and `CCWEB_API_PORT` if `.env` sets them:

```console
ping -n 6 127.0.0.1 >nul
curl -s -f -o nul http://127.0.0.1:8000/health
if errorlevel 1 echo The API is not answering: read %USERPROFILE%\dev\ccweb\logs\backend.log
```

To restart the API after an update:

```console
net stop ccwebdb-api
net start ccwebdb-api
```

## 7. Caddy

**1. Download Caddy.** Caddy is one program, `caddy.exe`. Download it into
`C:\caddy`:

```console
if not exist C:\caddy mkdir C:\caddy
curl -L -o C:\caddy\caddy.exe "https://caddyserver.com/api/download?os=windows&arch=amd64"
C:\caddy\caddy.exe version
```

`version` prints a `v2.` version line.

The download address is the one behind the Windows amd64 button on
caddyserver.com's download page. That button saves the same file as
`caddy_windows_amd64.exe`; renamed to `caddy.exe`, that one does as well.

Every command here names `C:\caddy\caddy.exe` in full. On a machine with
`NoDefaultCurrentDirectoryInExePath` set, a bare `caddy` is not found, even
in `C:\caddy`.

**2. Render the configuration.** Caddy's configuration is
`C:\caddy\Caddyfile`. It is written from the repository's template
`deploy\Caddyfile` and the settings of step 4. Run this in a window where
`conda activate ccwebdb` has been run:

```console
cd /d %USERPROFILE%\dev\ccweb\backend
python -m app.runtime_settings --render ..\deploy\Caddyfile > C:\caddy\Caddyfile.new
```

The Windows service has no environment of its own, so the values are filled
in now:

- with full paths, because Caddy runs as `SYSTEM`, whose own `USERPROFILE`
  is not the installing account's;
- with forward slashes, which Caddy wants on Windows too.

The output goes to `Caddyfile.new` first. So a refused setting -- an empty
`CCWEB_SITE_DOMAIN`, say, which it names -- never empties the file a
running Caddy reads. After changing any of those settings, render the file
again, check it and put it in place as below, then restart the service.

For the example installation, with the repository under an account named
`YOU`, the result, comments left out, is:

```
{
	log {
		output file C:/caddy/logs/caddy.log
	}
}

classobjects.com {
	tls C:/caddy/certs/fullchain.pem C:/caddy/certs/classobjects.com.key
	encode gzip

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		Content-Security-Policy "default-src 'self'; script-src 'self' https://seal.digicert.com; img-src 'self' data: https://seal.digicert.com https://*.digicert.com; style-src 'self' 'unsafe-inline'; object-src https://seal.digicert.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
		-Server
	}

	@hashed path /assets/*
	header @hashed Cache-Control "public, max-age=31536000, immutable"
	@checked not path /assets/* /api/*
	header @checked Cache-Control no-cache

	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}

	@console path /management /management/*
	handle @console {
		root * C:/Users/YOU/dev/ccweb/frontend/dist
		try_files {path} /management.html
		file_server
	}

	handle {
		root * C:/Users/YOU/dev/ccweb/frontend/dist
		try_files {path} /index.html
		file_server
	}
}

www.classobjects.com {
	tls C:/caddy/certs/fullchain.pem C:/caddy/certs/classobjects.com.key

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		Content-Security-Policy "default-src 'self'; script-src 'self' https://seal.digicert.com; img-src 'self' data: https://seal.digicert.com https://*.digicert.com; style-src 'self' 'unsafe-inline'; object-src https://seal.digicert.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
		-Server
	}

	redir https://classobjects.com{uri} permanent
}
```

What the parts of the file do:

- **The two `try_files` rules** are the server's half of the two
  applications. A console address that is not a file is answered with
  `management.html`; any other with the shop's `index.html`. Vite's
  development fallback does the same. The `@console` rule names
  `/management` and the addresses under it, and no other address that
  merely starts with those letters.
- **The `header` block** is sent with every answer. It sets:
  - HTTPS only, for a year (`Strict-Transport-Security`);
  - no guessing at a file's type;
  - never shown inside another site's frame;
  - the address passed to other sites without its path;
  - no `Server` line;
  - a content policy that lets a page load only the site's own scripts,
    styles, pictures and API, plus the DigiCert seal's script and badge.

  So a script injected into a page could not send what it read anywhere but
  this site. The policy names DigiCert because the seal is the one thing
  the shop loads from elsewhere. A site using another authority's seal names
  that one instead.
- **The two `Cache-Control` rules** make a deploy reach every browser at
  once. A file under `/assets/` is named for a hash of its content, so a
  browser keeps it for a year without asking; a new build brings new names.
  Every other file -- `management.html` and `index.html` above all, which
  name the build's assets -- is `no-cache`. The browser keeps it but asks
  the server before each use, and is answered `304 Not Modified` when it has
  not changed. Without these rules a browser guesses from the file's age.
  After a deploy it can then go on running the previous build for hours,
  even with the site's cookies and storage cleared.
- **The two `tls` lines** give Caddy its own certificate, so it asks no one
  else for one. It still answers port 80 by sending visitors to `https://`.
  The lines must name the key file Caddy is really to use, and that is the
  copy to lock down with `icacls` (step 1). Keep one copy of the key in
  `C:\caddy\certs`, not several under different names. With
  `CCWEB_TLS_CERT` and `CCWEB_TLS_KEY` both empty, the file has no `tls`
  lines at all: see *No certificate to buy* (step 1).

**3. Check the file.** It says `Valid configuration`. With the certificate
files given, it also says it is skipping automatic certificates because
they are loaded:

```console
C:\caddy\caddy.exe validate --config C:\caddy\Caddyfile.new
```

**4. Only when it does, put it in place:**

```console
move /y C:\caddy\Caddyfile.new C:\caddy\Caddyfile
```

### Other sites on the server

The template describes the shop alone. A site the server runs beside the
shop is not in it:

- Its Caddyfile lives in `C:\caddy\sites`, outside the repository.
- `CCWEB_CADDY_IMPORT` names it, or a pattern for all of them
  (`C:\caddy\sites\*.caddy`).
- The rendered file then ends with an `import` of it. With the setting
  unset, it ends with the `www.` block.

After adding or changing such a site, render, validate and move the file
into place as above.

### Caddy as a service

Caddy runs as a Windows service by itself, with no wrapper program. It then
starts with the machine and keeps running when no one is signed in.

**1. Stop any Caddy started by hand.** Caddy started in a window
(`caddy run`) holds ports 80 and 443 until that window closes. Stop it with
Ctrl+C first, then check that none is left:

```console
tasklist /fi "imagename eq caddy.exe"
```

It should say `No tasks are running`.

**2. Create the service.** Use a cmd window run **as administrator**: Start,
type `cmd`, right-click *Command Prompt*, *Run as administrator*. Its title
starts `Administrator:`. Copy the line rather than retype it:

```console
sc.exe create caddy start= auto binPath= "C:\caddy\caddy.exe run --config C:\caddy\Caddyfile"
```

It prints `[SC] CreateService SUCCESS`. `sc.exe` wants a space after each
`=` and nothing else there: `start= auto`, exactly. A misspelt value is
refused as an `Invalid start= field`.

**3. Start it and check it**, with your domain in place of `YOUR_DOMAIN`:

```console
sc.exe start caddy
sc.exe query caddy
curl -s -o nul -w "%{http_code}\n" https://YOUR_DOMAIN/
```

Expect `RUNNING`, and `200` once the domain points at the server (step 8).
With a certificate Caddy obtains itself, `200` does not come before then.

Caddy reads the Caddyfile only when it starts. After rendering it again or
changing the certificate files, restart the service:

```console
sc.exe stop caddy
sc.exe start caddy
```

**When the service will not start or cannot be created:**

| What it says | What it means |
|---|---|
| `StartService FAILED 2: The system cannot find the file specified` | the program named in the service is not there. `sc.exe qc caddy` shows the path it runs (`BINARY_PATH_NAME`); put `caddy.exe` there, or point the service at where it is with `sc.exe config caddy binPath= "..."` |
| `CreateService FAILED 5: Access is denied` | in a window that is not elevated, that is all it means: open one as administrator. In an elevated one, the name is still held by a service deleted while something had it open -- see below |
| `CreateService FAILED 1073: The specified service already exists` | `sc.exe delete caddy` first |
| `FAILED 1072: The specified service has been marked for deletion` | the same held name, said plainly -- see below |
| copying `caddy.exe` into `C:\caddy` fails with `Access is denied` | the old `caddy.exe` was deleted while still open, and its name is held -- see below |

**Close the Services window before deleting or re-creating a service.**

- A service deleted with `sc.exe delete` while the Services window (or
  anything else) has it open is only *marked* for deletion. It lingers, and
  its name cannot be used again.
- A `caddy.exe` deleted while a process still has it open is held the same
  way. It is gone from `dir`, but its name is refused to anything that
  tries to create it.

Both clear when whatever holds them lets go; a restart always does it.
Until then, a service under another name (`caddy-web`, say) running a copy
of `caddy.exe` from another folder keeps the site up.

## 8. Open the server to the internet

- **DNS:** `A` records for the domain and its `www.` name (the example:
  `classobjects.com`, `www.classobjects.com`) at the server's public
  address.
- **Router:** forward ports 80 and 443 to the server, and nothing else.
- **Windows firewall**, from an administrator cmd:

  ```console
  netsh advfirewall firewall add rule name="Caddy HTTP" dir=in action=allow protocol=TCP localport=80
  netsh advfirewall firewall add rule name="Caddy HTTPS" dir=in action=allow protocol=TCP localport=443
  ```

  Do not open the API's port or PostgreSQL's: the API and the database
  answer only on the server itself.

## 9. Check it

Run these with your domain, `CCWEB_SITE_DOMAIN`, in place of
`YOUR_DOMAIN`:

```console
curl -sI https://YOUR_DOMAIN/
curl -s https://YOUR_DOMAIN/api/shop
curl -sI http://YOUR_DOMAIN/
```

Expect, in order:

1. `200`;
2. `{"open":false}`, or `{"open":true}` once `SHOP_OPEN` is `true`;
3. a redirect to `https://`.

`/api/shop` answers anyone, open or not, so it proves Caddy reaches the
API. The catalog would not do here: while the shop is closed, it refuses a
visitor who is not signed in (403).

Then check in a browser:

- the shop loads with the coin-and-note favicon;
- the certificate's seal appears in the footer if `VITE_DIGICERT_SEAL_ID`
  is set (it shows only on the domain the certificate names);
- the domain's `/management` signs in.

## Keeping it running

The server's three parts all start with the machine. Control them on their
own, never with the `ccweb_` start-up and shut-down scripts.

From an administrator cmd, stop the site, API first:

```console
net stop ccwebdb-api
sc.exe stop caddy
sc.exe stop ccwebdb-postgres
```

Start it again, database first:

```console
sc.exe start ccwebdb-postgres
net start ccwebdb-api
sc.exe start caddy
```

`sc.exe query ccwebdb-postgres` and `sc.exe query caddy` say `RUNNING` when
they are up. Step 9 checks the whole site.

- **A certificate Caddy obtained itself** (*No certificate to buy*) is
  renewed by Caddy. Nothing below applies to it.
- **A bought certificate expires** on the date it carries
  (`openssl x509 -in classobjects.com.pem -noout -enddate`, with your
  certificate's file name). A public certificate may last no more than 200
  days, so a multi-year purchase is a subscription. Within it, the authority
  issues a new certificate at no charge before each one ends -- about twice
  a year. Ahead of each expiry:
  1. Reissue in the portal. The request made in step 1 can be used again,
     so the key stays where it is.
  2. Replace the certificate and `fullchain.pem` in `C:\caddy\certs`.
  3. Restart the `caddy` service.
- **An update:**
  1. `git pull`, then `uv sync`.
  2. When the update brings a migration, a schema release as in
     [system-administration.md](system-administration.md) (*Applying a
     schema release*).
  3. `npm ci` and `npm run build` in `frontend`.
  4. Restart the API service (above).

  Caddy needs no restart for a new build. A pull does not update the
  deployed copies of the templates: `C:\caddy\Caddyfile` and the API
  service's XML in `C:\ccwebdb-api`. When an update changes `deploy\`, copy
  and edit the XML again (step 6) and render the Caddyfile again (step 7).
- **Backups:** schedule the daily backup once, from an administrator cmd:

  ```console
  cd /d %USERPROFILE%\dev\ccweb
  .\scripts\ccweb_backup.cmd /schedule
  ```

  It runs every day at `CCWEB_BACKUP_TIME`, into `CCWEB_BACKUP_DIR`,
  whether or not anyone is signed in
  ([system-administration.md](system-administration.md), *Backing up and
  restoring*). Put that folder somewhere that leaves the machine. The
  example's is a OneDrive folder, whose files OneDrive carries off at the
  owner's next sign-in.

### Logs

| Part | Its log |
|---|---|
| The API | `backend.log` in the log folder (`%USERPROFILE%\dev\ccweb\logs` by default), started afresh each time the service starts (step 6) |
| PostgreSQL | `postgresql-Mon.log` to `postgresql-Sun.log` in the cluster's `log` folder, `%USERPROFILE%\dev\ccweb\.pgdata\log` by default: one file per weekday, written all day and overwritten a week later |
| Caddy | the file `CCWEB_CADDY_LOG` names (step 4), `C:\caddy\logs\caddy.log` in the example. Caddy creates the folder, starts a new file at 100 MB and keeps ten |
| The daily backup | `backup.log` in the log folder |

Both service logs need their settings. A Windows service has no console,
so anything it writes to one is lost.

- **PostgreSQL registered without the `logging_collector` options** writes
  to the Windows Application event log instead: Event Viewer, *Windows
  Logs*, *Application*, source `PostgreSQL`. To move it to files, register
  the service again:
  - Use an administrator cmd with `conda activate ccwebdb` run in it.
  - Type or paste the commands into the window. Do not run them from a
    `.cmd` file, which would drop the `%a`.
  - The API service depends on the database's, so it stops first and
    starts last. The site is down for about a minute.

  Stop both, and wait until `sc.exe query ccwebdb-postgres` says
  `STOPPED`:

  ```console
  net stop ccwebdb-api
  sc.exe stop ccwebdb-postgres
  sc.exe query ccwebdb-postgres
  ```

  Then register the database again and start both. Neither `pg_ctl` line
  prints anything when it works. The API's dependency survives, because it
  names the service by its name:

  ```console
  pg_ctl unregister -N ccwebdb-postgres
  pg_ctl register -N ccwebdb-postgres -D "%USERPROFILE%\dev\ccweb\.pgdata" -S auto -o "-p 5432 -c logging_collector=on -c log_filename=postgresql-%a.log -c log_truncate_on_rotation=on"
  sc.exe start ccwebdb-postgres
  net start ccwebdb-api
  ```

  `dir %USERPROFILE%\dev\ccweb\.pgdata\log` then lists that day's file,
  `postgresql-Wed.log` on a Wednesday.

- **Caddy with `CCWEB_CADDY_LOG` unset** keeps no log at all. To give it
  one, set it in `.env`, render the Caddyfile again (step 7) and restart
  the `caddy` service.
