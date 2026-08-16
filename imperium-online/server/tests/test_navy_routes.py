"""Sea routes: what may cross open water, and how long the crossing takes.

Island (0,0) spans cells 0..3; island (1,1) starts at (4,4). Registration fills
island (0,0) first, so a target at (4,4)+ is reliably overseas.
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app import world
from app.db import get_session
from app.main import app
from app.models import City, Movement, Unit


@pytest.fixture
def ctx():
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


def _garrison(c, city_id, **units):
    with Session(c.engine) as s:
        for unit_type, count in units.items():
            s.add(Unit(city_id=city_id, unit_type=unit_type, count=count))
        s.commit()


def _overseas_city(c, name="Ultima", user_id=999):
    """A city on island (1,1), reachable only by sea from island (0,0)."""
    with Session(c.engine) as s:
        city = City(user_id=user_id, name=name, x=5, y=5)
        s.add(city)
        s.commit()
        s.refresh(city)
        return {"id": city.id, "x": city.x, "y": city.y}


def _send(c, h, origin_id, tx, ty, units):
    return c.post("/movements", headers=h, json={
        "origin_city_id": origin_id, "target_x": tx, "target_y": ty, "units": units,
    })


def test_same_island_march_needs_no_ships(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    _reg(ctx, "b@t.io", "Carthago")  # lands on the same island
    roma = ctx.get("/cities/me", headers=h).json()
    world_cities = ctx.get("/world/cities", headers=h).json()
    carthago = next(c for c in world_cities if c["name"] == "Carthago")
    assert world.same_island(roma["x"], roma["y"], carthago["x"], carthago["y"])

    _garrison(ctx, roma["id"], legionary=10)
    r = _send(ctx, h, roma["id"], carthago["x"], carthago["y"], {"legionary": 10})
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "attack"


def test_cross_island_land_march_requires_transports(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    roma = ctx.get("/cities/me", headers=h).json()
    over = _overseas_city(ctx)
    assert not world.same_island(roma["x"], roma["y"], over["x"], over["y"])

    _garrison(ctx, roma["id"], legionary=10, transport=1)

    # 10 legionaries = 10 population of cargo; 0 transports = 0 berths.
    r = _send(ctx, h, roma["id"], over["x"], over["y"], {"legionary": 10})
    assert r.status_code == 400
    detail = r.json()["detail"].lower()
    assert "transport" in detail and "berth" in detail

    # One transport (16 berths) carries them.
    ok = _send(ctx, h, roma["id"], over["x"], over["y"], {"legionary": 10, "transport": 1})
    assert ok.status_code == 201, ok.text


def test_capacity_is_population_based_and_settlers_are_heavy(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    roma = ctx.get("/cities/me", headers=h).json()
    over = _overseas_city(ctx)
    _garrison(ctx, roma["id"], legionary=20, settler=2, transport=2)

    # 1 transport = 16 berths. A settler costs 8, so settler+9 legionaries = 17 > 16.
    over_capacity = _send(ctx, h, roma["id"], over["x"], over["y"],
                          {"settler": 1, "legionary": 9, "transport": 1})
    assert over_capacity.status_code == 400

    # Exactly 16 fits.
    exact = _send(ctx, h, roma["id"], over["x"], over["y"],
                  {"settler": 1, "legionary": 8, "transport": 1})
    assert exact.status_code == 201, exact.text


def test_pure_ship_raid_needs_no_capacity(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    roma = ctx.get("/cities/me", headers=h).json()
    over = _overseas_city(ctx)
    _garrison(ctx, roma["id"], trireme=4)
    r = _send(ctx, h, roma["id"], over["x"], over["y"], {"trireme": 4})
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "attack"


def test_cross_island_founding_requires_transports(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    roma = ctx.get("/cities/me", headers=h).json()
    _garrison(ctx, roma["id"], settler=2, transport=1)

    # (6,6) is an empty cell on island (1,1) — overseas.
    assert not world.same_island(roma["x"], roma["y"], 6, 6)
    denied = _send(ctx, h, roma["id"], 6, 6, {"settler": 1})
    assert denied.status_code == 400
    assert "transport" in denied.json()["detail"].lower()

    ok = _send(ctx, h, roma["id"], 6, 6, {"settler": 1, "transport": 1})
    assert ok.status_code == 201, ok.text
    assert ok.json()["kind"] == "found"


def test_cross_island_reinforce_requires_transports(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    roma = ctx.get("/cities/me", headers=h).json()
    # An overseas city belonging to the same player → reinforce.
    with Session(ctx.engine) as s:
        me = s.get(City, roma["id"])
        colony = City(user_id=me.user_id, name="Colonia", x=5, y=5)
        s.add(colony)
        s.commit()
    _garrison(ctx, roma["id"], legionary=5, transport=1)

    denied = _send(ctx, h, roma["id"], 5, 5, {"legionary": 5})
    assert denied.status_code == 400

    ok = _send(ctx, h, roma["id"], 5, 5, {"legionary": 5, "transport": 1})
    assert ok.status_code == 201, ok.text
    assert ok.json()["kind"] == "reinforce"


def test_crossing_sails_at_fleet_speed_not_cargo_speed(ctx):
    """A settler (speed 0.5) aboard a transport (0.9) must not slow the voyage —
    below decks it isn't walking."""
    h = _reg(ctx, "a@t.io", "Roma")
    roma = ctx.get("/cities/me", headers=h).json()
    _overseas_city(ctx)
    _garrison(ctx, roma["id"], settler=1, transport=2, trireme=1)

    r = _send(ctx, h, roma["id"], 5, 5, {"settler": 1, "transport": 1})
    assert r.status_code == 201
    with Session(ctx.engine) as s:
        m = s.exec(select(Movement).where(Movement.kind == "attack")).one()
        sea_secs = (m.arrives_at - m.departs_at).total_seconds()

    # Same trip overland would be gated by the settler's 0.5 speed — nearly
    # twice as slow as the transport's 0.9.
    from app import game_config
    dist = ((5 - roma["x"]) ** 2 + (5 - roma["y"]) ** 2) ** 0.5
    land_pace = game_config.travel_seconds(dist, {"settler": 1, "transport": 1})
    assert sea_secs < land_pace
