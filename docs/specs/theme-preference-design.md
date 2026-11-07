# Light, dark or automatic: each account's choice

*2026-11-06.*

The shop and the console have a light and a dark set of colors. Which one a
page shows is each person's choice, kept on their account so it follows them
to every computer and phone they sign in on.

## The choice

Three settings, stored as `users.theme` (a PostgreSQL enum `user_theme`):

| Setting | Shown as | What the page does |
|---|---|---|
| `auto` (the default) | Automatic | follows the device: dark when the operating system or browser is set to dark, light otherwise |
| `light` | Light | always light |
| `dark` | Dark | always dark |

A new account starts on `auto`, so nothing changes for anyone until they
choose. A visitor who is not signed in follows their device, or the choice
last made in that browser.

## Where it is chosen

A **Theme** dropdown in the header of every page, shop and console alike,
beside the account's name. Changing it changes the page at once. Signed in,
it is saved to the account (`PATCH /api/auth/me` with `{"theme": ...}`); not
signed in, it is remembered by that browser only.

## How a page applies it

Every color is a variable in `frontend/src/shared/shared.css`. The dark set
applies when:

- `<html data-theme="dark">`, whatever the device says; or
- the device asks for dark (`prefers-color-scheme: dark`) and the page is not
  `<html data-theme="light">`.

`auto` is the absence of the attribute. `frontend/src/shared/theme.js` sets
or removes it and keeps the choice in the browser (`ccwebdb.theme`).

So that a page does not flash light before turning dark, each HTML entry
page (`index.html`, `management.html`) runs a few lines in its `<head>` that
apply the browser's remembered choice before anything is drawn. Signing in
then reads the account's choice from `/api/auth/me`, applies it, and
remembers it in the browser for the next load. Signing out leaves the page
as it is.

## API

- `GET /api/auth/me` includes `theme`.
- `PATCH /api/auth/me` takes `{"theme": "auto" | "light" | "dark"}` and
  returns the account. Anything else is refused (422). It changes only the
  signed-in account's own preference; any signed-in role may use it.
