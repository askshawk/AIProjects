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
from .models import BuildJob, City


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


def catch_up(session: Session, city: City, now: datetime) -> City:
    """Fast-forward `city` to `now`. Returns the same (mutated) city.

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

    # Pending builds that finish at or before `now`, oldest first. Resolving in
    # completion order is what makes step 1 correct.
    due_jobs = session.exec(
        select(BuildJob)
        .where(
            BuildJob.city_id == city.id,
            BuildJob.status == "queued",
            BuildJob.completes_at <= now,
        )
        .order_by(BuildJob.completes_at)
    ).all()

    for job in due_jobs:
        # Produce at the OLD rates up to the moment this build lands...
        _accrue(city, (job.completes_at - cursor).total_seconds())
        cursor = job.completes_at
        # ...then apply the upgrade so subsequent accrual uses the NEW rate.
        # Guard against a stale/duplicate job lowering a level.
        if job.target_level > city.level_of(job.building):
            city.set_level(job.building, job.target_level)
        job.status = "done"
        session.add(job)

    # Finally, produce over whatever time remains after the last build.
    _accrue(city, (now - cursor).total_seconds())

    city.last_tick_at = now
    session.add(city)
    return city
