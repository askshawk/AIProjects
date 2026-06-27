"""
Movement & combat endpoints.

  POST /movements        → send an army from your city to attack another.
  GET  /movements/me     → armies currently on the road to/from your city.
  GET  /reports/me        → your battle reports (as attacker or defender).

Sending deducts the units from your standing army immediately (they're on the
road, not at home). Battles themselves resolve in the worker / on read — never
here — so this endpoint just validates and dispatches.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlmodel import Session, select

from .. import game_config, military, realtime
from ..auth import get_current_user
from ..db import get_session
from ..models import BattleReport, City, Movement, Unit, User, utcnow
from ..schemas import BattleReportOut, MovementOut, SendArmyRequest
from ..simulation import catch_up

router = APIRouter(tags=["movements"])


def _my_city(session: Session, user: User) -> City:
    city = session.exec(select(City).where(City.user_id == user.id)).first()
    if city is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "City not found")
    return city


@router.post("/movements", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
def send_army(
    body: SendArmyRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MovementOut:
    origin = _my_city(session, user)
    now = utcnow()
    catch_up(session, origin, now)  # resolve any just-finished recruits first

    target = session.exec(
        select(City).where(City.x == body.target_x, City.y == body.target_y)
    ).first()
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No city at those coordinates")
    if target.id == origin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't attack your own city")

    # Validate the requested stack against the standing army.
    units = {t: int(c) for t, c in body.units.items() if int(c) > 0}
    if not units:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Send at least one unit")
    for unit_type in units:
        if unit_type not in game_config.UNIT_TYPES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown unit: {unit_type}")

    have = {
        u.unit_type: u
        for u in session.exec(select(Unit).where(Unit.city_id == origin.id)).all()
    }
    for unit_type, count in units.items():
        if have.get(unit_type) is None or have[unit_type].count < count:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"You don't have {count} {unit_type} to send",
            )

    # Deduct the marching units from the city.
    for unit_type, count in units.items():
        have[unit_type].count -= count
        session.add(have[unit_type])

    dist = military.distance(origin, target)
    secs = game_config.travel_seconds(dist, units)
    movement = Movement(
        origin_city_id=origin.id,
        target_city_id=target.id,
        kind="attack",
        payload=units,
        departs_at=now,
        arrives_at=now + timedelta(seconds=secs),
    )
    session.add(movement)
    session.commit()
    session.refresh(movement)
    realtime.emit_queued(user.id)  # attacker's tabs refresh their movements panel

    return MovementOut(
        id=movement.id,
        kind=movement.kind,
        payload=movement.payload,
        departs_at=movement.departs_at,
        arrives_at=movement.arrives_at,
        mine=True,
        incoming_attack=False,
        from_name=origin.name,
        to_name=target.name,
        to_x=target.x,
        to_y=target.y,
    )


@router.get("/movements/me", response_model=list[MovementOut])
def my_movements(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[MovementOut]:
    city = _my_city(session, user)
    now = utcnow()
    # Resolve anything that has already arrived so the list is current.
    military.resolve_due_movements(session, now, city_id=city.id)
    session.commit()

    rows = session.exec(
        select(Movement)
        .where(
            Movement.status == "traveling",
            or_(Movement.origin_city_id == city.id, Movement.target_city_id == city.id),
        )
        .order_by(Movement.arrives_at)
    ).all()

    out: list[MovementOut] = []
    for m in rows:
        origin = session.get(City, m.origin_city_id)
        target = session.get(City, m.target_city_id)
        origin_mine = origin is not None and origin.user_id == user.id
        target_mine = target is not None and target.user_id == user.id
        # The marching troops belong to: the origin (attack) or the destination
        # home city (return). "mine" means those troops are yours.
        mine = origin_mine if m.kind == "attack" else target_mine
        incoming_attack = m.kind == "attack" and target_mine and not origin_mine
        out.append(MovementOut(
            id=m.id,
            kind=m.kind,
            payload=m.payload,
            departs_at=m.departs_at,
            arrives_at=m.arrives_at,
            mine=mine,
            incoming_attack=incoming_attack,
            from_name=origin.name if origin else "?",
            to_name=target.name if target else "?",
            to_x=target.x if target else 0,
            to_y=target.y if target else 0,
        ))
    return out


@router.get("/reports/me", response_model=list[BattleReportOut])
def my_reports(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[BattleReportOut]:
    rows = session.exec(
        select(BattleReport)
        .where(or_(
            BattleReport.attacker_user_id == user.id,
            BattleReport.defender_user_id == user.id,
        ))
        .order_by(BattleReport.created_at.desc())
        .limit(50)
    ).all()
    return [
        BattleReportOut(
            id=r.id,
            outcome=r.outcome,
            i_attacked=r.attacker_user_id == user.id,
            attacker_city_name=r.attacker_city_name,
            defender_city_name=r.defender_city_name,
            attacker_sent=r.attacker_sent,
            attacker_survivors=r.attacker_survivors,
            defender_before=r.defender_before,
            defender_survivors=r.defender_survivors,
            created_at=r.created_at,
        )
        for r in rows
    ]
