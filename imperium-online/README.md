# Imperium Online

A Roman-era **async multiplayer** city builder, in the spirit of browser MMOs like
*Grepolis* — found a *colonia*, raise buildings on real-world timers, and share one
persistent world with every other player. Players don't need to be online at the same
time: the server is the single source of truth, and time itself drives the game.

This is the **vertical slice** — the architectural spine that everything else (resources
economy, units, combat, alliances) layers onto. If you only read one file, read
[`server/app/simulation.py`](server/app/simulation.py): the on-demand "catch-up" tick is
the whole idea.

## What it demonstrates

1. **Server-authoritative state.** All state — cities, resources, building levels, build
   timers — lives in the database. The client only renders and sends commands (`build X`).
   The server validates everything; the client is never trusted (e.g. it can't tell the
   server how much time passed).
2. **On-demand "catch-up" simulation — no real-time loop.** When you load or act, the
   server fast-forwards your city from its last checkpoint to *now*: it resolves any builds
   that came due (in time order, since each upgrade can change production rates) and accrues
   resources over the elapsed gap, capped at warehouse capacity. The server does **zero**
   work while a city is idle — cost is proportional to reads, not wall-clock. This is how
   Grepolis-class games stay cheap at scale.
3. **Scheduled timer events + a background worker.** Builds finish at an absolute
   `completes_at`. A lightweight background job resolves events that must happen even when
   nobody is online — minimal now, load-bearing once combat lands.
4. **A shared world.** Every player's city sits on one global grid; any account sees the
   same map.

## Stack

| Layer    | Choice |
|----------|--------|
| Backend  | Python + **FastAPI**, **SQLModel** ORM |
| Database | **SQLite** locally, **Postgres** in prod (just change `DATABASE_URL`) |
| Auth     | JWT (bcrypt password hashing, `python-jose` tokens) |
| Frontend | **Next.js** (App Router, React) + **Phaser** for the city & map views |

## Run it locally

You'll need **two terminals** (backend + frontend).

