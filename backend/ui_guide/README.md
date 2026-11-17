# The screen guide's pictures

The pictures in [docs/ui-guide.md](../../docs/ui-guide.md), under
`docs/images/ui-guide/`, are taken by this package from a made-up demo
collection. One command rebuilds the collection and retakes every picture,
so a screen that changes is photographed again rather than left out of date.

## Running it

The test cluster must exist (`scripts\ccweb_testdb.cmd` creates it the first
time); the script starts it when it is stopped. The frontend's packages must be
installed (`npm ci` in `frontend`).

Windows (cmd):

```console
cd /d %USERPROFILE%\dev\ccweb
.\scripts\ccweb_ui_guide.cmd all
```

Linux (bash):

```console
cd ~/dev/ccweb
./scripts/ccweb_ui_guide.sh all
```

The folder in the `cd` line is the owner's checkout; use your own.

`all` rebuilds the demo database and takes every picture, writing each over
the file of the same name. The other steps, in either shell:

| Step | What it does |
|---|---|
| `all` | rebuild the demo database, then take every picture |
| `seed` | only rebuild the demo database |
| `shots` | take every picture from the database as it is |
| `shots coins_1 labels` | take only the pictures named |
| `serve` | start the demo stack and leave it running, to look at a screen; Ctrl+C stops it |
| `list` | name every picture and the address it opens |

It prints a line per picture, and `FAILED` with the reason for one it could
not take; the exit code is 1 when any failed. Look at every new picture before
committing it.

## What it runs

- **The demo database** is `ccweb_ui_guide` in the test cluster
  (`CCWEB_TEST_DB_PORT`), built from nothing by the migrations, `app.seeding`
  and `demo_data`. Nothing else makes or drops a database by that name: the
  test session drops only `ccwebdb_test`, its per-worker `ccwebdb_gw<N>_test`
  and the scratch databases named from them, and the backups only
  `ccwebdb_proof_*` and `ccwebdb_bak*`. It is left in place after a run, so
  `shots` can retake a picture without rebuilding it.
- **The stack** is an API, Vite and headless Chrome on `CCWEB_GUIDE_API_PORT`,
  `CCWEB_GUIDE_FRONTEND_PORT` and `CCWEB_GUIDE_BROWSER_PORT`, so a development
  server on its own ports is left alone. Their logs, the demo photographs
  (`MEDIA_ROOT`) and Chrome's profile are in `CCWEB_GUIDE_DIR`, never the
  collection's media folder ([settings.md](../../docs/settings.md)). Each
  run stops all three and fails if any port is still held.
- **Every value the API runs with** is set for it: the demo database, a
  signing key made for the run, the shop open, the shop named "Demo Coin
  Shop", no site seal. A checkout's own `.env` reaches none of the pictures.

## The demo collection

`demo_data.py` enters it through the application's own API, so every row
meets the rules a person entering it would. Everything in it is invented
([reference-data.md](../../docs/reference-data.md)): businesses and people
are "Example" and "Demo" names at `example.com` addresses, telephone numbers
are in the 555-01xx range kept for fiction, listing numbers start `DEMO-`,
the one grading certificate is a run of zeros, and the photographs are
drawings marked "DEMO IMAGE" made by `art.py`. Item codes follow the order
the items are entered, so `pictures.py` names some by code; adding an item
anywhere but at the end of `PURCHASES` moves them.

## Adding a picture

`PICTURES` in `pictures.py` is the whole list. A picture is one entry: its
file name, the address it opens, who is signed in (`admin`, `customer` or
`nobody`), a setup function that puts the screen in the state shown -- clicks
are real mouse clicks, so a dialog opens as it does for a person -- the window
size, and the frame:

| Frame | What it saves |
|---|---|
| `page` | the window as it is, 1400 by 900 unless the entry says otherwise |
| `first`, `last` | a list too long for the window, by its first rows and its last (the `_1` and `_2` pictures), each cut at a row's edge |
| `whole` | a long form or page, the window made tall enough to show all of it |
| `dialog` | the open dialog alone, made tall enough to show all of it |

A picture that shows an error, "Loading" or "Page not found" is refused
rather than saved.
