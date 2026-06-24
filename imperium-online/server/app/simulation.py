"""
★ The heart of the whole project: on-demand "catch-up" simulation.

There is NO real-time game loop. The server does nothing while a city sits idle.
Instead, every read or command first calls catch_up(city, now), which fast-
forwards the city from its last checkpoint (city.last_tick_at) to `now` by:

  1. Resolving every build job that came due in that window, IN TIME ORDER.
     A finished build raises a building level, which can change production
     rates, so we can't just bulk-add resources for the whole gap — we advance
     to each job's completion, apply it, then keep going. This ordering is the
     subtle, important part.
  2. Advancing resources over any remaining time at the (possibly new) rates.
  3. Stamping city.last_tick_at = now.

Because state is always derived from absolute timestamps, the result is
identical whether the player was gone for one second or one month, and whether
catch_up runs from a web request or the background worker. That's what makes it
offline-correct, cheap (work is proportional to reads, not wall-clock), and
cheat-resistant (the client never reports elapsed time — the server reads it).
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from . import game_config
from .models import BuildJob, City, RecruitJob, Unit


def _accrue(city: City, seconds: float) -> None:
    """Add `seconds` worth of production to each resource at current rates,
    clamped to the warehouse capacity. Mutates the city in place.
    """
    if seconds <= 0:
        return
    hours = seconds / 3600.0
    capacity = game_config.warehouse_capacity(city.forum_level)
    for resource, building in game_config.PRODUCERS.items():
        rate = game_config.production_per_hour(city.level_of(building))
        produced = rate * hours
        new_amount = min(capacity, city.resource(resource) + produced)
        city.set_resource(resource, new_amount)


def _grant_units(session: Session, city: City, unit_type: str, count: int) -> None:
    """Add freshly-trained units to the standing army, creating the Unit row on
    first recruitment of that type."""
    row = session.exec(
        select(Unit).where(Unit.city_id == city.id, Unit.unit_type == unit_type)
    ).first()
    if row is None:
        row = Unit(city_id=city.id, unit_type=unit_type, count=0)
    row.count += count
    session.add(row)


def catch_up(session: Session, city: City, now: datetime) -> City:
    """Fast-forward `city` to `now`. Returns the same (mutated) city.

    Resolves BOTH build and recruit jobs that came due, merged into a single
    timeline ordered by completion. Builds change production rates, so resources
    must be accrued up to each event before it's applied; recruit jobs just add
    units (no rate change) but still resolve in order so the timeline is exact.

    Caller is responsible for committing the session afterwards — keeping the
    commit out of here lets a request bundle catch_up + a new command into one
    transaction.
    """
    cursor = city.last_tick_at

    # `now` should never precede the checkpoint, but clocks and races happen.
    # Treat a backwards jump as "no time passed" rather than producing negative
    # resources or resurrecting resolved jobs.
    if now <= cursor:
        city.last_tick_at = now
        return city

    due_builds = session.exec(
        select(BuildJob).where(
            BuildJob.city_id == city.id,
            BuildJob.status == "queued",
            BuildJob.completes_at <= now,
        )
    ).all()
    due_recruits = session.exec(
        select(RecruitJob).where(
            RecruitJob.city_id == city.id,
            RecruitJob.status == "queued",
            RecruitJob.completes_at <= now,
        )
    ).all()

    # One merged timeline. Ties resolve builds before recruits, which is
    # harmless (recruits don't depend on levels).
    events = sorted(
        [*due_builds, *due_recruits],
        key=lambda e: (e.completes_at, isinstance(e, RecruitJob)),
    )

    for event in events:
        # Produce at the CURRENT rates up to the moment this event lands...
        _accrue(city, (event.completes_at - cursor).total_seconds())
        cursor = event.completes_at
        # ...then apply it. A build may change rates for subsequent accrual.
        if isinstance(event, BuildJob):
            if event.target_level > city.level_of(event.building):
                city.set_level(event.building, event.target_level)
        else:  # RecruitJob
            _grant_units(session, city, event.unit_type, event.count)
        event.status = "done"
        session.add(event)

    # Finally, produce over whatever time remains after the last event.
    _accrue(city, (now - cursor).total_seconds())

    city.last_tick_at = now
    session.add(city)
    return city
