// The single source of truth for every sprite the scenes load. The loader in
// PhaserGame reads this and picks load.svg vs load.image by file extension, so
// swapping a hand-authored .svg for a painted .png is a one-line change here —
// no scene code touched. See imperium-online/ART.md for the painted-upgrade
// workflow and exact sprite spec.

export type AssetSlot = {
  src: string;   // path under /public
  w: number;     // intrinsic width to rasterize SVG at (ignored for PNG sizing)
  h: number;
};

const ISO = "/assets/iso";

// Building sprites, keyed by the building name the backend uses. `anchorY` is
// the fraction of the sprite height that sits ON the tile (1 = bottom edge).
export const BUILDINGS: Record<string, AssetSlot> = {
  forum: { src: `${ISO}/forum.svg`, w: 200, h: 200 },
  timber_camp: { src: `${ISO}/timber_camp.svg`, w: 176, h: 176 },
  quarry: { src: `${ISO}/quarry.svg`, w: 176, h: 176 },
  silver_mine: { src: `${ISO}/silver_mine.svg`, w: 176, h: 176 },
  farm: { src: `${ISO}/farm.svg`, w: 176, h: 176 },
  barracks: { src: `${ISO}/barracks.svg`, w: 188, h: 188 },
};

// Terrain + decoration slots.
export const TERRAIN: Record<string, AssetSlot> = {
  grass: { src: `${ISO}/grass.svg`, w: 130, h: 66 },
  path: { src: `${ISO}/path.svg`, w: 130, h: 66 },
  water: { src: `${ISO}/water.svg`, w: 130, h: 66 },
  shadow: { src: `${ISO}/shadow.svg`, w: 120, h: 60 },
  cypress: { src: `${ISO}/cypress.svg`, w: 64, h: 110 },
  rocks: { src: `${ISO}/rocks.svg`, w: 80, h: 60 },
  amphora: { src: `${ISO}/amphora.svg`, w: 40, h: 64 },
  island: { src: `${ISO}/island.svg`, w: 200, h: 150 },
};

export const ALL_ASSETS: Record<string, AssetSlot> = { ...BUILDINGS, ...TERRAIN };

/** True if the asset should be loaded via Phaser's SVG loader (rasterized at
    w×h) rather than load.image. */
export function isSvg(slot: AssetSlot): boolean {
  return slot.src.toLowerCase().endsWith(".svg");
}
