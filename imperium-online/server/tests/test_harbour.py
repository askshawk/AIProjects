"""The Harbour: the facility gate that separates ships from soldiers."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app import game_config
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


def _reg(c, email, name):
    r = c.post("/register", json={"email": email, "password": "pw", "city_name": name})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _set_levels(c, city_id, **levels):
    with Session(c.engine) as s:
        city = s.get(City, city_id)
        for k, v in levels.items():
            setattr(city, k, v)
        city.wood = city.stone = city.silver = 100000.0
        s.add(city)
        s.commit()


# --- pure ------------------------------------------------------------------

def test_sea_units_are_flagged_and_carry_berths():
    assert game_config.is_sea_unit("trireme")
    assert game_config.is_sea_unit("transport")
    assert not game_config.is_sea_unit("legionary")
    # Only transports carry cargo.
    assert game_config.UNITS["transport"]["capacity"] == 16
    assert game_config.UNITS["trireme"]["capacity"] == 0


def test_split_domains_separates_the_fleet():
    land, sea = game_config.split_domains({"legionary": 5, "trireme": 2, "transport": 1, "archer": 0})
    assert land == {"legionary": 5}
    assert sea == {"trireme": 2, "transport": 1}


def test_capacity_and_cargo_maths():
    # 3 transports = 48 berths; a settler costs its 8 population.
    assert game_config.transport_capacity({"transport": 3, "trireme": 9}) == 48
    assert game_config.cargo_population({"legionary": 10, "settler": 1}) == 18


def test_recruit_seconds_uses_the_facility_level():
    # Same 5%-per-level curve, whichever building it is.
    at_one = game_config.recruit_seconds("trireme", 1, 1)
    at_five = game_config.recruit_seconds("trireme", 1, 5)
    assert at_five < at_one


def test_fleet_speed_ignores_cargo():
    # A slow settler aboard must not slow the crossing; the transport does.
    stack = {"settler": 2, "transport": 1, "trireme": 3}
    assert game_config.fleet_speed(stack) == game_config.UNITS["transport"]["speed"]
    assert game_config.army_speed(stack) == game_config.UNITS["settler"]["speed"]


def test_can_recruit_unit_gates_by_facility():
    # ships need a harbour; soldiers a barracks; settlers a forum too.
    assert not game_config.can_recruit_unit("trireme", 5, 5, 0)
    assert game_config.can_recruit_unit("trireme", 1, 0, 1)
    assert not game_config.can_recruit_unit("legionary", 5, 0, 5)
    assert not game_config.can_recruit_unit("settler", 1, 1, 0)


# --- API -------------------------------------------------------------------

def test_naval_recruit_requires_a_harbour(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    _set_levels(client, city["id"], barracks_level=3, harbour_level=0, farm_level=10)

    r = client.post(f"/cities/{city['id']}/recruit", headers=h, json={"unit_type": "trireme", "count": 1})
    assert r.status_code == 400
    assert "harbour" in r.json()["detail"].lower()

    _set_levels(client, city["id"], harbour_level=1)
    assert client.post(
        f"/cities/{city['id']}/recruit", headers=h, json={"unit_type": "trireme", "count": 1}
    ).status_code == 201


def test_land_recruit_still_requires_a_barracks(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    # A harbour alone doesn't raise soldiers.
    _set_levels(client, city["id"], barracks_level=0, harbour_level=3, farm_level=10)
    r = client.post(f"/cities/{city['id']}/recruit", headers=h, json={"unit_type": "legionary", "count": 1})
    assert r.status_code == 400
    assert "barracks" in r.json()["detail"].lower()


def test_harbour_is_buildable_and_reported(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    assert city["harbour_level"] == 0
    assert any(u["building"] == "harbour" for u in city["upgrades"])
    # The catalog exposes the domain/capacity the client needs for the meter.
    trireme = next(u for u in city["units"] if u["unit_type"] == "trireme")
    transport = next(u for u in city["units"] if u["unit_type"] == "transport")
    assert trireme["domain"] == "sea" and trireme["capacity"] == 0
    assert transport["capacity"] == 16
    legionary = next(u for u in city["units"] if u["unit_type"] == "legionary")
    assert legionary["domain"] == "land"

    _set_levels(client, city["id"], forum_level=5)
    r = client.post(f"/cities/{city['id']}/builds", headers=h, json={"building": "harbour"})
    assert r.status_code == 201
