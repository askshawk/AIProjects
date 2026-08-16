"""
Phase 7B — founding & reinforcement. A Settler-led stack to an empty cell founds
a colony; to your own city it reinforces; a settler to an occupied cell can't
found (army comes home).
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app import military
from app.db import get_session
from app.main import app
from app.models import City, Movement, Unit, utcnow


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)

    def _override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override
    c = TestClient(app)
    c.engine = engine
    yield c
    app.dependency_overrides.clear()


def _reg(c, email, city):
    return {"Authorization": f"Bearer {c.post('/register', json={'email': email, 'password': 'pw', 'city_name': city}).json()['access_token']}"}


def _garrison(c, city_id, **units):
    with Session(c.engine) as s:
        for unit_type, count in units.items():
            s.add(Unit(city_id=city_id, unit_type=unit_type, count=count))
        s.commit()


def _rush(c):
    past = utcnow() - timedelta(seconds=1)
    with Session(c.engine) as s:
        for m in s.exec(select(Movement).where(Movement.status == "traveling")).all():
            m.arrives_at = past
            s.add(m)
        s.commit()
        military.resolve_due_movements(s, utcnow())
        s.commit()


def test_settler_founds_a_colony(client):
    h = _reg(client, "a@t.io", "Roma")
    roma = client.get("/cities/me", headers=h).json()
    _garrison(client, roma["id"], settler=1, legionary=4)

    # March a settler + escort to an empty cell on the SAME island — no ships
    # needed. (Crossing to another island is covered in test_navy_routes.py.)
    r = client.post("/movements", headers=h, json={
        "origin_city_id": roma["id"], "target_x": 2, "target_y": 2, "units": {"settler": 1, "legionary": 4},
    })
    assert r.status_code == 201
    assert r.json()["kind"] == "found"
    # A march to an empty cell still reports where it set out from.
    assert (r.json()["from_x"], r.json()["from_y"]) == (roma["x"], roma["y"])

    _rush(client)
    cities = client.get("/cities", headers=h).json()
    assert len(cities) == 2
    colony = next(c for c in cities if (c["x"], c["y"]) == (2, 2))
    # The settler was consumed; the 4 legionaries are its garrison.
    detail = client.get(f"/cities/{colony['id']}", headers=h).json()
    assert next((u["have"] for u in detail["units"] if u["unit_type"] == "legionary"), 0) == 4
    assert next((u["have"] for u in detail["units"] if u["unit_type"] == "settler"), 0) == 0


def test_cannot_found_on_occupied_cell(client):
    h = _reg(client, "a@t.io", "Roma")
    _reg(client, "b@t.io", "Carthago")
    roma = client.get("/cities/me", headers=h).json()
    # Find Carthago's coordinates from the shared map.
    world = client.get("/world/cities", headers=h).json()
    carthago = next(c for c in world if c["name"] == "Carthago")
    _garrison(client, roma["id"], settler=1)

    # Sending a settler at an OCCUPIED enemy cell is an attack, not a found.
    r = client.post("/movements", headers=h, json={
        "origin_city_id": roma["id"], "target_x": carthago["x"], "target_y": carthago["y"], "units": {"settler": 1},
    })
    assert r.json()["kind"] == "attack"
    _rush(client)
    # No new city was founded for A.
    assert len(client.get("/cities", headers=h).json()) == 1


def test_empty_cell_without_settler_is_rejected(client):
    h = _reg(client, "a@t.io", "Roma")
    roma = client.get("/cities/me", headers=h).json()
    _garrison(client, roma["id"], legionary=5)
    # Same island, so the sea rules don't apply — this is purely about needing
    # a settler to claim empty ground.
    r = client.post("/movements", headers=h, json={
        "origin_city_id": roma["id"], "target_x": 2, "target_y": 2, "units": {"legionary": 5},
    })
    assert r.status_code == 400
    assert "settler" in r.json()["detail"].lower()


def test_reinforce_own_city(client):
    h = _reg(client, "a@t.io", "Roma")
    roma = client.get("/cities/me", headers=h).json()
    # Give Roma an army and found a second city to reinforce.
    _garrison(client, roma["id"], settler=1, legionary=10)
    client.post("/movements", headers=h, json={
        "origin_city_id": roma["id"], "target_x": 2, "target_y": 2, "units": {"settler": 1, "legionary": 2},
    })
    _rush(client)
    colony = next(c for c in client.get("/cities", headers=h).json() if (c["x"], c["y"]) == (2, 2))

    # Reinforce the colony with Roma's remaining legionaries — same island, so
    # they march overland without transports.
    r = client.post("/movements", headers=h, json={
        "origin_city_id": roma["id"], "target_x": 2, "target_y": 2, "units": {"legionary": 8},
    })
    assert r.json()["kind"] == "reinforce"
    _rush(client)
    detail = client.get(f"/cities/{colony['id']}", headers=h).json()
    # 2 (founding escort) + 8 (reinforcement) = 10
    assert next(u["have"] for u in detail["units"] if u["unit_type"] == "legionary") == 10
