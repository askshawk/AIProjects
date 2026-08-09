"""Shared test fixtures.

Battles resolve against the shared world clock (see app/daynight.py), which
advances in real time — so from B4 onward, a defender's strength depends on
*when* the suite runs. Left alone that makes every combat assertion flaky:
green at noon, red at midnight.

So the suite is pinned to daylight by default. Tests that specifically care
about the night mechanic either use the pure functions with explicit
timestamps (mark them `real_clock`) or opt into `night_world`.
"""

import pytest

from app import daynight


@pytest.fixture(autouse=True)
def daytime_world(request, monkeypatch):
    """Pin combat to daylight so outcomes are deterministic."""
    if request.node.get_closest_marker("real_clock"):
        return
    monkeypatch.setattr(daynight, "is_night", lambda _now: False)
    monkeypatch.setattr(daynight, "defense_multiplier", lambda _now: 1.0)


@pytest.fixture
def night_world(monkeypatch):
    """Opt in to nightfall: defenders fight under the night bonus."""
    monkeypatch.setattr(daynight, "is_night", lambda _now: True)
    monkeypatch.setattr(daynight, "defense_multiplier", lambda _now: daynight.NIGHT_DEFENSE_BONUS)
