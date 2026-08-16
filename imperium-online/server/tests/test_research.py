"""The Academy: research points, technology gates, and the effects they buy."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app import game_config, research
from app.db import get_session
from app.main import app
from app.models import City, Research


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


def _set(c, city_id, **fields):
    with Session(c.engine) as s:
        city = s.get(City, city_id)
        for k, v in fields.items():
            setattr(city, k, v)
        s.add(city)
        s.commit()


def _rich(c, city_id, academy=6):
    _set(c, city_id, academy_level=academy, wood=99999.0, stone=99999.0, silver=99999.0)


# --- pure -------------------------------------------------------------------

def test_points_scale_with_academy_level():
    assert game_config.research_points(0) == 0
    assert game_config.research_points(5) == 5 * game_config.RESEARCH_POINTS_PER_LEVEL


def test_effects_default_to_no_op():
    fx = research.effects_for([])
    assert fx.build_cost_mult == 1.0 and fx.warehouse_bonus == 0.0
    assert fx.land_attack_mult == 1.0 and fx.berth_bonus == 0


def test_multipliers_compound_and_additions_sum():
    fx = research.effects_for(["architecture", "ceramics"])
    assert fx.build_cost_mult == 0.85
    assert fx.warehouse_bonus == 1500.0
    # Unknown ids are ignored rather than exploding — old saves stay loadable.
    assert research.effects_for(["architecture", "no_such_tech"]).build_cost_mult == 0.85


def test_points_available_subtracts_what_is_spent():
    # Academy 3 = 12 points; ceramics (4) + trainer (6) leaves 2.
    assert research.points_available(3, ["ceramics", "trainer"]) == 2


def test_can_research_reports_why_not():
    ok, why = research.can_research("shipwright", 2, [])
    assert not ok and "Academy level 6" in why

    ok, why = research.can_research("ceramics", 1, ["ceramics"])
    assert not ok and "already researched" in why

    # Academy 1 gives 4 points; architecture needs 6.
    ok, why = research.can_research("architecture", 2, ["ceramics"])
    assert not ok and "research points" in why

    assert research.can_research("ceramics", 1, [])[0] is True


# --- API --------------------------------------------------------------------

def test_research_requires_an_academy(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    assert city["academy_level"] == 0
    assert city["research_points"] == 0

    r = client.post(f"/cities/{city['id']}/research", headers=h, json={"tech": "ceramics"})
    assert r.status_code == 400
    assert "Academy level 1" in r.json()["detail"]


def test_researching_spends_points_and_resources(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    _rich(client, city["id"], academy=2)   # 8 points

    before = client.get("/cities/me", headers=h).json()
    assert before["research_points"] == 8

    r = client.post(f"/cities/{city['id']}/research", headers=h, json={"tech": "ceramics"})
    assert r.status_code == 201, r.text
    after = r.json()
    # ceramics costs 4 points and 400/500/200.
    assert after["research_points"] == 4
    assert after["wood"] == pytest.approx(before["wood"] - 400.0, abs=1.0)
    entry = next(t for t in after["research"] if t["tech"] == "ceramics")
    assert entry["researched"] is True


def test_cannot_research_the_same_technology_twice(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    _rich(client, city["id"], academy=3)

    assert client.post(f"/cities/{city['id']}/research", headers=h, json={"tech": "ceramics"}).status_code == 201
    again = client.post(f"/cities/{city['id']}/research", headers=h, json={"tech": "ceramics"})
    assert again.status_code == 400 and "already researched" in again.json()["detail"]
    with Session(client.engine) as s:
        rows = s.exec(select(Research).where(Research.city_id == city["id"])).all()
        assert len(rows) == 1


def test_ceramics_raises_the_warehouse_cap(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    base_cap = city["capacity"]
    _rich(client, city["id"], academy=2)

    after = client.post(f"/cities/{city['id']}/research", headers=h, json={"tech": "ceramics"}).json()
    assert after["capacity"] == base_cap + 1500.0


def test_architecture_discounts_building_costs(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    forum_before = next(u for u in city["upgrades"] if u["building"] == "forum")["cost"]["wood"]
    _rich(client, city["id"], academy=3)

    after = client.post(f"/cities/{city['id']}/research", headers=h, json={"tech": "architecture"}).json()
    forum_after = next(u for u in after["upgrades"] if u["building"] == "forum")["cost"]["wood"]
    assert forum_after == pytest.approx(forum_before * 0.85, abs=0.2)


def test_trainer_shortens_recruitment(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    _set(client, city["id"], barracks_level=1)
    before = next(u for u in client.get("/cities/me", headers=h).json()["units"]
                  if u["unit_type"] == "legionary")["seconds"]
    _rich(client, city["id"], academy=4)

    after_city = client.post(f"/cities/{city['id']}/research", headers=h, json={"tech": "trainer"}).json()
    after = next(u for u in after_city["units"] if u["unit_type"] == "legionary")["seconds"]
    assert after < before


def test_stowage_adds_berths_to_transports_only(client):
    # Pure: a berth bonus lifts carriers, never warships.
    plain = game_config.transport_capacity({"transport": 2, "trireme": 4})
    boosted = game_config.transport_capacity({"transport": 2, "trireme": 4}, 8)
    assert plain == 32 and boosted == 48


def test_catalog_explains_what_is_blocked(client):
    h = _reg(client, "a@t.io", "Roma")
    city = client.get("/cities/me", headers=h).json()
    ship = next(t for t in city["research"] if t["tech"] == "shipwright")
    assert ship["researched"] is False
    assert ship["can_research"] is False
    assert "Academy level 6" in ship["blocked_reason"]
