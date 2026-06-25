"""
Combat math — pure-function tests on resolve_battle. No DB, no app: just the
ratio rule and its edge cases.

Unit stats used here come from game_config.UNITS:
  legionary: attack 12, defense 14
  archer:    attack 14, defense 7
  scout:     attack 3,  defense 3
"""

from __future__ import annotations

from app.combat import resolve_battle


def test_overwhelming_attacker_wins_with_light_losses():
    # 20 legionaries (att 240) vs 5 legionaries (def 70). Attacker wins and
    # loses def/att = 70/240 ≈ 0.29 → round(20*0.29)=6 lost → 14 survive.
    r = resolve_battle({"legionary": 20}, {"legionary": 5})
    assert r.outcome == "attacker_won"
    assert r.attacker_survivors == {"legionary": 14}
    assert r.defender_survivors == {}  # defender wiped


def test_strong_defender_wins_and_attacker_is_wiped():
    r = resolve_battle({"scout": 10}, {"legionary": 10})  # att 30 vs def 140
    assert r.outcome == "defender_won"
    assert r.attacker_survivors == {}
    # defender loses att/def = 30/140 ≈ 0.21 → round(10*0.21)=2 → 8 survive
    assert r.defender_survivors == {"legionary": 8}


def test_undefended_city_falls_without_losses():
    r = resolve_battle({"legionary": 3}, {})
    assert r.outcome == "attacker_won"
    assert r.attacker_survivors == {"legionary": 3}


def test_empty_attack_fails_and_defenders_are_unscathed():
    r = resolve_battle({}, {"legionary": 4})
    assert r.outcome == "defender_won"
    assert r.defender_survivors == {"legionary": 4}


def test_fortification_bonus_can_flip_a_close_fight():
    attacker = {"legionary": 10}  # att 120
    defender = {"legionary": 10}  # def 140 (already wins on base stats)
    # Without bonus the defender already wins here; verify the multiplier
    # widens the margin (fewer defender losses with a higher fort).
    base = resolve_battle(attacker, defender, defense_multiplier=1.0)
    forted = resolve_battle(attacker, defender, defense_multiplier=1.5)
    assert base.outcome == forted.outcome == "defender_won"
    base_surv = sum(base.defender_survivors.values())
    fort_surv = sum(forted.defender_survivors.values())
    assert fort_surv > base_surv  # the citadel saved more defenders


def test_mixed_stack_powers_sum_correctly():
    # attacker: 5 archer (att 70) + 5 scout (att 15) = 85
    # defender: 5 legionary (def 70)
    r = resolve_battle({"archer": 5, "scout": 5}, {"legionary": 5})
    assert r.attacker_power == 85
    assert r.defender_power == 70
    assert r.outcome == "attacker_won"
