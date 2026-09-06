/*
 * Kennel Wars - screen rendering and input.
 *
 * Everything here reads from the player state object and writes back through
 * playerState.*; no game rules are decided in this file.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function KWns() { return globalThis.KW; }
  function $(id) { return document.getElementById(id); }

  function fmt(n) {
    return Math.floor(n).toLocaleString('en-US');
  }

  function mmss(seconds) {
    var s = Math.max(0, Math.ceil(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function starString(n, total) {
    var out = '';
    for (var i = 0; i < (total || 3); i++) out += i < n ? '★' : '☆';
    return out;
  }

  // ---------------------------------------------------------------- HUD

  function renderHud(game) {
    var KW = KWns(), P = KW.playerState, s = game.state;
    $('res-food').textContent = fmt(s.resources.food);
    $('cap-food').textContent = '/' + fmt(P.capacity(s, 'food'));
    $('res-gold').textContent = fmt(s.resources.gold);
    $('cap-gold').textContent = '/' + fmt(P.capacity(s, 'gold'));
    $('res-bloodline').textContent = fmt(s.resources.bloodline);
    $('kennel-badge').textContent = 'Kennel ' + KW.baseModel.kennelLevel(s.base);
  }

  // ---------------------------------------------------------------- BASE

  function drawBase(game) {
    var KW = KWns(), M = KW.baseModel, R = KW.render;
    var s = game.state, base = s.base;
    var canvas = $('baseCanvas');
    var g = R.setup(canvas, base.grid);
    var ctx = g.ctx, tile = g.tile;

    R.drawGround(ctx, base.grid, tile);

    base.buildings.forEach(function (b) {
      var d = M.def(b.type);
      R.drawBuilding(ctx, b.x, b.y, tile, {
        size: d.size, role: d.role, icon: d.icon, level: b.level,
        selected: b.id === game.ui.selectedId,
        dim: game.ui.moveMode && b.id === game.ui.selectedId
      });
    });

    // Range ring for a selected watchtower.
    var sel = base.buildings.find(function (b) { return b.id === game.ui.selectedId; });
    if (sel && sel.type === 'watchtower') {
      var c = M.centerOf(sel);
      R.drawRange(ctx, c.x, c.y, M.at(M.def('watchtower').range, sel.level), tile);
    }

    // Ghost preview while placing or moving.
    var mode = game.ui.buildMode || (game.ui.moveMode && sel ? sel.type : null);
    if (mode && game.ui.hover) {
      var size = M.def(mode).size;
      var pos = ghostPosition(base, mode, game.ui.hover);
      var ok = M.canPlace(base, mode, pos.x, pos.y, game.ui.moveMode ? game.ui.selectedId : undefined);
      R.drawBuilding(ctx, pos.x, pos.y, tile, {
        size: size, role: M.def(mode).role, icon: M.def(mode).icon, level: 1,
        ghost: true, invalid: !ok
      });
    }
  }

  // Centre the footprint on the cursor and keep it inside the grid.
  function ghostPosition(base, type, hover) {
    var size = KWns().baseModel.def(type).size;
    var x = Math.round(hover.x - size / 2);
    var y = Math.round(hover.y - size / 2);
    return {
      x: Math.max(0, Math.min(base.grid - size, x)),
      y: Math.max(0, Math.min(base.grid - size, y))
    };
  }

  function renderPalette(game) {
    var KW = KWns(), M = KW.baseModel, P = KW.playerState, s = game.state;
    var wrap = $('palette');
    wrap.innerHTML = '';

    KW.BALANCE.buildOrder.forEach(function (type) {
      var d = M.def(type);
      var check = P.canBuild(s, type);
      var count = M.countOf(s.base, type);
      var limit = M.limitFor(s.base, type);

      var btn = document.createElement('button');
      btn.className = 'pal-item' + (game.ui.buildMode === type ? ' selected' : '');
      btn.disabled = !check.ok;
      btn.title = check.ok ? d.blurb : check.why;
      btn.innerHTML =
        '<span class="pal-icon">' + d.icon + '</span>' +
        d.label +
        '<span class="pal-cost">' + fmt(M.buildCost(type)) + 'g</span>' +
        '<span class="muted" style="font-size:10px">' + count + '/' + limit + '</span>';
      btn.addEventListener('click', function () {
        game.ui.buildMode = game.ui.buildMode === type ? null : type;
        game.ui.selectedId = null;
        game.ui.moveMode = false;
        game.refresh();
      });
      wrap.appendChild(btn);
    });
  }

  function renderSelection(game) {
    var KW = KWns(), M = KW.baseModel, P = KW.playerState, s = game.state;
    var box = $('selection');
    var b = s.base.buildings.find(function (x) { return x.id === game.ui.selectedId; });

    if (!b) {
      box.innerHTML = game.ui.buildMode
        ? '<p class="muted">Click the map to place your ' + M.def(game.ui.buildMode).label + '.</p>'
        : '<p class="muted">Nothing selected. Click a building to inspect it.</p>';
      return;
    }

    var d = M.def(b.type);
    var cap = M.levelCapFor(s.base, b.type);
    var up = P.canUpgrade(s, b.id);
    var rows = [];

    rows.push('<span>Level</span><span>' + b.level + ' / ' + M.maxLevel(b.type) + '</span>');
    rows.push('<span>Health</span><span>' + fmt(M.hpOf(b.type, b.level)) + '</span>');
    if (d.role === 'production') rows.push('<span>Produces</span><span>' + fmt(M.at(d.rate, b.level)) + ' ' + d.resource + '/hr</span>');
    if (d.role === 'storage') rows.push('<span>Holds</span><span>' + fmt(M.at(d.capacity, b.level)) + ' ' + d.resource + '</span>');
    if (d.armySpace) rows.push('<span>Kennel space</span><span>' + M.at(d.armySpace, b.level) + '</span>');
    if (d.trainSpeed) rows.push('<span>Training speed</span><span>×' + M.at(d.trainSpeed, b.level) + '</span>');
    if (b.type === 'watchtower') {
      rows.push('<span>Damage</span><span>' + M.at(d.dps, b.level) + '/s</span>');
      rows.push('<span>Range</span><span>' + M.at(d.range, b.level) + ' tiles</span>');
    }
    if (b.type === 'guardPost') {
      rows.push('<span>Defenders</span><span>' + M.at(d.packSize, b.level) + '</span>');
      rows.push('<span>Each</span><span>' + M.at(d.dogHp, b.level) + ' hp / ' + M.at(d.dogDps, b.level) + ' dps</span>');
    }

    var actions = '';
    if (up.ok) {
      actions += '<button class="primary-btn" data-act="upgrade">Upgrade · ' + fmt(up.cost) + 'g</button>';
    } else {
      actions += '<button class="primary-btn" disabled title="' + up.why + '">' +
        (b.level >= cap ? (b.level >= M.maxLevel(b.type) ? 'Max level' : 'Kennel too low') : 'Upgrade · ' + fmt(M.upgradeCost(b.type, b.level) || 0) + 'g') +
        '</button>';
    }
    actions += '<button class="ghost-btn" data-act="move">' + (game.ui.moveMode ? 'Cancel move' : 'Move') + '</button>';
    if (b.type !== 'kennel') {
      actions += '<button class="ghost-btn danger-btn" data-act="sell">Sell · ' + fmt(P.sellValue(s, b.id)) + 'g</button>';
    }

    box.innerHTML =
      '<div class="sel-title"><span class="big">' + d.icon + '</span><h3>' + d.label + '</h3></div>' +
      '<p class="muted small">' + d.blurb + '</p>' +
      '<div class="sel-stats">' + rows.join('') + '</div>' +
      '<div class="sel-actions">' + actions + '</div>';

    box.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-act');
        if (act === 'upgrade') {
          var r = P.upgrade(s, b.id);
          game.status(r.ok ? M.def(b.type).label + ' upgraded to level ' + b.level + '.' : r.why);
        } else if (act === 'move') {
          game.ui.moveMode = !game.ui.moveMode;
          game.ui.buildMode = null;
          game.status(game.ui.moveMode ? 'Click where the ' + d.label + ' should stand.' : 'Move cancelled.');
        } else if (act === 'sell') {
          var sr = P.sell(s, b.id);
          if (sr.ok) {
            game.ui.selectedId = null;
            game.status('Sold for ' + fmt(sr.refund) + ' gold.');
          }
        }
        game.save();
        game.refresh();
      });
    });
  }

  function mountBase(game) {
    var canvas = $('baseCanvas');
    var KW = KWns(), M = KW.baseModel, P = KW.playerState;

    canvas.addEventListener('mousemove', function (e) {
      game.ui.hover = KW.render.eventToTile(canvas, e, game.state.base.grid);
      if (game.ui.buildMode || game.ui.moveMode) drawBase(game);
    });
    canvas.addEventListener('mouseleave', function () {
      game.ui.hover = null;
      drawBase(game);
    });

    canvas.addEventListener('click', function (e) {
      var s = game.state;
      var pos = KW.render.eventToTile(canvas, e, s.base.grid);
      game.ui.hover = pos;

      // Placing a new building.
      if (game.ui.buildMode) {
        var g1 = ghostPosition(s.base, game.ui.buildMode, pos);
        var r = P.build(s, game.ui.buildMode, g1.x, g1.y);
        if (r.ok) {
          game.status(M.def(game.ui.buildMode).label + ' raised.');
          // Stay in build mode if another is still affordable and allowed.
          if (!P.canBuild(s, game.ui.buildMode).ok) game.ui.buildMode = null;
        } else {
          game.status(r.why);
        }
        game.save();
        game.refresh();
        return;
      }

      // Relocating the selected building.
      if (game.ui.moveMode && game.ui.selectedId != null) {
        var sel = s.base.buildings.find(function (b) { return b.id === game.ui.selectedId; });
        var g2 = ghostPosition(s.base, sel.type, pos);
        var mr = P.move(s, sel.id, g2.x, g2.y);
        game.status(mr.ok ? 'Moved.' : mr.why);
        if (mr.ok) game.ui.moveMode = false;
        game.save();
        game.refresh();
        return;
      }

      // Otherwise: select whatever was clicked.
      var cell = { x: Math.floor(pos.x), y: Math.floor(pos.y) };
      var occ = M.occupancy(s.base);
      var id = (cell.y >= 0 && cell.y < s.base.grid && cell.x >= 0 && cell.x < s.base.grid)
        ? occ[cell.y][cell.x] : null;
      game.ui.selectedId = id;
      game.refresh();
    });
  }

  function renderBase(game) {
    renderPalette(game);
    renderSelection(game);
    drawBase(game);
  }

  // ---------------------------------------------------------------- ARMY

  function renderArmy(game) {
    var KW = KWns(), B = KW.BALANCE, P = KW.playerState, s = game.state;
    var used = P.armyUsed(s), cap = P.armyCapacity(s);

    $('army-capacity').textContent = used + ' / ' + cap + ' space';
    $('army-bar').style.width = cap ? Math.min(100, used / cap * 100) + '%' : '0%';

    var list = $('breed-list');
    list.innerHTML = '';

    B.breedOrder.forEach(function (key) {
      var d = B.breeds[key];
      var unlocked = s.unlocked.indexOf(key) >= 0;
      var owned = s.roster[key] || 0;
      var card = document.createElement('div');
      card.className = 'breed-card' + (unlocked ? '' : ' locked');

      var stats =
        '<span>❤️ <b>' + d.hp + '</b></span>' +
        '<span>⚔️ <b>' + d.dps + '</b>/s</span>' +
        '<span>💨 <b>' + d.speed + '</b></span>' +
        '<span>🧱 <b>×' + d.wallDamage + '</b></span>' +
        '<span>📦 <b>' + d.space + '</b> space</span>';

      var actions;
      if (!unlocked) {
        var affordable = s.resources.bloodline >= d.unlock;
        actions = '<button class="primary-btn" data-unlock="' + key + '"' + (affordable ? '' : ' disabled') +
          '>Unlock · ' + d.unlock + ' 🩸</button>';
      } else {
        var check = P.canTrain(s, key);
        actions = '<button class="primary-btn" data-train="' + key + '"' + (check.ok ? '' : ' disabled title="' + check.why + '"') +
          '>Train · ' + d.food + ' 🥩</button>' +
          '<span class="muted small">' + d.trainSeconds + 's</span>';
      }

      card.innerHTML =
        '<div class="breed-head"><span class="big">' + d.icon + '</span>' +
        '<h3>' + d.label + '</h3>' +
        '<span class="badge breed-owned">' + owned + ' ready</span></div>' +
        '<p class="breed-blurb">' + d.blurb + '</p>' +
        '<div class="breed-stats">' + stats + '</div>' +
        '<div class="breed-actions">' + actions + '</div>';
      list.appendChild(card);
    });

    list.querySelectorAll('[data-train]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = P.train(s, btn.getAttribute('data-train'));
        game.status(r.ok ? 'Training started.' : r.why);
        game.save();
        game.refresh();
      });
    });
    list.querySelectorAll('[data-unlock]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-unlock');
        var r = P.unlockBreed(s, key);
        game.status(r.ok ? B.breeds[key].label + ' joins your kennel.' : r.why);
        game.save();
        game.refresh();
      });
    });

    renderQueue(game);
    renderUpgrades(game);
  }

  function renderQueue(game) {
    var KW = KWns(), B = KW.BALANCE, P = KW.playerState, s = game.state;
    var box = $('queue');
    if (!s.queue.length) {
      box.innerHTML = '<p class="muted small">Nothing in training.</p>';
      return;
    }
    var speed = KW.baseModel.trainSpeed(s.base) || 1;
    var cumulative = 0;
    box.innerHTML = s.queue.map(function (q, i) {
      var d = B.breeds[q.breed];
      cumulative += q.secondsLeft / speed;
      var pct = Math.max(0, Math.min(100, (1 - q.secondsLeft / q.total) * 100));
      return '<div class="queue-item">' +
        '<span>' + d.icon + '</span>' +
        '<span class="grow">' + d.label +
        '<div class="queue-progress"><div style="width:' + pct.toFixed(1) + '%"></div></div></span>' +
        '<span class="muted">' + mmss(cumulative) + '</span>' +
        '<button class="mini-btn" data-cancel="' + i + '">✕</button>' +
        '</div>';
    }).join('');

    box.querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = P.cancelTraining(s, Number(btn.getAttribute('data-cancel')));
        if (r.ok) game.status('Cancelled. ' + fmt(r.refund) + ' food returned.');
        game.save();
        game.refresh();
      });
    });
  }

  function renderUpgrades(game) {
    var KW = KWns(), B = KW.BALANCE, P = KW.playerState, s = game.state;
    var box = $('upgrade-list');
    box.innerHTML = '';

    B.upgradeOrder.forEach(function (key) {
      var up = B.upgrades[key];
      var tier = s.upgrades[key] || 0;
      var cost = P.upgradeCostFor(s, key);
      var maxed = cost == null;
      var affordable = !maxed && s.resources.bloodline >= cost;

      var el = document.createElement('div');
      el.className = 'upgrade-item';
      el.innerHTML =
        '<div class="upgrade-head"><span>' + up.icon + '</span><b>' + up.label + '</b>' +
        '<span class="tier">' + tier + ' / ' + up.cost.length + '</span></div>' +
        '<p class="muted small" style="margin:0 0 7px">' + up.blurb + '</p>' +
        (maxed
          ? '<span class="muted small">Fully researched</span>'
          : '<button class="primary-btn" data-buy="' + key + '"' + (affordable ? '' : ' disabled') +
            '>Research · ' + cost + ' 🩸</button>');
      box.appendChild(el);
    });

    box.querySelectorAll('[data-buy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = P.buyUpgrade(s, btn.getAttribute('data-buy'));
        game.status(r.ok ? 'Bloodline strengthened.' : r.why);
        game.save();
        game.refresh();
      });
    });
  }

  // ---------------------------------------------------------------- RAID

  function renderRaid(game) {
    var KW = KWns(), M = KW.baseModel, s = game.state;
    var box = $('target-list');
    box.innerHTML = '';

    var hasScout = (s.roster.bloodhound || 0) > 0;
    var totalDogs = Object.keys(s.roster).reduce(function (n, k) { return n + s.roster[k]; }, 0);

    game.targets.forEach(function (t) {
      var best = s.bestStars[t.id] || 0;
      var card = document.createElement('div');
      card.className = 'target-card';

      var scouted = game.ui.scouted[t.id];
      var intel = '';
      if (scouted) {
        var counts = {};
        t.base.buildings.forEach(function (b) { counts[b.type] = (counts[b.type] || 0) + 1; });
        intel = '<div class="muted small">Scouted: ' +
          (counts.watchtower || 0) + ' towers · ' +
          (counts.guardPost || 0) + ' guard posts · ' +
          (counts.wall || 0) + ' walls</div>';
      }

      card.innerHTML =
        '<div class="target-head"><h3>' + t.name + '</h3>' +
        '<span class="badge">Kennel ' + t.level + '</span>' +
        '<span class="stars" style="margin-left:auto">' + starString(best) + '</span></div>' +
        '<div class="target-loot"><span>🥩 ' + fmt(t.base.loot.food) + '</span>' +
        '<span>💰 ' + fmt(t.base.loot.gold) + '</span></div>' +
        intel +
        '<div class="sel-actions">' +
        '<button class="primary-btn" data-raid="' + t.id + '"' + (totalDogs ? '' : ' disabled title="Train some dogs first"') + '>Raid</button>' +
        (scouted ? '' : '<button class="ghost-btn" data-scout="' + t.id + '"' +
          (hasScout ? '' : ' disabled title="Needs a Bloodhound in your kennel"') + '>Scout</button>') +
        '</div>';
      box.appendChild(card);
    });

    box.querySelectorAll('[data-raid]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-raid');
        var t = game.targets.find(function (x) { return x.id === id; });
        KW.battle.open(game, t);
      });
    });
    box.querySelectorAll('[data-scout]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        game.ui.scouted[btn.getAttribute('data-scout')] = true;
        game.status('Your bloodhound returns with the layout.');
        game.refresh();
      });
    });
    void M;
  }

  // ---------------------------------------------------------------- shell

  function setScreen(game, name) {
    game.ui.screen = name;
    ['base', 'army', 'raid'].forEach(function (n) {
      $('screen-' + n).classList.toggle('active', n === name);
    });
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-screen') === name);
    });
    game.refresh();
  }

  return {
    screens: {
      fmt: fmt, mmss: mmss, starString: starString,
      renderHud: renderHud, mountBase: mountBase, renderBase: renderBase, drawBase: drawBase,
      renderArmy: renderArmy, renderRaid: renderRaid, setScreen: setScreen
    }
  };
});
