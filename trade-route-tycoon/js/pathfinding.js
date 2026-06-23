// ======================================================================
// pathfinding.js — a grid + classic A* search
// ----------------------------------------------------------------------
// We overlay an invisible grid on the world. Cells covered by an island are
// "blocked". A* finds the shortest sequence of free cells from the ship to
// where you clicked, routing AROUND islands. The scene then turns that into
// waypoints the ship auto-sails through.
//
// A* = Dijkstra + a heuristic (straight-line distance to the goal) that biases
// the search toward the target, so it explores far fewer cells. This is THE
// foundational game-AI pathfinding algorithm.
// ======================================================================

class Grid {
  constructor(worldW, worldH, cell) {
    this.cell = cell;
    this.cols = Math.ceil(worldW / cell);
    this.rows = Math.ceil(worldH / cell);
    // blocked[row][col] = true if impassable
    this.blocked = Array.from({ length: this.rows }, () =>
      new Array(this.cols).fill(false)
    );
  }

  // Mark every cell whose center is within (radius + margin) of an island.
  // The margin keeps the ship from clipping island corners.
  blockCircle(x, y, radius) {
    const margin = this.cell * 0.7;
    const r = radius + margin;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cx = (col + 0.5) * this.cell;
        const cy = (row + 0.5) * this.cell;
        if (Phaser.Math.Distance.Between(cx, cy, x, y) <= r) {
          this.blocked[row][col] = true;
        }
      }
    }
  }

  inBounds(col, row) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }
  isBlocked(col, row) {
    return !this.inBounds(col, row) || this.blocked[row][col];
  }
  worldToCell(x, y) {
    return { col: Math.floor(x / this.cell), row: Math.floor(y / this.cell) };
  }
  cellToWorld(col, row) {
    return { x: (col + 0.5) * this.cell, y: (row + 0.5) * this.cell };
  }

  // If a target cell is blocked (you clicked on an island), spiral outward
  // to the nearest free cell so the ship still has somewhere to go.
  nearestFree(col, row) {
    if (!this.isBlocked(col, row)) return { col, row };
    for (let radius = 1; radius < Math.max(this.cols, this.rows); radius++) {
      for (let dc = -radius; dc <= radius; dc++) {
        for (let dr = -radius; dr <= radius; dr++) {
          const c = col + dc, r = row + dr;
          if (!this.isBlocked(c, r)) return { col: c, row: r };
        }
      }
    }
    return null;
  }
}

// A* search. Returns an array of world-space waypoints {x, y}, or [] if no path.
function aStar(grid, startX, startY, goalX, goalY) {
  const start = grid.worldToCell(startX, startY);
  let goal = grid.worldToCell(goalX, goalY);
  const free = grid.nearestFree(goal.col, goal.row);
  if (!free) return [];
  goal = free;

  const key = (c, r) => r * grid.cols + c;
  const h = (c, r) => Phaser.Math.Distance.Between(c, r, goal.col, goal.row);

  const open = [{ col: start.col, row: start.row, g: 0, f: h(start.col, start.row) }];
  const cameFrom = new Map();
  const gScore = new Map([[key(start.col, start.row), 0]]);
  const closed = new Set();

  // 8-directional movement (lets the ship cut diagonals for natural routes).
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  while (open.length) {
    // Pop the node with the lowest f-score (simple linear scan — the grid is
    // small enough that a fancy heap isn't worth the complexity here).
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.col, cur.row);

    if (cur.col === goal.col && cur.row === goal.row) {
      return reconstruct(grid, cameFrom, cur);
    }
    if (closed.has(ck)) continue;
    closed.add(ck);

    for (const [dc, dr] of dirs) {
      const nc = cur.col + dc, nr = cur.row + dr;
      if (grid.isBlocked(nc, nr)) continue;
      // Don't let diagonals squeeze through a gap between two blocked cells.
      if (dc !== 0 && dr !== 0) {
        if (grid.isBlocked(cur.col + dc, cur.row) || grid.isBlocked(cur.col, cur.row + dr)) continue;
      }
      const step = (dc !== 0 && dr !== 0) ? 1.414 : 1;
      const tentative = cur.g + step;
      const nk = key(nc, nr);
      if (!gScore.has(nk) || tentative < gScore.get(nk)) {
        gScore.set(nk, tentative);
        cameFrom.set(nk, cur);
        open.push({ col: nc, row: nr, g: tentative, f: tentative + h(nc, nr) });
      }
    }
  }
  return []; // no path found
}

function reconstruct(grid, cameFrom, node) {
  const path = [];
  let cur = node;
  const key = (c, r) => r * grid.cols + c;
  while (cur) {
    path.push(grid.cellToWorld(cur.col, cur.row));
    cur = cameFrom.get(key(cur.col, cur.row));
  }
  path.reverse();
  return path;
}

window.Grid = Grid;
window.aStar = aStar;
