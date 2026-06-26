# Imperium Online — Art pipeline & prompt pack

The city/world sprites are hand-authored **isometric SVGs** in `web/public/assets/iso/`.
They're cohesive, free, and ship working today. This doc is the bridge to **painted
sprites** (Midjourney / Stable Diffusion / DALL·E) whenever you want a higher-fidelity look —
the rendering engine never changes; you only swap files and one manifest line.

## How the slot system works

Every sprite the scenes load is declared in **`web/components/phaser/assetManifest.ts`**:

```ts
export const BUILDINGS = {
  forum: { src: "/assets/iso/forum.svg", w: 200, h: 200 },
  ...
};
```

The loader (`CityScene.preload` / `MapScene.preload`) picks `load.svg` for `.svg` and
`load.image` for `.png`/`.webp` **by file extension**. So to upgrade a building:

1. Generate a sprite (see prompts below) as a **transparent PNG**.
2. Drop it in `web/public/assets/iso/`, e.g. `forum.png`.
3. Change that one manifest line: `forum: { src: "/assets/iso/forum.png", w: 200, h: 200 }`
   (set `w`/`h` to the PNG's pixel size).

No scene/React code changes. Mix-and-match is fine (some painted PNGs, some SVGs).

## Sprite spec (match this or sprites won't line up)

- **Projection:** 2:1 isometric (classic 3/4 top-down). Tile diamond is 128×64.
- **Camera angle & light:** consistent across every sprite — light from the **top-left**,
  the front-left face lit, the front-right face shaded.
- **Footprint:** the building's base should occupy roughly the bottom ~⅓ of the canvas and be
  **horizontally centred**; the engine anchors sprites bottom-centre onto the tile.
- **Background:** fully transparent. **No baked ground shadow** — the engine draws a soft
  contact shadow under each building.
- **Canvas size:** square, ~256–512 px (downscale in the manifest via `w`/`h`). Keep buildings
  in proportion to each other (the Forum/Barracks are the largest).
- **Filenames (exact):** `forum`, `barracks`, `timber_camp`, `quarry`, `silver_mine`, `farm`,
  plus terrain `grass`, `path`, `water`, `island`, `shadow`, `cypress`, `rocks`, `amphora`.

## Style bible (paste into EVERY prompt for cohesion)

> *isometric 2.5D game asset, ancient Roman / classical Mediterranean architecture, clean
> cel-shaded cartoon style, warm palette — terracotta roofs, travertine cream stone, olive
> green, sea blue — soft top-left lighting, transparent background, centered, crisp edges,
> mobile strategy game art (Grepolis / Travian style), no text, no shadow on ground*

## Per-building prompts

Append the style bible to each.

- **forum** — "a grand Roman forum temple: marble columns across the front, triangular
  pediment with a gold disc, low terracotta tiled roof, stepped stone stylobate, the civic
  centrepiece."
- **barracks** — "a fortified Roman barracks hall: cream stone walls with crenellated parapet,
  a round red-and-gold shield mounted on the wall, an arched timber gate, a red banner on a
  pole."
- **timber_camp** — "a Roman timber lodge: open timber-framed workshop, wood-shingle roof, a
  pile of cut logs stacked in front, a saw."
- **quarry** — "a Roman stone quarry: a low cutting shed, stacked hewn travertine blocks, a
  wooden lifting crane with rope and pulley."
- **silver_mine** — "a Roman silver mine: a timber-framed adit cut into a rocky grey hillside,
  silver ore glinting at the mouth, a small loaded ore cart on rails."
- **farm** — "a Roman farm: a cream-stone granary with terracotta roof, golden tilled grain
  fields in rows out front, a few wheat sheaves."

### Optional per-tier variants

Each building may declare tiers in the manifest:
`forum: { src: ".../forum.svg", w, h, tiers: { 1: ".../forum_t1.png", 4: ".../forum_t2.png", 8: ".../forum_t3.png" } }`
(then have the scene pick by level band). For painted sets, generate three sizes per building:
*tier 1 = modest*, *tier 2 = larger with more columns/detail*, *tier 3 = grand, gilded*.

## Terrain & decor prompts

- **grass** — "a single 2:1 isometric grass tile, diamond shaped, subtle texture, edge-to-edge
  so tiles abut seamlessly."
- **path** — "a single 2:1 isometric dirt/gravel path tile, diamond shaped, seamless."
- **water / island** — "an isometric island: grass landmass with a sandy beach rim sitting in
  blue sea" (for the world map).
- **cypress** — "a tall Mediterranean cypress tree, isometric, anchored at its base."
- **rocks** — "a small cluster of grey isometric boulders."
- **amphora** — "a single classical Greek/Roman amphora pot, isometric."

## Licensing note

Hand-authored SVGs here are original (no attribution needed). **AI-generated images occupy a
legal grey area** — fine for a personal portfolio piece, but review the terms of your image
tool and the current state of AI-art copyright **before any commercial use** or before
claiming the art as wholly original.
