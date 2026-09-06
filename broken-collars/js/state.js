/*
 * Broken Collars - player state and economy.
 *
 * The entire save is ONE serializable object. Right now it lives in
 * localStorage; the shape is chosen so that moving it to a database row later
 * is a change of storage backend, not a change of data model.
 *
 * Resources tick on a timestamp rather than a running timer, so closing the tab
 * and coming back tomorrow settles up correctly. That "catch-up on read"
 * pattern is also exactly how a server would do it.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SAVE_KEY = 'brokenCollars.save.v1';

  function G() { return typeof globalThis !== 'undefined' ? globalThis : this; }
  function KWns() { return G().KW; }

  function newGame() {
    var KW = KWns();
    var B = KW.BALANCE;
    var now = Date.now();
    return {
      version: B.version,
      createdAt: now,
      lastTick: now,
      resources: { food: B.start.food, gold: B.start.gold, bloodline: B.start.bloodline },
      base: KW.baseModel.createStartingBase(),
      roster: Object.assign({}, B.start.roster),
      queue: [],
      unlocked: Object.keys(B.breeds).filter(function (k) { return B.breeds[k].unlock === 0; }),
      upgrades: { ironJaws: 0, thickCoats: 0, packRunners: 0 },
      mapSeed: 'map-' + now,
      bestStars: {},          // targetId -> best stars earned
      raided: {},             // targetId -> loot already taken, so bases run dry
      stats: { raids: 0, stars: 0, foodLooted: 0, goldLooted: 0, dogsLost: 0, dogsFreed: 0 }
    };
  }

  function save(state) {
    try {
      G().localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;   // private browsing, disabled storage, quota. Play on regardless.
    }
  }

  function load() {
    try {
      var raw = G().localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.base || !parsed.resources) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try { G().localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to do */ }
  }

  // ---- Derived numbers ----

  function capacity(state, resource) {
    return KWns().baseModel.storageCapacity(state.base, resource);
  }

  function perHour(state, resource) {
    return KWns().baseModel.productionPerHour(state.base, resource);
  }

  function armyCapacity(state) {
    return KWns().baseModel.armySpace(state.base);
  }

  function armyUsed(state) {
    var B = KWns().BALANCE;
    var used = 0;
    Object.keys(state.roster).forEach(function (breed) {
      if (B.breeds[breed]) used += state.roster[breed] * B.breeds[breed].space;
    });
    state.queue.forEach(function (q) {
      if (B.breeds[q.breed]) used += B.breeds[q.breed].space;
    });
    return used;
  }

  // Permanent multipliers bought with bloodline points.
  function modifiers(state) {
    var B = KWns().BALANCE;
    var mods = { dps: 1, hp: 1, speed: 1 };
    Object.keys(B.upgrades).forEach(function (key) {
      var up = B.upgrades[key];
      var tier = state.upgrades[key] || 0;
      mods[up.stat] += up.per * tier;
    });
    return mods;
  }

  // ---- Time ----

  // Settle production and training up to `now`. Safe to call as often as you like.
  function tick(state, now) {
    now = now || Date.now();
    var elapsedMs = Math.max(0, now - state.lastTick);
    if (elapsedMs < 1) return state;
    var hours = elapsedMs / 3600000;

    ['food', 'gold'].forEach(function (res) {
      var cap = capacity(state, res);
      var gained = perHour(state, res) * hours;
      state.resources[res] = Math.min(cap, state.resources[res] + gained);
    });

    trainFor(state, (elapsedMs / 1000) * KWns().baseModel.trainSpeed(state.base));
    state.lastTick = now;
    return state;
  }

  // Spend `budget` training-seconds down the queue, finishing dogs as it goes.
  function trainFor(state, budget) {
    while (budget > 0 && state.queue.length) {
      var head = state.queue[0];
      if (head.secondsLeft > budget) {
        head.secondsLeft -= budget;
        budget = 0;
      } else {
        budget -= head.secondsLeft;
        state.queue.shift();
        state.roster[head.breed] = (state.roster[head.breed] || 0) + 1;
      }
    }
  }

  // Real-world seconds until the queue is empty (for the UI countdown).
  function queueSecondsLeft(state) {
    var speed = KWns().baseModel.trainSpeed(state.base) || 1;
    return state.queue.reduce(function (sum, q) { return sum + q.secondsLeft; }, 0) / speed;
  }

  // ---- Building ----

  function canBuild(state, type) {
    var KW = KWns(), M = KW.baseModel;
    var count = M.countOf(state.base, type);
    var limit = M.limitFor(state.base, type);
    if (count >= limit) return { ok: false, why: 'Kennel level ' + M.kennelLevel(state.base) + ' allows only ' + limit };
    var cost = M.buildCost(type);
    if (state.resources.gold < cost) return { ok: false, why: 'Needs ' + cost + ' gold' };
    return { ok: true, cost: cost };
  }

  function build(state, type, x, y) {
    var M = KWns().baseModel;
    var check = canBuild(state, type);
    if (!check.ok) return check;
    if (!M.canPlace(state.base, type, x, y)) return { ok: false, why: 'Does not fit there' };
    state.resources.gold -= check.cost;
    M.addBuilding(state.base, type, x, y, 1);
    return { ok: true };
  }

  function canUpgrade(state, id) {
    var M = KWns().baseModel;
    var b = state.base.buildings.find(function (x) { return x.id === id; });
    if (!b) return { ok: false, why: 'No such building' };
    var cap = M.levelCapFor(state.base, b.type);
    if (b.level >= cap) {
      return {
        ok: false,
        why: b.type === 'kennel' || b.level >= M.maxLevel(b.type)
          ? 'Already at maximum level'
          : 'Upgrade the Kennel first'
      };
    }
    var cost = M.upgradeCost(b.type, b.level);
    if (cost == null) return { ok: false, why: 'Already at maximum level' };
    if (state.resources.gold < cost) return { ok: false, why: 'Needs ' + cost + ' gold' };
    return { ok: true, cost: cost };
  }

  function upgrade(state, id) {
    var check = canUpgrade(state, id);
    if (!check.ok) return check;
    var b = state.base.buildings.find(function (x) { return x.id === id; });
    state.resources.gold -= check.cost;
    b.level += 1;
    return { ok: true };
  }

  function move(state, id, x, y) {
    var M = KWns().baseModel;
    var b = state.base.buildings.find(function (x2) { return x2.id === id; });
    if (!b) return { ok: false, why: 'No such building' };
    if (!M.canPlace(state.base, b.type, x, y, id)) return { ok: false, why: 'Does not fit there' };
    b.x = x; b.y = y;
    return { ok: true };
  }

  // Half the gold sunk in so far, so experimenting with layouts is not punishing.
  function sellValue(state, id) {
    var M = KWns().baseModel;
    var b = state.base.buildings.find(function (x) { return x.id === id; });
    if (!b) return 0;
    var costs = M.def(b.type).cost;
    var spent = 0;
    for (var i = 0; i < b.level; i++) spent += costs[i] || 0;
    return Math.floor(spent * 0.5);
  }

  function sell(state, id) {
    var M = KWns().baseModel;
    var b = state.base.buildings.find(function (x) { return x.id === id; });
    if (!b) return { ok: false, why: 'No such building' };
    if (b.type === 'kennel') return { ok: false, why: 'You cannot sell your Kennel' };
    var refund = sellValue(state, id);
    M.removeBuilding(state.base, id);
    state.resources.gold = Math.min(capacity(state, 'gold'), state.resources.gold + refund);
    return { ok: true, refund: refund };
  }

  // ---- Army ----

  function canTrain(state, breed) {
    var B = KWns().BALANCE;
    var d = B.breeds[breed];
    if (!d) return { ok: false, why: 'Unknown breed' };
    if (state.unlocked.indexOf(breed) < 0) return { ok: false, why: 'Not unlocked' };
    if (state.resources.food < d.food) return { ok: false, why: 'Needs ' + d.food + ' food' };
    if (armyUsed(state) + d.space > armyCapacity(state)) return { ok: false, why: 'No kennel space' };
    return { ok: true };
  }

  function train(state, breed) {
    var B = KWns().BALANCE;
    var check = canTrain(state, breed);
    if (!check.ok) return check;
    var d = B.breeds[breed];
    state.resources.food -= d.food;
    state.queue.push({ breed: breed, secondsLeft: d.trainSeconds, total: d.trainSeconds });
    return { ok: true };
  }

  function cancelTraining(state, index) {
    var B = KWns().BALANCE;
    var item = state.queue[index];
    if (!item) return { ok: false };
    state.queue.splice(index, 1);
    // Refund in proportion to the work not yet done.
    var refund = Math.floor(B.breeds[item.breed].food * (item.secondsLeft / item.total));
    state.resources.food = Math.min(capacity(state, 'food'), state.resources.food + refund);
    return { ok: true, refund: refund };
  }

  function unlockBreed(state, breed) {
    var B = KWns().BALANCE;
    var d = B.breeds[breed];
    if (!d) return { ok: false, why: 'Unknown breed' };
    if (state.unlocked.indexOf(breed) >= 0) return { ok: false, why: 'Already unlocked' };
    if (state.resources.bloodline < d.unlock) return { ok: false, why: 'Needs ' + d.unlock + ' bloodline' };
    state.resources.bloodline -= d.unlock;
    state.unlocked.push(breed);
    return { ok: true };
  }

  function upgradeCostFor(state, key) {
    var up = KWns().BALANCE.upgrades[key];
    var tier = state.upgrades[key] || 0;
    return tier >= up.cost.length ? null : up.cost[tier];
  }

  function buyUpgrade(state, key) {
    var cost = upgradeCostFor(state, key);
    if (cost == null) return { ok: false, why: 'Fully researched' };
    if (state.resources.bloodline < cost) return { ok: false, why: 'Needs ' + cost + ' bloodline' };
    state.resources.bloodline -= cost;
    state.upgrades[key] = (state.upgrades[key] || 0) + 1;
    return { ok: true };
  }

  // ---- Raids ----

  // What the player's own base looks like to an attacker. In the multiplayer
  // version this is the object that gets uploaded so other people can raid you.
  function mySnapshot(state) {
    return KWns().baseModel.snapshot(state.base, {
      food: state.resources.food * 0.5,
      gold: state.resources.gold * 0.5
    });
  }

  // Deployed dogs are spent, win or lose. That is what makes an army a real cost
  // and keeps the build-train-raid loop turning.
  function applyRaid(state, target, army, result) {
    army.forEach(function (entry) {
      if (state.roster[entry.breed]) state.roster[entry.breed] -= 1;
    });
    Object.keys(state.roster).forEach(function (k) {
      if (state.roster[k] <= 0) delete state.roster[k];
    });

    state.resources.food = Math.min(capacity(state, 'food'), state.resources.food + result.loot.food);
    state.resources.gold = Math.min(capacity(state, 'gold'), state.resources.gold + result.loot.gold);
    state.resources.bloodline += result.bloodline;

    // Hounds freed from broken cages join the pack, as far as there is room.
    // Any beyond that are recorded as taken in but not kept for war.
    var B = KWns().BALANCE;
    var joined = 0, turnedAway = 0;
    Object.keys(result.freed || {}).forEach(function (breed) {
      for (var i = 0; i < result.freed[breed]; i++) {
        var space = B.breeds[breed].space;
        if (armyUsed(state) + space <= armyCapacity(state)) {
          state.roster[breed] = (state.roster[breed] || 0) + 1;
          joined++;
        } else {
          turnedAway++;
        }
      }
    });
    result.joined = joined;
    result.turnedAway = turnedAway;
    state.stats.dogsFreed = (state.stats.dogsFreed || 0) + joined;

    var prev = state.bestStars[target.id] || 0;
    if (result.stars > prev) state.bestStars[target.id] = result.stars;

    // Remember what has already been carried off so the same base cannot be
    // farmed forever. Rivals run dry and you go looking for new ones.
    state.raided = state.raided || {};
    var taken = state.raided[target.id] || { food: 0, gold: 0 };
    taken.food += result.loot.food;
    taken.gold += result.loot.gold;
    state.raided[target.id] = taken;

    state.stats.raids += 1;
    state.stats.stars += result.stars;
    state.stats.foodLooted += result.loot.food;
    state.stats.goldLooted += result.loot.gold;
    state.stats.dogsLost += army.length;
    return state;
  }

  function refreshMap(state) {
    state.mapSeed = 'map-' + Date.now();
    return state;
  }

  return {
    playerState: {
      SAVE_KEY: SAVE_KEY,
      newGame: newGame, save: save, load: load, clear: clear,
      capacity: capacity, perHour: perHour,
      armyCapacity: armyCapacity, armyUsed: armyUsed, modifiers: modifiers,
      tick: tick, queueSecondsLeft: queueSecondsLeft,
      canBuild: canBuild, build: build, canUpgrade: canUpgrade, upgrade: upgrade,
      move: move, sellValue: sellValue, sell: sell,
      canTrain: canTrain, train: train, cancelTraining: cancelTraining,
      unlockBreed: unlockBreed, upgradeCostFor: upgradeCostFor, buyUpgrade: buyUpgrade,
      mySnapshot: mySnapshot, applyRaid: applyRaid, refreshMap: refreshMap
    }
  };
});
