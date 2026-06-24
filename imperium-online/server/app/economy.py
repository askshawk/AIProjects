"""
Economy helpers — the rules around what an upgrade costs and whether a city can
afford it (resources) and sustain it (population).

Shared by the build endpoint (which enforces these on a command) and the city
serializer (which previews per-building upgrade economics for the client), so
the two can never disagree. Pure functions over a City + its pending jobs — no
DB access, no mutation.

Two gates on every upgrade:
  1. Resources — wood/stone/silver are charged UP FRONT when you queue. The
     city row already reflects everything you've queued, so "affordable" just
     means current stored >= cost.
  2. Population — the Farm feeds a fixed number of citizens; the sum of every
     building's population draw (counting pending upgrades) must not exceed it.
     This is a queue-time gate only; the simulation never touches population.
"""

from __future__ import annotations

from . import game_config
from .models import BuildJob, City, RecruitJob, Unit


def pending_counts(pending: list[BuildJob]) -> dict[str, int]:
    """How many queued upgrades each building has, e.g. {"timber_camp": 2}."""
    counts: dict[str, int] = {b: 0 for b in game_config.BUILDINGS}
    for job in pending:
        counts[job.building] = counts.get(job.building, 0) + 1
    return counts


def next_target_level(city: City, counts: dict[str, int], building: str) -> int:
    """The level a NEW upgrade of `building` would target: current applied level
    plus everything already queued for it, plus one."""
    return city.level_of(building) + counts.get(building, 0) + 1


def effective_levels(
    city: City, counts: dict[str, int], extra: str | None = None
) -> dict[str, int]:
    """Final level of every building once all pending jobs resolve. If `extra`
    is given, that building gets one more (models 'what if I queue this too')."""
    levels: dict[str, int] = {}
    for b in game_config.BUILDINGS:
        levels[b] = city.level_of(b) + counts.get(b, 0) + (1 if extra == b else 0)
    return levels


def total_population_used(levels: dict[str, int]) -> int:
    return sum(game_config.population_used(b, lvl) for b, lvl in levels.items())


def population_cap(levels: dict[str, int]) -> int:
    return game_config.population_provided(levels["farm"])


def can_afford(city: City, cost: dict[str, float]) -> bool:
    return all(city.resource(r) >= amount for r, amount in cost.items())


# --- military population accounting ---------------------------------------
# Soldiers occupy population just like building levels. "Effective" unit counts
# include both the standing army (Unit rows) and everything still in the recruit
# queue (already paid for, so reserved against the cap).


def effective_unit_counts(
    units: list[Unit], recruits: list[RecruitJob], extra_type: str | None = None, extra_count: int = 0
) -> dict[str, int]:
    counts: dict[str, int] = {t: 0 for t in game_config.UNIT_TYPES}
    for u in units:
        counts[u.unit_type] = counts.get(u.unit_type, 0) + u.count
    for r in recruits:
        counts[r.unit_type] = counts.get(r.unit_type, 0) + r.count
    if extra_type:
        counts[extra_type] = counts.get(extra_type, 0) + extra_count
    return counts


def army_population(unit_counts: dict[str, int]) -> int:
    return sum(game_config.unit_population(t) * c for t, c in unit_counts.items())
