"""
City endpoints — the gameplay surface.

  GET  /cities/me              → your city, fast-forwarded to right now.
  POST /cities/{id}/builds     → queue a building upgrade.
  POST /cities/{id}/recruit    → queue unit recruitment (needs a Barracks).

Every handler runs catch_up FIRST so it always operates on current state. The
client is never trusted to tell us how much time passed — the server reads it
from the stored timestamps. Both gates (resources, population) are enforced
here; population now spans buildings AND the standing/queued army.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from .. import economy, game_config, military, realtime
from ..auth import get_current_user
from ..db import get_session
from ..models import BuildJob, City, RecruitJob, Unit, User, utcnow
from ..schemas import (
    BuildJobOut,
    BuildRequest,
    CityOut,
    CitySummaryOut,
    RecruitJobOut,
    RecruitRequest,
    UnitTypeOut,
    UpgradeOut,
)
from ..simulation import catch_up

router = APIRouter(prefix="/cities", tags=["cities"])

MAX_RECRUIT_BATCH = 500  # sanity cap on a single recruit command


# --- queries ---------------------------------------------------------------
def _pending_builds(session: Session, city: City) -> list[BuildJob]:
    return session.exec(
        select(BuildJob)
        .where(BuildJob.city_id == city.id, BuildJob.status == "queued")
        .order_by(BuildJob.completes_at)
    ).all()


def _pending_recruits(session: Session, city: City) -> list[RecruitJob]:
    return session.exec(
        select(RecruitJob)
        .where(RecruitJob.city_id == city.id, RecruitJob.status == "queued")
        .order_by(RecruitJob.completes_at)
    ).all()


def _units(session: Session, city: City) -> list[Unit]:
    return session.exec(select(Unit).where(Unit.city_id == city.id)).all()


# --- serialization ---------------------------------------------------------
def _upgrade_previews(city: City, builds: list[BuildJob], army_pop: int) -> list[UpgradeOut]:
    """Next-upgrade economics per building. army_pop is folded into the
    population projection so buildings and soldiers share the one cap."""
    counts = economy.pending_counts(builds)
    previews: list[UpgradeOut] = []
    for building in game_config.BUILDINGS:
        target = economy.next_target_level(city, counts, building)
        cost = game_config.building_cost(building, target)
        after_levels = economy.effective_levels(city, counts, extra=building)
        pop_after = economy.total_population_used(after_levels) + army_pop
        previews.append(
            UpgradeOut(
                building=building,
                target_level=target,
                cost=cost,
                seconds=game_config.build_seconds(building, target, city.forum_level),
                population_after=pop_after,
                affordable=economy.can_afford(city, cost),
                pop_ok=pop_after <= economy.population_cap(after_levels),
                maxed=target > game_config.MAX_LEVEL,
            )
        )
    return previews


def _unit_catalog(city: City, units: list[Unit], army_pop: int, pop_cap: int) -> list[UnitTypeOut]:
    """Per unit-type catalog + this city's live recruit economics."""
    have = {u.unit_type: u.count for u in units}
    built = city.barracks_level >= 1
    out: list[UnitTypeOut] = []
    for unit_type in game_config.UNIT_TYPES:
        spec = game_config.UNITS[unit_type]
        one_cost = game_config.unit_cost(unit_type, 1)
        can = (
            built
            and game_config.can_recruit_unit(unit_type, city.forum_level)
            and economy.can_afford(city, one_cost)
            and army_pop + spec["population"] <= pop_cap
        )
        out.append(
            UnitTypeOut(
                unit_type=unit_type,
                label=spec["label"],
                cost=one_cost,
                population=spec["population"],
                seconds=game_config.recruit_seconds(unit_type, 1, city.barracks_level),
                attack=spec["attack"],
                defense=spec["defense"],
                have=have.get(unit_type, 0),
                can_recruit=can,
            )
        )
    return out


