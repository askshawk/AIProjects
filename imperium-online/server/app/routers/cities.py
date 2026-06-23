"""
City endpoints — the gameplay surface of the slice.

  GET  /cities/me              → your city, fast-forwarded to right now.
  POST /cities/{id}/builds     → queue an upgrade.

Every handler runs catch_up FIRST so it always operates on current state. The
client is never trusted to tell us how much time passed — the server reads it
from the stored timestamps.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from .. import game_config
from ..auth import get_current_user
from ..db import get_session
from ..models import BuildJob, City, User, utcnow
from ..schemas import BuildJobOut, BuildRequest, CityOut
from ..simulation import catch_up

router = APIRouter(prefix="/cities", tags=["cities"])


def _serialize(city: City, session: Session) -> CityOut:
    """City → wire format, including only still-pending build jobs (the active
    timers the client cares about)."""
    pending = session.exec(
        select(BuildJob)
        .where(BuildJob.city_id == city.id, BuildJob.status == "queued")
        .order_by(BuildJob.completes_at)
    ).all()
    return CityOut(
        id=city.id,
        name=city.name,
        x=city.x,
        y=city.y,
        last_tick_at=city.last_tick_at,
        wood=round(city.wood, 1),
        stone=round(city.stone, 1),
        silver=round(city.silver, 1),
        forum_level=city.forum_level,
        timber_camp_level=city.timber_camp_level,
        quarry_level=city.quarry_level,
        silver_mine_level=city.silver_mine_level,
        capacity=game_config.warehouse_capacity(city.forum_level),
        build_jobs=[
            BuildJobOut(
                id=j.id,
                building=j.building,
                target_level=j.target_level,
                completes_at=j.completes_at,
                status=j.status,
            )
            for j in pending
        ],
    )


def _load_my_city(session: Session, user: User) -> City:
    city = session.exec(select(City).where(City.user_id == user.id)).first()
    if city is None:  # shouldn't happen — every user gets a city at register
        raise HTTPException(status.HTTP_404_NOT_FOUND, "City not found")
    return city


@router.get("/me", response_model=CityOut)
def get_my_city(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CityOut:
    city = _load_my_city(session, user)
    catch_up(session, city, utcnow())
    session.commit()
    session.refresh(city)
    return _serialize(city, session)


@router.post("/{city_id}/builds", response_model=CityOut, status_code=status.HTTP_201_CREATED)
def queue_build(
    city_id: int,
    body: BuildRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CityOut:
    city = _load_my_city(session, user)
    if city.id != city_id:  # ownership check — can't build in someone else's city
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your city")

    if body.building not in game_config.BUILDINGS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown building: {body.building}")

    # Resolve anything already finished before we reason about the queue.
    now = utcnow()
    catch_up(session, city, now)

    # Single city-wide sequential build queue (Grepolis-style): a new job starts
    # when the last queued one finishes, and its target stacks on top of any
    # pending upgrades to the same building.
    pending = session.exec(
        select(BuildJob)
        .where(BuildJob.city_id == city.id, BuildJob.status == "queued")
        .order_by(BuildJob.completes_at)
    ).all()

    already_queued_for_building = sum(1 for j in pending if j.building == body.building)
    target_level = city.level_of(body.building) + already_queued_for_building + 1
    if target_level > game_config.MAX_LEVEL:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{body.building} is already at or queued to max level ({game_config.MAX_LEVEL})",
        )

    # NOTE: resource costs (game_config.building_cost) are intentionally NOT
    # charged yet — that's the first roadmap step, a check right here.

    start_at = pending[-1].completes_at if pending else now
    from datetime import timedelta

    duration = game_config.build_seconds(body.building, target_level, city.forum_level)
    job = BuildJob(
        city_id=city.id,
        building=body.building,
        target_level=target_level,
        started_at=start_at,
        completes_at=start_at + timedelta(seconds=duration),
    )
    session.add(job)
    session.commit()
    session.refresh(city)
    return _serialize(city, session)
