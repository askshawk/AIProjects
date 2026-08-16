"""Heroes: appointment rules, the bonuses they lend, and how they earn levels."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app import bonuses, game_config, heroes, military
from app.db import get_session
from app.main import app
from app.models import City, Hero, Movement, Unit, utcnow


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


def _set(c, city_id, **fields):
    with Session(c.engine) as s:
        city = s.get(City, city_id)
        for k, v in fields.items():
            setattr(city, k, v)
        s.add(city)
        s.commit()


def _rich(c, city_id, forum=5):
    _set(c, city_id, forum_level=forum, wood=99999.0, stone=99999.0, silver=99999.0)


def _garrison(c, city_id, **units):
    with Session(c.engine) as s:
        for unit_type, count in units.items():
            s.add(Unit(city_id=city_id, unit_type=unit_type, count=count))
        s.commit()


# --- pure -------------------------------------------------------------------

def test_level_and_bonus_scale_with_experience():
    assert game_config.hero_level(0) == 1
    assert game_config.hero_level(game_config.HERO_XP_PER_LEVEL) == 2
    # Capped, however much they fight.
    assert game_config.hero_level(999999) == game_config.HERO_MAX_LEVEL

    l1 = game_config.hero_bonus("legatus", 1)
    l10 = game_config.hero_bonus("legatus", 10)
    assert l1 == pytest.approx(1.04) and l10 == pytest.approx(1.40)


def test_appointment_rules():
    spec_forum = game_config.HEROES["navarch"]["forum_level"]
    ok, why = heroes.can_recruit("navarch", spec_forum - 1, [])
    assert not ok and "Forum level" in why

    existing = [Hero(city_id=1, name="A", archetype="legatus")]
    ok, why = heroes.can_recruit("legatus", 9, existing)
    assert not ok and "already has" in why

    full = [Hero(city_id=1, name=str(i), archetype=a)
            for i, a in enumerate(("legatus", "praefectus", "navarch"))]
    ok, why = heroes.can_recruit("quaestor", 9, full)
    assert not ok and "at most" in why

    assert heroes.can_recruit("quaestor", 9, [])[0] is True


def test_hero_effects_compound_with_research():
    from app import research
    merged = research.merge(
        research.effects_for(["conscription"]),          # +10% land attack
        research.Effects(land_attack_mult=1.04),          # a level-1 legatus
    )
    assert merged.land_attack_mult == pytest.approx(1.10 * 1.04)


# --- API --------------------------------------------------------------------

def test_appointing_a_hero_costs_resources_and_fills_the_post(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    city = ctx.get("/cities/me", headers=h).json()
    _rich(ctx, city["id"])
    before = ctx.get("/cities/me", headers=h).json()

    r = ctx.post(f"/cities/{city['id']}/heroes", headers=h,
                 json={"archetype": "legatus", "name": "Scipio"})
    assert r.status_code == 201, r.text
    after = r.json()

    legatus = next(x for x in after["heroes"] if x["archetype"] == "legatus")
    assert legatus["recruited"] is True
    assert legatus["name"] == "Scipio"
    assert legatus["level"] == 1
    assert legatus["bonus_pct"] == 4
    assert after["silver"] < before["silver"]


def test_a_post_cannot_be_filled_twice(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    city = ctx.get("/cities/me", headers=h).json()
    _rich(ctx, city["id"])
    ctx.post(f"/cities/{city['id']}/heroes", headers=h, json={"archetype": "legatus"})
    again = ctx.post(f"/cities/{city['id']}/heroes", headers=h, json={"archetype": "legatus"})
    assert again.status_code == 400 and "already has" in again.json()["detail"]


def test_forum_gate_is_enforced(ctx):
    h = _reg(ctx, "a@t.io", "Roma")
    city = ctx.get("/cities/me", headers=h).json()
    _set(ctx, city["id"], forum_level=1, wood=99999.0, stone=99999.0, silver=99999.0)
    r = ctx.post(f"/cities/{city['id']}/heroes", headers=h, json={"archetype": "navarch"})
    assert r.status_code == 400 and "Forum level" in r.json()["detail"]


def test_quaestor_raises_production(ctx):
    """The steward's bonus reaches the resource tick, not just the roster."""
    h = _reg(ctx, "a@t.io", "Roma")
    city = ctx.get("/cities/me", headers=h).json()
    _rich(ctx, city["id"])

    with Session(ctx.engine) as s:
        assert bonuses.for_city(s, city["id"]).production_mult == 1.0

    ctx.post(f"/cities/{city['id']}/heroes", headers=h, json={"archetype": "quaestor"})
    with Session(ctx.engine) as s:
        assert bonuses.for_city(s, city["id"]).production_mult == pytest.approx(1.03)


