"""
Movement resolution — the load-bearing half of Phase 5.

When an army's `arrives_at` passes, this resolves it: an attack triggers a
battle at the target (the defender's army is brought current with catch_up
first), writes a permanent BattleReport, and — if any attackers survive — sends
them home as a "return" movement. A return movement deposits its survivors back
into the home city's standing army.

Crucially this runs from the background worker, so a battle resolves even when
NEITHER player is online. It's also invoked on a city read (scoped to that city)
so a player who logs in sees a freshly-resolved outcome without waiting for the
next worker tick. resolve_movement is guarded by status, so the worker and a
read racing on the same movement can't double-resolve it.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from sqlalchemy import or_
from sqlmodel import Session, select

from . import game_config, realtime
from .combat import resolve_battle
from .models import BattleReport, City, Movement, Unit
from .simulation import _grant_units, catch_up


def distance(a: City, b: City) -> float:
    """Euclidean distance between two cities on the world grid."""
    return math.hypot(a.x - b.x, a.y - b.y)


def _standing_army(session: Session, city: City) -> dict[str, int]:
    rows = session.exec(select(Unit).where(Unit.city_id == city.id)).all()
    return {u.unit_type: u.count for u in rows if u.count > 0}


def _set_army(session: Session, city: City, survivors: dict[str, int]) -> None:
    """Overwrite the city's standing units with `survivors` (battle aftermath).
    Existing rows not in survivors drop to zero."""
    rows = session.exec(select(Unit).where(Unit.city_id == city.id)).all()
    for row in rows:
        row.count = survivors.get(row.unit_type, 0)
        session.add(row)


def _deposit_home(session: Session, origin: City | None, payload: dict[str, int]) -> None:
    """A trip that can't complete (cell taken, target gone) puts the whole stack
    back into the origin city's army and pings the owner."""
    if origin is None:
        return
    for unit_type, count in payload.items():
        if count > 0:
            _grant_units(session, origin, unit_type, count)
    realtime.emit_army_returned(origin.user_id, origin.id)


def _resolve_found(session: Session, origin: City | None, movement: Movement, now: datetime) -> None:
    """A Settler-led stack reaches an empty cell → a new colony is born. If the
    cell was taken in the meantime, the army marches home instead."""
    tx, ty = movement.target_x, movement.target_y
    occupied = session.exec(select(City).where(City.x == tx, City.y == ty)).first()
    payload = {t: c for t, c in movement.payload.items() if c > 0}
    if occupied is not None or origin is None or payload.get("settler", 0) < 1:
        _deposit_home(session, origin, payload)
        return
    # Consume one settler; the rest of the stack becomes the new garrison.
    payload["settler"] -= 1
    new_city = City(user_id=origin.user_id, name=f"Colonia ({tx},{ty})", x=tx, y=ty)
    session.add(new_city)
    session.flush()  # assign id for _grant_units + the event
    for unit_type, count in payload.items():
        if count > 0:
            _grant_units(session, new_city, unit_type, count)
    realtime.emit_city_founded(origin.user_id, new_city.id)


def _resolve_reinforce(session: Session, origin: City | None, target: City | None, now: datetime, payload: dict[str, int]) -> None:
    if target is None:
        _deposit_home(session, origin, payload)
        return
    catch_up(session, target, now)
    for unit_type, count in payload.items():
        if count > 0:
            _grant_units(session, target, unit_type, count)
    realtime.emit_army_returned(target.user_id, target.id)


def resolve_movement(session: Session, movement: Movement, now: datetime) -> None:
    if movement.status != "traveling":
        return  # already resolved (worker/read race) — skip

    origin = session.get(City, movement.origin_city_id)
    target = session.get(City, movement.target_city_id) if movement.target_city_id else None

    if movement.kind == "found":
        _resolve_found(session, origin, movement, now)
        movement.status = "done"
        session.add(movement)
        return

    if movement.kind == "reinforce":
        _resolve_reinforce(session, origin, target, now, {t: c for t, c in movement.payload.items() if c > 0})
        movement.status = "done"
        session.add(movement)
        return

    if movement.kind == "attack":
        if target is None or origin is None:
            movement.status = "done"
            session.add(movement)
            return

        # Bring the defender current so the battle uses their real army.
        catch_up(session, target, now)
        defender_before = _standing_army(session, target)
        mult = game_config.fortification_multiplier(target.forum_level)

        result = resolve_battle(movement.payload, defender_before, mult)

        # Apply the aftermath to the defender's standing army.
        _set_army(session, target, result.defender_survivors)

        report = BattleReport(
            movement_id=movement.id,
            attacker_user_id=origin.user_id,
            defender_user_id=target.user_id,
            attacker_city_name=origin.name,
            defender_city_name=target.name,
            outcome=result.outcome,
            attacker_sent=dict(movement.payload),
            attacker_survivors=result.attacker_survivors,
            defender_before=defender_before,
            defender_survivors=result.defender_survivors,
        )
        session.add(report)
        # Flush so the report has an id we can include in the push event.
        session.flush()
        # Push to both sides — defender's app shows the loud warning, attacker's
        # gets the report immediately too. Skip self-attacks (origin == target
        # owner) by ensuring distinct user_ids.
        realtime.emit_attack_resolved(origin.user_id, report.id, result.outcome, "attacker")
        if target.user_id != origin.user_id:
            realtime.emit_attack_resolved(target.user_id, report.id, result.outcome, "defender")

        # Survivors march home.
        survivors = {t: c for t, c in result.attacker_survivors.items() if c > 0}
        if survivors:
            dist = distance(target, origin)
            secs = game_config.travel_seconds(dist, survivors)
            session.add(Movement(
                origin_city_id=target.id,
                target_city_id=origin.id,
                target_x=origin.x,
                target_y=origin.y,
                kind="return",
                payload=survivors,
                departs_at=now,
                arrives_at=now + timedelta(seconds=secs),
            ))

        movement.status = "done"
        session.add(movement)

    else:  # return — deposit survivors back into the home city's army
        home = target
        if home is not None:
            catch_up(session, home, now)
            for unit_type, count in movement.payload.items():
                _grant_units(session, home, unit_type, count)
            realtime.emit_army_returned(home.user_id, home.id)
        movement.status = "done"
        session.add(movement)


def resolve_due_movements(
    session: Session, now: datetime, city_id: int | None = None
) -> list[Movement]:
    """Resolve every traveling movement that has arrived. If `city_id` is given,
    only those touching that city (so a read resolves just the player's own
    incoming/outgoing armies); otherwise all (the worker's global sweep).

    Resolved in arrival order so chained battles on one city use the correct
    post-previous-battle defender army."""
    query = select(Movement).where(
        Movement.status == "traveling", Movement.arrives_at <= now
    )
    if city_id is not None:
        query = query.where(
            or_(Movement.origin_city_id == city_id, Movement.target_city_id == city_id)
        )
    due = session.exec(query.order_by(Movement.arrives_at)).all()
    for movement in due:
        resolve_movement(session, movement, now)
    return due
