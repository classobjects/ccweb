# Deploying on an Ubuntu server

This guide runs the system on an Ubuntu server that the public reaches over
`https://` at a domain of your own:

- PostgreSQL and the API as systemd services;
- Caddy in front of them;
- the routine backup on a systemd timer.

It is the Linux counterpart of [deployment-windows.md](deployment-windows.md),
in the same steps. The reasons given there for the shape of the site hold
here.

Tested on **Ubuntu 26.04 LTS**. Every command here is bash. WSL is for
development only: hosting the public site needs a real Ubuntu machine.

**The example installation.** Where a value has to be shown, it is the
owner's: the domain `classobjects.com` with a DigiCert certificate. Put
your own domain, certificate files and folders where those appear.

**On the server, do not use `ccweb_startup.sh` or `ccweb_shutdown.sh` once
step 6 is done.** The shutdown script stops the API holding the API's port
-- there, the live API -- and it stops PostgreSQL. The server's own controls
are `systemctl` (*Keeping it running*).

## The shape

```
browser --https:443--> Caddy --+-- /api/...   --> uvicorn CCWEB_API_HOST:CCWEB_API_PORT --> PostgreSQL (DATABASE_URL)
                               +-- everything else --> CCWEB_SITE_ROOT (a copy of the built frontend)
```

Caddy is the only thing that listens to the outside. It is installed from
its own apt repository. The API listens on `CCWEB_API_HOST` (`127.0.0.1`)
only. Each server runs as the account that owns the repository, from the
conda environment.

## 1. The certificate

Make the key and certificate request, or carry them in, exactly as in
[deployment-windows.md](deployment-windows.md), step 1 -- `openssl` is the
same program. Two things are specific to Linux:

- **Where you make them.** Make the key and request, and keep the
  certificate authority's files, in your home folder, outside the
  repository, so no key can be committed by accident.
- **Where Caddy reads them.** Keep the installed files in
  `/etc/caddy/certs`, readable by root and by Caddy's own account, `caddy`,
  alone. That account exists once Caddy is installed (step 7), so make the
  folder then.

The example's commands, run from step 7 on, with the certificate
authority's two files and the key in the home folder:

```console
cd ~
sudo mkdir -p /etc/caddy/certs
cat classobjects.com.pem GeoTrustTLSRSACAG1.pem | sudo tee /etc/caddy/certs/fullchain.pem > /dev/null
sudo cp classobjects.com.key /etc/caddy/certs/
sudo chown -R root:caddy /etc/caddy/certs
sudo chmod 640 /etc/caddy/certs/*
sudo chmod 750 /etc/caddy/certs
```

Run them in that order. The `*` is expanded by your own shell, which can no
longer list the folder once it is `750`.

`sudo grep -c BEGIN /etc/caddy/certs/fullchain.pem` should say `2`. Keep
every certificate and key file out of the repository.

### No certificate to buy

A bought certificate is optional, as on Windows
([deployment-windows.md](deployment-windows.md), *No certificate to buy*).
To go without one:

1. Leave `CCWEB_TLS_CERT` and `CCWEB_TLS_KEY` both empty in `.env`.
2. Leave `VITE_DIGICERT_SEAL_ID` unset, since such a certificate has no
   seal.

The Caddyfile rendered in step 7 then has no `tls` line. Caddy obtains a
free certificate for the domain and its `www.` name when it starts, and
renews it itself. The rest of step 1 is then not needed.

Before Caddy can get a certificate, the DNS records must point at the
server, and ports 80 and 443 must reach it (step 8).

## 2. Install the system

Follow [environment-setup-linux.md](environment-setup-linux.md) steps 0 to
7, as the account that will own the system. Then make PostgreSQL a service.

First stop a server started by hand in step 5:

```console
cd ~/dev/ccweb
conda activate ccwebdb
pg_ctl -D .pgdata -m fast stop
```

It prints `server stopped`, or `Is server running?` when none was. Then
render the unit from the settings and install it:

```console
cd ~/dev/ccweb/backend
conda activate ccwebdb
python -m app.runtime_settings --render ../deploy/linux/ccwebdb-postgres.service > ~/ccwebdb-postgres.service && sudo install -m 644 ~/ccwebdb-postgres.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ccwebdb-postgres
```

Check it: `systemctl status ccwebdb-postgres` says `active (running)`, and
`pg_isready -h localhost -p 5432` says `accepting connections`.

- **The unit runs `pg_ctl` from the conda environment by its full path.**
  Re-creating the environment needs the unit rendered and installed again.
- **It is hardened as step 6 describes.** It writes only to the cluster
  folder, the log folder (`CCWEB_LOG_DIR`, which must exist) and `/tmp`,
  where it makes its local socket.

## 3. The collection

There are two paths, as in [deployment-windows.md](deployment-windows.md),
step 3: a new installation, or an existing collection restored. **Never
run `app.seed` on the server.**

### A new installation

