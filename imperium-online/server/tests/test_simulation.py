"""
Tests for the catch-up simulation — the one piece of logic worth pinning down,
because every endpoint trusts it to compute "state now" correctly.

Run from the server/ dir:  .venv/bin/pytest -q
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app import game_config
from app.models import BuildJob, City, User, utcnow
from app.simulation import catch_up


@pytest.fixture
def session():
    # Fresh in-memory DB per test — fully isolated, no files.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _make_city(session: Session, **overrides) -> City:
    user = User(email=f"u{id(overrides)}@test.io", password_hash="x")
    session.add(user)
    session.flush()
    city = City(user_id=user.id, name="Test", x=0, y=0, **overrides)
    # Zero out resources so production math is easy to assert.
    city.wood = city.stone = city.silver = 0.0
    session.add(city)
    session.commit()
    return city


def test_offline_gap_accrues_resources(session):
    """An idle city produces at its level-1 rate over the elapsed gap."""
    start = utcnow()
    city = _make_city(session, last_tick_at=start)

    catch_up(session, city, start + timedelta(hours=2))
    session.commit()

    # 2 hours at the level-1 rate (30/hr) = 60, well under capacity.
    expected = game_config.production_per_hour(1) * 2
    assert city.wood == pytest.approx(expected)
    assert city.stone == pytest.approx(expected)


def test_capacity_caps_resources(session):
    """Resources never exceed warehouse capacity, no matter how long offline."""
    start = utcnow()
    city = _make_city(session, last_tick_at=start)

    catch_up(session, city, start + timedelta(days=3650))  # a decade away
    session.commit()

    cap = game_config.warehouse_capacity(city.forum_level)
    assert city.wood == pytest.approx(cap)


def test_build_resolves_and_raises_level(session):
    """A due build flips to done and bumps the building level."""
    start = utcnow()
    city = _make_city(session, last_tick_at=start)
    job = BuildJob(
        city_id=city.id,
        building="timber_camp",
        target_level=2,
        started_at=start,
        completes_at=start + timedelta(hours=1),
    )
    session.add(job)
    session.commit()

    catch_up(session, city, start + timedelta(hours=2))
    session.commit()
    session.refresh(job)

    assert city.timber_camp_level == 2
    assert job.status == "done"


def test_resolution_order_uses_new_rate_after_upgrade(session):
    """Production AFTER an upgrade completes must use the higher rate.

    This is the subtle correctness property: you can't bulk-accrue the whole
    gap at the old rate. We compare against a hand-computed two-segment total.
    """
    start = utcnow()
    city = _make_city(session, last_tick_at=start)
    # timber_camp 1→2 finishes one hour in.
    session.add(
        BuildJob(
            city_id=city.id,
            building="timber_camp",
            target_level=2,
            started_at=start,
            completes_at=start + timedelta(hours=1),
        )
    )
    session.commit()

    catch_up(session, city, start + timedelta(hours=2))
    session.commit()

    rate1 = game_config.production_per_hour(1)  # first hour
    rate2 = game_config.production_per_hour(2)  # second hour, post-upgrade
    assert city.wood == pytest.approx(rate1 * 1 + rate2 * 1)
    # Stone has no upgrade, so it's a flat two hours at level-1 rate.
    assert city.stone == pytest.approx(rate1 * 2)


def test_backwards_clock_is_safe(session):
    """A 'now' before the checkpoint must not create negative resources."""
    start = utcnow()
    city = _make_city(session, last_tick_at=start)
    city.wood = 100.0
    session.commit()

    catch_up(session, city, start - timedelta(hours=5))
    session.commit()

    assert city.wood == 100.0  # unchanged
