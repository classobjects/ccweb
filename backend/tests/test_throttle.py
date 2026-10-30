# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Attempt limits on sign-in and registration (`app.throttle`).

Through the routes, not the counter alone: what matters is that a guesser
is stopped and the owner is not, and only the routes can say both.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import cast

import pytest
from app import throttle
from app.models import User, UserRole
from app.routers import auth
from app.security import hash_password
from fastapi import HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.orm import Session

from tests.conftest import CUSTOMER_PASSWORD


def _sign_in(client: TestClient, email: str, password: str) -> Response:
    """One sign-in attempt."""
    return client.post(
        "/api/auth/login", data={"username": email, "password": password}
    )


def _register(client: TestClient, email: str) -> Response:
    """One registration attempt."""
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": "longenough", "full_name": "Someone"},
    )


def test_a_guesser_is_stopped_even_when_the_guess_is_right(
    client: TestClient, customer_user: User
) -> None:
    """Over the limit the answer is a 429 before the password is looked at.

    Were the right password still let through, the 429s would only slow a
    guesser, and the one 200 among them would say which guess it was.
    """
    limit = throttle.SIGN_IN_FAILURES_BY_ADDRESS.attempts
    for _ in range(limit):
        assert _sign_in(client, customer_user.email, "wrongpassword").status_code == 401

    stopped = _sign_in(client, customer_user.email, CUSTOMER_PASSWORD)
    assert stopped.status_code == 429, stopped.text
    assert int(stopped.headers["Retry-After"]) > 0


