"""The shared world clock: phase maths, the wrapping night window, and the
defender bonus that hangs off it."""

from datetime import datetime, timezone

import pytest

from app import daynight
from app.combat import resolve_battle

# These exercise the clock itself, so they must see the real implementation
# rather than the daylight pin the rest of the suite runs under.
pytestmark = pytest.mark.real_clock


def _at(fraction: float) -> datetime:
    """A UTC timestamp sitting exactly `fraction` through a cycle."""
    return datetime.fromtimestamp(fraction * daynight.CYCLE_SECONDS, tz=timezone.utc)


def test_phase_spans_the_cycle():
    assert daynight.phase_at(_at(0.0)) == 0.0
    assert abs(daynight.phase_at(_at(0.5)) - 0.5) < 1e-9
    # The cycle repeats: one full cycle later is the same phase.
    later = datetime.fromtimestamp(daynight.CYCLE_SECONDS * 3.25, tz=timezone.utc)
    assert abs(daynight.phase_at(later) - 0.25) < 1e-9


def test_night_window_wraps_past_midnight():
    assert daynight.is_night(_at(0.0))     # midnight
    assert daynight.is_night(_at(0.95))    # late evening, before the wrap
    assert daynight.is_night(_at(0.10))    # small hours, after the wrap
    assert not daynight.is_night(_at(0.5))  # noon
    assert not daynight.is_night(_at(0.8))  # early evening, before night starts


def test_phase_names():
    assert daynight.phase_name(_at(0.0)) == "night"
    assert daynight.phase_name(_at(0.5)) == "day"
    assert daynight.phase_name(_at(7.0 / 24.0)) == "dawn"
    assert daynight.phase_name(_at(19.0 / 24.0)) == "dusk"


def test_defense_multiplier_follows_the_clock():
    assert daynight.defense_multiplier(_at(0.0)) == daynight.NIGHT_DEFENSE_BONUS
    assert daynight.defense_multiplier(_at(0.5)) == 1.0


def test_seconds_until_change_is_within_the_cycle():
    for fraction in (0.0, 0.3, 0.5, 0.99):
        state = daynight.state(_at(fraction))
        assert 0 <= state["seconds_until_change"] <= daynight.CYCLE_SECONDS
        assert state["is_night"] is daynight.is_night(_at(fraction))


def test_naive_timestamps_are_read_as_utc():
    """The app stores naive UTC everywhere, and datetime.timestamp() reads a
    naive value as *local* time. If that leaks through, the whole world clock
    (and the epoch the client syncs to) shifts by the host's UTC offset."""
    aware = datetime(2026, 8, 9, 18, 30, tzinfo=timezone.utc)
    naive = aware.replace(tzinfo=None)

    assert daynight.phase_at(naive) == daynight.phase_at(aware)
    assert daynight.state(naive)["server_now_ms"] == daynight.state(aware)["server_now_ms"]
    assert daynight.state(aware)["server_now_ms"] == int(aware.timestamp() * 1000)


def test_night_bonus_can_flip_a_battle():
    """The same assault that wins by day is repulsed at night — the whole point
    of the mechanic."""
    attacker = {"legionary": 10}
    defender = {"legionary": 6}

    by_day = resolve_battle(attacker, defender, 1.0)
    at_night = resolve_battle(attacker, defender, daynight.NIGHT_DEFENSE_BONUS)

    assert by_day.outcome == "attacker_won"
    assert at_night.outcome == "defender_won"
