# Contributing

Thank you for considering a contribution. One person maintains this project,
so small, focused changes with tests are the easiest to accept.

## Before you start

- Read [docs/overview.md](docs/overview.md), then
  [docs/project-purpose.md](docs/project-purpose.md). Most design decisions
  follow from a rule stated there.
- For anything larger than a fix, open an issue first. Describe the problem
  and the change you propose.
- Report security problems through [SECURITY.md](SECURITY.md), not in an
  issue.

## Setting up

Follow [docs/environment-setup-windows.md](docs/environment-setup-windows.md)
or [docs/environment-setup-linux.md](docs/environment-setup-linux.md). Every
script in `scripts/` exists as a `.cmd` for Windows and a `.sh` for Linux.

## Making a change

1. Fork the repository and create a topic branch from `main`.
2. Make the change, with a test that fails without it.
3. Run every gate and make it pass:

   Windows (cmd):

   ```console
   cd /d %USERPROFILE%\dev\ccweb
   .\scripts\ccweb_check.cmd
   ```

   Linux (bash):

   ```console
   cd ~/dev/ccweb
   ./scripts/ccweb_check.sh
   ```

   `ccweb_check fix` applies the formatters first. Every gate is at zero, so
   anything it reports is new.
4. Open a pull request against `main`. Explain what changed and why.

## Conventions

The binding conventions are written down. The most important:

- **Code.** Every public function has a docstring and full type annotations
  (ruff `D` and `ANN`). No lint finding is ignored. Comments state the
  constraint a piece of code protects, not the history of how it came
  about. Money is `Decimal`, never a float.
- **Data.** The database is the system of record. Anything that changes a
  table with a history goes through that table's single writer module
  ([docs/architecture.md](docs/architecture.md)).
- **Scripts.** A change to `scripts/X.cmd` comes with the same change to
  `scripts/X.sh` (same modes, wording and exit codes). No script names a
  port, host or folder of its own; each comes from
  `backend/app/runtime_settings.py`.
- **Documentation.** Documents describe the current state, not their
  history. Designs go in `docs/specs/<topic>-design.md`. Command blocks are
  fenced as `console` and paste into their shell as written. Where cmd and
  bash differ, a block is given for both.
- **Reference data.** Only facts may be shipped. A publisher's catalog
  numbering or price guide may not
  ([docs/reference-data.md](docs/reference-data.md)).
- **Test data.** Use `example.com` addresses, fictional names and synthetic
  identifiers. Friedberg numbers in tests are in the 9900s.

[docs/code-quality.md](docs/code-quality.md) explains the gates and their
few exceptions.

## License

By contributing, you agree that your contribution is licensed under the
Apache License 2.0, as the rest of the project is ([LICENSE](LICENSE)).

## Conduct

Everyone taking part is expected to follow the
[code of conduct](CODE_OF_CONDUCT.md).
