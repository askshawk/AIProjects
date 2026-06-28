"""
Phase 7D — alliances + chat. Create/join/leave, one-alliance-per-user, member-
only chat, and the live alliance_message WebSocket push.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app.db import get_session
from app.main import app


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
    with TestClient(app) as c:  # context manager so the realtime loop is captured
        c.engine = engine
        yield c
    app.dependency_overrides.clear()


def _reg(c, email):
    return {"Authorization": f"Bearer {c.post('/register', json={'email': email, 'password': 'pw', 'city_name': 'C'}).json()['access_token']}"}


def _tok(c, email):
    return c.post("/login", json={"email": email, "password": "pw"}).json()["access_token"]


def test_create_join_leave(ctx):
    ha = _reg(ctx, "a@t.io")
    hb = _reg(ctx, "b@t.io")

    created = ctx.post("/alliances", headers=ha, json={"name": "The Legion"})
    assert created.status_code == 201
    aid = created.json()["id"]
    assert created.json()["mine_role"] == "founder"

    # B joins; the roster now has two.
    assert ctx.post(f"/alliances/{aid}/join", headers=hb).status_code == 200
    assert len(ctx.get("/alliances/me", headers=hb).json()["members"]) == 2

    # Can't be in two at once.
    assert ctx.post("/alliances", headers=hb, json={"name": "Rivals"}).status_code == 400

    # Leave.
    assert ctx.post("/alliances/leave", headers=hb).status_code == 204
    assert ctx.get("/alliances/me", headers=hb).json() is None


def test_duplicate_name_rejected(ctx):
    ha = _reg(ctx, "a@t.io")
    hb = _reg(ctx, "b@t.io")
    ctx.post("/alliances", headers=ha, json={"name": "Senate"})
    assert ctx.post("/alliances", headers=hb, json={"name": "Senate"}).status_code == 409


def test_chat_is_members_only_and_persisted(ctx):
    ha = _reg(ctx, "a@t.io")
    hb = _reg(ctx, "b@t.io")
    aid = ctx.post("/alliances", headers=ha, json={"name": "Praetorians"}).json()["id"]

    # Non-member can't read or post.
    assert ctx.get(f"/alliances/{aid}/messages", headers=hb).status_code == 403
    assert ctx.post(f"/alliances/{aid}/messages", headers=hb, json={"body": "hi"}).status_code == 403

    ctx.post(f"/alliances/{aid}/messages", headers=ha, json={"body": "Ave!"})
    msgs = ctx.get(f"/alliances/{aid}/messages", headers=ha).json()
    assert len(msgs) == 1 and msgs[0]["body"] == "Ave!" and msgs[0]["user"] == "a"


def test_chat_pushes_over_websocket(ctx):
    ha = _reg(ctx, "a@t.io")
    hb = _reg(ctx, "b@t.io")
    aid = ctx.post("/alliances", headers=ha, json={"name": "Optimates"}).json()["id"]
    ctx.post(f"/alliances/{aid}/join", headers=hb)

    tok_b = _tok(ctx, "b@t.io")
    with ctx.websocket_connect(f"/ws?token={tok_b}") as ws_b:
        ctx.post(f"/alliances/{aid}/messages", headers=ha, json={"body": "Marching out"})
        evt = ws_b.receive_json()
        assert evt["type"] == "alliance_message"
        assert evt["body"] == "Marching out"
        assert evt["user"] == "a"


def test_allied_city_is_reinforced_not_attacked(ctx):
    from sqlmodel import select
    from app.models import City, Unit

    ha = _reg(ctx, "a@t.io")
    hb = _reg(ctx, "b@t.io")
    aid = ctx.post("/alliances", headers=ha, json={"name": "Foederati"}).json()["id"]
    ctx.post(f"/alliances/{aid}/join", headers=hb)

    a_city = ctx.get("/cities/me", headers=ha).json()
    b_city = ctx.get("/cities/me", headers=hb).json()
    with Session(ctx.engine) as s:
        s.add(Unit(city_id=a_city["id"], unit_type="legionary", count=5))
        s.commit()

    r = ctx.post("/movements", headers=ha, json={
        "origin_city_id": a_city["id"], "target_x": b_city["x"], "target_y": b_city["y"], "units": {"legionary": 5},
    })
    assert r.status_code == 201
    assert r.json()["kind"] == "reinforce"  # allied, not attack
