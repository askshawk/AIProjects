// The single source of truth for every sprite the scenes load. The loader in
// PhaserGame / the scenes read this and pick load.svg vs load.image by file
// extension (isSvg), so swapping a hand-authored .svg for a painted .png is a
// one-line change here. See imperium-online/ART.md for the sprite spec.
//
// The current set is the painted Lovable pack (high-res transparent PNGs); the
// `scale` / `tile` hints below tell the scenes how to size them on the iso grid.

export type AssetSlot = {
  src: string;       // path under /public
  w: number;         // intrinsic width to rasterize SVG at (ignored for PNG load)
  h: number;
  scale?: number;    // default on-grid display scale for a high-res PNG
  tile?: boolean;    // a 2:1 ground diamond — displayed at the tile footprint
};

const ISO = "/assets/iso";
const UNITS_DIR = "/assets/units";

// Building sprites (768² painted PNGs), keyed by the backend building name.
export const BUILDINGS: Record<string, AssetSlot> = {
  forum: { src: `${ISO}/forum.png`, w: 768, h: 768, scale: 0.22 },
  timber_camp: { src: `${ISO}/timber_camp.png`, w: 768, h: 768, scale: 0.22 },
  quarry: { src: `${ISO}/quarry.png`, w: 768, h: 768, scale: 0.22 },
  silver_mine: { src: `${ISO}/silver_mine.png`, w: 768, h: 768, scale: 0.22 },
  farm: { src: `${ISO}/farm.png`, w: 768, h: 768, scale: 0.22 },
  barracks: { src: `${ISO}/barracks.png`, w: 768, h: 768, scale: 0.22 },
};

// Terrain + decoration slots.
export const TERRAIN: Record<string, AssetSlot> = {
  grass: { src: `${ISO}/grass.png`, w: 512, h: 256, tile: true },
  path: { src: `${ISO}/path.png`, w: 512, h: 256, tile: true },
  water: { src: `${ISO}/water.png`, w: 512, h: 256, tile: true },
  shadow: { src: `${ISO}/shadow.png`, w: 512, h: 256, scale: 0.34 },
  cypress: { src: `${ISO}/cypress.png`, w: 320, h: 560, scale: 0.16 },
  rocks: { src: `${ISO}/rocks.png`, w: 384, h: 288, scale: 0.18 },
  amphora: { src: `${ISO}/amphora.png`, w: 192, h: 320, scale: 0.16 },
  island: { src: `${ISO}/island.png`, w: 800, h: 600, scale: 0.22 },
};

// Unit portraits (256² painted PNGs). Settlers have no painted sprite yet —
// the hand-drawn SettlerIcon SVG (components/UnitIcons.tsx) covers that slot.
export const UNITS: Record<string, AssetSlot> = {
  legionary: { src: `${UNITS_DIR}/legionary.png`, w: 256, h: 256 },
  archer: { src: `${UNITS_DIR}/archer.png`, w: 256, h: 256 },
  scout: { src: `${UNITS_DIR}/scout.png`, w: 256, h: 256 },
};

export const ALL_ASSETS: Record<string, AssetSlot> = { ...BUILDINGS, ...TERRAIN };

/** True if the asset should be loaded via Phaser's SVG loader (rasterized at
    w×h) rather than load.image. */
export function isSvg(slot: AssetSlot): boolean {
  return slot.src.toLowerCase().endsWith(".svg");
}