This makes the schema, the reference vocabularies and the first manager,
with no demo data. Every command here reads `.env`, so `.env` must exist
first, with its own `JWT_SECRET` (environment-setup-linux.md step 6):

```console
cd ~/dev/ccweb/backend
conda activate ccwebdb
uv run alembic upgrade head
uv run python -m app.seeding load
```

Then give the manager's sign-in address. It is asked for on its own:

```console
read -r -p "Manager's email address: " ADMIN_EMAIL
```

Then make the account. It asks for a password twice (12 characters or
more) and shows nothing as it is typed, so the command stands alone:

```console
cd ~/dev/ccweb/backend && uv run python -m app.create_admin --email "$ADMIN_EMAIL"
```

It refuses a password under 12 characters or one published in this
repository. Once a manager exists, it refuses to run unless given
`--another`.

### Restore an existing collection

As in [deployment-windows.md](deployment-windows.md), step 3, restore
either of these:

- a `pg_dump` and the photographs from the development machine, restored
  into an empty database here; or
- the backup workbook, restored as
  [environment-setup-linux.md](environment-setup-linux.md) step 8 does.

Carry the files with `scp` or `rsync`. Then check the photographs, with
`MEDIA_FOLDER` replaced by the folder `MEDIA_ROOT` names:

```console
cd ~/dev/ccweb/backend
uv run python -m app.media_backup check MEDIA_FOLDER
```

## 4. Settings for the server

The server's `.env` takes the settings in
[deployment-windows.md](deployment-windows.md), step 4, with Linux values
for the paths. The example's:

| Setting | On the server |
|---|---|
| `CCWEB_TLS_CERT`, `CCWEB_TLS_KEY` | `/etc/caddy/certs/fullchain.pem`, `/etc/caddy/certs/classobjects.com.key`; both empty when Caddy is to obtain the certificate (*No certificate to buy*) |
| `CCWEB_SITE_ROOT` | `/srv/ccwebdb/dist`: a copy Caddy can read (step 5) |
| `CCWEB_CADDY_IMPORT` | unset, unless the server runs sites of its own beside the shop; then their Caddyfiles, such as `/etc/caddy/sites/*.caddy` |
| `MEDIA_ROOT` | the photographs' folder, as a full path |
| `CCWEB_BACKUP_DIR` | a folder that leaves the machine: a mounted network share, or one a sync client carries off |
| `TIME_ZONE` | the business's zone (`America/New_York`) when the server's clock runs on UTC, as most servers' do |

Then change both database passwords, as that step says. The commands are
the same in bash. Start from the repository:

```console
cd ~/dev/ccweb
conda activate ccwebdb
psql -h localhost -U postgres -d postgres
```

1. At the `psql` prompt, run `\password ccwebdb` and `\password postgres`.
2. Write the new `ccwebdb` password into `DATABASE_URL` with `nano .env`.
3. Run the check:

```console
cd ~/dev/ccweb/backend
uv run alembic current
```

## 5. Build the frontend

```console
cd ~/dev/ccweb/frontend
conda activate ccwebdb
npm ci
npm run build
```

- **The seal.** Set `VITE_DIGICERT_SEAL_ID` before building, or the shop
  has no seal; the build prints a `WARNING` naming it.
- **The brand pictures.** The build's `brand/` folder holds the project's
  own ClassObjects pictures. A site of your own replaces
  `frontend/public/brand/logo.svg` (the logo in every header) with its own
  before building, and removes or replaces the `classobjects-*.png` files
  there.

Then copy the build to `CCWEB_SITE_ROOT`. Ubuntu makes each home folder
readable by its owner alone, so Caddy cannot serve `frontend/dist` where it
is. Copy it where Caddy can:

```console
sudo mkdir -p /srv/ccwebdb
sudo rsync -a --delete ~/dev/ccweb/frontend/dist/ /srv/ccwebdb/dist/
```

Copy it again after every build.

## 6. Run the API at start-up

Render and install the API's unit. It runs as the repository's owner, reads
`.env` itself, and listens on `CCWEB_API_HOST` behind Caddy.

The unit is hardened. To the API:

- the whole file system is read-only except three folders: the
  photographs' (`MEDIA_ROOT`), the log folder (`CCWEB_LOG_DIR`) and the
  repository's `.runtime`;
- `/tmp` is private;
- it cannot gain a privilege or a capability;
- it cannot change kernel settings or load modules;
- it can open only network and local sockets.

The PostgreSQL unit takes the part of this that `pg_ctl` allows. Neither
unit hides the home folder (`ProtectHome`): the repository and the conda
environment are there, and both servers read them.

The three folders must exist before the unit starts, or systemd refuses to
start it. This makes any that are missing:

```console
cd ~/dev/ccweb/backend
conda activate ccwebdb
mkdir -p "$(python -c 'from app.config import settings; print(settings.media_root)')"
mkdir -p "$(python -c 'from app.runtime_settings import RuntimeSettings; print(RuntimeSettings().ccweb_log_dir)')"
mkdir -p ../.runtime
```

