# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""A browser never answers an API request from its own copy.

Chrome restoring a tab, or going Back, may replay a GET from its disk cache
without asking the server unless the answer said `no-store`; the console then
shows a list from before the latest changes. A route that wants caching --
an image's bytes, named for their content -- says so itself and keeps it.
"""

from __future__ import annotations

from app.routers.images import CACHE_CONTROL
from fastapi.testclient import TestClient

from tests.builders import make_jpeg


def test_an_api_answer_is_never_stored(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = client.get("/api/reports", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "no-store"


def test_a_refusal_is_never_stored_either(client: TestClient) -> None:
    response = client.get("/api/reports")
    assert response.status_code == 401
    assert response.headers["Cache-Control"] == "no-store"


def test_an_image_keeps_its_own_caching(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    uploaded = client.post(
        "/api/images",
        files={"file": ("coin.jpg", make_jpeg(), "image/jpeg")},
        headers=admin_headers,
    )
    assert uploaded.status_code == 201, uploaded.text
    thumb = client.get(uploaded.json()["thumbnail_url"])
    assert thumb.status_code == 200
    assert thumb.headers["Cache-Control"] == CACHE_CONTROL
