# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""`python -m ui_guide`: build the demo collection and take the pictures."""

from __future__ import annotations

import argparse
import os
import secrets
import sys
import time

from . import stack


def _seed(guide: stack.Guide) -> None:
    """Rebuild the demo database from nothing and enter the collection."""
    print(
        f"Building {stack.DEMO_DATABASE} on {guide.demo_url.host}:{guide.demo_url.port}"
    )
    stack.recreate_database(guide)
    stack.run_python("-m", "alembic", "upgrade", "head")
    stack.run_python("-m", "app.seeding", "load")
    from . import demo_data

    demo_data.build(secrets.token_urlsafe(16))
    print("Demo collection entered.")


def _passwords() -> dict[str, str]:
    """New passwords for the accounts the pictures sign in with, set now."""
    from app.models import UserRole

    from . import demo_data

    chosen = {
        stack.ADMIN_EMAIL: secrets.token_urlsafe(16),
        demo_data.CUSTOMER_EMAIL: secrets.token_urlsafe(16),
    }
    for email, password in chosen.items():
        role = UserRole.manager if email == stack.ADMIN_EMAIL else None
        demo_data.set_password(email, password, role)
    return chosen


def main(argv: list[str] | None = None) -> int:
    """Run the step asked for; 1 when a picture or the stack failed."""
    parser = argparse.ArgumentParser(prog="python -m ui_guide")
    parser.add_argument("step", choices=["all", "seed", "shots", "list", "serve"])
    parser.add_argument("names", nargs="*", help="pictures to take; all if none")
    args = parser.parse_args(argv)

    from . import pictures

    if args.step == "list":
        for picture in pictures.PICTURES:
            print(f"{picture.name:<26} {picture.route}")
        return 0
    unknown = sorted(set(args.names) - {p.name for p in pictures.PICTURES})
    if unknown:
        print(f"No such picture: {', '.join(unknown)}", file=sys.stderr)
        return 2

    guide = stack.load()
    os.environ.update(stack.environment(guide))
    guide.media.mkdir(parents=True, exist_ok=True)
    if args.step in {"all", "seed"}:
        _seed(guide)
        if args.step == "seed":
            return 0
    passwords = _passwords()
    running = stack.Stack(guide)
    try:
        running.start()
        if args.step == "serve":
            print(
                f"Serving {guide.console}/management, Chrome on port "
                f"{guide.browser_port}. Ctrl+C stops it."
            )
            for email, password in passwords.items():
                print(f"  {email}  {password}")
            while True:
                time.sleep(1)
        failed = pictures.take_all(guide, passwords, args.names)
    except KeyboardInterrupt:
        failed = 0
    finally:
        running.stop()
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
