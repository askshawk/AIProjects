/*
 * Kennel Wars - enemy base generation.
 *
 * Generates rival kennels deterministically from a seed. The output is an
 * ordinary base snapshot, byte-for-byte the same shape as the player's own
 * base, so the day this is replaced by "fetch another player's saved base from
 * a server" nothing else in the game has to change.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function G() { return typeof globalThis !== 'undefined' ? globalThis : this; }

  var HOUSES = ['Blackmoor', 'Harrow', 'Thornfield', 'Ravenscar', 'Dunkeld',
    'Grimsby', 'Ashvale', 'Wolfden', 'Caskmere', 'Bramblewick',
    'Stonepaw', 'Northgate', 'Hollowmere', 'Fenwick', 'Draymoor'];
  var TITLES = ['Kennels', 'Keep', 'Hold', 'Barrows', 'Court', 'Run', 'Yard', 'Watch'];

  function nameFor(rng) {
    return rng.pick(HOUSES) + ' ' + rng.pick(TITLES);
  }

  // Build one rival base at the given kennel level.
  function generateBase(seed, kennelLevel) {
    var KW = G().KW;
    var B = KW.BALANCE, M = KW.baseModel;
    var rng = KW.makeRng(seed);
    var grid = B.grid;
    var kl = Math.max(1, Math.min(5, kennelLevel));

    var base = { grid: grid, buildings: [], loot: { food: 0, gold: 0 } };
    var occ = [];
    for (var y = 0; y < grid; y++) occ.push(new Array(grid).fill(false));

    function free(x, y, size) {
      if (x < 0 || y < 0 || x + size > grid || y + size > grid) return false;
      for (var dy = 0; dy < size; dy++) {
        for (var dx = 0; dx < size; dx++) if (occ[y + dy][x + dx]) return false;
      }
      return true;
    }

    function place(type, x, y, level) {
      var size = M.def(type).size;
      for (var dy = 0; dy < size; dy++) {
        for (var dx = 0; dx < size; dx++) occ[y + dy][x + dx] = true;
      }
      M.addBuilding(base, type, x, y, level);
    }

    // Find a legal spot whose centre sits roughly `minR`..`maxR` tiles from the
    // middle of the map. Candidates are collected in a fixed scan order and
    // then chosen with the seeded rng, so the result is fully reproducible.
    function placeNear(type, level, minR, maxR) {
      var size = M.def(type).size;
      var c = grid / 2;
      var candidates = [];
      for (var y = 0; y < grid; y++) {
        for (var x = 0; x < grid; x++) {
          if (!free(x, y, size)) continue;
          var d = Math.hypot(x + size / 2 - c, y + size / 2 - c);
          if (d < minR || d > maxR) continue;
          candidates.push({ x: x, y: y, d: d });
        }
      }
      if (!candidates.length) return false;
      candidates.sort(function (a, b) { return a.d - b.d || a.y - b.y || a.x - b.x; });
      // Bias toward the tighter end of the band so bases stay compact.
      var idx = Math.floor(Math.pow(rng(), 1.6) * candidates.length);
      var spot = candidates[idx];
      place(type, spot.x, spot.y, level);
      return true;
    }

    // A rival's outbuildings sit at or one below their kennel level.
    function levelFor() {
      return Math.max(1, kl - (rng() < 0.35 ? 1 : 0));
    }

    // How many of each type this rival bothered to build.
    function countFor(type) {
      var cap = M.at(B.limits[type], kl);
      if (!cap) return 0;
      var fill = 0.65 + rng() * 0.35;
      return Math.max(type === 'watchtower' && kl >= 2 ? 1 : 0, Math.round(cap * fill));
    }

    // Kennel dead centre, everything else in rings around it.
    var kSize = M.def('kennel').size;
    var kx = Math.floor(grid / 2 - kSize / 2);
    place('kennel', kx, kx, kl);

    // Storages hug the core (they hold the loot), production sits further out,
    // defences ring the whole thing.
    var plan = [
      { type: 'foodStore', min: 2.5, max: 5.5 },
      { type: 'goldVault', min: 2.5, max: 5.5 },
      { type: 'breedingPen', min: 3, max: 6.5 },
      { type: 'trainingYard', min: 3.5, max: 7 },
      { type: 'farm', min: 4.5, max: 9 },
      { type: 'goldMine', min: 4.5, max: 9 },
      { type: 'guardPost', min: 3.5, max: 7 },
      { type: 'watchtower', min: 3, max: 7.5 }
    ];

    plan.forEach(function (entry) {
      var n = countFor(entry.type);
      for (var i = 0; i < n; i++) {
        if (!placeNear(entry.type, levelFor(), entry.min, entry.max)) {
          placeNear(entry.type, levelFor(), 0, grid);   // fall back to anywhere legal
        }
      }
    });

    ringWalls(base, rng, M.at(B.limits.wall, kl), levelFor(), grid, free, place);

    // Loot scales steeply with level so pushing up the map is worth the risk.
    var scale = Math.pow(kl, 1.9);
    base.loot = {
      food: Math.round(300 * scale * (0.75 + rng() * 0.5)),
      gold: Math.round(270 * scale * (0.75 + rng() * 0.5))
    };
    return base;
  }

  // Wall off the valuable core (hall, stores, pens) and leave the farms and
  // mines outside, the way a real base is laid out. Ringing only the core also
  // keeps the perimeter short enough to actually close with the wall budget.
  function ringWalls(base, rng, maxWalls, level, grid, free, place) {
    if (!maxWalls) return;
    var KW = G().KW;
    var CORE = { kennel: 1, foodStore: 1, goldVault: 1, breedingPen: 1, trainingYard: 1, guardPost: 1 };

    var core = base.buildings.filter(function (b) { return CORE[b.type]; });
    if (!core.length) return;

    var minX = grid, minY = grid, maxX = 0, maxY = 0;
    core.forEach(function (b) {
      var size = KW.baseModel.def(b.type).size;
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + size - 1); maxY = Math.max(maxY, b.y + size - 1);
    });
    var x0 = Math.max(0, minX - 1), y0 = Math.max(0, minY - 1);
    var x1 = Math.min(grid - 1, maxX + 1), y1 = Math.min(grid - 1, maxY + 1);

    // Walk the perimeter as a continuous loop so gaps land as real openings.
    var loop = [];
    for (var x = x0; x <= x1; x++) loop.push({ x: x, y: y0 });
    for (var y = y0 + 1; y <= y1; y++) loop.push({ x: x1, y: y });
    for (var x2 = x1 - 1; x2 >= x0; x2--) loop.push({ x: x2, y: y1 });
    for (var y2 = y1 - 1; y2 > y0; y2--) loop.push({ x: x0, y: y2 });

    var usable = loop.filter(function (p) { return free(p.x, p.y, 1); });
    if (!usable.length) return;

    var chosen;
    if (usable.length > maxWalls) {
      // Not enough stone to close the ring: spread what there is evenly rather
      // than walling one side and leaving the rest open.
      chosen = [];
      for (var i = 0; i < maxWalls; i++) {
        chosen.push(usable[Math.floor(i * usable.length / maxWalls)]);
      }
    } else {
      // Enough to close it, so punch a few deliberate gaps to attack through.
      var gaps = new Set();
      var gapCount = rng.int(2, 3);
      for (var g = 0; g < gapCount; g++) {
        var start = rng.int(0, usable.length - 1);
        var len = rng.int(1, 2);
        for (var k = 0; k < len; k++) gaps.add((start + k) % usable.length);
      }
      chosen = usable.filter(function (_, idx) { return !gaps.has(idx); });
    }

    chosen.forEach(function (p) {
      if (free(p.x, p.y, 1)) place('wall', p.x, p.y, level);
    });
  }

  // The raid map: a spread of rivals around the player's own strength.
  function generateTargets(mapSeed, playerKennelLevel, count) {
    var KW = G().KW;
    var n = count || 6;
    var targets = [];
    for (var i = 0; i < n; i++) {
      var seed = KW.hashSeed(mapSeed + ':' + i);
      var rng = KW.makeRng(seed);
      // Mostly your own level, sometimes softer, sometimes a real challenge.
      var roll = rng();
      var offset = roll < 0.3 ? -1 : (roll < 0.75 ? 0 : 1);
      var level = Math.max(1, Math.min(5, playerKennelLevel + offset));
      var base = generateBase(seed, level);
      targets.push({
        id: mapSeed + ':' + i,
        seed: seed,
        name: nameFor(rng),
        level: level,
        base: base
      });
    }
    // Softest rival first, so there is always an obvious place to start.
    targets.sort(function (a, b) { return a.level - b.level || (a.id < b.id ? -1 : 1); });
    return targets;
  }

  return { aiBases: { generateBase: generateBase, generateTargets: generateTargets } };
});
