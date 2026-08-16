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
# the population every other building (and unit) consumes. The Barracks and the
# Harbour start at level 0 (not built): you must construct them before you can
# recruit soldiers / lay keels.
BUILDINGS = ("forum", "timber_camp", "quarry", "silver_mine", "farm", "barracks", "harbour", "academy")
STARTING_LEVELS = {
    "forum": 1,
    "timber_camp": 1,
    "quarry": 1,
    "silver_mine": 1,
    "farm": 1,
    "barracks": 0,
    "harbour": 0,
    "academy": 0,
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
    "harbour": 6,
    "academy": 4,
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
    # --- the fleet (C1b). domain "sea" units are built at the Harbour and are
    # what carries an army between islands. Land units have no domain key and
    # default to "land" via .get("domain", "land").
    "trireme": {
        "label": "Trireme",
        "cost": {"wood": 180.0, "stone": 0.0, "silver": 120.0},
        "population": 6,
        "seconds": 300,
        "attack": 24,        # the naval hammer — two legionaries' attack afloat
        "defense": 12,
        "speed": 1.2,
        "domain": "sea",
        "capacity": 0,
    },
    "bireme": {
        "label": "Bireme",
        "cost": {"wood": 160.0, "stone": 0.0, "silver": 90.0},
        "population": 5,
        "seconds": 260,
        "attack": 8,
        "defense": 28,       # the sea wall
        "speed": 1.1,
        "domain": "sea",
        "capacity": 0,
    },
    "transport": {
        "label": "Transport",
        "cost": {"wood": 140.0, "stone": 0.0, "silver": 60.0},
        "population": 4,
        "seconds": 240,
        "attack": 0,         # cannot fight: unescorted vs any fleet = total loss
        "defense": 2,
        "speed": 0.9,
        "domain": "sea",
        "capacity": 16,      # berths, in population points of cargo
    },
}

UNIT_TYPES = tuple(UNITS.keys())

# A city can recruit Settlers (to found/conquer) only once its Forum is decent.
SETTLER_FORUM_REQUIREMENT = 2


def is_sea_unit(unit_type: str) -> bool:
    return UNITS[unit_type].get("domain", "land") == "sea"


def split_domains(stack: dict[str, int]) -> tuple[dict[str, int], dict[str, int]]:
    """Split a mixed stack into (land, sea), dropping zero counts."""
    land: dict[str, int] = {}
    sea: dict[str, int] = {}
    for t, c in stack.items():
        if c <= 0:
            continue
        (sea if is_sea_unit(t) else land)[t] = c
    return land, sea


def transport_capacity(stack: dict[str, int], berth_bonus: int = 0) -> int:
    """Total berths the stack's ships provide, in population points. Only ships
    that carry cargo at all benefit from a berth bonus (Stowage)."""
    return sum(
        (UNITS[t].get("capacity", 0) + (berth_bonus if UNITS[t].get("capacity", 0) else 0)) * c
        for t, c in stack.items() if c > 0
    )


def cargo_population(land_stack: dict[str, int]) -> int:
    """Berths a land force needs aboard: each unit occupies its population."""
    return sum(UNITS[t]["population"] * c for t, c in land_stack.items() if c > 0)


def can_recruit_unit(unit_type: str, forum_level: int, barracks_level: int, harbour_level: int) -> bool:
    """Facility gates for one unit type. Sea units need a Harbour; land units a
    Barracks; settlers additionally need an established Forum."""
    if is_sea_unit(unit_type):
        return harbour_level >= 1
    if barracks_level < 1:
        return False
    if unit_type == "settler":
        return forum_level >= SETTLER_FORUM_REQUIREMENT
    return True


def unit_cost(unit_type: str, count: int) -> dict[str, float]:
    """Total resource cost to recruit `count` of a unit type."""
    per = UNITS[unit_type]["cost"]
    return {res: round(amount * count, 1) for res, amount in per.items()}


def unit_population(unit_type: str) -> int:
    return UNITS[unit_type]["population"]


def recruit_seconds(unit_type: str, count: int, facility_level: int, time_mult: float = 1.0) -> int:
    """Time to recruit `count` units. `facility_level` is the Barracks for land
    units or the Harbour for ships; each level past the first shaves ~5% off
    the per-unit time."""
    per_unit = UNITS[unit_type]["seconds"] * (0.95 ** max(0, facility_level - 1)) * time_mult
    return max(1, int(per_unit * count))


# --- movement & combat ------------------------------------------------------
SECONDS_PER_TILE = 75  # base march time per grid tile, before unit speed


def army_speed(units: dict[str, int]) -> float:
    """An army moves at the pace of its slowest present unit."""
    present = [UNITS[t]["speed"] for t, c in units.items() if c > 0]
    return min(present) if present else 1.0


def travel_seconds(distance: float, units: dict[str, int], speed_mult: float = 1.0) -> int:
    """Marching time for `units` to cross `distance` tiles. Slower units
    (legionaries) lengthen the journey; scouts shorten it."""
    return max(1, int(distance * SECONDS_PER_TILE / (army_speed(units) * speed_mult)))


