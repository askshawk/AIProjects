"""
The world clock — a shared day/night cycle (Phase 8B / B4).

Modelled on Grepolis, where "night" is a *gameplay* mechanic rather than a
graphical one: defenders get a large bonus during a fixed window of server
time, so players aren't farmed while they sleep. We keep that mechanic and
also drive the visuals from the same clock, so every player sees dusk fall at
the same moment — one shared world, not a per-client cosmetic.

The cycle is accelerated by default (a "day" is CYCLE_SECONDS long, not 24h)
so the world visibly turns while you play. Set IMPERIUM_DAY_SECONDS=86400 for
a real 24-hour cycle.

Everything here is pure: a phase is derived from a timestamp, nothing is
stored, and the client re-derives the same phase from the server clock it
already tracks for marching armies.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

# Length of one full day/night cycle. Accelerated by default so the cycle is
# observable inside a single session.
CYCLE_SECONDS = int(os.getenv("IMPERIUM_DAY_SECONDS", "600"))

# Night runs 21:00 -> 06:00 in cycle-local time, expressed as a fraction of the
# cycle. It wraps past midnight, which is why the comparison below is an `or`.
NIGHT_START = 21.0 / 24.0
NIGHT_END = 6.0 / 24.0

# Defenders fight twice as hard at night (Grepolis grants +100%).
NIGHT_DEFENSE_BONUS = 2.0


def _epoch_seconds(now: datetime) -> float:
    """Unix seconds for a timestamp that may be naive.

    The codebase stores naive UTC throughout, and `datetime.timestamp()` reads
    a naive value as *local* time — which would offset the whole world clock by
    the host's UTC offset. Attach UTC explicitly first.
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.timestamp()


def phase_at(now: datetime) -> float:
    """Position in the cycle as a fraction in [0, 1), where 0 is midnight.

    Derived from the Unix epoch so every server process — API, worker, tests —
    agrees without storing any state.
    """
    return (_epoch_seconds(now) % CYCLE_SECONDS) / CYCLE_SECONDS


def is_night(now: datetime) -> bool:
    phase = phase_at(now)
    return phase >= NIGHT_START or phase < NIGHT_END


def defense_multiplier(now: datetime) -> float:
    """The night bonus applied to a defender's power, or 1.0 by day."""
    return NIGHT_DEFENSE_BONUS if is_night(now) else 1.0


def phase_name(now: datetime) -> str:
    """A coarse label for the UI. Dawn/dusk are the short transitional bands."""
    phase = phase_at(now)
    if phase >= NIGHT_START or phase < NIGHT_END:
        return "night"
    if phase < 8.0 / 24.0:
        return "dawn"
    if phase < 18.0 / 24.0:
        return "day"
    return "dusk"


def seconds_until(now: datetime, target_fraction: float) -> float:
    """Seconds until the cycle next reaches `target_fraction`."""
    delta = (target_fraction - phase_at(now)) % 1.0
    return delta * CYCLE_SECONDS


def state(now: datetime) -> dict:
    """Everything the client needs to render and explain the current phase.

    The client re-derives the phase locally from `server_now_ms` + the window
    constants, so it never has to poll this to stay in sync.
    """
    night = is_night(now)
    return {
        "server_now_ms": int(_epoch_seconds(now) * 1000),
        "cycle_seconds": CYCLE_SECONDS,
        "phase": phase_at(now),
        "phase_name": phase_name(now),
        "is_night": night,
        "night_start": NIGHT_START,
        "night_end": NIGHT_END,
        "night_defense_bonus": NIGHT_DEFENSE_BONUS,
        # How long the current condition lasts — drives the UI countdown.
        "seconds_until_change": seconds_until(now, NIGHT_END if night else NIGHT_START),
    }
