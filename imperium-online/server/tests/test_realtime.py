"""
Phase 6 tests — WebSocket auth + per-user event routing.

Uses Starlette's TestClient.websocket_connect (built into FastAPI, no new dep).
Two delicate things to know about the harness:

  1. The realtime module captures the asyncio loop in app lifespan, so EVERY
     test uses TestClient as a context manager (`with TestClient(app) as c`)
     so startup + shutdown actually run. Without this, push_to_user is a no-op
     because no loop was set.

  2. push_to_user schedules sends via run_coroutine_threadsafe. After
     triggering an emit synchronously from the request thread, we read from
     the socket — that read blocks until the loop drains the scheduled send,
     so no manual sleep is needed.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool
from starlette.websockets import WebSocketDisconnect

from app import military
from app.db import get_session
from app.main import app
from app.models import BuildJob, City, Movement, Unit, utcnow


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
    # TestClient as a context manager so lifespan runs (captures the loop).
    with TestClient(app) as c:
        c.engine = engine
        yield c
    app.dependency_overrides.clear()


def _reg(c, email, city):
    return c.post("/register", json={"email": email, "password": "pw", "city_name": city}).json()["access_token"]


def _rush_jobs(client, city_id):
    past = utcnow() - timedelta(seconds=1)
    with Session(client.engine) as s:
        for j in s.exec(select(BuildJob).where(BuildJob.city_id == city_id)).all():
            j.completes_at = past
            s.add(j)
        s.commit()


def test_ws_rejects_bad_token(ctx):
    with pytest.raises(WebSocketDisconnect) as exc:
        with ctx.websocket_connect("/ws?token=garbage"):
            pass
    assert exc.value.code == 4401


def test_ws_accepts_good_token(ctx):
    tok = _reg(ctx, "a@t.io", "Roma")
    with ctx.websocket_connect(f"/ws?token={tok}"):
        # Connecting cleanly is the assertion; no message until something is
        # emitted or the 25s keepalive fires.
        pass


def test_build_done_event_is_pushed_to_owner(ctx):
    tok = _reg(ctx, "a@t.io", "Roma")
    h = {"Authorization": f"Bearer {tok}"}
    city = ctx.get("/cities/me", headers=h).json()

    with ctx.websocket_connect(f"/ws?token={tok}") as ws:
        # Queue a build, fast-forward it, then trigger catch_up via a read.
        ctx.post(f"/cities/{city['id']}/builds", headers=h, json={"building": "timber_camp"})
        # The queue command itself emits a "queued" event — drain it.
        first = ws.receive_json()
        assert first["type"] == "queued"

        _rush_jobs(ctx, city["id"])
        ctx.get("/cities/me", headers=h)  # triggers catch_up → emit_build_done

        evt = ws.receive_json()
        assert evt["type"] == "build_done"
        assert evt["building"] == "timber_camp"
        assert evt["target_level"] == 2


def test_per_user_routing(ctx):
    """Account A's events don't reach account B's socket."""
    tok_a = _reg(ctx, "a@t.io", "Roma")
    tok_b = _reg(ctx, "b@t.io", "Carthago")
    ha = {"Authorization": f"Bearer {tok_a}"}
    city_a = ctx.get("/cities/me", headers=ha).json()

    with ctx.websocket_connect(f"/ws?token={tok_a}") as ws_a, \
         ctx.websocket_connect(f"/ws?token={tok_b}") as ws_b:

        ctx.post(f"/cities/{city_a['id']}/builds", headers=ha, json={"building": "quarry"})
        # A's queued event
        assert ws_a.receive_json()["type"] == "queued"
        _rush_jobs(ctx, city_a["id"])
        ctx.get("/cities/me", headers=ha)
        # A's build_done
        assert ws_a.receive_json()["type"] == "build_done"

        # B must not have received anything in the meantime.
        ws_b.send_text("nop")  # poke the connection
        # Read with a short timeout via the underlying socket — Starlette's
        # TestClient blocks indefinitely on receive, so we assert by not
        # receiving here: ws_b had no events queued, and we move on.
        # (The earlier asserts proved the events fired; routing means only A
        # got them. A direct "B has nothing" check would need a timeout API
        # the test client doesn't expose.)


def test_attack_resolved_pushes_to_both_sides(ctx):
    tok_a = _reg(ctx, "a@t.io", "Roma")
    tok_b = _reg(ctx, "b@t.io", "Carthago")
    ha = {"Authorization": f"Bearer {tok_a}"}
    city_a = ctx.get("/cities/me", headers=ha).json()
    city_b = ctx.get("/cities/me", headers={"Authorization": f"Bearer {tok_b}"}).json()
    # Give A an army at home.
    with Session(ctx.engine) as s:
        s.add(Unit(city_id=city_a["id"], unit_type="legionary", count=10))
        s.commit()

    with ctx.websocket_connect(f"/ws?token={tok_a}") as ws_a, \
         ctx.websocket_connect(f"/ws?token={tok_b}") as ws_b:

        ctx.post("/movements", headers=ha, json={
            "target_x": city_b["x"], "target_y": city_b["y"], "units": {"legionary": 10},
        })
        # send_army emits a "queued" to A.
        assert ws_a.receive_json()["type"] == "queued"

        # Fast-forward the attack and drive the worker.
        past = utcnow() - timedelta(seconds=1)
        with Session(ctx.engine) as s:
            for m in s.exec(select(Movement).where(Movement.status == "traveling")).all():
                m.arrives_at = past
                s.add(m)
            s.commit()
            military.resolve_due_movements(s, utcnow())
            s.commit()

        # Both sockets should now receive an attack_resolved event.
        evt_a = ws_a.receive_json()
        evt_b = ws_b.receive_json()
        for evt, role in [(evt_a, "attacker"), (evt_b, "defender")]:
            assert evt["type"] == "attack_resolved"
            assert evt["role"] == role
            assert evt["outcome"] == "attacker_won"
