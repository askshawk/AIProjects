"""
Phase 7C — loyalty & conquest. Loyalty regenerates over time; a settler-led
assault that wipes the garrison erodes it; at 0 the city flips to the attacker.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app import game_config, military
from app.db import get_session
from app.main import app
from app.models import City, Movement, Unit, utcnow


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


def _reg(c, email, city):
    return {"Authorization": f"Bearer {c.post('/register', json={'email': email, 'password': 'pw', 'city_name': city}).json()['access_token']}"}


def _coords(c, headers):
    me = c.get("/cities/me", headers=headers).json()
    return me["id"], me["x"], me["y"]


def _garrison(c, city_id, **units):
    with Session(c.engine) as s:
        for unit_type, count in units.items():
            s.add(Unit(city_id=city_id, unit_type=unit_type, count=count))
        s.commit()


def _resolve_now(c):
    past = utcnow() - timedelta(seconds=1)
    with Session(c.engine) as s:
        for m in s.exec(select(Movement).where(Movement.status == "traveling", Movement.kind == "attack")).all():
            m.arrives_at = past
            s.add(m)
        s.commit()
        military.resolve_due_movements(s, utcnow())
        s.commit()


def _loyalty(c, city_id):
    with Session(c.engine) as s:
        return s.get(City, city_id).loyalty


def _owner(c, city_id):
    with Session(c.engine) as s:
        return s.get(City, city_id).user_id


def test_loyalty_regenerates_in_catch_up(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    cid, _, _ = _coords(ctx, h)
    with Session(ctx.engine) as s:
        city = s.get(City, cid)
        city.loyalty = 40
        city.last_tick_at = utcnow() - timedelta(hours=10)  # 10h * 2/hr = +20
        s.add(city)
        s.commit()
    ctx.get("/cities/me", headers=h)  # triggers catch_up
    assert _loyalty(ctx, cid) == 60


def _attack(ctx, h_att, origin_id, tx, ty, **units):
    return ctx.post("/movements", headers=h_att, json={
        "origin_city_id": origin_id, "target_x": tx, "target_y": ty, "units": units,
    })


def test_settler_assault_erodes_loyalty(ctx):
    h_a = _reg(ctx, "a@t.io", "Roma")
    h_b = _reg(ctx, "b@t.io", "Carthago")
    a_id, _, _ = _coords(ctx, h_a)
    b_id, bx, by = _coords(ctx, h_b)
    _garrison(ctx, a_id, legionary=50, settler=1)  # overwhelming + a settler
    # defender undefended → attacker wins, garrison wiped

    assert _attack(ctx, h_a, a_id, bx, by, legionary=50, settler=1).status_code == 201
    _resolve_now(ctx)
    # One hit: 100 - 25 = 75, not captured.
    assert _loyalty(ctx, b_id) == 100 - game_config.LOYALTY_HIT
    assert _owner(ctx, b_id) != _owner(ctx, a_id)  # still B's


def test_repeated_assaults_capture_the_city(ctx):
    h_a = _reg(ctx, "a@t.io", "Roma")
    h_b = _reg(ctx, "b@t.io", "Carthago")
    a_id, _, _ = _coords(ctx, h_a)
    b_id, bx, by = _coords(ctx, h_b)
    a_owner = _owner(ctx, a_id)

    # Four settler-led assaults (100 → 75 → 50 → 25 → 0 = capture). Re-arm each.
    captured = False
    for i in range(4):
        _garrison(ctx, a_id, legionary=50, settler=1)
        _attack(ctx, h_a, a_id, bx, by, legionary=50, settler=1)
        _resolve_now(ctx)
        if _owner(ctx, b_id) == a_owner:
            captured = True
            break
    assert captured, "city should have flipped owner after loyalty hit 0"
    # Reset to the post-capture value, garrison transferred (some legionaries hold it).
    assert _loyalty(ctx, b_id) == game_config.LOYALTY_AFTER_CAPTURE
    with Session(ctx.engine) as s:
        held = s.exec(select(Unit).where(Unit.city_id == b_id, Unit.unit_type == "legionary")).first()
        assert held is not None and held.count > 0
    # A now owns two cities.
    assert len(ctx.get("/cities", headers=h_a).json()) == 2


def test_winning_without_a_settler_never_captures(ctx):
    h_a = _reg(ctx, "a@t.io", "Roma")
    h_b = _reg(ctx, "b@t.io", "Carthago")
    a_id, _, _ = _coords(ctx, h_a)
    b_id, bx, by = _coords(ctx, h_b)
    _garrison(ctx, a_id, legionary=50)

    _attack(ctx, h_a, a_id, bx, by, legionary=50)
    _resolve_now(ctx)
    # Garrison wiped but no settler → loyalty untouched, no capture.
    assert _loyalty(ctx, b_id) == 100
    assert _owner(ctx, b_id) != _owner(ctx, a_id)