**1 — Backend** (http://localhost:8000, interactive API docs at `/docs`):

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # optional — sane local defaults if you skip it
.venv/bin/uvicorn app.main:app --reload
```

**2 — Frontend** (http://localhost:3000):

```bash
cd web
npm install
cp .env.local.example .env.local   # optional — defaults to the local API
npm run dev
```

Open http://localhost:3000, found a city, and queue a couple of builds.

### Run the tests

The catch-up simulation is covered by unit tests (offline accrual, capacity cap,
build resolution, post-upgrade rate change, backwards-clock safety):

```bash
cd server
.venv/bin/pytest -q
```

## Project layout

```
server/                  FastAPI backend
  app/
    main.py              app wiring: CORS, lifespan (DB init + worker), routers
    db.py                engine/session; DATABASE_URL → SQLite or Postgres
    models.py            User, City, BuildJob  (the persisted world)
    game_config.py       all balance numbers: costs, build times, production rates
    simulation.py        ★ catch_up(city, now) — the core mechanic
    auth.py              bcrypt + JWT + get_current_user dependency
    world.py             shared-grid city placement
    worker.py            background event resolver (clock-driven twin of catch_up)
    routers/             auth, cities, world endpoints
  tests/                 catch_up unit tests
web/                     Next.js + Phaser client
  app/                   landing, login, register, play (city), map (world)
  components/            PhaserGame bridge, Phaser scenes, BuildQueue, TopBar
  lib/                   api.ts (typed fetch + JWT), auth.tsx (auth context)
```

## Credits

All third-party assets are public-domain (CC0) or open-font-license (OFL); no attribution is legally required, but credit where credit's due:

- **Isometric building & terrain art** — hand-authored original SVGs in `web/public/assets/iso/` (classical Roman temples, mine, quarry, barracks, terrain). No third-party source. See **[ART.md](ART.md)** for the sprite spec + a prompt pack to drop in painted (Midjourney/SD) sprites via the format-agnostic slot system in `web/components/phaser/assetManifest.ts`.
- **Fonts** — [Cinzel](https://fonts.google.com/specimen/Cinzel) and [Marcellus SC](https://fonts.google.com/specimen/Marcellus+SC) from Google Fonts, OFL, self-hosted under `web/public/assets/fonts/` so there's no runtime CDN dependency.
- **Resource / unit icons** — hand-drawn inline SVGs in `web/components/ResourceIcons.tsx` / `UnitIcons.tsx`, no third-party source.

## What's next (the roadmap this spine supports)

Each layer reuses `catch_up` + scheduled events; none requires re-architecting.

1. ~~**Resource costs & limits**~~ ✅ **Done.** Builds charge wood/stone/silver up front
   (`game_config.building_cost`), and a Farm provides population that every building draws
   from — you can't queue past the cap until you raise the Farm. The server previews each
   building's next-upgrade economics (`UpgradeOut`) so the client renders costs and disables
   unaffordable/pop-blocked buttons without duplicating any balance math.
2. ~~**Units & recruitment**~~ ✅ **Done.** Build a Barracks, then recruit Legionaries,
   Archers, and Scouts. Recruitment uses the exact same timer pattern as builds — recruit
   jobs resolve through `catch_up` (and the background worker) on a queue parallel to
   construction, and both streams merge into one ordered timeline. Soldiers draw population
   from the same Farm cap as buildings.
3. ~~**Movement & combat**~~ ✅ **Done.** March an army from the world map onto a rival
   colonia. A `Movement` event carries the stack with an `arrives_at`; on arrival the
   background worker (or a defender's read) resolves a deterministic battle, writes a
   permanent `BattleReport`, and sends survivors home as a return movement. **This is where
   the worker earns its keep** — battles land while *both* players are offline. Pure combat
   math lives in `combat.py`; movement resolution in `military.py`.
4. ~~**Real-time pushes**~~ ✅ **Done.** The 10s/8s polling intervals are gone. A single
   WebSocket from `AuthProvider` opens on login; pages subscribe via `realtime.subscribe(...)`.
   The server pushes tiny JSON events (`build_done`, `recruit_done`, `attack_resolved`,
   `army_returned`, `queued`) the moment a state change resolves inside `catch_up` or
   `resolve_movement` — works whether triggered by a request or the background worker. A
   defender sees an attack land the instant it lands. Auth via `?token=<jwt>` query param;
   reconnects with exponential backoff. `server/app/realtime.py` + `web/lib/realtime.ts`.
   (In-process registry; horizontal scaling needs Redis pub/sub — flagged for later.)
5. ~~**Multiple cities, founding, conquest, alliances**~~ ✅ **Done.** A user owns many cities
   (city switcher; every endpoint loads by id + ownership). Recruit **Settlers** to found new
   colonies on empty map cells or reinforce friendly ones. Cities have **loyalty** that
   regenerates in `catch_up`; a settler-led assault erodes it and at 0 the city flips owner —
   resolved by the worker even while both players are offline. **Alliances** with one-per-user
   membership and **live chat over the WebSocket** (`alliance_message`); allied cities show in
   alliance colour and count as friendly for reinforcement. `routers/alliances.py`,
   loyalty/conquest in `military.py`, founding/reinforce branches in `resolve_movement`.
6. **Hardening** — JWT in httpOnly cookies, rate limiting, SQLite → Postgres.

## Notes & deliberate choices

- **Time is the source of truth, not ticks.** State is always derived from `now -
  last_tick_at` and absolute `completes_at` timestamps (stored UTC). Nothing accumulates in
  a loop — that's what makes it offline-correct and cheat-resistant.
- Datetimes are stored as **naive UTC** for cross-database consistency (SQLite drops
  tzinfo); the UTC offset is re-attached only at the JSON boundary so the browser parses
  times correctly.
- Unlike the other portfolio games, this one is **not** a single no-build `index.html` — it's
  a two-app full-stack project with a database. That's the point: it's the most
  architecturally ambitious piece here.
