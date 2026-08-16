"""
The single bonus bundle the simulation reads.

Research and heroes both modify the same numbers, so the game loop should not
have to know how many sources exist — it asks here and gets one Effects.
Adding a third source later (wonders, alliance perks) means editing this
function and nothing else.
"""

from __future__ import annotations

from sqlmodel import Session

from . import heroes, research
from .research import Effects


def for_city(session: Session, city_id: int) -> Effects:
    """Research + heroes, combined."""
    return research.merge(
        research.effects_of(session, city_id),
        heroes.effects_of(session, city_id),
    )
