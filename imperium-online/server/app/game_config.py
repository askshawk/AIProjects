"""
Game balance & rules — all the tunable numbers in one place.

Everything here is pure data + pure functions. The simulation reads from this
module; it never hard-codes a cost or a rate. Want to rebalance the game? You
should only ever need to touch this file.

Buildings (the small set the vertical slice ships with):
  - forum        : the town hall. Higher level → faster builds (a small discount).
  - timber_camp  : produces wood.
  - quarry       : produces stone.
  - silver_mine  : produces silver.
"""

from __future__ import annotations

# The resources a city tracks. Order matters only for display.
RESOURCES = ("wood", "stone", "silver")

# Which building feeds which resource. The forum produces nothing; it speeds
# up construction instead (see build_seconds below).
PRODUCERS = {
    "wood": "timber_camp",
    "stone": "quarry",
    "silver": "silver_mine",
}

# Every building a city can have. The Farm produces no resources — it provides
# the population every other building (and unit) consumes. The Barracks starts
# at level 0 (not built): you must construct it before you can recruit, which
# demonstrates a prerequisite gate on top of the build system.
BUILDINGS = ("forum", "timber_camp", "quarry", "silver_mine", "farm", "barracks")
STARTING_LEVELS = {
    "forum": 1,
    "timber_camp": 1,
    "quarry": 1,
    "silver_mine": 1,
    "farm": 1,
    "barracks": 0,
}

# Max level so the client can grey out the button and the server can reject the
# command. Keeps the slice bounded.
MAX_LEVEL = 30

# Starting resources for a freshly founded city — enough to fund a couple of
# upgrades immediately, then you must wait on production (the core loop).
STARTING_RESOURCES = {"wood": 500.0, "stone": 500.0, "silver": 250.0}


def population_provided(farm_level: int) -> int:
    """Total population the Farm feeds at a given level.

    Level 1 supports 100 citizens; each level adds 40. This is the hard cap on
    how much you can build — queue an upgrade that would exceed it and the
    server rejects the command until you raise the Farm.
    """
    return 100 + 40 * (farm_level - 1)


# How much population each building occupies *per level* (cumulative: a level-3
# timber camp uses 3x this). The Farm tends itself cheaply.
_POPULATION_PER_LEVEL = {
    "forum": 5,
    "timber_camp": 4,
    "quarry": 4,
    "silver_mine": 5,
    "farm": 3,
    "barracks": 6,
}


def population_used(building: str, level: int) -> int:
    """Population occupied by `building` when it sits at `level` (cumulative)."""
    if level <= 0:
        return 0
    return _POPULATION_PER_LEVEL.get(building, 4) * level


# --- military ---------------------------------------------------------------
# The three starting unit types. Each costs resources + population to recruit,
# takes time per unit (shortened by the Barracks level), and carries attack /
# defense values that Phase 5's combat will use. Population is the long-run
# constraint: every soldier occupies a citizen slot just like a building level.
UNITS: dict[str, dict] = {
    "legionary": {
        "label": "Legionary",
        "cost": {"wood": 0.0, "stone": 40.0, "silver": 60.0},
        "population": 1,
        "seconds": 75,       # per unit, at barracks level 1
        "attack": 12,
        "defense": 14,
        "speed": 0.8,        # march speed multiplier (heavy infantry = slow)
    },
    "archer": {
        "label": "Archer",
        "cost": {"wood": 50.0, "stone": 0.0, "silver": 55.0},
        "population": 1,
        "seconds": 60,
        "attack": 14,
        "defense": 7,
        "speed": 1.0,
    },
    "scout": {
        "label": "Scout",
        "cost": {"wood": 25.0, "stone": 0.0, "silver": 45.0},
        "population": 1,
        "seconds": 35,
        "attack": 3,
        "defense": 3,
        "speed": 1.6,        # fast — outruns the legion
    },
    "settler": {
        "label": "Settler",
        "cost": {"wood": 200.0, "stone": 200.0, "silver": 200.0},
        "population": 8,     # a whole household leaves the city
        "seconds": 600,      # 10 min at barracks 1 — a serious commitment
        "attack": 0,
        "defense": 2,
        "speed": 0.5,        # slow, lumbering wagon train
    },
}

UNIT_TYPES = tuple(UNITS.keys())

# A city can recruit Settlers (to found/conquer) only once its Forum is decent.
SETTLER_FORUM_REQUIREMENT = 2


