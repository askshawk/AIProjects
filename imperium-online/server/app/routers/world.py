"""
The shared world. One public-ish endpoint that returns every city's position
and owner, so any logged-in player sees the same map — the multiplayer proof of
the slice.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import City, User
from ..schemas import WorldCityOut

router = APIRouter(prefix="/world", tags=["world"])


@router.get("/cities", response_model=list[WorldCityOut])
def list_world_cities(
    session: Session = Depends(get_session),
    _user: User = Depends(get_current_user),  # must be logged in, but any account sees all
) -> list[WorldCityOut]:
    rows = session.exec(select(City, User).join(User, City.user_id == User.id)).all()
    return [
        WorldCityOut(
            x=city.x,
            y=city.y,
            name=city.name,
            owner=user.email.split("@", 1)[0],  # friendly label, not the full email
        )
        for city, user in rows
    ]
