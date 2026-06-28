"""
Phase 7A — multi-city ownership. A user can own several cities; every per-city
endpoint must load BY id and enforce ownership.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import City


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


def _give_second_city(c, headers, name, x, y):
    """Until founding lands (Sub-step B), add a city directly so we can test the
    multi-city plumbing."""
    me = c.get("/cities/me", headers=headers).json()
    with Session(c.engine) as s:
        owner_id = s.get(City, me["id"]).user_id
        city = City(user_id=owner_id, name=name, x=x, y=y)
        s.add(city)
        s.commit()
        return city.id


def test_list_cities(client):
    h = _reg(client, "a@t.io", "Roma")
    second = _give_second_city(client, h, "Ostia", 9, 9)
    cities = client.get("/cities", headers=h).json()
    assert {c["name"] for c in cities} == {"Roma", "Ostia"}
    assert second in {c["id"] for c in cities}


def test_get_city_by_id_ownership(client):
    h_a = _reg(client, "a@t.io", "Roma")
    h_b = _reg(client, "b@t.io", "Carthago")
    a_city = client.get("/cities/me", headers=h_a).json()["id"]

    # Owner can read it; the other user gets 403; missing id gets 404.
    assert client.get(f"/cities/{a_city}", headers=h_a).status_code == 200
    assert client.get(f"/cities/{a_city}", headers=h_b).status_code == 403
    assert client.get("/cities/99999", headers=h_a).status_code == 404


def test_build_targets_the_named_city(client):
    h = _reg(client, "a@t.io", "Roma")
    roma = client.get("/cities/me", headers=h).json()["id"]
    ostia = _give_second_city(client, h, "Ostia", 9, 9)

    # Build in Ostia only.
    client.post(f"/cities/{ostia}/builds", headers=h, json={"building": "timber_camp"})
    assert len(client.get(f"/cities/{ostia}", headers=h).json()["build_jobs"]) == 1
    assert len(client.get(f"/cities/{roma}", headers=h).json()["build_jobs"]) == 0


def test_cannot_build_in_someone_elses_city(client):
    h_a = _reg(client, "a@t.io", "Roma")
    h_b = _reg(client, "b@t.io", "Carthago")
    a_city = client.get("/cities/me", headers=h_a).json()["id"]
    assert client.post(f"/cities/{a_city}/builds", headers=h_b, json={"building": "forum"}).status_code == 403