def can_recruit_unit(unit_type: str, forum_level: int) -> bool:
    if unit_type == "settler":
        return forum_level >= SETTLER_FORUM_REQUIREMENT
    return True


def unit_cost(unit_type: str, count: int) -> dict[str, float]:
    """Total resource cost to recruit `count` of a unit type."""
    per = UNITS[unit_type]["cost"]
    return {res: round(amount * count, 1) for res, amount in per.items()}


def unit_population(unit_type: str) -> int:
    return UNITS[unit_type]["population"]


def recruit_seconds(unit_type: str, count: int, barracks_level: int) -> int:
    """Time to recruit `count` units. Each Barracks level past the first shaves
    ~5% off the per-unit time (so a bigger barracks trains faster)."""
    per_unit = UNITS[unit_type]["seconds"] * (0.95 ** max(0, barracks_level - 1))
    return max(1, int(per_unit * count))


# --- movement & combat ------------------------------------------------------
SECONDS_PER_TILE = 75  # base march time per grid tile, before unit speed


def army_speed(units: dict[str, int]) -> float:
    """An army moves at the pace of its slowest present unit."""
    present = [UNITS[t]["speed"] for t, c in units.items() if c > 0]
    return min(present) if present else 1.0


def travel_seconds(distance: float, units: dict[str, int]) -> int:
    """Marching time for `units` to cross `distance` tiles. Slower units
    (legionaries) lengthen the journey; scouts shorten it."""
    return max(1, int(distance * SECONDS_PER_TILE / army_speed(units)))


def fortification_multiplier(forum_level: int) -> float:
    """Home-defense bonus. The Forum doubles as the citadel: defenders fight a
    little harder for every level of it (no separate Wall building yet)."""
    return 1.0 + 0.05 * (forum_level - 1)


# --- conquest / loyalty -----------------------------------------------------
LOYALTY_MAX = 100
LOYALTY_REGEN_PER_HOUR = 2.0   # a city slowly returns to full allegiance
LOYALTY_HIT = 25               # drop per settler-led successful assault
LOYALTY_AFTER_CAPTURE = 25     # a freshly conquered city starts shaky


def loyalty_regen(loyalty: float, seconds: float) -> float:
    """Loyalty drifts back up toward LOYALTY_MAX over time. Pure function of
    elapsed seconds, mirroring how resources accrue in the catch-up tick."""
    return min(LOYALTY_MAX, loyalty + LOYALTY_REGEN_PER_HOUR * (seconds / 3600.0))


def production_per_hour(building_level: int) -> float:
    """Units/hour a producer yields at a given level.

    Level 1 yields 30/hr and each level adds a bit more than the last, so
    upgrading always feels worth it without exploding. A pure function of the
    level — no global state — which is what makes the catch-up math trivial.
    """
    return 30.0 * (1.2 ** (building_level - 1))


def warehouse_capacity(forum_level: int) -> float:
    """Per-resource storage cap.

    The slice has no dedicated warehouse building yet, so the forum level
    stands in for it. Resources never accumulate past this; that cap is applied
    in the catch-up tick so an offline player doesn't get unlimited resources.
    """
    return 1000.0 + 500.0 * forum_level


def build_seconds(building: str, target_level: int, forum_level: int) -> int:
    """How long it takes to raise `building` to `target_level`.

    Cost-in-time grows geometrically with the target level (each level is ~1.6x
    the previous), and a higher forum shaves a few percent off every build.
    Returns whole seconds; the caller turns that into an absolute completes_at.
    """
    base = 60.0  # level-1 build = 60s, short enough to watch finish in the demo
    raw = base * (1.6 ** (target_level - 1))
    forum_discount = 0.98 ** (forum_level - 1)  # ~2% faster per forum level
    return max(1, int(raw * forum_discount))


def building_cost(building: str, target_level: int) -> dict[str, float]:
    """Resource cost to raise `building` to `target_level`.

    Not enforced in the slice's build endpoint yet (resources are free to
    queue) — it lives here so the "enforce costs" roadmap step is a one-line
    change in the router, not a new model. Wood/stone scale with level; silver
    only matters for pricier upgrades.
    """
    factor = 1.55 ** (target_level - 1)
    return {
        "wood": round(50 * factor, 1),
        "stone": round(40 * factor, 1),
        "silver": round(10 * factor, 1),
    }
