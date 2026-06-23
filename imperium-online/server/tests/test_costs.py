"""
Phase 3 economy tests — resource costs + population gating on the build endpoint.

Drives the real FastAPI app through a TestClient, but with the DB dependency
overridden to a throwaway in-memory SQLite so tests are isolated and fast. We
don't trigger the app lifespan (no `with`), so the background worker never
starts — these tests are purely about the request path.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app import game_config
from app.db import get_session
from app.main import app
from app.models import City


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # one shared in-memory connection across the test
    )
    SQLModel.metadata.create_all(engine)

    def _override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override
    c = TestClient(app)
    c.engine = engine  # expose so tests can set up edge-case state directly
    yield c
    app.dependency_overrides.clear()


def _set_levels(client, headers, **levels):
    """Force specific building levels directly in the DB, to set up an economy
    edge case (e.g. a city sitting just under its population cap) without having
    to grind dozens of upgrades through the resource gate first."""
    city_id = client.get("/cities/me", headers=headers).json()["id"]
    with Session(client.engine) as s:
        city = s.get(City, city_id)
        for building, level in levels.items():
            city.set_level(building, level)
        s.add(city)
        s.commit()


def _register(client, email="a@test.io"):
    r = client.post("/register", json={"email": email, "password": "pw", "city_name": "Roma"})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_cost_is_charged_on_queue(client):
    h = _register(client)
    before = client.get("/cities/me", headers=h).json()
    cost = game_config.building_cost("timber_camp", 2)

    after = client.post("/cities/{}/builds".format(before["id"]),
                        headers=h, json={"building": "timber_camp"}).json()

    assert after["wood"] == pytest.approx(before["wood"] - cost["wood"], abs=0.5)
    assert after["stone"] == pytest.approx(before["stone"] - cost["stone"], abs=0.5)
    assert after["silver"] == pytest.approx(before["silver"] - cost["silver"], abs=0.5)


def test_insufficient_resources_rejected(client):
    h = _register(client)
    city = client.get("/cities/me", headers=h).json()
    cid = city["id"]

    # Spend until the next timber upgrade is unaffordable, then assert a 400.
    # Costs grow geometrically, so this terminates quickly.
    last = None
    for _ in range(40):
        r = client.post(f"/cities/{cid}/builds", headers=h, json={"building": "timber_camp"})
        if r.status_code != 201:
            last = r
            break
    assert last is not None, "expected to run out of resources"
    assert last.status_code == 400
    assert "resources" in last.json()["detail"].lower()


def test_population_cap_blocks_and_farm_unblocks(client):
    h = _register(client)
    cid = client.get("/cities/me", headers=h).json()["id"]

    # Park the city at population 98 of a 100 cap (farm 1): forum1+timber1 = 9,
    # quarry9 = 36, silver10 = 50, farm1 = 3.
    _set_levels(client, h, quarry=9, silver_mine=10)
    city = client.get("/cities/me", headers=h).json()
    assert city["population_used"] == 98
    assert city["population_cap"] == 100

    # A forum upgrade (+5 pop → 103) must be refused for population, not money.
    blocked = client.post(f"/cities/{cid}/builds", headers=h, json={"building": "forum"})
    assert blocked.status_code == 400
    assert "population" in blocked.json()["detail"].lower()

    # Raising the Farm lifts the cap (100 → 140) and the forum now fits.
    r = client.post(f"/cities/{cid}/builds", headers=h, json={"building": "farm"})
    assert r.status_code == 201
    assert r.json()["population_cap"] == 140
    assert client.post(f"/cities/{cid}/builds", headers=h, json={"building": "forum"}).status_code == 201


def test_upgrade_previews_are_present_and_flagged(client):
    h = _register(client)
    city = client.get("/cities/me", headers=h).json()
    by_building = {u["building"]: u for u in city["upgrades"]}

    # Every building has a preview, and the cheap first upgrades are affordable.
    assert set(by_building) == set(game_config.BUILDINGS)
    assert by_building["timber_camp"]["affordable"] is True
    assert by_building["timber_camp"]["target_level"] == 2
    assert all(u["pop_ok"] for u in city["upgrades"])  # plenty of population at start
