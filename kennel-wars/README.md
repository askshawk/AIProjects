# Kennel Wars

A browser strategy game where you play a lord who breeds war dogs, fortifies a
kennel-castle, and raids rival lords for their food and gold.

**Run it:** `open kennel-wars/index.html`

No build step, no install, no server. Plain HTML, CSS and JavaScript.

---

## The loop

1. **Build.** Farms and mines produce Food and Gold over real time. Stores hold
   it. Walls, watchtowers and guard posts keep raiders off it.
2. **Train.** Six breeds, each a genuinely different unit rather than a reskin.
   Dogs cost Food and take time in the Training Yard.
3. **Raid.** Pick a rival off the map, release your pack along the edge of their
   base, and watch the fight resolve.
4. **Reinvest.** Loot buys upgrades. Stars buy Bloodline points, which unlock
   new breeds and permanent pack-wide buffs.

Deployed dogs are spent whether you win or lose, which is what keeps the loop
turning.

## Breeds

| Breed | Role | Why you bring it |
|---|---|---|
| Jack Russell | Swarm | 1 space, dirt cheap, overwhelms single-target defences |
| Belgian Malinois | Hunter | Targets watchtowers and guard posts first |
| Mastiff | Wall-breaker | Chews stone 8x faster than anything else |
| Bloodhound | Scout | Lets you scout a rival's defences before committing |
| Greyhound | Raider | Slips through walls entirely, runs for the storages |
| Husky | Hauler | Weak fighter, but every husky increases loot taken |

Composition matters. Without Mastiffs you die on the walls; without Malinois the
towers grind you down; without Jack Russells you run out of damage.

---

## How it is built

```
index.html          markup and screen shells
styles.css          all styling
js/
  balance.js        every tunable number in the game
  rng.js            seeded random, so battles reproduce exactly
  baseModel.js      base layouts as plain data
  simulate.js       the battle simulation (pure, no DOM)
  aiBases.js        procedural rival bases
  state.js          player save, economy, training
  render.js         canvas drawing helpers
  screens.js        base editor, army and raid screens
  battle.js         deploy phase and replay playback
  game.js           app shell and clock
tools/
  verify.js         determinism check (Node)
```

### Built single-player, shaped for multiplayer

This is a single-player game. It is deliberately structured so that adding
asynchronous player-vs-player later is an extension rather than a rewrite, and
four rules make that true:

**1. The battle simulation is a pure function with no UI inside it.**

```js
simulateBattle({ army, base, seed }) // -> a complete replay log
```

It returns everything that happened as data. `battle.js` only plays that
recording back. No outcome is ever decided during animation, so the same battle
can be run with no screen attached at all.

**2. A base is plain serializable data.** The player's own base and a generated
AI base are the same shape, so swapping in another player's saved base needs no
change to the simulation or the renderer. `playerState.mySnapshot()` already
produces exactly the object that would be uploaded for others to raid.

**3. The whole save is one serializable object.** It lives in `localStorage`
today. Moving it to a database row is a change of storage backend, not a change
of data model. Resources settle from a timestamp on read rather than from a
running timer, which is how a server would do it too.

**4. Battles are deterministic.** Same army, same base, same seed, same result,
every time. That is what lets a server re-run a submitted raid and check the
attacker reported it honestly.

Run the check yourself:

```bash
node tools/verify.js 20
```

It loads the same four files the browser loads, replays twenty raids twice each,
and fingerprints the results. This is the anti-cheat path in miniature: in the
multiplayer version the client submits `(army, seed, claimed result)`, the
server re-runs it, and a mismatch means the client lied.

One honest caveat: this relies on floating point behaving identically for the
same sequence of operations, which holds across JS engines for the arithmetic
used here. If raids ever carried real stakes, fixed-point maths would be the
fully paranoid version.

### What is still missing for real multiplayer

Accounts and login, a backend to store player bases, matchmaking to find
opponents near your level, and battle reports for defenders. All of it sits
*around* the existing code rather than replacing it.

---

## Tuning

Every number lives in `js/balance.js`: building costs and health, production
rates, breed stats, what each Kennel level permits. Change a value, reload the
page, run `node tools/verify.js` to see how the difficulty curve moved. Nothing
else in the codebase hardcodes a game number.
