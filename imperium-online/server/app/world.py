"""
Shared-world helpers: founding a city onto the single global grid.

City placement is deterministic-ish: walk outward from the origin in a square
spiral and take the first unoccupied cell. With few players that keeps cities
clustered (so the map demo looks alive) and guarantees no two cities share a
coordinate without needing a fancy region/world system yet.
"""

from __future__ import annotations

from sqlmodel import Session, select

from .models import City, User


def _spiral_coords():
    """Yield (x, y) in a square spiral: (0,0), then rings outward."""
    x = y = 0
    yield x, y
    step = 1
    while True:
        for _ in range(step):
            x += 1
            yield x, y
        for _ in range(step):
            y += 1
            yield x, y
        step += 1
        for _ in range(step):
            x -= 1
            yield x, y
        for _ in range(step):
            y -= 1
            yield x, y
        step += 1


def next_free_coord(session: Session) -> tuple[int, int]:
    occupied = {(c.x, c.y) for c in session.exec(select(City.x, City.y)).all()}
    for coord in _spiral_coords():
        if coord not in occupied:
            return coord
    raise RuntimeError("unreachable: spiral is infinite")  # pragma: no cover


def found_city(session: Session, user: User, name: str) -> City:
    """Create the user's starter city at the next open grid cell.

    Assumes user.id is already populated (caller flushed). Adds the city to the
    session but leaves the commit to the caller.
    """
    x, y = next_free_coord(session)
    city = City(user_id=user.id, name=name, x=x, y=y)
    session.add(city)
    return city
