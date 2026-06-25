"""
Battle resolution — a pure, deterministic function. No DB, no IO, no clock:
just stacks in, result out. That purity is what makes combat trivially testable
and identical whether it runs in the worker, on a read, or in a unit test.

Model (the classic ratio rule used by Travian/Grepolis-likes):
  - Attack power  = Σ attack(unit) × count, over the attacking stack.
  - Defense power = Σ defense(unit) × count, over the defender, × a home
    fortification multiplier.
  - The stronger side WINS and loses a fraction of itself equal to
    weaker_power / stronger_power (a rout costs the victor little; a near-even
    fight costs them dearly). The loser is wiped out.

This rewards concentration of force and gives defenders a home advantage.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import game_config


@dataclass
class BattleResult:
    outcome: str  # "attacker_won" | "defender_won"
    attacker_survivors: dict[str, int]
    defender_survivors: dict[str, int]
    attacker_power: float
    defender_power: float


def _clean(stack: dict[str, int]) -> dict[str, int]:
    """Drop zero/empty entries so snapshots and survivor sets stay tidy."""
    return {t: int(c) for t, c in stack.items() if int(c) > 0}


def _power(stack: dict[str, int], stat: str) -> float:
    return sum(game_config.UNITS[t][stat] * c for t, c in stack.items() if c > 0)


def _apply_losses(stack: dict[str, int], loss_ratio: float) -> dict[str, int]:
    """Remove `loss_ratio` of every unit type proportionally (rounded)."""
    survivors: dict[str, int] = {}
    for unit_type, count in stack.items():
        lost = round(count * loss_ratio)
        remaining = max(0, count - lost)
        if remaining > 0:
            survivors[unit_type] = remaining
    return survivors


def resolve_battle(
    attacker: dict[str, int],
    defender: dict[str, int],
    defense_multiplier: float = 1.0,
) -> BattleResult:
    attacker = _clean(attacker)
    defender = _clean(defender)

    att_power = _power(attacker, "attack")
    def_power = _power(defender, "defense") * defense_multiplier

    # Degenerate cases first.
    if att_power <= 0:
        # Nothing (effective) to attack with → the defenders hold, unscathed.
        return BattleResult("defender_won", {}, defender, att_power, def_power)
    if def_power <= 0:
        # Undefended city → attackers walk in without a scratch.
        return BattleResult("attacker_won", attacker, {}, att_power, def_power)

    if att_power > def_power:
        survivors = _apply_losses(attacker, def_power / att_power)
        return BattleResult("attacker_won", survivors, {}, att_power, def_power)

    # Ties go to the defender (home ground). They still pay proportionally.
    survivors = _apply_losses(defender, att_power / def_power)
    return BattleResult("defender_won", {}, survivors, att_power, def_power)
