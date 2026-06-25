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

from . import game_config
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


def resolve_movement(session: Session, movement: Movement, now: datetime) -> None:
    if movement.status != "traveling":
        return  # already resolved (worker/read race) — skip

    origin = session.get(City, movement.origin_city_id)
    target = session.get(City, movement.target_city_id)

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

        session.add(BattleReport(
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
        ))

        # Survivors march home.
        survivors = {t: c for t, c in result.attacker_survivors.items() if c > 0}
        if survivors:
            dist = distance(target, origin)
            secs = game_config.travel_seconds(dist, survivors)
            session.add(Movement(
                origin_city_id=target.id,
                target_city_id=origin.id,
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
