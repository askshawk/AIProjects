"""
Background event resolver.

catch_up handles everything a logged-in player sees — but some events must
resolve even when nobody is online. In the slice that's just "mark builds done
so the shared map is accurate for everyone." This worker is the clock-driven
twin of catch_up: same logic, triggered by a timer instead of a request.

It earns its keep at the combat layer, where an attack must land (and a battle
must resolve) while BOTH players are offline. Building it now means that layer
plugs in without changing the architecture.

Implementation: an APScheduler background job every WORKER_INTERVAL seconds that
finds cities with a build due and runs catch_up on each.
"""

from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from .db import engine
from .military import resolve_due_movements
from .models import BuildJob, City, RecruitJob, utcnow
from .simulation import catch_up

WORKER_INTERVAL_SECONDS = 30

_scheduler: BackgroundScheduler | None = None


def resolve_due_events() -> None:
    """Advance the world: resolve every build/recruit job AND every army
    movement that has come due. This is the unattended heartbeat — battles land
    and troops finish training here even with nobody online."""
    now = utcnow()
    with Session(engine) as session:
        due_city_ids = set(
            session.exec(
                select(BuildJob.city_id).where(
                    BuildJob.status == "queued",
                    BuildJob.completes_at <= now,
                )
            ).all()
        )
        due_city_ids |= set(
            session.exec(
                select(RecruitJob.city_id).where(
                    RecruitJob.status == "queued",
                    RecruitJob.completes_at <= now,
                )
            ).all()
        )
        for city_id in due_city_ids:
            city = session.get(City, city_id)
            if city is not None:
                catch_up(session, city, now)

        # Movements are cross-city, so they're resolved globally (not per-city).
        due_movements = resolve_due_movements(session, now)

        if due_city_ids or due_movements:
            session.commit()


def start_worker() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        resolve_due_events,
        "interval",
        seconds=WORKER_INTERVAL_SECONDS,
        # If a tick runs long, don't pile up overlapping runs; just skip.
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()


def stop_worker() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
