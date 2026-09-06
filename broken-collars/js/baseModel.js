/*
 * Broken Collars - base layout model.
 *
 * A base is plain serializable data and nothing else:
 *
 *   { grid: 26,
 *     buildings: [ { id, type, level, x, y } ],   // x,y = top-left tile
 *     loot: { food, gold } }                      // what a raider can steal
 *
 * This is deliberately the *same* shape for the player's own base and for an
 * enemy base, so swapping a generated AI base for another real player's saved
 * base later needs no changes to the simulation or the renderer.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function balance() { return (typeof globalThis !== 'undefined' ? globalThis : this).KW.BALANCE; }

  function def(type) { return balance().buildings[type]; }

  // Level-indexed lookup that clamps rather than returning undefined.
  function at(arr, level) {
    if (!arr) return 0;
    return arr[Math.max(0, Math.min(arr.length - 1, level - 1))];
  }

  function hpOf(type, level) { return at(def(type).hp, level); }

  // Gold to place a fresh level-1 building, or to upgrade from `level` to `level + 1`.
  function buildCost(type) { return at(def(type).cost, 1); }
  function upgradeCost(type, level) {
    var costs = def(type).cost;
    if (level >= costs.length) return null;   // already maxed
    return costs[level];
  }

  function maxLevel(type) { return def(type).cost.length; }

  function cellsOf(b) {
    var size = def(b.type).size;
    var cells = [];
    for (var dy = 0; dy < size; dy++) {
      for (var dx = 0; dx < size; dx++) cells.push({ x: b.x + dx, y: b.y + dy });
    }
    return cells;
  }

  function centerOf(b) {
    var size = def(b.type).size;
    return { x: b.x + size / 2, y: b.y + size / 2 };
  }

  // grid[y][x] -> building id, or null. Used for placement checks and for
  // wall collision inside the simulation.
  function occupancy(base) {
    var g = [];
    for (var y = 0; y < base.grid; y++) {
      g.push(new Array(base.grid).fill(null));
    }
    base.buildings.forEach(function (b) {
      cellsOf(b).forEach(function (c) {
        if (c.y >= 0 && c.y < base.grid && c.x >= 0 && c.x < base.grid) g[c.y][c.x] = b.id;
      });
    });
    return g;
  }

  function kennelOf(base) {
    return base.buildings.find(function (b) { return b.type === 'kennel'; });
  }

  function kennelLevel(base) {
    var k = kennelOf(base);
    return k ? k.level : 1;
  }

  function countOf(base, type) {
    return base.buildings.filter(function (b) { return b.type === type; }).length;
  }

  // How many of `type` this base is allowed, given its Kennel level.
  function limitFor(base, type) {
    return at(balance().limits[type], kennelLevel(base));
  }

  // A building can never out-level the Kennel that houses it.
  function levelCapFor(base, type) {
    if (type === 'kennel') return maxLevel('kennel');
    return Math.min(maxLevel(type), kennelLevel(base));
  }

  function canPlace(base, type, x, y, ignoreId) {
    var size = def(type).size;
    if (x < 0 || y < 0 || x + size > base.grid || y + size > base.grid) return false;
    var occ = occupancy(base);
    for (var dy = 0; dy < size; dy++) {
      for (var dx = 0; dx < size; dx++) {
        var id = occ[y + dy][x + dx];
        if (id !== null && id !== ignoreId) return false;
      }
    }
    return true;
  }

  function nextId(base) {
    var max = 0;
    base.buildings.forEach(function (b) { if (b.id > max) max = b.id; });
    return max + 1;
  }

  function addBuilding(base, type, x, y, level) {
    var b = { id: nextId(base), type: type, level: level || 1, x: x, y: y };
    base.buildings.push(b);
    return b;
  }

  function removeBuilding(base, id) {
    var i = base.buildings.findIndex(function (b) { return b.id === id; });
    if (i >= 0) base.buildings.splice(i, 1);
  }

  // ---- Derived economy numbers ----

  function productionPerHour(base, resource) {
    return base.buildings.reduce(function (sum, b) {
      var d = def(b.type);
      if (d.role === 'production' && d.resource === resource) return sum + at(d.rate, b.level);
      return sum;
    }, 0);
  }

  function storageCapacity(base, resource) {
    return base.buildings.reduce(function (sum, b) {
      var d = def(b.type);
      if (d.role === 'storage' && d.resource === resource) return sum + at(d.capacity, b.level);
      return sum;
    }, balance().baseStorage);
  }

  function armySpace(base) {
    return base.buildings.reduce(function (sum, b) {
      var d = def(b.type);
      return d.role === 'army' && d.armySpace ? sum + at(d.armySpace, b.level) : sum;
    }, 0);
  }

  function trainSpeed(base) {
    // Best training yard sets the pace; extra yards add a small stacking bonus.
    var yards = base.buildings.filter(function (b) { return b.type === 'trainingYard'; });
    if (!yards.length) return 0.5;   // you can still train, just slowly
    var speeds = yards.map(function (b) { return at(def('trainingYard').trainSpeed, b.level); });
    speeds.sort(function (a, b) { return b - a; });
    return speeds.reduce(function (acc, s, i) { return acc + (i === 0 ? s : s * 0.35); }, 0);
  }

  // Buildings that count toward destruction percentage. Walls are excluded so
  // that a base cannot inflate its own score by spamming stone.
  function scorable(base) {
    return base.buildings.filter(function (b) { return def(b.type).role !== 'wall'; });
  }

  // ---- Snapshots ----

  // Freeze a base into the exact payload a raid runs against. Today the loot is
  // computed locally; later a server hands back the same object for a real
  // opponent and nothing downstream changes.
  function snapshot(base, loot) {
    return {
      grid: base.grid,
      buildings: base.buildings.map(function (b) {
        return { id: b.id, type: b.type, level: b.level, x: b.x, y: b.y };
      }),
      loot: { food: Math.floor(loot.food || 0), gold: Math.floor(loot.gold || 0) }
    };
  }

  function createStartingBase() {
    var base = { grid: balance().grid, buildings: [], loot: { food: 0, gold: 0 } };
    var plan = [
      ['kennel', 10, 10],
      ['farm', 6, 10],
      ['goldMine', 10, 6],
      ['foodStore', 6, 6],
      ['goldVault', 14, 14],
      ['breedingPen', 14, 6],
      ['trainingYard', 14, 10]
    ];
    plan.forEach(function (p) { addBuilding(base, p[0], p[1], p[2], 1); });
    return base;
  }

  return {
    baseModel: {
      def: def, at: at, hpOf: hpOf, buildCost: buildCost, upgradeCost: upgradeCost,
      maxLevel: maxLevel, cellsOf: cellsOf, centerOf: centerOf, occupancy: occupancy,
      kennelOf: kennelOf, kennelLevel: kennelLevel, countOf: countOf, limitFor: limitFor,
      levelCapFor: levelCapFor, canPlace: canPlace, addBuilding: addBuilding,
      removeBuilding: removeBuilding, productionPerHour: productionPerHour,
      storageCapacity: storageCapacity, armySpace: armySpace, trainSpeed: trainSpeed,
      scorable: scorable, snapshot: snapshot, createStartingBase: createStartingBase
    }
  };
});
