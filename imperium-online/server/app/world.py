"""
Shared-world helpers: islands, and founding a city onto the single global grid.

The world is an archipelago (Grepolis-style): every ISLAND_SIZE×ISLAND_SIZE
block of the coordinate grid is one island, holding up to 16 cities owned by
different players. Land armies march freely within an island; crossing to
another island is a sea voyage (enforced by the movement rules, not here).

City placement is deterministic: walk the *islands* outward from the origin in
a square spiral, and fill each island completely before opening the next — so
every new player lands next to neighbours instead of alone on open water.
"""

from __future__ import annotations

from sqlmodel import Session, select

from .models import City, User

# An island is a 4×4 block of grid cells → up to 16 cities per island.
ISLAND_SIZE = 4

# Order in which an island's 16 slots fill: corners first, then edge midpoints,
# then the remainder — early settlers spread out instead of packing one row.
SLOT_ORDER: tuple[tuple[int, int], ...] = (
    (0, 0), (3, 3), (3, 0), (0, 3),
    (1, 2), (2, 1), (1, 0), (3, 2),
    (0, 1), (2, 3), (2, 0), (3, 1),
    (0, 2), (1, 3), (1, 1), (2, 2),
)


def island_of(x: int, y: int) -> tuple[int, int]:
    """The island a grid cell belongs to. Floor division keeps negative
    coordinates in clean blocks (cells -4..-1 form one island, not two)."""
    return (x // ISLAND_SIZE, y // ISLAND_SIZE)


def same_island(ax: int, ay: int, bx: int, by: int) -> bool:
    return island_of(ax, ay) == island_of(bx, by)


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
    """First free cell, filling each island before the next opens.

    The spiral now walks *island* coordinates; within an island, slots fill in
    SLOT_ORDER. Pure function of the occupied set, so placement stays
    deterministic — and existing cities (placed by the old cell-spiral) simply
    appear as occupied slots that get skipped.
    """
    occupied = {(c.x, c.y) for c in session.exec(select(City.x, City.y)).all()}
    for ix, iy in _spiral_coords():
        for dx, dy in SLOT_ORDER:
            coord = (ix * ISLAND_SIZE + dx, iy * ISLAND_SIZE + dy)
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
