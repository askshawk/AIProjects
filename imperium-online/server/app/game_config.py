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

# Every building a city can have, with its starting level. New cities are
# founded with everything at level 1 so there's something producing from t=0.
BUILDINGS = ("forum", "timber_camp", "quarry", "silver_mine")
STARTING_LEVELS = {b: 1 for b in BUILDINGS}

# Max level so the client can grey out the button and the server can reject the
# command. Keeps the slice bounded.
MAX_LEVEL = 30

# Starting resources for a freshly founded city.
STARTING_RESOURCES = {"wood": 200.0, "stone": 200.0, "silver": 100.0}


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
