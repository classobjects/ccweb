# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue: use
GitHub's **Report a vulnerability** button on this repository's
**Security** tab (private vulnerability reporting), or mail
support@classobjects.com. Include what you found, how to reproduce it, and
the version (commit) you tested.

You can expect an acknowledgement within a week and a fix or an
explanation within 90 days. Once a fix is released the report may be
published with credit to you, unless you ask otherwise.

## Supported versions

Only the latest commit on `main` is supported; there are no maintained
release branches.

## Scope

In scope: the API (`backend/`), the shop and console (`frontend/`), the
operational scripts (`scripts/`) and the deployment templates (`deploy/`).

The deployment documents describe the supported way to run the system on
the internet -- the API behind Caddy, which proxies only `/api/*`, with the
security headers in `deploy/Caddyfile`. A report that depends on exposing
the API or the development servers directly to the internet is still
welcome, but is weighed against that.

## Practices the code follows

- Passwords are hashed with argon2; sign-in and registration are throttled
  per address and per account.
- Every console route requires a manager; the shop's responses are built
  field by field so cost, storage location and history never reach a
  customer.
- Uploaded and fetched photographs are decoded within size and pixel
  limits, re-encoded without metadata, and served only as renditions;
  fetching by web address refuses private and local addresses.
- Secrets are never in the repository: `JWT_SECRET` has no default and a
  published or short value is refused at start-up.

## Known limitations

These are trade-offs the design accepts. A report that shows one of them
doing more harm than described here is still welcome.

- **Someone can lock an account out of signing in.** After 20 failed
  sign-ins to one account within 15 minutes, further attempts on it are
  refused before the password is checked -- the right one included -- until
  the oldest failure is 15 minutes old (`app/throttle.py`). Each address is
  also held to 10 failures in 15 minutes, but someone sending from many
  addresses can keep an account locked for as long as they keep sending.
  The limit is what stops password guessing, so it holds for the owner too.
  The counts live in the API's memory: restarting the API service clears
  them, and the owner can sign in again at once.
- **Sign-in tokens are kept in the browser's `localStorage`**, where any
  script running on the site's own pages can read them. A cross-site
  scripting flaw would therefore let an attacker take a signed-in
  session. Defenses against that: the content security policy in
  `deploy/Caddyfile` runs only the site's own scripts and DigiCert's seal,
  and refuses inline scripts; React escapes everything it renders; and the
  pages never insert raw HTML. A stolen access token works for 30 minutes,
  a refresh token for 14 days (`ACCESS_TOKEN_EXPIRE_MINUTES`,
  `REFRESH_TOKEN_EXPIRE_DAYS`). Signing out, or a manager setting the
  account a new password, ends every one of the account's sessions at
  once, on every device: each token carries the account's version, which
  is checked on every request.
