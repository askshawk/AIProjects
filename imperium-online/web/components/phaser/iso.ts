// Isometric projection math — pure, no Phaser dependency so it's trivially
// testable and reusable by both scenes.
//
// We use a classic 2:1 diamond tile: a grid cell that is TILE_W wide and
// TILE_H tall on screen, with TILE_H = TILE_W / 2. Moving +1 in grid-x pushes
// screen-right-and-down; +1 in grid-y pushes screen-left-and-down. The result
// is the familiar 3/4 top-down look.

export const TILE_W = 128;
export const TILE_H = 64;

export type Screen = { x: number; y: number };
export type Grid = { gx: number; gy: number };

/** Grid cell → screen position of that cell's CENTRE (before camera offset). */
export function toScreen(gx: number, gy: number): Screen {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

/** Screen position → fractional grid coords (inverse of toScreen). Used for
    map hit-testing / picking. */
export function toGrid(sx: number, sy: number): Grid {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

/** Painter's-algorithm depth: cells further "back" (smaller gx+gy) draw first,
    so closer buildings overlap farther ones. Multiply by a constant at the
    call site to leave room for sub-ordering (shadow < building < overlay). */
export function depthOf(gx: number, gy: number): number {
  return gx + gy;
}
