# Aegean Trader

A top-down ship trading game set in the **classical Greek/Roman Mediterranean** (inspired by Grepolis), built with [Phaser 3](https://phaser.io/). Sail an Aegean of city-states and islands, buy goods cheap where they're made and sell them dear where they're wanted, weather **Poseidon's storms**, outrun a rival **Phoenician trader**, and upgrade your galley — with an optional **Oracle of Delphi** (Claude) advising your next voyage.

> The folder is still named `trade-route-tycoon` (its original prototype name); the game itself is *Aegean Trader*.

## Run it

**Just the game (no setup, no accounts):**
```
open trade-route-tycoon/index.html
```
Phaser loads from a CDN; everything else is drawn in code, so there are no asset files.

**With the Oracle (optional AI advisor):**
```
cd trade-route-tycoon/server
pip install -r requirements.txt
cp .env.example .env        # paste your Anthropic API key into .env
python app.py
# then open http://localhost:5000
```

## Controls

- **Arrow keys / WASD** — steer and sail (islands are solid — your hull stops at the beach)
- **Click the sea** — auto-sail there, routing around islands (A* pathfinding)
- **Click the minimap** — set a course to anywhere on the map (handy on the big ocean)
- **Click an island** — inspect it (name, owning faction, garrison)
- **Dock at a city** (sail into its ring) — opens the agora to **buy/sell** and the **⚒ Shipyard** to upgrade
- **Pantheon (top-left)** — spend **Favor** on the gods' powers
- **Click your own island → Enter City** — manage its buildings and army (you start owning **Melos**)
- **Click an empty island while nearby → Found City** — colonize unclaimed land for drachmae + Favor
- **Click an enemy island while nearby → Lay Siege** — commit your hoplites; a timer resolves the assault, and winning makes the island yours
- **In a city, drag buildings** to rearrange them on the grid (a twist on Grepolis's fixed slots)
- **Panels** have a **⠿ grip** (drag to move) and a **– button** (minimize) — your layout persists
- **💾 Save / Load / New** (in the top-left panel) — the game also auto-saves
- **🏛 Consult the Oracle** — an AI prophecy of your most profitable trade (needs the server)

## The world

- **Six city-states** — Athenai, Sparta, Korinthos, Rhodos, Syrakousai, and Alexandreia (crowned with a glowing **Pharos lighthouse**), each belonging to a **faction** (Delian League, Peloponnesian League, or a Free City) and exporting some goods cheaply while seeking others.
- **Six classical goods** — Grain, Pottery, Olive Oil, Wine, Marble, and the luxury **Tyrian Purple** (high value, big swings).
- **Named islands** (Naxos, Delos, Thera, Melos, Ikaria, Kythera) — each with a shallows halo, beaches, rocky shores, marble ruins, cypress & olive groves, and a **settlement flying its faction's banner** (the seed of the future city you'll build there).
- A Greek **war-galley** with a painted apotropaic eye, bronze ram, oars, and an emblem sail.

## The systems

1. **Dynamic economy** ([economy.js](js/economy.js)) — price follows stock; buying raises it, selling lowers it, and stock drifts back to equilibrium. Exporting cities are cheap; seeking cities pay well.
2. **A\* pathfinding** ([pathfinding.js](js/pathfinding.js)) — islands are obstacles; click anywhere and the galley routes around them.
3. **Real ocean shader** — animated WebGL waves, foam, sun/moon glints, and a depth-color gradient that **darkens and churns during storms**.
4. **Weather — Poseidon's mood** — calm → rain → full storm with diagonal rain, a darkened sea, bigger swell, gale winds that shove your hull, and **Zeus's lightning**. The Oak Hull upgrade resists the push.
5. **Day/night cycle** — the sun crosses the sky over ~2 minutes; the Pharos beacon glows brightest at night.
6. **Hermes' blessing** — a periodic divine event granting **+25% sale prices** for a short window (watch the banner).
7. **Rival trader** — *Hanno of Carthage* sails his purple-sailed galley between cities, buying and selling on the same live markets you do. His trades move prices — you're competing for the best deals, and the scoreboard tracks who's richer.
8. **Ship upgrades** ([the Shipyard](js/game.js)) — spend drachmae on a bigger Cargo Hold (+capacity), better Sails (+speed), or an Oak Hull (+storm resistance).
9. **Factions & standing** — every city and island belongs to a faction; trading at a faction's city raises your **standing** with it (shown in the Pantheon). The groundwork for alliances, blockades, and war.
10. **Divine Favor & the Pantheon** — trading earns **Favor** (luxuries most of all). Spend it on the gods: **Poseidon** calms the seas *and scatters an attacking fleet*, **Zeus** hurls a thunderbolt, **Hermes** blesses your sales (+25%), **Athena** lends the Oracle's wisdom, **Ares** rallies a besieged garrison (+15).
11. **Island inspector & sieges** — click any island to see its faction and garrison. Near an enemy isle you **Lay Siege** (a ~15s timer; outnumber the garrison to capture it, banner turns gold); near your own you **Reinforce** (move army into its garrison).
12. **Isometric city-building** ([city.js](js/city.js)) — *the Grepolis half.* Each island you own opens an **isometric city** of ten buildings — **Senate, Timber Camp, Quarry, Silver Mine, Farm, Warehouse, Temple, Barracks, Harbor, City Walls**. Build/upgrade them via a **one-at-a-time queue with construction timers**, within **population** (Farm) and **storage** (Warehouse) caps. Cost = `base × 1.5^level`; the **Senate gates** every other building's max level, so you grow it to unlock the rest. Train **hoplites** (Barracks) and **warships** (Harbor). Everything ticks whether you're managing or sailing.
13. **AI counter-sieges** — after a grace period, the factions push back: a telegraphed assault (red ring + countdown) hits one of your islands. Its **defense** = garrison + Walls + warships; defend by reinforcing, building Walls, or invoking Ares/Poseidon. **Lose every island and your empire falls** (game over → restart).
14. **Diplomacy** (🤝 menu) — set **war / peace / alliance** with each faction. At war their cities charge you a tax (worse prices) and they besiege you more; at peace/allied you get better prices and they leave you be. Laying siege on a peaceful faction declares war.
15. **Academy & Research** (🔬 menu) — build the **Academy** to unlock empire-wide **research**: Engineering (−20% build time), Agriculture (+15% output), Phalanx Drill (+25% army), Shipwrights (−20% unit cost), Masonry (+50% Wall defense). Higher Academy levels unlock higher tiers.
16. **Automated trade routes** (⛵ menu) — hire **auto-trader galleys** (up to 3) that sail a buy-low/sell-high loop between two cities for **passive drachmae** (they move prices like any trader).
17. **Quests & victory** (📜 menu) — starter quests teach the loop and pay rewards; reach **hegemony** by owning 6 cities to win.
18. **Living world** — the rival factions act on their own: they **found colonies** on unclaimed islands (racing you for empty land), **reinforce** their garrisons over time, and **seize** weaker rivals' islands — so the map's ownership shifts as you play.
19. **Sound** — procedural Web Audio effects (sell chime, build thud, war horn, victory fanfare) with a 🔊 mute toggle in the Polis panel.
20. **Oracle of Delphi** ([server/app.py](server/app.py)) — a Flask server sends the live game state to Claude, which replies as a mystical-but-concrete trade prophecy.

## How the two halves connect

The **sea** funds and feeds the **land**, and the land arms the sea: trade earns drachmae + Favor; cities produce resources, hoplites, and warships; hoplites capture islands by siege, or you **found new cities on empty islands**; cities produce more — but the factions besiege you back. You sail a **large open ocean** (7200×5200) dotted with city-states and islands, starting from one city (**Melos**). Progress **auto-saves** (and you can Save/Load/New). Expand by sailing, trading, conquering, and colonizing — and hold what you take.

## Roadmap

- **Naval combat**: ship HP, ramming, boarding between fleets (period-accurate — no gunpowder).
- **Mythic units & more gods**, music, and a proper tutorial flow.
- *(The bigger arc — a live, registered, async multiplayer **Roman** version — is a separate server-backed project.)*
