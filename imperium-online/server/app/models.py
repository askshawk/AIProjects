"""
The persisted world. These SQLModel tables ARE the game state — there is no
in-memory game object that can drift from the database. Anything the server
needs to reconstruct "the world right now" lives here.

Three tables for the slice:
  User      — an account.
  City      — one per user; the unit the simulation operates on.
  BuildJob  — a queued construction with an absolute completion time.

Design note: times are stored as timezone-aware UTC datetimes. The whole
architecture rests on comparing `now` to stored timestamps (last_tick_at,
completes_at), so we are religious about UTC and never store naive local time.
"""

from datetime import datetime, timezone
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel

from . import game_config


def utcnow() -> datetime:
    """Single source of 'now': naive datetime holding UTC.

    Why naive? SQLite doesn't preserve tzinfo, so a value written as aware comes
    back naive — mixing the two raises "can't compare offset-naive and aware".
    We sidestep that by storing naive UTC *everywhere* internally (consistent on
    both SQLite and Postgres) and attaching the UTC offset only when serializing
    to JSON (see schemas.py), so the browser still parses times as UTC.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=utcnow)

    # One city per user in the slice. cascade so deleting a user is clean.
    city: Optional["City"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
    )


class City(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    name: str

    # Position on the single shared world grid. Unique so two cities never
    # overlap; assigned at founding.
    x: int
    y: int

    founded_at: datetime = Field(default_factory=utcnow)

    # ★ The checkpoint the catch-up tick advances from. "Resources were exactly
    #   these values AT last_tick_at"; everything since is derived, not stored.
    last_tick_at: datetime = Field(default_factory=utcnow)

    # Stored resource amounts as of last_tick_at.
    wood: float = game_config.STARTING_RESOURCES["wood"]
    stone: float = game_config.STARTING_RESOURCES["stone"]
    silver: float = game_config.STARTING_RESOURCES["silver"]

    # Building levels. Flat columns (not a child table) because the set is
    # small and fixed for the slice — simpler to read and query.
    forum_level: int = game_config.STARTING_LEVELS["forum"]
    timber_camp_level: int = game_config.STARTING_LEVELS["timber_camp"]
    quarry_level: int = game_config.STARTING_LEVELS["quarry"]
    silver_mine_level: int = game_config.STARTING_LEVELS["silver_mine"]
    farm_level: int = game_config.STARTING_LEVELS["farm"]

    user: User = Relationship(back_populates="city")
    build_jobs: List["BuildJob"] = Relationship(
        back_populates="city",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    # --- helpers so callers don't sprinkle getattr/setattr everywhere ---
    def level_of(self, building: str) -> int:
        return getattr(self, f"{building}_level")

    def set_level(self, building: str, level: int) -> None:
        setattr(self, f"{building}_level", level)

    def resource(self, name: str) -> float:
        return getattr(self, name)

    def set_resource(self, name: str, value: float) -> None:
        setattr(self, name, value)


class BuildJob(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    city_id: int = Field(foreign_key="city.id", index=True)

    building: str  # one of game_config.BUILDINGS
    target_level: int

    started_at: datetime = Field(default_factory=utcnow)
    completes_at: datetime = Field(index=True)  # ★ absolute time it finishes

    # "queued" until the simulation resolves it, then "done". We keep done rows
    # for now (cheap history); a later cleanup job can prune them.
    status: str = Field(default="queued", index=True)

    city: City = Relationship(back_populates="build_jobs")
