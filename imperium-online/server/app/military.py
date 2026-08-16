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

from . import daynight, game_config, realtime, world
from .combat import resolve_battle
from .models import BattleReport, City, Movement, Unit
from .simulation import _grant_units, catch_up


def distance(a: City, b: City) -> float:
    """Euclidean distance between two cities on the world grid."""
    return math.hypot(a.x - b.x, a.y - b.y)


def _merge(*stacks: dict[str, int]) -> dict[str, int]:
    """Combine unit stacks, dropping empties — used to put a land force and a
    fleet back together after the two battle phases resolve separately."""
    out: dict[str, int] = {}
    for stack in stacks:
        for unit_type, count in stack.items():
            if count > 0:
                out[unit_type] = out.get(unit_type, 0) + count
    return out


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
        land_att, sea_att = game_config.split_domains(movement.payload)
        def_land, def_sea = game_config.split_domains(defender_before)

        night = daynight.is_night(now)
        night_mult = daynight.defense_multiplier(now)
        fort_mult = game_config.fortification_multiplier(target.forum_level)

        # A sea voyage is derived, never stored: the movement crossed between
        # islands. Pre-navy land-only movements (and same-island marches with
        # an escort sailing round the coast) resolve as land battles — the
        # defender's fleet sits in harbour and a coastal escort doesn't fight.
        crossed = not world.same_island(origin.x, origin.y, target.x, target.y)
        seaborne = crossed and bool(sea_att)

        naval: dict | None = None
        surviving_ships: dict[str, int] = {} if seaborne else dict(sea_att)
        landed = dict(land_att)
        defender_sea_after = dict(def_sea)

        if seaborne and not def_sea:
            # Nobody contests the crossing: the fleet lands unopposed and every
            # soldier aboard reaches the shore. This case must bypass the sea
            # battle — a transport-only fleet has zero attack power, and
            # resolve_battle would score that as a loss against no opponent.
            naval = {
                "sea_sent": sea_att,
                "sea_survivors": sea_att,
                "defender_sea_before": {},
                "defender_sea_survivors": {},
                "outcome": "attacker_won",
            }
            surviving_ships = dict(sea_att)
        elif seaborne:
            # --- phase 1: the sea battle. No fortification on open water; the
            # night bonus applies (crews fight harder defending home waters).
            sea_result = resolve_battle(sea_att, def_sea, night_mult)
            naval = {
                "sea_sent": sea_att,
                "sea_survivors": sea_result.attacker_survivors,
                "defender_sea_before": def_sea,
                "defender_sea_survivors": sea_result.defender_survivors,
                "outcome": sea_result.outcome,
            }
            defender_sea_after = sea_result.defender_survivors

            if sea_result.outcome == "defender_won":
                # The invasion drowned: transports sunk, every soldier aboard
                # lost. No landing, no loyalty erosion, no return leg.
                _set_army(session, target, _merge(def_land, defender_sea_after))
                report = BattleReport(
                    movement_id=movement.id,
                    attacker_user_id=origin.user_id,
                    defender_user_id=target.user_id,
                    attacker_city_name=origin.name,
                    defender_city_name=target.name,
                    outcome="defender_won",
                    attacker_sent=dict(movement.payload),
                    attacker_survivors={},
                    defender_before=defender_before,
                    defender_survivors=_merge(def_land, defender_sea_after),
                    loyalty_before=target.loyalty,
                    loyalty_after=target.loyalty,
                    captured=False,
                    night_bonus=night,
                    naval=naval,
                )
                session.add(report)
                session.flush()
                realtime.emit_attack_resolved(origin.user_id, report.id, "defender_won", "attacker")
                if target.user_id != origin.user_id:
                    realtime.emit_attack_resolved(target.user_id, report.id, "defender_won", "defender")
                movement.status = "done"
                session.add(movement)
                return

            surviving_ships = sea_result.attacker_survivors
            # Sunk transports take their cargo down with them: the landing
            # force scales by transport survival. floor(), never round — a
            # drowned settler must not be rounded back to life.
            sent_tr = sea_att.get("transport", 0)
            if sent_tr > 0 and landed:
                ratio = surviving_ships.get("transport", 0) / sent_tr
                landed = {t: math.floor(c * ratio) for t, c in landed.items()}
                landed = {t: c for t, c in landed.items() if c > 0}

        # --- phase 2: the ground battle (skipped for a pure-ship raid).
        if landed or def_land or not seaborne:
            result = resolve_battle(landed, def_land, fort_mult * night_mult)
        else:
            result = None

        if seaborne and not land_att:
            # Pure-ship raid that won the sea phase: there is no ground battle
            # to lose — the raid succeeded.
            outcome = "attacker_won"
            att_land_survivors: dict[str, int] = {}
            def_land_after = def_land
        elif result is not None:
            outcome = result.outcome
            att_land_survivors = result.attacker_survivors
            def_land_after = result.defender_survivors
        else:  # seaborne, cargo all drowned, empty defence — nothing landed
            outcome = "defender_won"
            att_land_survivors = {}
            def_land_after = def_land

        # --- loyalty & conquest ---------------------------------------------
        defender_user_id = target.user_id  # capture before any ownership flip
        loyalty_before = target.loyalty    # already regenerated by catch_up above
        # A settler-led assault that wipes the garrison erodes the city's
        # loyalty — and only settlers that actually LANDED count.
        settler_assault = (
            outcome == "attacker_won"
            and not def_land_after
            and landed.get("settler", 0) > 0
        )
        if settler_assault:
            target.loyalty = max(0, target.loyalty - game_config.LOYALTY_HIT)
        loyalty_after = target.loyalty
        captured = settler_assault and target.loyalty <= 0

        attacker_survivors = _merge(att_land_survivors, surviving_ships)
        survivors = {t: c for t, c in attacker_survivors.items() if c > 0}

        if captured:
            # The city flips owner; the conquering survivors (minus one consumed
            # settler) stay as its garrison, and the victorious fleet stations
            # itself in the captured harbour — no return march. The defender's
            # remaining ships are scuttled with the fallen city.
            target.user_id = origin.user_id
            target.loyalty = game_config.LOYALTY_AFTER_CAPTURE
            garrison = dict(survivors)
            if garrison.get("settler"):
                garrison["settler"] -= 1
            _set_army(session, target, {})  # clear the wiped defender rows
            for unit_type, count in garrison.items():
                if count > 0:
                    _grant_units(session, target, unit_type, count)
        else:
            _set_army(session, target, _merge(def_land_after, defender_sea_after))

        report = BattleReport(
            movement_id=movement.id,
            attacker_user_id=origin.user_id,
            defender_user_id=defender_user_id,
            attacker_city_name=origin.name,
            defender_city_name=target.name,
            outcome=outcome,
            attacker_sent=dict(movement.payload),
            attacker_survivors=attacker_survivors,
            defender_before=defender_before,
            defender_survivors=_merge(def_land_after, defender_sea_after),
            loyalty_before=loyalty_before,
            loyalty_after=loyalty_after,
            captured=captured,
            night_bonus=night,
            naval=naval,
        )
        session.add(report)
        session.flush()  # report needs an id for the push events
        realtime.emit_attack_resolved(origin.user_id, report.id, outcome, "attacker")
        if defender_user_id != origin.user_id:
            realtime.emit_attack_resolved(defender_user_id, report.id, outcome, "defender")
        if captured:
            realtime.emit_city_captured(origin.user_id, defender_user_id, target.id)

        # Survivors march home — unless they captured the city (they stay to
        # hold it). A returning fleet sails at ship speed.
        if survivors and not captured:
            dist = distance(target, origin)
            _, return_ships = game_config.split_domains(survivors)
            secs = (
                game_config.travel_seconds_naval(dist, survivors)
                if crossed and return_ships
                else game_config.travel_seconds(dist, survivors)
            )
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
