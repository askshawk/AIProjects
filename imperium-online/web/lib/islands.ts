// Island identity, client side (C1). Mirrors server/app/world.py exactly:
// an island is a 4×4 block of the coordinate grid, derived — never stored.
// Math.floor matches Python's // for negative coordinates.

export const ISLAND_SIZE = 4;

export function islandOf(x: number, y: number): [number, number] {
  return [Math.floor(x / ISLAND_SIZE), Math.floor(y / ISLAND_SIZE)];
}

export function sameIsland(ax: number, ay: number, bx: number, by: number): boolean {
  const [aix, aiy] = islandOf(ax, ay);
  const [bix, biy] = islandOf(bx, by);
  return aix === bix && aiy === biy;
}

/** Stable string key for grouping cities by island. */
export function islandKey(x: number, y: number): string {
  const [ix, iy] = islandOf(x, y);
  return `${ix},${iy}`;
}
