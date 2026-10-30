# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Attempt limits for sign-in and registration.

Without them a stranger can guess passwords against sign-in as fast as the
server answers, and test addresses against registration -- whose 409 for a
taken address says the address has an account -- by the thousand.

Counted in this process's memory. The API runs as one uvicorn process
behind Caddy (`docs/deployment-windows.md`, `docs/deployment-linux.md`), so
one count is every count; a restart
clears them, which costs an attacker nothing they could not get by waiting
out the window. The address is the caller's as uvicorn sees it, which with
`--proxy-headers` behind Caddy is the browser's, not Caddy's.

The memory is bounded. A key is at most `MAX_KEY_LENGTH` characters, every
`SWEEP_EVERY` attempts counted the keys whose attempts have all aged out are dropped,
and a table that still holds more than `max_keys` loses the keys whose last
attempt is oldest -- so a stranger naming a new account on every request
cannot grow it without limit.
"""

from __future__ import annotations

import heapq
import math
import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock

from fastapi import HTTPException, status

#: The longest key counted: an address is at most 254 characters (RFC 5321),
#: so a longer one names no account and is cut to this length.
MAX_KEY_LENGTH = 254

#: How many counted attempts pass between sweeps of the keys whose window is over.
SWEEP_EVERY = 1000


def _key(key: str) -> str:
    """The key as counted: no longer than `MAX_KEY_LENGTH`."""
    return key[:MAX_KEY_LENGTH]


@dataclass
class Limit:
    """At most `attempts` within `window_seconds`, per key.

    At most `max_keys` keys are held; past that the stalest are forgotten.
    """

    attempts: int
    window_seconds: float
    max_keys: int = 100_000
    _seen: dict[str, deque[float]] = field(default_factory=dict, repr=False)
    _lock: Lock = field(default_factory=Lock, repr=False)
    _records: int = field(default=0, repr=False)

    def _recent(self, key: str, now: float) -> deque[float]:
        """This key's attempts still inside the window, oldest first.

        A key left with none is dropped. Keys that are never asked about
        again are dropped by `_sweep` instead.
        """
        seen = self._seen.get(key, deque())
        while seen and seen[0] <= now - self.window_seconds:
            seen.popleft()
        if not seen:
            self._seen.pop(key, None)
        return seen

    def _sweep(self, now: float) -> None:
        """Drop every key whose attempts have aged out, then the stalest over the cap.

        The caller holds the lock.
        """
        for key in list(self._seen):
            self._recent(key, now)
        excess = len(self._seen) - self.max_keys
        if excess > 0:
            stalest = heapq.nsmallest(
                excess, self._seen.items(), key=lambda item: item[1][-1]
            )
            for key, _ in stalest:
                del self._seen[key]

    def take(self, *keys: str) -> float:
        """Count one attempt against each key, or a 429 when any has none left.

        Taken before the attempt is looked at, so a caller over the limit
        learns nothing from it -- not even whether the password was right.
        The check and the count are one step under the lock: were they two,
        requests arriving together would all pass the check before any was
        counted, and a burst of guesses in parallel would never meet the
        limit. A refused attempt counts against nothing.

        Returns the attempt's stamp, which `give_back` takes when the
        attempt turns out not to be one the limit counts.
        """
        now = time.monotonic()
        with self._lock:
            counted = [_key(key) for key in keys]
            recent = [self._recent(key, now) for key in counted]
            # The attempt that must age out before one more fits is the
            # `attempts`-th newest: the oldest can leave and still leave
            # the key full.
            waits = [
                seen[-self.attempts] + self.window_seconds - now
                for seen in recent
                if len(seen) >= self.attempts
            ]
            if not waits:
                for key, seen in zip(counted, recent, strict=True):
                    seen.append(now)
                    self._seen[key] = seen
                self._records += 1
                if self._records >= SWEEP_EVERY or len(self._seen) > self.max_keys:
                    self._records = 0
                    self._sweep(now)
        if waits:
            retry_after = max(1, math.ceil(max(waits)))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )
        return now

    def give_back(self, stamp: float, *keys: str) -> None:
        """Uncount the attempt `take` stamped `stamp` from each key.

        A key that no longer holds it -- forgotten, swept or aged out since
        -- is left as it is.
        """
        with self._lock:
            for key in keys:
                seen = self._seen.get(_key(key))
                if seen is not None and stamp in seen:
                    seen.remove(stamp)
                    if not seen:
                        del self._seen[_key(key)]

    def forget(self, *keys: str) -> None:
        """Drop what each key has used."""
        with self._lock:
            for key in keys:
                self._seen.pop(_key(key), None)

    def clear(self) -> None:
        """Drop every count."""
        with self._lock:
            self._seen.clear()
            self._records = 0

    def key_count(self) -> int:
        """How many keys are held."""
        with self._lock:
            return len(self._seen)


#: Failed sign-ins from one address. A person mistyping a password does not
#: reach ten in a quarter hour; a guesser does at once. A success does not
#: clear it: the failures age out of the window instead, so a guesser who
#: also holds one account cannot reset the count by signing into it.
SIGN_IN_FAILURES_BY_ADDRESS = Limit(attempts=10, window_seconds=15 * 60)

#: Failed sign-ins naming one account, from anywhere: a guesser spread over
#: many addresses still meets this. Higher than the per-address limit so a
#: stranger cannot lock the owner out as cheaply as they could guess. The
#: owner's own success clears it.
SIGN_IN_FAILURES_BY_ACCOUNT = Limit(attempts=20, window_seconds=15 * 60)

#: Registrations from one address, whatever their answer: each 409 says an
#: address has an account, so the answers themselves are what is limited.
REGISTRATIONS_BY_ADDRESS = Limit(attempts=5, window_seconds=60 * 60)

ALL_LIMITS = (
    SIGN_IN_FAILURES_BY_ADDRESS,
    SIGN_IN_FAILURES_BY_ACCOUNT,
    REGISTRATIONS_BY_ADDRESS,
)
