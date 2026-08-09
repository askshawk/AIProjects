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


class UpgradeOut(BaseModel):
    """Per-building preview of the next upgrade — everything the client needs to
    render a cost panel and decide whether to enable the button. Computed
    server-side so the client never duplicates the balance formulas."""
    building: str
    target_level: int
    cost: dict[str, float]
    seconds: int
    population_after: int  # total city population if this upgrade is queued
    affordable: bool       # can pay the cost from current resources
    pop_ok: bool           # population_after fits under the (post-upgrade) cap
    maxed: bool            # already at/above MAX_LEVEL


class RecruitJobOut(BaseModel):
    id: int
    unit_type: str
    count: int
    completes_at: datetime
    status: str

    _ser_completes = field_serializer("completes_at")(_as_utc_iso)


class UnitTypeOut(BaseModel):
    """Static catalog entry for a unit type + this city's live recruit economics
    (cost for one, per-unit time, whether the barracks/resources allow it)."""
    unit_type: str
    label: str
    cost: dict[str, float]   # cost for ONE unit
    population: int
    seconds: int             # to train ONE, at this city's barracks level
    attack: int
    defense: int
    have: int                # how many the city currently fields
    can_recruit: bool        # barracks built + at least one affordable + pop room


class CitySummaryOut(BaseModel):
    """Lightweight entry for the city-switcher list (no catch_up)."""
    id: int
    name: str
    x: int
    y: int
    forum_level: int
    loyalty: int


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
    farm_level: int
    barracks_level: int
    loyalty: int
    capacity: float  # current per-resource warehouse cap (derived)
    population_used: int
    population_cap: int
    upgrades: list[UpgradeOut]
    build_jobs: list[BuildJobOut]
    units: list[UnitTypeOut]
    recruit_jobs: list[RecruitJobOut]

    _ser_tick = field_serializer("last_tick_at")(_as_utc_iso)


class BuildRequest(BaseModel):
    building: str  # one of game_config.BUILDINGS


class RecruitRequest(BaseModel):
    unit_type: str  # one of game_config.UNIT_TYPES
    count: int


class WorldCityOut(BaseModel):
    x: int
    y: int
    name: str
    owner: str  # owner's email local-part, for a friendly map label
    alliance: str | None = None  # alliance name, for map colouring


# --- alliances ---------------------------------------------------------------
class AllianceCreateRequest(BaseModel):
    name: str


class MessageRequest(BaseModel):
    body: str


class MemberOut(BaseModel):
    user: str  # email local-part
    role: str


class AllianceOut(BaseModel):
    id: int
    name: str
    members: list[MemberOut]
    mine_role: str | None = None  # the caller's role, if a member


class MessageOut(BaseModel):
    id: int
    user: str
    body: str
    created_at: datetime

    _ser_created = field_serializer("created_at")(_as_utc_iso)


# --- movement & combat ------------------------------------------------------
class SendArmyRequest(BaseModel):
    origin_city_id: int
    target_x: int
    target_y: int
    units: dict[str, int]  # {unit_type: count}


class MovementOut(BaseModel):
    """A moving army, described from the viewer's perspective."""
    id: int
    kind: str               # "attack" | "return"
    payload: dict[str, int]
    departs_at: datetime
    arrives_at: datetime
    mine: bool              # do I own the marching troops?
    incoming_attack: bool   # an enemy attack inbound to my city
    from_name: str
    to_name: str
    # Origin coordinates let the client draw the march route. Optional because
    # the origin city row may be gone (mirrors the from_name fallback).
    from_x: int | None = None
    from_y: int | None = None
    to_x: int
    to_y: int

    _ser_dep = field_serializer("departs_at")(_as_utc_iso)
    _ser_arr = field_serializer("arrives_at")(_as_utc_iso)


class BattleReportOut(BaseModel):
    id: int
    outcome: str            # "attacker_won" | "defender_won"
    i_attacked: bool        # was I the attacker (vs. the defender)?
    attacker_city_name: str
    defender_city_name: str
    attacker_sent: dict[str, int]
    attacker_survivors: dict[str, int]
    defender_before: dict[str, int]
    defender_survivors: dict[str, int]
    loyalty_before: int
    loyalty_after: int
    captured: bool
    night_bonus: bool = False  # defenders fought under the night bonus
    created_at: datetime

    _ser_created = field_serializer("created_at")(_as_utc_iso)