def test_heroes_earn_experience_from_battles(ctx):
    att = _reg(ctx, "att@t.io", "Attacker")
    dfn = _reg(ctx, "def@t.io", "Defender")
    ac = ctx.get("/cities/me", headers=att).json()
    dc = ctx.get("/cities/me", headers=dfn).json()
    _rich(ctx, ac["id"])
    ctx.post(f"/cities/{ac['id']}/heroes", headers=att, json={"archetype": "legatus"})

    _garrison(ctx, ac["id"], legionary=20)
    _garrison(ctx, dc["id"], legionary=2)
    ctx.post("/movements", headers=att, json={
        "origin_city_id": ac["id"], "target_x": dc["x"], "target_y": dc["y"],
        "units": {"legionary": 20},
    })
    with Session(ctx.engine) as s:
        for m in s.exec(select(Movement).where(Movement.kind == "attack")).all():
            m.arrives_at = utcnow() - timedelta(seconds=1)
            s.add(m)
        s.commit()
        military.resolve_due_movements(s, utcnow())
        s.commit()

    roster = ctx.get("/cities/me", headers=att).json()["heroes"]
    legatus = next(x for x in roster if x["archetype"] == "legatus")
    assert legatus["xp"] == game_config.HERO_XP_PER_BATTLE


def test_captured_city_loses_its_heroes(ctx):
    """Officers fall with the city rather than defecting to the conqueror."""
    att = _reg(ctx, "att@t.io", "Attacker")
    dfn = _reg(ctx, "def@t.io", "Defender")
    ac = ctx.get("/cities/me", headers=att).json()
    dc = ctx.get("/cities/me", headers=dfn).json()
    _rich(ctx, dc["id"])
    ctx.post(f"/cities/{dc['id']}/heroes", headers=dfn, json={"archetype": "praefectus"})
    _set(ctx, dc["id"], loyalty=20, forum_level=1)

    _garrison(ctx, ac["id"], legionary=40, settler=1)
    _garrison(ctx, dc["id"], legionary=1)
    ctx.post("/movements", headers=att, json={
        "origin_city_id": ac["id"], "target_x": dc["x"], "target_y": dc["y"],
        "units": {"legionary": 40, "settler": 1},
    })
    with Session(ctx.engine) as s:
        for m in s.exec(select(Movement).where(Movement.kind == "attack")).all():
            m.arrives_at = utcnow() - timedelta(seconds=1)
            s.add(m)
        s.commit()
        military.resolve_due_movements(s, utcnow())
        s.commit()

    with Session(ctx.engine) as s:
        attacker_city = s.get(City, ac["id"])
        taken = s.get(City, dc["id"])
        assert taken.user_id == attacker_city.user_id, "the city must have changed hands"
        assert heroes.heroes_of(s, dc["id"]) == []


def test_unaffordable_posts_explain_themselves(ctx):
    """A disabled button with no tooltip is a dead end — an affordability
    block must say so, not just fall silent."""
    h = _reg(ctx, "a@t.io", "Roma")
    city = ctx.get("/cities/me", headers=h).json()
    # Forum high enough for every post, but an empty treasury.
    _set(ctx, city["id"], forum_level=9, wood=0.0, stone=0.0, silver=0.0)

    roster = ctx.get("/cities/me", headers=h).json()["heroes"]
    for post in roster:
        assert post["can_recruit"] is False
        assert post["blocked_reason"], f"{post['label']} gives no reason"
        assert "Not enough resources" in post["blocked_reason"]
