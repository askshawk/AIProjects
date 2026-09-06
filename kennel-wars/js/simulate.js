/*
 * Kennel Wars - battle simulation.
 *
 * THIS FILE MUST NEVER TOUCH THE DOM.
 *
 * simulateBattle() is a pure function: give it an army, a base snapshot and a
 * seed, and it returns a complete replay log describing everything that
 * happened. The renderer's only job is to play that log back. Nothing about the
 * outcome is decided during animation.
 *
 * That split is what makes async multiplayer a drop-in later:
 *   - the defending base is just data, so it can come from a server instead of
 *     the local AI generator;
 *   - the log is reproducible from (army, base, seed), so a server can re-run
 *     the same raid and confirm the attacker reported it honestly.
 *
 * Caveat worth knowing: this relies on IEEE-754 floating point behaving
 * identically for the same sequence of operations, which holds across JS
 * engines for the arithmetic used here. Fixed-point maths would be the fully
 * paranoid version if raids ever carry real stakes.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function G() { return typeof globalThis !== 'undefined' ? globalThis : this; }
  function r2(n) { return Math.round(n * 100) / 100; }

  // Distance from a point to the nearest edge of a building's footprint.
  function edgeDistance(px, py, b) {
    var dx = Math.max(b.x - px, 0, px - (b.x + b.size));
    var dy = Math.max(b.y - py, 0, py - (b.y + b.size));
    return Math.hypot(dx, dy);
  }

  /**
   * @param {object} opts
   * @param {Array}  opts.army      [{ breed, x, y }] dogs and where they are released
   * @param {object} opts.base      base snapshot { grid, buildings, loot }
   * @param {number} opts.seed      any 32-bit integer
   * @param {object} [opts.modifiers] { dps, hp, speed } multipliers from bloodline upgrades
   * @param {object} [opts.balance] override the config (defaults to KW.BALANCE)
   * @returns {object} replay log
   */
  function simulateBattle(opts) {
    var KW = G().KW;
    var B = opts.balance || KW.BALANCE;
    var M = KW.baseModel;
    var rng = KW.makeRng(opts.seed >>> 0);
    var mods = opts.modifiers || { dps: 1, hp: 1, speed: 1 };

    var dt = 1 / B.tickRate;
    var maxTicks = Math.round(B.battleSeconds * B.tickRate);
    var grid = opts.base.grid;

    // ---- Buildings ----
    var buildings = opts.base.buildings.map(function (b) {
      var d = M.def(b.type);
      var maxHp = M.hpOf(b.type, b.level);
      return {
        id: b.id, type: b.type, level: b.level, x: b.x, y: b.y,
        size: d.size, role: d.role, cx: b.x + d.size / 2, cy: b.y + d.size / 2,
        hp: maxHp, maxHp: maxHp, alive: true,
        // defence state
        cooldown: 0, triggered: false
      };
    });
    var byId = {};
    buildings.forEach(function (b) { byId[b.id] = b; });

    // Cell -> building id, cleared as buildings fall so paths open up.
    var occ = [];
    for (var y = 0; y < grid; y++) occ.push(new Array(grid).fill(null));
    buildings.forEach(function (b) {
      for (var dy = 0; dy < b.size; dy++) {
        for (var dx = 0; dx < b.size; dx++) {
          if (b.y + dy < grid && b.x + dx < grid) occ[b.y + dy][b.x + dx] = b.id;
        }
      }
    });
    function clearCells(b) {
      for (var dy = 0; dy < b.size; dy++) {
        for (var dx = 0; dx < b.size; dx++) {
          if (b.y + dy < grid && b.x + dx < grid) occ[b.y + dy][b.x + dx] = null;
        }
      }
    }

    var totalScorable = buildings.filter(function (b) { return b.role !== 'wall'; }).length;

    // ---- Units ----
    var units = [];
    var nextUnitId = 1;

    opts.army.forEach(function (entry) {
      var breed = B.breeds[entry.breed];
      if (!breed) return;
      var hp = breed.hp * (mods.hp || 1);
      units.push({
        id: nextUnitId++, side: 'atk', breed: entry.breed,
        x: entry.x, y: entry.y,
        hp: hp, maxHp: hp,
        dps: breed.dps * (mods.dps || 1),
        speed: breed.speed * (mods.speed || 1),
        wallDamage: breed.wallDamage || 1,
        targeting: breed.targeting, ignoresWalls: !!breed.ignoresWalls,
        targetId: null, targetKind: null, attacking: false, alive: true
      });
    });

    function spawnDefenders(post) {
      var d = M.def('guardPost');
      var n = M.at(d.packSize, post.level);
      var hp = M.at(d.dogHp, post.level);
      var dps = M.at(d.dogDps, post.level);
      for (var i = 0; i < n; i++) {
        // Fan out around the post; the jitter is seeded, so it replays exactly.
        var angle = (i / n) * Math.PI * 2 + rng() * 0.6;
        units.push({
          id: nextUnitId++, side: 'def', breed: 'defender',
          x: Math.max(0.5, Math.min(grid - 0.5, post.cx + Math.cos(angle) * 1.4)),
          y: Math.max(0.5, Math.min(grid - 0.5, post.cy + Math.sin(angle) * 1.4)),
          hp: hp, maxHp: hp, dps: dps, speed: 1.1,
          homeX: post.cx, homeY: post.cy,
          targeting: 'unit', ignoresWalls: true,
          targetId: null, targetKind: null, attacking: false, alive: true
        });
      }
    }

    // ---- Targeting ----
    function preferredBuildings(kind) {
      var alive = buildings.filter(function (b) { return b.alive; });
      var pick;
      if (kind === 'defense') {
        pick = alive.filter(function (b) { return b.role === 'defense'; });
      } else if (kind === 'storage') {
        pick = alive.filter(function (b) { return b.role === 'storage' || b.role === 'production'; });
      } else {
        pick = [];
      }
      if (pick.length) return pick;
      var nonWall = alive.filter(function (b) { return b.role !== 'wall'; });
      return nonWall.length ? nonWall : alive;
    }

    function acquireBuilding(u) {
      var list = preferredBuildings(u.targeting);
      var best = null, bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        var d = edgeDistance(u.x, u.y, b);
        if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best && b.id < best.id)) {
          best = b; bestD = d;
        }
      }
      u.targetId = best ? best.id : null;
      u.targetKind = 'building';
    }

    function acquireUnit(u) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < units.length; i++) {
        var o = units[i];
        if (!o.alive || o.side === u.side) continue;
        var d = Math.hypot(o.x - u.x, o.y - u.y);
        if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best && o.id < best.id)) {
          best = o; bestD = d;
        }
      }
      u.targetId = best ? best.id : null;
      u.targetKind = 'unit';
    }

    function unitById(id) {
      for (var i = 0; i < units.length; i++) if (units[i].id === id) return units[i];
      return null;
    }

    // ---- Replay log ----
    var frames = [];
    var events = [];
    var destroyedCount = 0;
    var kennelDestroyed = false;

    function killBuilding(b, tick) {
      b.alive = false;
      b.hp = 0;
      clearCells(b);
      if (b.role !== 'wall') destroyedCount++;
      if (b.type === 'kennel') kennelDestroyed = true;
      events.push({ t: tick, type: 'buildingDestroyed', id: b.id, x: b.cx, y: b.cy });
    }

    function damageBuilding(b, amount, tick) {
      b.hp -= amount;
      if (b.hp <= 0) killBuilding(b, tick);
    }

    function damageUnit(u, amount, tick) {
      u.hp -= amount;
      if (u.hp <= 0) {
        u.alive = false;
        u.hp = 0;
        events.push({ t: tick, type: 'unitDied', id: u.id, side: u.side, x: u.x, y: u.y });
      }
    }

    // ---- Main loop ----
    var tick = 0;
    var endReason = 'timeout';

    for (tick = 0; tick <= maxTicks; tick++) {
      var changedBuildings = {};

      // 1. Guard posts release their hounds when raiders get close.
      for (var gi = 0; gi < buildings.length; gi++) {
        var post = buildings[gi];
        if (post.type !== 'guardPost' || !post.alive || post.triggered) continue;
        var trigger = M.def('guardPost').triggerRange;
        for (var ui = 0; ui < units.length; ui++) {
          var raider = units[ui];
          if (!raider.alive || raider.side !== 'atk') continue;
          if (Math.hypot(raider.x - post.cx, raider.y - post.cy) <= trigger) {
            post.triggered = true;
            spawnDefenders(post);
            events.push({ t: tick, type: 'defendersOut', id: post.id, x: post.cx, y: post.cy });
            break;
          }
        }
      }

      // 2. Every dog on the field moves or bites.
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (!u.alive) continue;
        u.attacking = false;

        if (u.side === 'def') {
          // Defenders chase the nearest raider, but will not be pulled far
          // from the post that released them.
          var tgt = u.targetId != null ? unitById(u.targetId) : null;
          if (!tgt || !tgt.alive) { acquireUnit(u); tgt = u.targetId != null ? unitById(u.targetId) : null; }
          if (!tgt) continue;
          var du = Math.hypot(tgt.x - u.x, tgt.y - u.y);
          if (du <= 0.6) {
            u.attacking = true;
            damageUnit(tgt, u.dps * dt, tick);
          } else {
            var stepD = u.speed * dt;
            var nxD = u.x + (tgt.x - u.x) / du * stepD;
            var nyD = u.y + (tgt.y - u.y) / du * stepD;
            if (Math.hypot(nxD - u.homeX, nyD - u.homeY) <= B.defenderLeash) { u.x = nxD; u.y = nyD; }
          }
          continue;
        }

        // Attackers.
        var target = u.targetId != null ? byId[u.targetId] : null;
        if (!target || !target.alive) { acquireBuilding(u); target = u.targetId != null ? byId[u.targetId] : null; }
        if (!target) continue;   // nothing left standing; the end check closes it out

        var dist = edgeDistance(u.x, u.y, target);
        if (dist <= B.attackReach) {
          u.attacking = true;
          // Breeds bite stone at their own rate, which is what makes a Mastiff
          // a wall-breaker and a Jack Russell useless against one.
          var bite = u.dps * dt * (target.role === 'wall' ? u.wallDamage : 1);
          damageBuilding(target, bite, tick);
          changedBuildings[target.id] = Math.max(0, target.hp);
          continue;
        }

        var step = u.speed * dt;
        var vx = target.cx - u.x, vy = target.cy - u.y;
        var vlen = Math.hypot(vx, vy) || 1;
        var nx = u.x + vx / vlen * step;
        var ny = u.y + vy / vlen * step;

        // Wall collision: anything that cannot slip through stone stops and
        // chews on whatever is in the way instead.
        if (!u.ignoresWalls) {
          var cx = Math.floor(nx), cy = Math.floor(ny);
          if (cx >= 0 && cy >= 0 && cx < grid && cy < grid) {
            var blockerId = occ[cy][cx];
            if (blockerId !== null && blockerId !== u.targetId) {
              u.targetId = blockerId;
              u.targetKind = 'building';
              continue;   // spend this tick turning on the obstacle
            }
          }
        }
        u.x = nx; u.y = ny;
      }

      // 3. Watchtowers fire on the nearest raider in range.
      for (var ti = 0; ti < buildings.length; ti++) {
        var tower = buildings[ti];
        if (tower.type !== 'watchtower' || !tower.alive) continue;
        var range = M.at(M.def('watchtower').range, tower.level);
        var dps = M.at(M.def('watchtower').dps, tower.level);
        var mark = null, markD = Infinity;
        for (var ai = 0; ai < units.length; ai++) {
          var a = units[ai];
          if (!a.alive || a.side !== 'atk') continue;
          var d2 = Math.hypot(a.x - tower.cx, a.y - tower.cy);
          if (d2 <= range && (d2 < markD - 1e-9 || (Math.abs(d2 - markD) <= 1e-9 && mark && a.id < mark.id))) {
            mark = a; markD = d2;
          }
        }
        if (mark) {
          damageUnit(mark, dps * dt, tick);
          // Log only when a tower switches target, not every tick, or the
          // replay would carry thousands of identical entries.
          if (tower.lastTarget !== mark.id) {
            tower.lastTarget = mark.id;
            events.push({ t: tick, type: 'towerShot', id: tower.id, target: mark.id });
          }
        } else if (tower.lastTarget != null) {
          tower.lastTarget = null;
          events.push({ t: tick, type: 'towerCease', id: tower.id });
        }
      }

      // 4. Snapshot the field.
      var liveUnits = [];
      for (var si = 0; si < units.length; si++) {
        var su = units[si];
        if (!su.alive) continue;
        liveUnits.push({
          i: su.id, x: r2(su.x), y: r2(su.y),
          h: Math.max(0, Math.round(su.hp)), a: su.attacking ? 1 : 0
        });
      }
      var bChanges = [];
      Object.keys(changedBuildings).forEach(function (id) {
        bChanges.push({ i: Number(id), h: Math.round(changedBuildings[id]) });
      });
      frames.push({ t: tick, u: liveUnits, b: bChanges });

      // 5. End conditions.
      var anyBuildingLeft = buildings.some(function (b) { return b.alive; });
      var anyRaiderLeft = units.some(function (u) { return u.alive && u.side === 'atk'; });
      if (!anyBuildingLeft) { endReason = 'razed'; break; }
      if (!anyRaiderLeft) { endReason = 'wiped'; break; }
    }

    // ---- Scoring ----
    var percentDestroyed = totalScorable ? destroyedCount / totalScorable : 1;
    var stars = 0;
    if (percentDestroyed >= B.oneStarDestruction) stars++;
    if (kennelDestroyed) stars++;
    if (percentDestroyed >= 0.999) stars++;

    var huskyBonus = 0;
    opts.army.forEach(function (entry) {
      var breed = B.breeds[entry.breed];
      if (breed && breed.lootBonus) huskyBonus += breed.lootBonus;
    });
    huskyBonus = Math.min(huskyBonus, 0.6);

    var fraction = Math.min(1, percentDestroyed * B.maxLootFraction * (1 + huskyBonus));
    var available = opts.base.loot || { food: 0, gold: 0 };
    var loot = {
      food: Math.floor(Math.min(available.food, available.food * fraction)),
      gold: Math.floor(Math.min(available.gold, available.gold * fraction))
    };

    var survivors = units.filter(function (u) { return u.alive && u.side === 'atk'; }).length;

    return {
      seed: opts.seed >>> 0,
      tickRate: B.tickRate,
      ticks: frames.length,
      grid: grid,
      // Static rosters so the renderer knows what it is drawing.
      units: units.map(function (u) {
        return { id: u.id, side: u.side, breed: u.breed, maxHp: Math.round(u.maxHp) };
      }),
      buildings: opts.base.buildings.map(function (b) {
        return {
          id: b.id, type: b.type, level: b.level, x: b.x, y: b.y,
          size: M.def(b.type).size, maxHp: M.hpOf(b.type, b.level)
        };
      }),
      frames: frames,
      events: events,
      result: {
        endReason: endReason,
        percentDestroyed: percentDestroyed,
        destroyed: destroyedCount,
        totalBuildings: totalScorable,
        kennelDestroyed: kennelDestroyed,
        stars: stars,
        loot: loot,
        bloodline: B.bloodlineByStars[stars],
        survivors: survivors,
        attackers: opts.army.length,
        secondsUsed: Math.round((frames.length - 1) / B.tickRate)
      }
    };
  }

  return { simulateBattle: simulateBattle };
});
