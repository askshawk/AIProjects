"""
The shared world. One public-ish endpoint that returns every city's position
and owner, so any logged-in player sees the same map — the multiplayer proof of
the slice.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from .. import daynight
from ..auth import get_current_user
from ..db import get_session
from ..models import Alliance, AllianceMembership, City, User, utcnow
from ..schemas import WorldCityOut

router = APIRouter(prefix="/world", tags=["world"])


@router.get("/time")
def world_time() -> dict:
    """The shared world clock: current phase plus the constants the client
    needs to re-derive it locally. Deliberately unauthenticated and cheap —
    the client fetches it once and then computes the phase itself against the
    server clock it already tracks, rather than polling."""
    return daynight.state(utcnow())


@router.get("/cities", response_model=list[WorldCityOut])
def list_world_cities(
    session: Session = Depends(get_session),
    _user: User = Depends(get_current_user),  # must be logged in, but any account sees all
) -> list[WorldCityOut]:
    rows = session.exec(select(City, User).join(User, City.user_id == User.id)).all()
    # Map each user_id → alliance name, so the client can colour allied cities.
    alliance_of: dict[int, str] = {}
    for membership, alliance in session.exec(
        select(AllianceMembership, Alliance).join(Alliance, AllianceMembership.alliance_id == Alliance.id)
    ).all():
        alliance_of[membership.user_id] = alliance.name
    return [
        WorldCityOut(
            x=city.x,
            y=city.y,
            name=city.name,
            owner=user.email.split("@", 1)[0],  # friendly label, not the full email
            alliance=alliance_of.get(user.id),
        )
        for city, user in rows
    ]
