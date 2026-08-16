"""Session cookies: the browser's credential is httpOnly and never handled by JS."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app import auth
from app.db import get_session
from app.main import app


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


def _register(c, email="a@t.io"):
    return c.post("/register", json={"email": email, "password": "pw", "city_name": "Roma"})


def test_register_sets_an_httponly_cookie(client):
    r = _register(client)
    assert r.status_code == 201
    raw = r.headers["set-cookie"]
    assert auth.COOKIE_NAME in raw
    # The whole point: script can't read it.
    assert "HttpOnly" in raw
    assert client.cookies.get(auth.COOKIE_NAME)


def test_login_sets_the_cookie_too(client):
    _register(client)
    client.cookies.clear()
    r = client.post("/login", json={"email": "a@t.io", "password": "pw"})
    assert r.status_code == 200
    assert "HttpOnly" in r.headers["set-cookie"]


def test_the_cookie_alone_authenticates(client):
    """No Authorization header anywhere — the cookie carries the session."""
    _register(client)
    r = client.get("/cities/me")          # no headers
    assert r.status_code == 200
    assert r.json()["name"] == "Roma"


def test_me_reports_the_signed_in_user(client):
    _register(client, "who@t.io")
    r = client.get("/me")
    assert r.status_code == 200
    assert r.json()["email"] == "who@t.io"


def test_no_credentials_is_401(client):
    assert client.get("/cities/me").status_code == 401
    assert client.get("/me").status_code == 401


def test_logout_clears_the_cookie_and_ends_the_session(client):
    _register(client)
    assert client.get("/cities/me").status_code == 200

    assert client.post("/logout").status_code == 204
    assert not client.cookies.get(auth.COOKIE_NAME)
    assert client.get("/cities/me").status_code == 401


def test_logout_without_a_session_still_succeeds(client):
    """Logging out of an expired session should be quiet, not an error."""
    assert client.post("/logout").status_code == 204


def test_an_explicit_header_beats_a_stale_cookie(client):
    """Two accounts, one client. The cookie belongs to the second; an explicit
    bearer token must still identify the first — otherwise a stale cookie
    silently hijacks every request made on that client."""
    first = _register(client, "first@t.io").json()["access_token"]
    _register(client, "second@t.io")          # overwrites the cookie
    assert client.get("/me").json()["email"] == "second@t.io"

    as_first = client.get("/me", headers={"Authorization": f"Bearer {first}"})
    assert as_first.json()["email"] == "first@t.io"


def test_a_forged_cookie_is_rejected(client):
    client.cookies.set(auth.COOKIE_NAME, "not-a-real-jwt")
    assert client.get("/cities/me").status_code == 401
