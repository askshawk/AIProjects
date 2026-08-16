"""
Technology effects (C2) — pure.

A city's researched technologies collapse into one `Effects` bundle, and the
simulation reads that bundle wherever a number is computed. Nothing here
reaches into the game loop; the loop asks for the multipliers it needs, so
adding a technology is a data change in game_config plus (at most) one call
site here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from sqlmodel import Session, select

from . import game_config
from .models import Research


@dataclass(frozen=True)
class Effects:
    """Accumulated bonuses. Multipliers default to 1.0, additions to 0."""
    warehouse_bonus: float = 0.0
    build_cost_mult: float = 1.0
    recruit_time_mult: float = 1.0
    speed_mult: float = 1.0
    berth_bonus: int = 0
    fortification_mult: float = 1.0
    land_attack_mult: float = 1.0
    naval_attack_mult: float = 1.0
    production_mult: float = 1.0


# Which fields compound multiplicatively vs. sum. Keeping this explicit means a
# new technology can't silently pick the wrong arithmetic.
_MULTIPLIERS = {
    "build_cost_mult", "recruit_time_mult", "speed_mult",
    "fortification_mult", "land_attack_mult", "naval_attack_mult",
    "production_mult",
}


def merge(*bundles: "Effects") -> "Effects":
    """Combine effect bundles from different sources (research, heroes).
    Multipliers compound, additions sum — the same arithmetic each field uses
    within a single source."""
    values: dict[str, float] = {}
    for bundle in bundles:
        for field, value in vars(bundle).items():
            if field in _MULTIPLIERS:
                values[field] = values.get(field, 1.0) * value
            else:
                values[field] = values.get(field, 0.0) + value
    return Effects(**values)


def effects_for(techs: Iterable[str]) -> Effects:
    """Collapse a set of researched technology ids into one Effects bundle.
    Unknown ids are ignored, so a removed technology can't break old saves."""
    values: dict[str, float] = {}
    for tech in techs:
        spec = game_config.RESEARCH.get(tech)
        if not spec:
            continue
        attr, delta = spec["effect"]
        if attr in _MULTIPLIERS:
            values[attr] = values.get(attr, 1.0) * delta
        else:
            values[attr] = values.get(attr, 0.0) + delta
    return Effects(**values)


def points_spent(techs: Iterable[str]) -> int:
    return sum(game_config.RESEARCH[t]["points"] for t in techs if t in game_config.RESEARCH)


def points_available(academy_level: int, techs: Iterable[str]) -> int:
    """Unspent research points: what the Academy has produced, less what the
    city has already committed."""
    return game_config.research_points(academy_level) - points_spent(techs)


def can_research(tech: str, academy_level: int, researched: Iterable[str]) -> tuple[bool, str | None]:
    """(allowed, reason-if-not) for one technology. The reason doubles as the
    API error message, so the rules live in exactly one place."""
    spec = game_config.RESEARCH.get(tech)
    if not spec:
        return False, f"Unknown technology: {tech}"
    researched = set(researched)
    if tech in researched:
        return False, f"{spec['label']} is already researched"
    if academy_level < spec["academy_level"]:
        return False, f"{spec['label']} requires Academy level {spec['academy_level']}"
    if points_available(academy_level, researched) < spec["points"]:
        return False, (
            f"Not enough research points for {spec['label']} "
            f"({points_available(academy_level, researched)}/{spec['points']})"
        )
    return True, None


# --- DB helpers -------------------------------------------------------------

def techs_of(session: Session, city_id: int) -> set[str]:
    """The technology ids a city has researched."""
    rows = session.exec(select(Research).where(Research.city_id == city_id)).all()
    return {r.tech for r in rows}


def effects_of(session: Session, city_id: int) -> Effects:
    """The live effect bundle for a city — the one call the simulation makes."""
    return effects_for(techs_of(session, city_id))
