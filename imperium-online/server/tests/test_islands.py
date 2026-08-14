"""Islands (C1): identity maths, slot ordering, and fill-before-open placement."""

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool
import pytest

from app import world
from app.db import get_session
from app.main import app
from app.models import City


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
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# --- pure maths -------------------------------------------------------------

def test_island_of_handles_negative_coords():
    # Cells 0..3 are island (0,0); cells -4..-1 are island (-1,-1) — floor
    # division must not split the negative block across two islands.
    assert world.island_of(0, 0) == (0, 0)
    assert world.island_of(3, 3) == (0, 0)
    assert world.island_of(4, 0) == (1, 0)
    assert world.island_of(-1, -1) == (-1, -1)
    assert world.island_of(-4, -4) == (-1, -1)
    assert world.island_of(-5, 0) == (-2, 0)


def test_same_island():
    assert world.same_island(0, 0, 3, 3)
    assert not world.same_island(3, 3, 4, 3)
    assert world.same_island(-1, -1, -4, -4)


def test_slot_order_is_a_permutation_of_the_block():
    n = world.ISLAND_SIZE
    assert sorted(world.SLOT_ORDER) == sorted((dx, dy) for dx in range(n) for dy in range(n))


# --- placement --------------------------------------------------------------

def test_registration_fills_an_island_before_the_next_opens(client):
    # 16 players fit on island (0,0); the 17th opens a new island.
    for i in range(16):
        _reg(client, f"p{i}@t.io", f"Urbs{i}")
    with Session(client.engine) as s:
        cities = s.exec(select(City)).all()
        islands = {world.island_of(c.x, c.y) for c in cities}
        assert islands == {(0, 0)}, f"first 16 must share island (0,0), got {islands}"

    _reg(client, "p16@t.io", "Urbs16")
    with Session(client.engine) as s:
        cities = s.exec(select(City)).all()
        islands = {world.island_of(c.x, c.y) for c in cities}
        assert len(cities) == 17
        assert len(islands) == 2, "the 17th city must open a second island"


def test_existing_legacy_coords_are_respected(client):
    # Pre-seed cities at old cell-spiral coords (straddling four islands, some
    # negative). New placement must skip them without moving anything.
    legacy = [(0, 0), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1)]
    with Session(client.engine) as s:
        for i, (x, y) in enumerate(legacy):
            s.add(City(user_id=999, name=f"Legacy{i}", x=x, y=y))
        s.commit()

    _reg(client, "new@t.io", "Nova")
    with Session(client.engine) as s:
        cities = s.exec(select(City)).all()
        coords = [(c.x, c.y) for c in cities]
        assert len(coords) == len(set(coords)), "no coordinate collisions"
        for i, (x, y) in enumerate(legacy):
            row = s.exec(select(City).where(City.name == f"Legacy{i}")).one()
            assert (row.x, row.y) == (x, y), "legacy cities must not move"
        # The new city fills a free slot on the origin island (which still has room).
        nova = s.exec(select(City).where(City.name == "Nova")).one()
        assert world.island_of(nova.x, nova.y) == (0, 0)
