"""GET /friedberg/mule: what the plate rules say of the note being entered.

The rules are `app.mule_rules`; these pin what the console is told for
facts typed but not yet saved, one answer per way the rules can speak.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def _says(client: TestClient, headers: dict[str, str], **params: object) -> str:
    """The endpoint's answer for these facts."""
    resp = client.get("/api/friedberg/mule", params=params, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["says"]


#: A 1934A $5 Silver Certificate: macro faces, so a micro back (938 or
#: below) makes it a mule.
_FIVE_1934A = {
    "note_type": "silver_certificate",
    "denomination": "usd_note_5",
    "series_year": 1934,
    "series_letter": "A",
}


@pytest.mark.parametrize(
    ("back_plate", "says"),
    [("912", "mule"), ("938", "mule"), ("939", "not_mule"), ("1204", "not_mule")],
)
def test_the_back_plate_decides_a_series_the_rules_cover(
    client: TestClient, admin_headers: dict[str, str], back_plate: str, says: str
) -> None:
    """Either side of the last micro back plate, 938."""
    assert _says(client, admin_headers, **_FIVE_1934A, back_plate=back_plate) == says


@pytest.mark.parametrize("back_plate", [None, "", "  ", "9l2"])
def test_a_covered_series_without_a_readable_back_plate_asks_for_one(
    client: TestClient, admin_headers: dict[str, str], back_plate: str | None
) -> None:
    """The rule speaks for this series once the back plate is known as digits."""
    params = dict(_FIVE_1934A)
    if back_plate is not None:
        params["back_plate"] = back_plate
    assert _says(client, admin_headers, **params) == "needs_back_plate"


def test_a_series_no_rule_covers_says_so(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """2017A $1 FRN: from 1981 a back number alone says nothing."""
    says = _says(
        client,
        admin_headers,
        note_type="frn",
        denomination="usd_note_1",
        series_year=2017,
        series_letter="A",
        back_plate="12",
    )
    assert says == "no_rule"


def test_nothing_typed_yet_is_no_rule(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """With no class, value or series there is no rule to ask."""
    assert _says(client, admin_headers) == "no_rule"


def test_a_back_the_number_cannot_decide_is_left_to_a_person(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """$1 SC back 470 carries numbers of neither size."""
    says = _says(
        client,
        admin_headers,
        note_type="silver_certificate",
        denomination="usd_note_1",
        series_year=1935,
        series_letter="A",
        back_plate="470",
    )
    assert says == "undecided"


def test_an_unknown_code_is_refused(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """A code that names nothing is a 422, not "no rule"."""
    resp = client.get(
        "/api/friedberg/mule",
        params={**_FIVE_1934A, "denomination": "usd_note_7"},
        headers=admin_headers,
    )
    assert resp.status_code == 422, resp.text
    assert "usd_note_7" in resp.json()["detail"]


def test_it_needs_a_manager(client: TestClient) -> None:
    """Signed out: refused, as the rest of the catalog is."""
    resp = client.get("/api/friedberg/mule", params=_FIVE_1934A)
    assert resp.status_code == 401, resp.text