def test_a_mistyped_password_does_not_lock_its_owner_out(
    client: TestClient, customer_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A sign-in that succeeds clears the account's failures before it.

    The per-address limit is lifted out of the way: what is shown is that
    the account's own count starts again, so failures from elsewhere before
    the owner's success do not add up with failures after it.
    """
    monkeypatch.setattr(throttle.SIGN_IN_FAILURES_BY_ADDRESS, "attempts", 1000)
    limit = throttle.SIGN_IN_FAILURES_BY_ACCOUNT.attempts
    for _ in range(limit - 1):
        _sign_in(client, customer_user.email, "wrongpassword")
    assert _sign_in(client, customer_user.email, CUSTOMER_PASSWORD).status_code == 200

    for _ in range(limit - 1):
        assert _sign_in(client, customer_user.email, "wrongpassword").status_code == 401
    assert _sign_in(client, customer_user.email, CUSTOMER_PASSWORD).status_code == 200


def test_a_success_does_not_reset_the_addresss_count(
    client: TestClient, customer_user: User, db: Session
) -> None:
    """A guesser holding one account cannot sign into it to start again.

    Their guesses at another account keep counting from the same address
    across the success, and the limit is met where it would have been.
    """
    other = User(
        email="other@example.com",
        full_name="Other",
        hashed_password=hash_password("another-password"),
        role=UserRole.customer,
    )
    db.add(other)
    db.commit()
    limit = throttle.SIGN_IN_FAILURES_BY_ADDRESS.attempts
    for _ in range(limit - 1):
        assert _sign_in(client, other.email, "wrongpassword").status_code == 401
    assert _sign_in(client, customer_user.email, CUSTOMER_PASSWORD).status_code == 200

    assert _sign_in(client, other.email, "wrongpassword").status_code == 401
    stopped = _sign_in(client, other.email, "another-password")
    assert stopped.status_code == 429, stopped.text


def test_an_account_is_counted_whatever_the_case_it_is_typed_in(
    client: TestClient, customer_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Spellings that sign into one account count against that one account."""
    monkeypatch.setattr(throttle.SIGN_IN_FAILURES_BY_ADDRESS, "attempts", 1000)
    for n in range(throttle.SIGN_IN_FAILURES_BY_ACCOUNT.attempts):
        spelling = customer_user.email.upper() if n % 2 else customer_user.email
        assert _sign_in(client, spelling, "wrongpassword").status_code == 401
    assert _sign_in(client, customer_user.email, CUSTOMER_PASSWORD).status_code == 429


def test_a_username_longer_than_any_address_is_refused_and_not_kept(
    client: TestClient,
) -> None:
    """Refused as a failed sign-in, counted against the caller, never keyed."""
    long_name = "x" * (throttle.MAX_KEY_LENGTH + 1) + "@example.com"
    response = _sign_in(client, long_name, "whatever123")
    assert response.status_code == 401, response.text
    assert throttle.SIGN_IN_FAILURES_BY_ACCOUNT.key_count() == 0
    assert throttle.SIGN_IN_FAILURES_BY_ADDRESS.key_count() == 1


def test_a_key_is_cut_to_the_longest_address() -> None:
    """Whatever reaches the counter directly is held at a bounded length."""
    limit = throttle.Limit(attempts=1, window_seconds=60)
    limit.take("y" * 10_000)
    assert [len(key) for key in limit._seen] == [throttle.MAX_KEY_LENGTH]


def test_keys_whose_window_has_passed_are_swept_away(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A key never asked about again does not stay in memory for good."""
    now = [1_000.0]
    monkeypatch.setattr(throttle.time, "monotonic", lambda: now[0])
    limit = throttle.Limit(attempts=5, window_seconds=60)
    for n in range(throttle.SWEEP_EVERY - 1):
        limit.take(f"stale{n}")
    assert limit.key_count() == throttle.SWEEP_EVERY - 1

    now[0] += 60
    limit.take("fresh")
    assert limit.key_count() == 1


def test_the_table_is_capped_by_dropping_the_stalest_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keys all still in their window are held only up to the cap."""
    now = [1_000.0]
    monkeypatch.setattr(throttle.time, "monotonic", lambda: now[0])
    limit = throttle.Limit(attempts=5, window_seconds=600, max_keys=3)
    for name in ("first", "second", "third", "fourth"):
        now[0] += 1
        limit.take(name)
    assert sorted(limit._seen) == ["fourth", "second", "third"]


def test_retry_after_waits_for_the_attempt_whose_leaving_frees_a_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A key holding more than its attempts waits for the `attempts`-th newest.

    The limit can be lowered under keys already counted; the oldest attempt
    leaving then still leaves the key full, so it says nothing of the wait.
    """
    now = [1_000.0]
    monkeypatch.setattr(throttle.time, "monotonic", lambda: now[0])
    limit = throttle.Limit(attempts=4, window_seconds=100)
    for _ in range(4):
        limit.take("key")
        now[0] += 10
    limit.attempts = 2
    # Stamped at 1000, 1010, 1020, 1030; now 1040. The one at 1020 frees a
    # slot, at 1120: 80 seconds away. The oldest would say 60.
    with pytest.raises(HTTPException) as refused:
        limit.take("key")
    assert refused.value.headers == {"Retry-After": "80"}


def test_a_refused_attempt_counts_against_nothing() -> None:
    """Over the limit on one key, the others are left as they were."""
    limit = throttle.Limit(attempts=1, window_seconds=60)
    limit.take("spent")
    with pytest.raises(HTTPException):
        limit.take("fresh", "spent")
    assert limit.key_count() == 1
    limit.take("fresh")


def test_parallel_guesses_meet_the_limit_like_sequential_ones(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A burst of guesses at once gets no more tries than the limit allows.

    Each guess is held in the password check long enough that all of them
    overlap there. Were the limit checked first and the failure counted only
    after, every guess would pass the check before any was counted.
    """
    for limit in throttle.ALL_LIMITS:
        limit.clear()
    monkeypatch.setattr(auth, "account_by_email", lambda _db, _email: None)

    def slow_verify(_password: str, _hash: str) -> bool:
        """A wrong password, after long enough for the others to arrive."""
        time.sleep(0.3)
        return False

    monkeypatch.setattr(auth, "verify_password", slow_verify)
    request = Request({"type": "http", "client": ("203.0.113.9", 1234)})
    allowed = throttle.SIGN_IN_FAILURES_BY_ADDRESS.attempts

    def guess(n: int) -> int:
        """One guess, answered with its status."""
        form = OAuth2PasswordRequestForm(
            username="someone@example.com", password=f"guess{n}"
        )
        try:
            auth.login(form, request, cast("Session", None))
        except HTTPException as refused:
            return refused.status_code
        return 200

    with ThreadPoolExecutor(max_workers=allowed * 2) as pool:
        answers = list(pool.map(guess, range(allowed * 2)))
    assert sorted(answers) == [401] * allowed + [429] * allowed


def test_unknown_addresses_count_like_known_ones(client: TestClient) -> None:
    """Guessing which addresses exist is limited as guessing passwords is."""
    for n in range(throttle.SIGN_IN_FAILURES_BY_ADDRESS.attempts):
        assert (
            _sign_in(client, f"ghost{n}@example.com", "whatever123").status_code == 401
        )
    assert _sign_in(client, "ghost@example.com", "whatever123").status_code == 429


def test_one_account_is_limited_however_many_addresses_guess_at_it(
    client: TestClient, customer_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Spreading guesses over many addresses still meets the account's limit.

    The per-address limit is lifted out of the way, which is what a guesser
    with many addresses has done.
    """
    monkeypatch.setattr(throttle.SIGN_IN_FAILURES_BY_ADDRESS, "attempts", 1000)
    for _ in range(throttle.SIGN_IN_FAILURES_BY_ACCOUNT.attempts):
        assert _sign_in(client, customer_user.email, "wrongpassword").status_code == 401
    assert _sign_in(client, customer_user.email, CUSTOMER_PASSWORD).status_code == 429


def test_the_limit_lifts_when_its_window_has_passed(
    client: TestClient, customer_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A limit, not a ban: once the window is over the owner signs in."""
    now = [1_000.0]
    monkeypatch.setattr(throttle.time, "monotonic", lambda: now[0])
    for _ in range(throttle.SIGN_IN_FAILURES_BY_ADDRESS.attempts):
        _sign_in(client, customer_user.email, "wrongpassword")
    assert _sign_in(client, customer_user.email, CUSTOMER_PASSWORD).status_code == 429

    now[0] += throttle.SIGN_IN_FAILURES_BY_ADDRESS.window_seconds
    assert _sign_in(client, customer_user.email, CUSTOMER_PASSWORD).status_code == 200


def test_registration_answers_only_a_handful_of_addresses(
    client: TestClient, customer_user: User
) -> None:
    """Each 409 says an address has an account, so every attempt counts."""
    limit = throttle.REGISTRATIONS_BY_ADDRESS.attempts
    answers = [_register(client, customer_user.email).status_code for _ in range(limit)]
    assert answers == [409] * limit

    stopped = _register(client, "brand-new@example.com")
    assert stopped.status_code == 429, stopped.text
    assert "Retry-After" in stopped.headers