**The account.** The units run as the account that owns the repository,
which keeps an installation simple. A dedicated service account confines a
compromised API further: one that cannot sign in, and owns only the
repository, the cluster and those folders. To use one:

1. Make it with `sudo adduser --system --group` and its name.
2. Install the repository and the conda environment under it.
3. Run every step here as that account, so the rendered units name it.

Then render and install the unit:

```console
cd ~/dev/ccweb/backend
conda activate ccwebdb
python -m app.runtime_settings --render ../deploy/linux/ccwebdb-api.service > ~/ccwebdb-api.service && sudo install -m 644 ~/ccwebdb-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ccwebdb-api
```

Check that it answers at the default address. It takes a few seconds to
start, so this asks for up to ten:

```console
for try in 1 2 3 4 5 6 7 8 9 10; do curl -s -f -o /dev/null http://127.0.0.1:8000/health && break; sleep 1; done; curl -s -f -o /dev/null http://127.0.0.1:8000/health && echo "The API answers" || echo "The API is not answering: journalctl -u ccwebdb-api"
```

## 7. Caddy

Install Caddy from its own apt repository, which keeps it current. This is
caddyserver.com's install for Ubuntu:

```console
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

It installs and starts the `caddy` service with a placeholder site.

Next, put the certificate in place (step 1). Then write the configuration
from the repository's template and the settings, and check it:

```console
cd ~/dev/ccweb/backend
conda activate ccwebdb
python -m app.runtime_settings --render ../deploy/Caddyfile > ~/Caddyfile.new && sudo install -m 644 ~/Caddyfile.new /etc/caddy/Caddyfile.new
sudo caddy validate --config /etc/caddy/Caddyfile.new
```

`validate` says `Valid configuration`. It runs as root because it reads the
key, which only root and Caddy may read.

The file goes to `Caddyfile.new` first, so that a refused setting never
empties the one a running Caddy reads. An empty `CCWEB_SITE_DOMAIN`, for
example, is refused, and the message names it. Only when the file is valid,
put it in place and load it:

```console
sudo mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Render, check and move it again after changing any of the site's settings.

The rendered file is the one [deployment-windows.md](deployment-windows.md)
step 7 shows, with this server's paths. It sets the site's security headers
and content policy, and how long a browser keeps each file: a year for the
hashed files under `/assets/`, `no-cache` for every other file outside
`/api`. Step 7 there explains why.

## 8. Open the server to the internet

Set up DNS and the router as in
[deployment-windows.md](deployment-windows.md), step 8. Then open ports 80
and 443 in the `ufw` firewall:

```console
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

Do not open the API's port or PostgreSQL's.

## 9. Check it

Run the checks of [deployment-windows.md](deployment-windows.md), step 9,
with your domain, `CCWEB_SITE_DOMAIN`, in place of `YOUR_DOMAIN`:

```console
curl -sI https://YOUR_DOMAIN/
curl -s https://YOUR_DOMAIN/api/shop
curl -sI http://YOUR_DOMAIN/
```

The answers are the ones step 9 there expects:

1. `200`;
2. `{"open":false}` until `SHOP_OPEN` is `true`;
3. a redirect to `https://`.

## Keeping it running

Stop the three services:

```console
sudo systemctl stop ccwebdb-api caddy ccwebdb-postgres
```

Start them:

```console
sudo systemctl start ccwebdb-postgres ccwebdb-api caddy
```

All three start with the machine. `systemctl status` names each one's
state. `journalctl -u ccwebdb-api` (or `-u ccwebdb-postgres`, `-u caddy`)
shows its log.

- **The certificate.** One that Caddy obtained itself, Caddy also renews.
  For a bought one: renew it as the Windows guide says, replace the files
  in `/etc/caddy/certs` as in step 1, and run `sudo systemctl reload caddy`.
- **An update.** In this order:
  1. `git pull`, then `uv sync`.
  2. When the update brings a migration, a schema release as in
     [system-administration.md](system-administration.md) (*Applying a
     schema release*).
  3. `npm ci` and `npm run build` in `frontend`, then the copy of step 5.
  4. `sudo systemctl restart ccwebdb-api`.

  A pull does not update the installed units or `/etc/caddy/Caddyfile`.
  When an update changes `deploy/`, render and install them again as in
  steps 2, 6 and 7.
- **Backups.** Run this once, as the system's owner:

  ```console
  cd ~/dev/ccweb
  ./scripts/ccweb_backup.sh --schedule
  ```

  It installs a systemd user timer that runs the backup every day at
  `CCWEB_BACKUP_TIME`, into `CCWEB_BACKUP_DIR`. The timer runs whether or
  not anyone is signed in, provided `loginctl enable-linger` succeeds; the
  script runs that command itself. If it prints a `WARNING` instead, the
  timer runs only while the account is signed in
  ([system-administration.md](system-administration.md), *Backing up and
  restoring*). `./scripts/ccweb_backup.sh --scheduled` shows the timer.
