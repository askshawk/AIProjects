"""
Movement lifecycle — the full send → battle → return cycle through the real app,
including the crucial property that a battle resolves while NOBODY is online (via
the worker's global sweep, not a player read).
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


def _rush_movements(c, kind=None):
    """Pull traveling movements' arrival into the past."""
    past = utcnow() - timedelta(seconds=1)
    with Session(c.engine) as s:
        q = select(Movement).where(Movement.status == "traveling")
        if kind:
            q = q.where(Movement.kind == kind)
        for m in s.exec(q).all():
            m.arrives_at = past
            s.add(m)
        s.commit()


def _setup(c):
    att = _reg(c, "att@t.io", "Attacker")
    dfn = _reg(c, "def@t.io", "Defender")
    ac = c.get("/cities/me", headers=att).json()
    dc = c.get("/cities/me", headers=dfn).json()
    return att, dfn, ac, dc


def test_send_validations(ctx):
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], legionary=10)

    # Empty cell with no settler → can't found, can't attack (400).
    assert ctx.post("/movements", headers=att, json={"origin_city_id": ac["id"], "target_x": 99, "target_y": 99, "units": {"legionary": 1}}).status_code == 400
    # Can't attack yourself.
    assert ctx.post("/movements", headers=att, json={"origin_city_id": ac["id"], "target_x": ac["x"], "target_y": ac["y"], "units": {"legionary": 1}}).status_code == 400
    # Can't send units you don't have.
    assert ctx.post("/movements", headers=att, json={"origin_city_id": ac["id"], "target_x": dc["x"], "target_y": dc["y"], "units": {"legionary": 999}}).status_code == 400
    # Must send something.
    assert ctx.post("/movements", headers=att, json={"origin_city_id": ac["id"], "target_x": dc["x"], "target_y": dc["y"], "units": {}}).status_code == 400


def test_full_attack_cycle(ctx):
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], legionary=20)
    _garrison(ctx, dc["id"], legionary=5)

    # Send → units leave the city immediately.
    r = ctx.post("/movements", headers=att, json={"origin_city_id": ac["id"], "target_x": dc["x"], "target_y": dc["y"], "units": {"legionary": 20}})
    assert r.status_code == 201
    # Origin coords travel with the movement so the map can draw the route.
    assert (r.json()["from_x"], r.json()["from_y"]) == (ac["x"], ac["y"])
    listed = ctx.get("/movements/me", headers=att).json()[0]
    assert (listed["from_x"], listed["from_y"]) == (ac["x"], ac["y"])
    assert (listed["to_x"], listed["to_y"]) == (dc["x"], dc["y"])
    home = ctx.get("/cities/me", headers=att).json()
    assert next(u["have"] for u in home["units"] if u["unit_type"] == "legionary") == 0

    # Defender loads after arrival → battle resolves on their read.
    _rush_movements(ctx, kind="attack")
    dcity = ctx.get("/cities/me", headers=dfn).json()
    assert next(u["have"] for u in dcity["units"] if u["unit_type"] == "legionary") == 0  # garrison wiped

    reports = ctx.get("/reports/me", headers=dfn).json()
    assert len(reports) == 1
    rep = reports[0]
    assert rep["outcome"] == "attacker_won"
    assert rep["attacker_sent"] == {"legionary": 20}
    assert rep["attacker_survivors"] == {"legionary": 14}
    assert rep["i_attacked"] is False  # this defender's copy

    # A return movement now carries survivors home; rush it and they arrive.
    _rush_movements(ctx, kind="return")
    home2 = ctx.get("/cities/me", headers=att).json()
    assert next(u["have"] for u in home2["units"] if u["unit_type"] == "legionary") == 14
    # Attacker sees the same battle from their side.
    arep = ctx.get("/reports/me", headers=att).json()
    assert arep[0]["i_attacked"] is True


def test_battle_resolves_while_everyone_is_offline(ctx):
    """The load-bearing property: nobody reads, the worker's global sweep
    resolves the battle anyway."""
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], legionary=10)
    _garrison(ctx, dc["id"], scout=3)

    ctx.post("/movements", headers=att, json={"origin_city_id": ac["id"], "target_x": dc["x"], "target_y": dc["y"], "units": {"legionary": 10}})
    _rush_movements(ctx, kind="attack")

    # No player read — drive the worker's resolver directly.
    with Session(ctx.engine) as s:
        military.resolve_due_movements(s, utcnow())
        s.commit()

    with Session(ctx.engine) as s:
        # Defender garrison wiped, a return movement was spawned.
        defender_scouts = s.exec(
            select(Unit).where(Unit.city_id == dc["id"], Unit.unit_type == "scout")
        ).first()
        assert defender_scouts.count == 0
        returns = s.exec(select(Movement).where(Movement.kind == "return")).all()
        assert len(returns) == 1 and returns[0].payload["legionary"] > 0


def test_night_bonus_repulses_an_attack_that_would_win_by_day(ctx, night_world):
    """The same assault flips outcome under the shared world clock's night
    window — and the report says so, since a smaller garrison holding is
    otherwise a surprising result."""
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], legionary=10)
    _garrison(ctx, dc["id"], legionary=6)

    ctx.post("/movements", headers=att, json={
        "origin_city_id": ac["id"], "target_x": dc["x"], "target_y": dc["y"], "units": {"legionary": 10},
    })
    _rush_movements(ctx, kind="attack")
    ctx.get("/cities/me", headers=dfn)  # defender's read resolves the battle

    rep = ctx.get("/reports/me", headers=att).json()[0]
    # 10 attack vs 6 defence would carry by day; doubled at night it does not.
    assert rep["outcome"] == "defender_won"
    assert rep["night_bonus"] is True
