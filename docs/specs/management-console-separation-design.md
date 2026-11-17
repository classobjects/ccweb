# Management console: separating the shop from the back office

*2026-09-29.* The business has two audiences: buyers browsing the public
shop, and the owner and managers running inventory, purchases, sales and
reports. So the frontend is two applications built from one Vite project:

- the **shop**, served at `/`;
- the **management console**, served at `/management`.

The shop's bundle contains no console module -- not lazily loaded, not
present. An anonymous visitor neither downloads the console's code nor
learns what its pages are or which endpoints they call.

This document covers how the two are kept apart and how that is verified. It
is of interest to whoever adds a page or a shared module.

## What this is and is not

This is frontend structure, not access control. `require_admin` in
`backend/app/deps.py` guards every administrative endpoint. The separation is
defense in depth, plus the removal of an information leak: a per-route guard
in the shop answering "Manager privileges are required" would confirm that
the page exists. The shop instead answers "not found" for console paths.

Someone who *guesses* `/management` still reaches a sign-in screen, so the
console remains discoverable to a determined guesser. `management.html` asks
crawlers not to index or follow it, so a search engine does not do the
guessing. Closing that gap means serving the console on an interface the
public cannot reach -- a deployment decision that needs no change to
anything here.

## Structure

```
frontend/
  index.html              -> /src/store/main.jsx   served at /
  management.html         -> /src/management/main.jsx   served at /management
  vite.config.js          build.rollupOptions.input = { store, management }
  scripts/check-bundle-isolation.mjs
  src/
    shared/   transport and calls both use (api.js), auth, reference pickers,
              kinds, formatting, useRequest, LoginForm, shared.css
    store/    StoreApp.jsx, cart, pages/, styles.css
    management/    ManagementApp.jsx, api.js, HelpScope, fieldHelp, shortcuts,
              pages/, styles.css
    test/     helpers and setup, imported only by test files
```

Rollup builds each HTML entry as an independent module graph. Everything stays
under `frontend/src`, so one eslint, one vitest and one SonarQube source path
cover both applications.

Two alternatives were rejected:

- Two Vite projects: two dependency trees, two lint and test configurations,
  and shared code needing a workspace package.
- One bundle with a lazily-loaded console subtree: the chunk is still served
  on request, and the routes still exist in the shop's router.

### The API client is split

An object literal does not tree-shake (the build cannot drop its unused
members). So every endpoint written into the shop's `api` object would be a
map of the owner's tooling delivered to every visitor. Instead:

- `shared/api.js` holds the transport (`send`, token handling, `ApiError`)
  and the calls the shop and shared components make;
- `management/api.js` spreads it and adds the console's, so a console page
  imports one `api`.

One exception: `addReferenceValue` stays in `shared/api.js`, because
`ReferenceSelect` in `shared/reference.jsx` calls it and shared code may not
import from `management/`. So one write endpoint's path is visible to the shop;
the endpoint itself is staff only.

### The stylesheet is split

There are three stylesheets: `shared.css`, `store/styles.css` and
`management/styles.css`. A single shared stylesheet would ship the shop class
names that enumerate the owner's features (`.inventory-table`, `.bulk-bar`,
`.review-pane`), giving back what the bundle split removed.

### Sessions are shared

The tokens live in `localStorage` under one key (`ccwebdb.tokens`,
`shared/api.js`) and the access token is sent as a bearer token.
Both applications are same-origin, so a session obtained in either works in
both. The console therefore has its **own `/management/login` route** rather than
redirecting to the shop's; both wrap the shared `LoginForm`. **The shop never
links to the console**: that link would reintroduce exactly the discovery this
removes.

Keeping the tokens in `localStorage` is a trade-off:

- **The cost.** Any script running in the page can read them. A cross-site
  scripting flaw would hand over the session, refresh token included, where
  an `HttpOnly` cookie would keep it out of a script's reach.
- **The gain.** The bearer token needs no CSRF defense, since a browser never
  attaches it to a request on its own.

What limits the exposure is everything that keeps a foreign script out of
the page:

- React escapes what it renders.
- The pages load nothing from elsewhere but the DigiCert seal.
- The public site's `Content-Security-Policy` (`deploy/Caddyfile`) allows
  scripts from the site itself and the seal only, and data to be sent back
  to the site alone.

The access token lives `ACCESS_TOKEN_EXPIRE_MINUTES` (30 by default), and
signing out or changing the password invalidates every token issued to the
account.

### One guard at the router root

`ManagementApp.jsx`'s `RequireAdmin` wraps every console route once; sign-in is the
only route outside it. Anonymous visitors are sent to sign-in and a signed-in
non-administrator is refused. Per-route guards leak by omission at the next new
page, a failure that does not announce itself.

## Routing and serving

The console's router mounts at `basename="/management"`. Each application needs its
own history fallback, so `vite.config.js` sets `appType: 'mpa'` and adds a
dev-server middleware (`twoAppDevFallback`): a non-asset request under
`/management` is rewritten to `/management.html`, every other one to `/index.html`.
Without it a console URL works until someone reloads it.

The dev server binds `127.0.0.1:5173` and proxies `/api` to
`127.0.0.1:8000`. The backend serves no static files; any production host
must serve `management.html` for `/management` and `/management/*` and `index.html` for
everything else.

## How the separation is verified

Two layers, in two channels, which fail for different reasons.

**Source: ESLint boundary rules** (`frontend/eslint.config.js`):

- `src/store/` may not import `**/management/**`;
- `src/management/` may not import `**/store/**`;
- `src/shared/` may import neither.

Glob patterns rather than literal relative paths, because a page nested one
level deeper reaches across by `../../`. `no-restricted-imports` sees only
static imports, so `no-restricted-syntax` applies the same boundary to
`import()` expressions with a string literal.

**Output: the bundle graph.** A Rollup `generateBundle` hook
(`bundleGraph()` in `vite.config.js`) writes `dist/.vite/bundle-graph.json`,
listing every chunk's modules. `frontend/scripts/check-bundle-isolation.mjs`
walks the chunks reachable from each entry, following static and dynamic
imports. It fails if any chunk contains a module from the other
application's tree. It is symmetric.

- It reads chunk *membership*, not Vite's `manifest.json`. A manifest
  records a chunk's imports but not its contents, and a chunk shared between
  entries has no `src` -- exactly where a module imported by both lands.
- It is the only layer that catches a computed dynamic import
  (``import(`../management/pages/${name}.jsx`)``), which no lint rule can
  match.
- It is deliberately not a string search of the built JavaScript.
  Minification renames identifiers, and a check that passes for the wrong
  reason is worse than none.

`scripts\ccweb_check.cmd` builds the frontend and runs the isolation check as
one of its gates.

Tests pin the rest: the console's root guard (anonymous to sign-in, non-admin
refused, admin rendered) and the shop answering "not found" for console paths
such as `/inventory/coins` and `/people`, asserting the absence of any
"privileges" message.
