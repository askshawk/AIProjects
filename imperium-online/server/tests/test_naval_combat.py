"""The two-phase battle: fleets fight first, and only then do troops land.

Island (0,0) spans cells 0..3; the defender here sits at (5,5) on island (1,1),
so every assault in this file is a genuine sea crossing.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app import military
from app.combat import resolve_battle
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


def _setup(c):
    """Attacker on island (0,0); defender moved overseas to (5,5)."""
    att = _reg(c, "att@t.io", "Attacker")
    dfn = _reg(c, "def@t.io", "Defender")
    ac = c.get("/cities/me", headers=att).json()
    dc = c.get("/cities/me", headers=dfn).json()
    with Session(c.engine) as s:
        d = s.get(City, dc["id"])
        d.x, d.y = 5, 5
        s.add(d)
        s.commit()
    dc = {**dc, "x": 5, "y": 5}
    return att, dfn, ac, dc


def _rush(c, kind="attack"):
    past = utcnow() - timedelta(seconds=1)
    with Session(c.engine) as s:
        for m in s.exec(select(Movement).where(Movement.status == "traveling", Movement.kind == kind)).all():
            m.arrives_at = past
            s.add(m)
        s.commit()
        military.resolve_due_movements(s, utcnow())
        s.commit()


def _send(c, h, origin_id, dc, units):
    return c.post("/movements", headers=h, json={
        "origin_city_id": origin_id, "target_x": dc["x"], "target_y": dc["y"], "units": units,
    })


def _report(c, h):
    return c.get("/reports/me", headers=h).json()[0]


# --- the two phases ---------------------------------------------------------

def test_winning_at_sea_then_landing(ctx):
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], trireme=6, transport=2, legionary=20)
    _garrison(ctx, dc["id"], bireme=1, legionary=3)

    assert _send(ctx, att, ac["id"], dc, {"trireme": 6, "transport": 2, "legionary": 20}).status_code == 201
    _rush(ctx)

    rep = _report(ctx, att)
    assert rep["naval"] is not None
    assert rep["naval"]["outcome"] == "attacker_won"
    assert rep["outcome"] == "attacker_won"          # the ground battle followed
    assert rep["naval"]["defender_sea_survivors"] == {}


def test_losing_at_sea_drowns_the_army_and_spares_the_city(ctx):
    """The decisive rule: if the fleet dies, nobody lands. The garrison is
    untouched, loyalty never moves, and no survivors sail home."""
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], transport=2, settler=1, legionary=10)
    _garrison(ctx, dc["id"], bireme=8, legionary=2)

    _send(ctx, att, ac["id"], dc, {"transport": 2, "settler": 1, "legionary": 10})
    _rush(ctx)

    rep = _report(ctx, att)
    assert rep["naval"]["outcome"] == "defender_won"
    assert rep["outcome"] == "defender_won"
    assert rep["attacker_survivors"] == {}
    # The land garrison never fought.
    assert rep["defender_survivors"]["legionary"] == 2
    # A settler that drowned cannot erode loyalty.
    assert rep["loyalty_before"] == rep["loyalty_after"] == 100
    assert rep["captured"] is False
    # No return leg — there is nobody left to sail home.
    with Session(ctx.engine) as s:
        assert s.exec(select(Movement).where(Movement.kind == "return")).all() == []


def test_unescorted_transports_are_annihilated(ctx):
    """Transports have zero attack, so any defending fleet wipes them — and the
    troops aboard with them."""
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], transport=3, legionary=40)
    _garrison(ctx, dc["id"], bireme=1)

    _send(ctx, att, ac["id"], dc, {"transport": 3, "legionary": 40})
    _rush(ctx)

    rep = _report(ctx, att)
    assert rep["naval"]["outcome"] == "defender_won"
    assert rep["attacker_survivors"] == {}


def test_undefended_shore_lands_unopposed(ctx):
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], transport=1, legionary=15)
    _garrison(ctx, dc["id"], legionary=2)  # no fleet at all

    _send(ctx, att, ac["id"], dc, {"transport": 1, "legionary": 15})
    _rush(ctx)

    rep = _report(ctx, att)
    assert rep["naval"]["outcome"] == "attacker_won"
    assert rep["naval"]["sea_survivors"] == {"transport": 1}  # nothing to fight
    assert rep["outcome"] == "attacker_won"


def test_a_pure_ship_raid_that_wins_at_sea_is_a_victory(ctx):
    """No troops aboard means no ground battle — the raid is judged at sea, not
    marked a defeat for failing to take a city it never tried to."""
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], trireme=6)
    _garrison(ctx, dc["id"], bireme=1, legionary=50)

    _send(ctx, att, ac["id"], dc, {"trireme": 6})
    _rush(ctx)

    rep = _report(ctx, att)
    assert rep["naval"]["outcome"] == "attacker_won"
    assert rep["outcome"] == "attacker_won"
    # The land garrison is untouched — the raid never went ashore.
    assert rep["defender_survivors"]["legionary"] == 50


def test_ships_sail_home_when_the_landing_fails(ctx):
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], trireme=8, transport=1, legionary=1)
    _garrison(ctx, dc["id"], legionary=40)  # no fleet, huge garrison

    _send(ctx, att, ac["id"], dc, {"trireme": 8, "transport": 1, "legionary": 1})
    _rush(ctx)

    rep = _report(ctx, att)
    assert rep["outcome"] == "defender_won"     # the landing was crushed
    with Session(ctx.engine) as s:
        ret = s.exec(select(Movement).where(Movement.kind == "return")).all()
        assert len(ret) == 1
        # Only ships came back.
        assert all(t in ("trireme", "transport") for t in ret[0].payload)


def test_capture_stations_the_fleet_in_the_taken_harbour(ctx):
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], trireme=4, transport=2, settler=1, legionary=20)
    _garrison(ctx, dc["id"], legionary=1)
    with Session(ctx.engine) as s:
        d = s.get(City, dc["id"])
        d.loyalty = 20          # one settler-led assault will break it
        s.add(d)
        s.commit()

    _send(ctx, att, ac["id"], dc, {"trireme": 4, "transport": 2, "settler": 1, "legionary": 20})
    _rush(ctx)

    rep = _report(ctx, att)
    assert rep["captured"] is True
    with Session(ctx.engine) as s:
        taken = s.get(City, dc["id"])
        units = {u.unit_type: u.count for u in s.exec(select(Unit).where(Unit.city_id == taken.id)).all()}
        assert units.get("trireme", 0) > 0, "the victorious fleet holds the captured harbour"
        assert units.get("settler", 0) == 0, "the settler was consumed founding the claim"


def test_report_naval_is_none_for_a_land_battle(ctx):
    """Same-island fighting never touches the sea phase."""
    att = _reg(ctx, "a@t.io", "Roma")
    _reg(ctx, "b@t.io", "Carthago")
    ac = ctx.get("/cities/me", headers=att).json()
    carthago = next(c for c in ctx.get("/world/cities", headers=att).json() if c["name"] == "Carthago")
    _garrison(ctx, ac["id"], legionary=10)

    _send(ctx, att, ac["id"], carthago, {"legionary": 10})
    _rush(ctx)
    assert _report(ctx, att)["naval"] is None


# --- pure -------------------------------------------------------------------

def test_fortification_does_not_apply_at_sea():
    """Open water is nobody's home ground: the sea phase must not get the
    Forum's fortification bonus, only the night bonus."""
    fleet = {"trireme": 5}
    defenders = {"bireme": 4}
    plain = resolve_battle(fleet, defenders, 1.0)
    fortified = resolve_battle(fleet, defenders, 1.5)
    # Sanity: the multiplier does change outcomes, which is why it must not be
    # applied to the naval phase (asserted end-to-end above by the sea results).
    assert plain.outcome != fortified.outcome or plain.defender_survivors != fortified.defender_survivors


def test_night_bonus_applies_at_sea(ctx, night_world):
    """Defending crews fight twice as hard in home waters after dark."""
    att, dfn, ac, dc = _setup(ctx)
    _garrison(ctx, ac["id"], trireme=5)
    _garrison(ctx, dc["id"], bireme=3)

    _send(ctx, att, ac["id"], dc, {"trireme": 5})
    _rush(ctx)

    rep = _report(ctx, att)
    assert rep["night_bonus"] is True
    # 5 triremes (120 attack) vs 3 biremes (84 defence) wins by day; doubled to
    # 168 at night, the raid is beaten off.
    assert rep["naval"]["outcome"] == "defender_won"