def fleet_speed(units: dict[str, int]) -> float:
    """A fleet sails at its slowest *ship* — cargo below decks doesn't slow the
    crossing. Falls back to army pace if (impossibly) no ship is present."""
    present = [UNITS[t]["speed"] for t, c in units.items() if c > 0 and is_sea_unit(t)]
    return min(present) if present else army_speed(units)


def travel_seconds_naval(distance: float, units: dict[str, int], speed_mult: float = 1.0) -> int:
    """Sailing time for a seaborne force to cross `distance` tiles."""
    return max(1, int(distance * SECONDS_PER_TILE / (fleet_speed(units) * speed_mult)))


def fortification_multiplier(forum_level: int, research_mult: float = 1.0) -> float:
    """Home-defense bonus. The Forum doubles as the citadel: defenders fight a
    little harder for every level of it (no separate Wall building yet)."""
    return (1.0 + 0.05 * (forum_level - 1)) * research_mult


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


def warehouse_capacity(forum_level: int, storage_bonus: float = 0.0) -> float:
    """Per-resource storage cap.

    The slice has no dedicated warehouse building yet, so the forum level
    stands in for it. Resources never accumulate past this; that cap is applied
    in the catch-up tick so an offline player doesn't get unlimited resources.
    """
    return 1000.0 + 500.0 * forum_level + storage_bonus


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


def building_cost(building: str, target_level: int, cost_mult: float = 1.0) -> dict[str, float]:
    """Resource cost to raise `building` to `target_level`.

    Not enforced in the slice's build endpoint yet (resources are free to
    queue) — it lives here so the "enforce costs" roadmap step is a one-line
    change in the router, not a new model. Wood/stone scale with level; silver
    only matters for pricier upgrades.
    """
    factor = (1.55 ** (target_level - 1)) * cost_mult
    return {
        "wood": round(50 * factor, 1),
        "stone": round(40 * factor, 1),
        "silver": round(10 * factor, 1),
    }


# --- research (C2) ----------------------------------------------------------
# The Academy turns levels into research points, which are spent (alongside
# resources) on technologies. Every technology is a pure multiplier or bonus
# applied to one of the functions above, so the simulation stays data-driven:
# nothing here reaches into the game loop, the loop reads the effects.

RESEARCH_POINTS_PER_LEVEL = 4


def research_points(academy_level: int) -> int:
    """Total points an Academy of this level has produced."""
    return max(0, academy_level) * RESEARCH_POINTS_PER_LEVEL


# effect: the key `research.effects_for` accumulates. Each entry is
# (attribute, delta) — multipliers compound, additions sum.
RESEARCH: dict[str, dict] = {
    "ceramics": {
        "label": "Ceramics",
        "blurb": "Pitch-sealed jars and deeper cellars. +1500 warehouse capacity.",
        "academy_level": 1,
        "points": 4,
        "cost": {"wood": 400.0, "stone": 500.0, "silver": 200.0},
        "effect": ("warehouse_bonus", 1500.0),
    },
    "architecture": {
        "label": "Architecture",
        "blurb": "Surveyors and standard plans. Buildings cost 15% less.",
        "academy_level": 2,
        "points": 6,
        "cost": {"wood": 800.0, "stone": 900.0, "silver": 400.0},
        "effect": ("build_cost_mult", 0.85),
    },
    "trainer": {
        "label": "Trainer",
        "blurb": "Drill masters on the parade ground. Recruitment is 10% faster.",
        "academy_level": 3,
        "points": 6,
        "cost": {"wood": 600.0, "stone": 400.0, "silver": 900.0},
        "effect": ("recruit_time_mult", 0.90),
    },
    "cartography": {
        "label": "Cartography",
        "blurb": "Charted roads and coastlines. Armies and fleets move 10% faster.",
        "academy_level": 4,
        "points": 8,
        "cost": {"wood": 700.0, "stone": 300.0, "silver": 1100.0},
        "effect": ("speed_mult", 1.10),
    },
    "stowage": {
        "label": "Stowage",
        "blurb": "Tighter holds and better lashing. Each transport carries 8 more berths.",
        "academy_level": 4,
        "points": 8,
        "cost": {"wood": 1200.0, "stone": 200.0, "silver": 700.0},
        "effect": ("berth_bonus", 8),
    },
    "fortifications": {
        "label": "Fortifications",
        "blurb": "Ditch, rampart and palisade. Defenders fight 15% harder at home.",
        "academy_level": 5,
        "points": 10,
        "cost": {"wood": 900.0, "stone": 1600.0, "silver": 600.0},
        "effect": ("fortification_mult", 1.15),
    },
    "conscription": {
        "label": "Conscription",
        "blurb": "A wider levy and harder discipline. Land units attack 10% harder.",
        "academy_level": 6,
        "points": 12,
        "cost": {"wood": 800.0, "stone": 800.0, "silver": 1800.0},
        "effect": ("land_attack_mult", 1.10),
    },
    "shipwright": {
        "label": "Shipwright",
        "blurb": "Seasoned timber and bronze rams. Warships attack 15% harder.",
        "academy_level": 6,
        "points": 12,
        "cost": {"wood": 2000.0, "stone": 400.0, "silver": 1200.0},
        "effect": ("naval_attack_mult", 1.15),
    },
}

RESEARCH_IDS = tuple(RESEARCH.keys())