def _serialize(city: City, session: Session) -> CityOut:
    builds = _pending_builds(session, city)
    recruits = _pending_recruits(session, city)
    units = _units(session, city)

    counts = economy.pending_counts(builds)
    eff_levels = economy.effective_levels(city, counts)
    # Effective army = standing units + everything in the recruit queue.
    unit_counts = economy.effective_unit_counts(units, recruits)
    army_pop = economy.army_population(unit_counts)

    pop_used = economy.total_population_used(eff_levels) + army_pop
    pop_cap = economy.population_cap(eff_levels)

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
        barracks_level=city.barracks_level,
        loyalty=city.loyalty,
        capacity=game_config.warehouse_capacity(city.forum_level),
        population_used=pop_used,
        population_cap=pop_cap,
        upgrades=_upgrade_previews(city, builds, army_pop),
        build_jobs=[
            BuildJobOut(
                id=j.id, building=j.building, target_level=j.target_level,
                completes_at=j.completes_at, status=j.status,
            )
            for j in builds
        ],
        units=_unit_catalog(city, units, army_pop, pop_cap),
        recruit_jobs=[
            RecruitJobOut(
                id=j.id, unit_type=j.unit_type, count=j.count,
                completes_at=j.completes_at, status=j.status,
            )
            for j in recruits
        ],
    )


def _owned_city(session: Session, user: User, city_id: int) -> City:
    """Load a city by id and verify the caller owns it. 404 if it doesn't
    exist, 403 if it belongs to someone else."""
    city = session.get(City, city_id)
    if city is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "City not found")
    if city.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your city")
    return city


def _primary_city(session: Session, user: User) -> City:
    """The user's oldest city — used by the convenience /cities/me endpoint."""
    city = session.exec(
        select(City).where(City.user_id == user.id).order_by(City.founded_at)
    ).first()
    if city is None:  # shouldn't happen — every user is founded with a city
        raise HTTPException(status.HTTP_404_NOT_FOUND, "City not found")
    return city


def _read_city(session: Session, city: City) -> CityOut:
    """catch_up + resolve due movements for one city, then serialize."""
    now = utcnow()
    catch_up(session, city, now)
    # Resolve any battles that landed on (or armies that returned to) this city,
    # so a player who logs in sees the outcome without waiting for the worker.
    military.resolve_due_movements(session, now, city_id=city.id)
    session.commit()
    session.refresh(city)
    return _serialize(city, session)


