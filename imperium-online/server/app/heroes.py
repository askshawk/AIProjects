"""
Heroes (C3) — named officers who hold a post rather than march.

A hero belongs to one city and lends it a standing bonus that grows with the
experience it earns from battles fought there. Keeping them stationed (rather
than riding along in a movement payload) means their effect is answered by
"whose city is this?" instead of "which stack were they in?", so they compose
with research through the same Effects bundle and never complicate combat
bookkeeping.
"""

from __future__ import annotations

from sqlmodel import Session, select

from . import game_config
from .models import Hero
from .research import Effects


def heroes_of(session: Session, city_id: int) -> list[Hero]:
    return session.exec(select(Hero).where(Hero.city_id == city_id)).all()


def effects_of(session: Session, city_id: int) -> Effects:
    """The combined bonus of every hero posted to a city."""
    values: dict[str, float] = {}
    for hero in heroes_of(session, city_id):
        spec = game_config.HEROES.get(hero.archetype)
        if not spec:
            continue  # an archetype removed from the catalog just goes quiet
        field = spec["effect"]
        bonus = game_config.hero_bonus(hero.archetype, game_config.hero_level(hero.xp))
        values[field] = values.get(field, 1.0) * bonus
    return Effects(**values)


def award_battle_xp(session: Session, city_id: int) -> None:
    """Every hero posted to a city that fought gains experience — win or lose.
    Surviving a hard defence teaches as much as winning an easy raid."""
    for hero in heroes_of(session, city_id):
        hero.xp += game_config.HERO_XP_PER_BATTLE
        session.add(hero)


def can_recruit(archetype: str, forum_level: int, existing: list[Hero]) -> tuple[bool, str | None]:
    """(allowed, reason-if-not). The reason doubles as the API error, so the
    rules live in exactly one place."""
    spec = game_config.HEROES.get(archetype)
    if not spec:
        return False, f"Unknown hero: {archetype}"
    if len(existing) >= game_config.HERO_MAX_PER_CITY:
        return False, f"A city can host at most {game_config.HERO_MAX_PER_CITY} heroes"
    if any(h.archetype == archetype for h in existing):
        return False, f"This city already has a {spec['label']}"
    if forum_level < spec["forum_level"]:
        return False, f"{spec['label']} requires Forum level {spec['forum_level']}"
    return True, None
