"""
Phase 4 tests — units & recruitment.

Covers the prerequisite (Barracks), the resource/population gates, that recruit
jobs resolve through catch_up into a standing army, and that a build and a
recruit resolve correctly when interleaved on the merged timeline.

Like test_costs, we drive the real app through a TestClient with an in-memory
DB. Some tests reach into the DB to fast-forward timestamps (so we don't have to
wait real seconds) or to set up an edge case directly.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app import game_config
from app.db import get_session
from app.main import app
from app.models import BuildJob, City, RecruitJob, Unit, utcnow


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


def _register(client, email="a@test.io"):
    r = client.post("/register", json={"email": email, "password": "pw", "city_name": "Roma"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _city_id(client, headers):
    return client.get("/cities/me", headers=headers).json()["id"]


def _give_barracks(client, city_id, level=2):
    """Construct the barracks instantly by setting the level in the DB (avoids
    waiting for a real build to finish)."""
    with Session(client.engine) as s:
        city = s.get(City, city_id)
        city.barracks_level = level
        s.add(city)
        s.commit()


def _rush_all_jobs(client, city_id):
    """Pull every queued build/recruit job's completes_at into the past so the
    next catch_up resolves them immediately."""
    past = utcnow() - timedelta(seconds=1)
    with Session(client.engine) as s:
        for model in (BuildJob, RecruitJob):
            for job in s.exec(select(model).where(model.city_id == city_id)).all():
                job.completes_at = past
                s.add(job)
        s.commit()


def test_recruit_requires_barracks(client):
    h = _register(client)
    cid = _city_id(client, h)
    r = client.post(f"/cities/{cid}/recruit", headers=h, json={"unit_type": "legionary", "count": 1})
    assert r.status_code == 400
    assert "barracks" in r.json()["detail"].lower()


def test_recruit_charges_and_resolves_into_army(client):
    h = _register(client)
    cid = _city_id(client, h)
    _give_barracks(client, cid)

    before = client.get("/cities/me", headers=h).json()
    cost = game_config.unit_cost("legionary", 3)
    r = client.post(f"/cities/{cid}/recruit", headers=h, json={"unit_type": "legionary", "count": 3})
    assert r.status_code == 201
    after = r.json()

    # Resources were charged up front.
    assert after["stone"] == pytest.approx(before["stone"] - cost["stone"], abs=0.5)
    assert after["silver"] == pytest.approx(before["silver"] - cost["silver"], abs=0.5)
    # The batch sits in the recruit queue; army still empty until it resolves.
    assert len(after["recruit_jobs"]) == 1
    assert next(u["have"] for u in after["units"] if u["unit_type"] == "legionary") == 0

    # Fast-forward and re-read: the batch resolves into the standing army.
    _rush_all_jobs(client, cid)
    resolved = client.get("/cities/me", headers=h).json()
    assert resolved["recruit_jobs"] == []
    assert next(u["have"] for u in resolved["units"] if u["unit_type"] == "legionary") == 3


def test_recruit_population_gate(client):
    h = _register(client)
    cid = _city_id(client, h)
    _give_barracks(client, cid)

    # Park population at 99/100 by giving the city standing soldiers directly
    # (forum1+timber1+quarry1+silver1+farm1+barracks2 = 5+4+4+5+3+12 = 33).
    # Add 66 legionaries (1 pop each) → 99 used, cap 100.
    with Session(client.engine) as s:
        s.add(Unit(city_id=cid, unit_type="legionary", count=66))
        s.commit()
    city = client.get("/cities/me", headers=h).json()
    assert city["population_used"] == 99 and city["population_cap"] == 100

    # Recruiting 2 more (→101) must be refused for population.
    r = client.post(f"/cities/{cid}/recruit", headers=h, json={"unit_type": "archer", "count": 2})
    assert r.status_code == 400
    assert "population" in r.json()["detail"].lower()
    # Exactly 1 fits.
    assert client.post(f"/cities/{cid}/recruit", headers=h, json={"unit_type": "archer", "count": 1}).status_code == 201


def test_build_and_recruit_interleave_on_one_timeline(client):
    """A build and a recruit, both due, resolve together in catch_up: the build
    bumps a level and the recruit grants units in the same tick."""
    h = _register(client)
    cid = _city_id(client, h)
    _give_barracks(client, cid)

    client.post(f"/cities/{cid}/builds", headers=h, json={"building": "timber_camp"})
    client.post(f"/cities/{cid}/recruit", headers=h, json={"unit_type": "scout", "count": 2})
    _rush_all_jobs(client, cid)

    city = client.get("/cities/me", headers=h).json()
    assert city["timber_camp_level"] == 2  # build resolved
    assert next(u["have"] for u in city["units"] if u["unit_type"] == "scout") == 2  # recruit resolved
    assert city["build_jobs"] == [] and city["recruit_jobs"] == []
