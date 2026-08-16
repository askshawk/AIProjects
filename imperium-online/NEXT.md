# Next up — art wiring, then Alembic

Working brief for the next session (human or agent). Written 2026-08-16, when
every roadmap item (B polish, C depth, D visuals) had shipped and the suite was
**106 passing**.

## Orientation

Roman async-multiplayer browser game. Backend FastAPI + SQLModel (SQLite dev) in
`server/`; frontend Next.js 15 + Phaser 3 in `web/`.

```bash
cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q          # expect 106 passing
cd ../web && npm install && npm run build
```

Read `server/app/game_config.py` and `web/components/phaser/assetManifest.ts`
early — the project is deliberately data-driven and those two files are its
heart.

**Dev-loop rule:** never run `npm run build` while the dev server is running —
it clobbers `.next` and serves blank pages. Stop the preview, `rm -rf web/.next`,
build, then restart.

---

## Task 1 — Wire up the painted art

Six painted PNGs are committed as raw assets but are **not wired in**. They are
already at the correct dimensions — **do not resize**.

| File | Size |
|---|---|
| `web/public/assets/units/{trireme,bireme,transport}.png` | 256×256 |
| `web/public/assets/iso/{harbour,academy}.png` | 768×768 |
| `web/public/assets/iso/island_large.png` | 1600×900 |

1. **`web/components/phaser/assetManifest.ts`** — add `trireme`, `bireme`,
   `transport` to the `UNITS` map (256×256, mirroring the existing entries) so
   world-map army tokens use the painted ships. `MapScene.preload` already loads
   every `UNITS` entry, so no scene change is needed.

2. **`web/components/UnitIcons.tsx`** — the hand-drawn `TriremeIcon`,
   `BiremeIcon`, `TransportIcon` SVGs were placeholders. Every other unit uses an
   SVG in the roster panels, so **keeping them is the consistent choice** — the
   painted PNGs are for map tokens. Make this call deliberately and say which you
   chose and why.

3. **`web/app/play/page.tsx`** — the buildings panel has an `onError` fallback
   swapping a missing thumbnail to `forum.png`. Harbour and Academy now have real
   sprites, so that fallback should stop firing. Keep the handler (it is a
   sensible guard) but verify via the build/network that neither 404s any more.

4. **`web/components/phaser/MapScene.ts`** — `drawIsland` currently stretches the
   small round `island.png` with `setScale(0.66, 0.48)` as a placeholder for a
   4×4 block. Replace it with `island_large.png` (1600×900), which was drawn for
   exactly this. Retune the scale so the landmass covers the block's 16 cells
   with a little coastline spare; the per-cell `grass.png` diamonds and the
   shallows/foam ring stay as they are. **This is the one change most likely to
   need visual tuning** — if you cannot see it, pick conservative numbers, say so
   in the PR, and leave a note that it needs an eyeball pass.

Verify: `npm run build` clean, `pytest` still 106, no new 404s.

---

## Task 2 — Adopt Alembic

Schema is still created by `SQLModel.metadata.create_all`, which adds new
**tables** to an existing database but never new **columns**. Three columns have
already needed hand-run `ALTER TABLE`s (`city.harbour_level`,
`battlereport.naval`, `city.academy_level`), and a missed one means 500s on the
first city read. That is the clearest argument for real migrations.

- Add Alembic to `server/requirements.txt`, `alembic init`, point it at the same
  `DATABASE_URL` the app uses (see `server/app/db.py`), and configure the env to
  target SQLModel's metadata so autogenerate sees the models.
- Generate an **initial migration matching the CURRENT schema** — every table in
  `server/app/models.py` including `Research` and `Hero`, and every column
  including the three hand-added ones above.
- Because existing databases already have this schema, the initial revision must
  be safe to stamp rather than replay: document `alembic stamp head` for an
  existing dev DB, and `alembic upgrade head` for a fresh one.
- Note SQLite's limits (no true `ALTER COLUMN`); `render_as_batch=True` in the
  Alembic env is the usual fix and is worth enabling now.
- Replace or guard the `create_all` call so the two mechanisms cannot disagree.
  Keep the tests working — they build a fresh in-memory SQLite via `create_all`
  in each test module's fixture, and that is fine to keep for tests.
- Add a short "Migrations" section to `imperium-online/README.md` with the two
  commands.

Verify: full `pytest` green; `alembic upgrade head` builds a correct schema from
empty; `alembic stamp head` then `alembic check` (or an autogenerate producing an
empty diff) proves the migration matches the models.

---

## Finishing

Work on a branch and open a PR — do not push to `main`. In the PR description:

- What changed and why, in plain language.
- **Explicitly list what you could not verify** (in a cloud sandbox there is no
  browser, so Phaser rendering cannot be seen — the island swap especially).
- Any judgement calls you made, with the reasoning.

Report failures honestly. If something does not work, say so with the output
rather than describing it as done.

## Known state / gotchas

- `server/imperium.db` is gitignored — a fresh checkout has no database. Register
  a user through the API to create one, or let the tests build their own.
- Tests: per-file `ctx`/`client` fixture (in-memory SQLite, engine stashed on the
  client), `_reg`, `_garrison`, `_rush_movements`. `tests/conftest.py` has an
  autouse `daytime_world` fixture pinning combat to daylight so results are
  deterministic; `night_world` opts into the night defence bonus.
- An island is a 4×4 block of the coordinate grid holding up to 16 cities
  (`server/app/world.py`, mirrored in `web/lib/islands.ts`).
- Land armies march freely within an island; crossing to another island needs
  transport berths, and battles resolve in two phases (fleets, then troops).
