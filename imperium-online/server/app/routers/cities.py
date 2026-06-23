"""
City endpoints — the gameplay surface.

  GET  /cities/me              → your city, fast-forwarded to right now.
  POST /cities/{id}/builds     → queue an upgrade (charges resources, gated by
                                 population).

Every handler runs catch_up FIRST so it always operates on current state. The
client is never trusted to tell us how much time passed — the server reads it
from the stored timestamps.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from .. import economy, game_config
from ..auth import get_current_user
from ..db import get_session
from ..models import BuildJob, City, User, utcnow
from ..schemas import BuildJobOut, BuildRequest, CityOut, UpgradeOut
from ..simulation import catch_up

router = APIRouter(prefix="/cities", tags=["cities"])


def _pending_jobs(session: Session, city: City) -> list[BuildJob]:
    return session.exec(
        select(BuildJob)
        .where(BuildJob.city_id == city.id, BuildJob.status == "queued")
        .order_by(BuildJob.completes_at)
    ).all()


def _upgrade_previews(city: City, pending: list[BuildJob]) -> list[UpgradeOut]:
    """For each building, describe the next upgrade: cost, time, population
    impact, and whether it's currently allowed. This is what powers the cost
    panel and the enabled/disabled state of the Upgrade buttons."""
    counts = economy.pending_counts(pending)
    previews: list[UpgradeOut] = []
    for building in game_config.BUILDINGS:
        target = economy.next_target_level(city, counts, building)
        maxed = target > game_config.MAX_LEVEL
        cost = game_config.building_cost(building, target)
        # Population if we DID queue this upgrade (this building +1).
        after_levels = economy.effective_levels(city, counts, extra=building)
        pop_after = economy.total_population_used(after_levels)
        pop_cap_after = economy.population_cap(after_levels)
        previews.append(
            UpgradeOut(
                building=building,
                target_level=target,
                cost=cost,
                seconds=game_config.build_seconds(building, target, city.forum_level),
                population_after=pop_after,
                affordable=economy.can_afford(city, cost),
                pop_ok=pop_after <= pop_cap_after,
                maxed=maxed,
            )
        )
    return previews


def _serialize(city: City, session: Session) -> CityOut:
    """City → wire format: resources, building levels, population, per-building
    upgrade previews, and the active build queue."""
    pending = _pending_jobs(session, city)
    counts = economy.pending_counts(pending)
    # Population reflects everything queued (upgrades are committed the moment
    # you pay for them), so use effective levels.
    eff = economy.effective_levels(city, counts)
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
        farm_level=city.farm_level,
        capacity=game_config.warehouse_capacity(city.forum_level),
        population_used=economy.total_population_used(eff),
        population_cap=economy.population_cap(eff),
        upgrades=_upgrade_previews(city, pending),
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

    # Resolve anything already finished before we reason about cost/queue.
    now = utcnow()
    catch_up(session, city, now)

    pending = _pending_jobs(session, city)
    counts = economy.pending_counts(pending)
    target_level = economy.next_target_level(city, counts, body.building)
    if target_level > game_config.MAX_LEVEL:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{body.building} is already at or queued to max level ({game_config.MAX_LEVEL})",
        )

    # --- gate 1: resources (charged up front) ---------------------------------
    cost = game_config.building_cost(body.building, target_level)
    if not economy.can_afford(city, cost):
        need = ", ".join(
            f"{int(amount)} {res}"
            for res, amount in cost.items()
            if city.resource(res) < amount
        )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Not enough resources for {body.building} → level {target_level} (need {need})",
        )

    # --- gate 2: population ---------------------------------------------------
    after_levels = economy.effective_levels(city, counts, extra=body.building)
    pop_after = economy.total_population_used(after_levels)
    pop_cap = economy.population_cap(after_levels)
    if pop_after > pop_cap:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Not enough population ({pop_after}/{pop_cap}) — upgrade the Farm first",
        )

    # Both gates passed: deduct resources, then queue the job. The single
    # city-wide queue is sequential, so this job starts when the last one ends.
    for res, amount in cost.items():
        city.set_resource(res, city.resource(res) - amount)

    start_at = pending[-1].completes_at if pending else now
    duration = game_config.build_seconds(body.building, target_level, city.forum_level)
    job = BuildJob(
        city_id=city.id,
        building=body.building,
        target_level=target_level,
        started_at=start_at,
        completes_at=start_at + timedelta(seconds=duration),
    )
    session.add(job)
    session.add(city)
    session.commit()
    session.refresh(city)
    return _serialize(city, session)
