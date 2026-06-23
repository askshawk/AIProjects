"""
API request/response shapes (Pydantic). Kept separate from the SQLModel tables
so the wire format never accidentally leaks a column (e.g. password_hash) and
so the client contract is easy to read in one place.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, field_serializer


def _as_utc_iso(dt: datetime) -> str:
    """Stamp our naive-UTC datetimes with the UTC offset on the way out, so the
    JSON carries +00:00 and `new Date(...)` in the browser reads it as UTC
    (not local time). Shared by every datetime field below."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# --- auth ---
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    city_name: str = "Nova Roma"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- gameplay ---
class BuildJobOut(BaseModel):
    id: int
    building: str
    target_level: int
    completes_at: datetime  # client computes the countdown from this
    status: str

    _ser_completes = field_serializer("completes_at")(_as_utc_iso)


class CityOut(BaseModel):
    id: int
    name: str
    x: int
    y: int
    last_tick_at: datetime
    wood: float
    stone: float
    silver: float
    forum_level: int
    timber_camp_level: int
    quarry_level: int
    silver_mine_level: int
    capacity: float  # current per-resource warehouse cap (derived)
    build_jobs: list[BuildJobOut]

    _ser_tick = field_serializer("last_tick_at")(_as_utc_iso)


class BuildRequest(BaseModel):
    building: str  # one of game_config.BUILDINGS


class WorldCityOut(BaseModel):
    x: int
    y: int
    name: str
    owner: str  # owner's email local-part, for a friendly map label