# --- endpoints -------------------------------------------------------------
@router.get("", response_model=list[CitySummaryOut])
def list_my_cities(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[CitySummaryOut]:
    """All cities the caller owns — drives the city switcher. Lightweight (no
    catch_up): just identity + position for the dropdown."""
    cities = session.exec(
        select(City).where(City.user_id == user.id).order_by(City.founded_at)
    ).all()
    return [CitySummaryOut(id=c.id, name=c.name, x=c.x, y=c.y, forum_level=c.forum_level, loyalty=c.loyalty) for c in cities]


@router.get("/me", response_model=CityOut)
def get_my_city(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CityOut:
    """Convenience: the caller's primary (oldest) city, fully resolved."""
    return _read_city(session, _primary_city(session, user))


@router.get("/{city_id}", response_model=CityOut)
def get_city(
    city_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CityOut:
    return _read_city(session, _owned_city(session, user, city_id))


@router.post("/{city_id}/builds", response_model=CityOut, status_code=status.HTTP_201_CREATED)
def queue_build(
    city_id: int,
    body: BuildRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CityOut:
    city = _owned_city(session, user, city_id)
    if body.building not in game_config.BUILDINGS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown building: {body.building}")

    now = utcnow()
    catch_up(session, city, now)

    builds = _pending_builds(session, city)
    counts = economy.pending_counts(builds)
    target_level = economy.next_target_level(city, counts, body.building)
    if target_level > game_config.MAX_LEVEL:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{body.building} is already at or queued to max level ({game_config.MAX_LEVEL})",
        )

    # gate 1: resources
    cost = game_config.building_cost(body.building, target_level)
    if not economy.can_afford(city, cost):
        need = ", ".join(
            f"{int(a)} {r}" for r, a in cost.items() if city.resource(r) < a
        )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Not enough resources for {body.building} → level {target_level} (need {need})",
        )

    # gate 2: population (buildings + the whole army)
    after_levels = economy.effective_levels(city, counts, extra=body.building)
    army_pop = economy.army_population(
        economy.effective_unit_counts(_units(session, city), _pending_recruits(session, city))
    )
    pop_after = economy.total_population_used(after_levels) + army_pop
    pop_cap = economy.population_cap(after_levels)
    if pop_after > pop_cap:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Not enough population ({pop_after}/{pop_cap}) — upgrade the Farm first",
        )

    for res, amount in cost.items():
        city.set_resource(res, city.resource(res) - amount)

    start_at = builds[-1].completes_at if builds else now
    duration = game_config.build_seconds(body.building, target_level, city.forum_level)
    session.add(BuildJob(
        city_id=city.id, building=body.building, target_level=target_level,
        started_at=start_at, completes_at=start_at + timedelta(seconds=duration),
    ))
    session.add(city)
    session.commit()
    session.refresh(city)
    realtime.emit_queued(user.id)  # nudge any other open tab to refresh
    return _serialize(city, session)


@router.post("/{city_id}/recruit", response_model=CityOut, status_code=status.HTTP_201_CREATED)
def recruit(
    city_id: int,
    body: RecruitRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CityOut:
    city = _owned_city(session, user, city_id)
    if body.unit_type not in game_config.UNIT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown unit: {body.unit_type}")
    if body.count < 1 or body.count > MAX_RECRUIT_BATCH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Recruit 1–{MAX_RECRUIT_BATCH} at a time")

    now = utcnow()
    catch_up(session, city, now)

    # prerequisite: a Barracks must exist
    if city.barracks_level < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Build a Barracks before recruiting")
    # Settlers need a developed Forum.
    if not game_config.can_recruit_unit(body.unit_type, city.forum_level):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Settlers require Forum level {game_config.SETTLER_FORUM_REQUIREMENT}",
        )

    # gate 1: resources
    cost = game_config.unit_cost(body.unit_type, body.count)
    if not economy.can_afford(city, cost):
        need = ", ".join(
            f"{int(a)} {r}" for r, a in cost.items() if city.resource(r) < a
        )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Not enough resources to recruit {body.count} {body.unit_type} (need {need})",
        )

    # gate 2: population — current buildings + current army + the new batch
    builds = _pending_builds(session, city)
    eff_levels = economy.effective_levels(city, economy.pending_counts(builds))
    unit_counts = economy.effective_unit_counts(
        _units(session, city), _pending_recruits(session, city),
        extra_type=body.unit_type, extra_count=body.count,
    )
    pop_after = economy.total_population_used(eff_levels) + economy.army_population(unit_counts)
    pop_cap = economy.population_cap(eff_levels)
    if pop_after > pop_cap:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Not enough population ({pop_after}/{pop_cap}) — upgrade the Farm",
        )

    for res, amount in cost.items():
        city.set_resource(res, city.resource(res) - amount)

    # Recruitment has its own queue, parallel to construction: chain after the
    # last pending recruit job.
    recruits = _pending_recruits(session, city)
    start_at = recruits[-1].completes_at if recruits else now
    duration = game_config.recruit_seconds(body.unit_type, body.count, city.barracks_level)
    session.add(RecruitJob(
        city_id=city.id, unit_type=body.unit_type, count=body.count,
        started_at=start_at, completes_at=start_at + timedelta(seconds=duration),
    ))
    session.add(city)
    session.commit()
    session.refresh(city)
    realtime.emit_queued(user.id)
    return _serialize(city, session)
