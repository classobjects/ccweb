# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Which database the test session may build and drop.

The `engine` fixture drops the database `conftest._test_database_url` names
before it creates it, so that function is what stands between a mistyped
`TEST_DATABASE_URL` and a real database. Nothing here opens a connection.
"""

from __future__ import annotations

import pytest
from app.config import settings
from sqlalchemy.engine import make_url

from tests.conftest import _test_database_url


@pytest.fixture(autouse=True)
def _one_process(monkeypatch: pytest.MonkeyPatch) -> None:
    """Each test here names the database of a single-process run unless it says.

    Under pytest-xdist the worker's id is in the environment, and it changes
    the name; the tests that are about that set it themselves.
    """
    monkeypatch.delenv("PYTEST_XDIST_WORKER", raising=False)


def _elsewhere(database: str) -> str:
    """The application's own URL, pointed at another database on the same server."""
    return (
        make_url(settings.database_url)
        .set(database=database)
        .render_as_string(hide_password=False)
    )


def test_the_default_is_the_configured_database_with_test_appended(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.setattr(settings, "test_database_url", None)
    configured = make_url(settings.database_url).database

    assert _test_database_url().database == f"{configured}_test"


def test_the_test_database_env_names_is_taken_when_the_process_has_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`.env`'s TEST_DATABASE_URL -- the test cluster -- counts as well."""
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.setattr(settings, "test_database_url", _elsewhere("cluster_test"))

    assert _test_database_url().database == "cluster_test"


def test_the_process_environment_comes_before_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "test_database_url", _elsewhere("cluster_test"))
    monkeypatch.setenv("TEST_DATABASE_URL", _elsewhere("scratch_test"))

    assert _test_database_url().database == "scratch_test"


def test_the_test_database_env_names_is_refused_like_any_other(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A `.env` value pointing at the application's database never reaches DROP."""
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.setattr(settings, "test_database_url", settings.database_url)

    with pytest.raises(RuntimeError, match="would drop"):
        _test_database_url()


def test_an_override_naming_a_test_database_is_taken(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TEST_DATABASE_URL", _elsewhere("scratch_test"))

    assert _test_database_url().database == "scratch_test"


def test_an_override_naming_the_applications_database_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The URL from `.env`, pasted in, must never reach `DROP DATABASE`."""
    monkeypatch.setenv("TEST_DATABASE_URL", settings.database_url)

    with pytest.raises(RuntimeError, match="would drop"):
        _test_database_url()


@pytest.mark.parametrize("database", ["scratch", "scratch_test_copy", "test"])
def test_an_override_not_named_as_a_test_database_is_refused(
    monkeypatch: pytest.MonkeyPatch, database: str
) -> None:
    monkeypatch.setenv("TEST_DATABASE_URL", _elsewhere(database))

    with pytest.raises(RuntimeError, match="_test"):
        _test_database_url()


def test_each_parallel_worker_has_a_database_of_its_own(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every worker drops and builds its database: two must never share one.

    The worker's id goes before the suffix, so the name still ends in `_test`,
    whichever way the base name was reached.
    """
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.setattr(settings, "test_database_url", None)
    configured = make_url(settings.database_url).database
    names = {}
    for worker in ("gw0", "gw1"):
        monkeypatch.setenv("PYTEST_XDIST_WORKER", worker)
        names[worker] = _test_database_url().database
    assert names == {"gw0": f"{configured}_gw0_test", "gw1": f"{configured}_gw1_test"}

    monkeypatch.setenv("TEST_DATABASE_URL", _elsewhere("scratch_test"))
    assert _test_database_url().database == "scratch_gw1_test"


def test_a_worker_is_refused_a_database_not_named_for_tests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The check reads the name as given, before the worker's id is added."""
    monkeypatch.setenv("PYTEST_XDIST_WORKER", "gw0")
    monkeypatch.setenv("TEST_DATABASE_URL", _elsewhere("scratch"))

    with pytest.raises(RuntimeError, match="_test"):
        _test_database_url()


def test_the_applications_own_name_is_refused_even_when_it_ends_in_test(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A development database called `x_test` is still not the suite's to drop."""
    own = _elsewhere("dev_test")
    monkeypatch.setattr(settings, "database_url", own)
    monkeypatch.setenv("TEST_DATABASE_URL", own)

    with pytest.raises(RuntimeError, match="would drop"):
        _test_database_url()
