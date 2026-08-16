"""Rate limiting: the window maths, and that a public login can't be hammered.

The suite at large runs with limiting off (see conftest); these tests switch it
on explicitly so the behaviour is actually covered rather than merely
configured.
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app import ratelimit
from app.db import get_session
from app.main import app


@pytest.fixture
def limited(monkeypatch):
    """Turn limiting on with a small, fast budget and a clean counter."""
    monkeypatch.setattr(ratelimit, "ENABLED", True)
    monkeypatch.setattr(ratelimit, "AUTH_LIMIT", (3, 60))
    monkeypatch.setattr(ratelimit, "WRITE_LIMIT", (5, 60))
    monkeypatch.setattr(ratelimit, "GLOBAL_LIMIT", (100, 60))
    ratelimit.limiter.reset()
    yield
    ratelimit.limiter.reset()


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
    yield c
    app.dependency_overrides.clear()


# --- the window itself ------------------------------------------------------

def test_window_allows_up_to_the_limit_then_refuses():
    w = ratelimit.SlidingWindow()
    assert w.check("k", 3, 60, now=0.0) is None
    assert w.check("k", 3, 60, now=1.0) is None
    assert w.check("k", 3, 60, now=2.0) is None
    retry = w.check("k", 3, 60, now=3.0)
    assert retry is not None and retry == pytest.approx(57.0)


def test_window_slides_rather_than_resetting_in_steps():
    """A fixed window would let a caller burst across the boundary; a sliding
    one only frees the slot whose own hit has aged out."""
    w = ratelimit.SlidingWindow()
    for t in (0.0, 1.0, 2.0):
        assert w.check("k", 3, 10, now=t) is None
    assert w.check("k", 3, 10, now=9.0) is not None      # still full
    assert w.check("k", 3, 10, now=10.5) is None         # the t=0 hit expired
    assert w.check("k", 3, 10, now=10.6) is not None     # only one slot freed


def test_keys_are_independent():
    w = ratelimit.SlidingWindow()
    assert w.check("a", 1, 60, now=0.0) is None
    assert w.check("a", 1, 60, now=0.1) is not None
    assert w.check("b", 1, 60, now=0.1) is None


def test_forwarded_header_is_only_trusted_when_configured(monkeypatch):
    """Trusting X-Forwarded-For unconditionally would let any client forge an
    address and mint itself a fresh budget per request."""
    class FakeClient:
        host = "10.0.0.1"

    class FakeRequest:
        headers = {"x-forwarded-for": "1.2.3.4, 10.0.0.9"}
        client = FakeClient()

    monkeypatch.setattr(ratelimit, "TRUST_PROXY", False)
    assert ratelimit.client_key(FakeRequest()) == "10.0.0.1"

    monkeypatch.setattr(ratelimit, "TRUST_PROXY", True)
    assert ratelimit.client_key(FakeRequest()) == "1.2.3.4"


# --- end to end -------------------------------------------------------------

def test_login_attempts_are_capped(client, limited):
    """The point of the exercise: a public login can't be brute-forced."""
    for _ in range(3):
        r = client.post("/login", json={"email": "nobody@t.io", "password": "wrong"})
        assert r.status_code == 401          # rejected on credentials, not budget

    blocked = client.post("/login", json={"email": "nobody@t.io", "password": "wrong"})
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    assert int(blocked.headers["Retry-After"]) > 0


def test_registration_shares_the_auth_budget(client, limited):
    """Account spam draws on the same allowance as login."""
    for i in range(3):
        assert client.post("/register", json={
            "email": f"u{i}@t.io", "password": "pw", "city_name": "Roma",
        }).status_code == 201
    assert client.post("/register", json={
        "email": "u4@t.io", "password": "pw", "city_name": "Roma",
    }).status_code == 429


def test_reads_are_not_limited_by_the_write_budget(client, limited):
    """Playing the game means a lot of GETs; only writes draw on the tighter
    budget."""
    client.post("/register", json={"email": "a@t.io", "password": "pw", "city_name": "Roma"})
    for _ in range(20):
        assert client.get("/cities/me").status_code == 200


def test_disabled_by_default_in_this_suite(client):
    """Without the `limited` fixture, nothing is capped — otherwise every other
    test file would trip the auth budget."""
    for i in range(12):
        r = client.post("/register", json={
            "email": f"many{i}@t.io", "password": "pw", "city_name": "Roma",
        })
        assert r.status_code == 201
