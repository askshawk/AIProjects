/*
 * Broken Collars - deploy phase and replay playback.
 *
 * Note what this file does NOT do: it never decides who wins. By the time the
 * first frame is drawn, simulateBattle() has already produced the entire
 * outcome. This is only a player for that recording, which is why the same
 * result can be re-derived anywhere the simulation runs.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function KWns() { return globalThis.KW; }
  function $(id) { return document.getElementById(id); }

  var SPEEDS = [1, 2, 4];

  var st = null;   // active battle session

  // ---------------------------------------------------------------- open

  function open(game, target) {
    var KW = KWns();
    st = {
      game: game,
      target: target,
      phase: 'deploy',
      picked: null,            // breed currently selected for release
      army: [],                // [{breed, x, y}]
      available: Object.assign({}, game.state.roster),
      replay: null,
      hpById: {},
      appliedTick: -1,
      eventsByTick: {},
      effects: [],
      facing: {},          // unit id -> last screen-space heading, so dogs face where they run
      unitMeta: {},
      playTick: 0,
      speed: 1,
      startedAt: 0,
      raf: 0,
      applied: false
    };

    $('battle-title').textContent = target.name;
    $('battle-sub').textContent = 'Kennel level ' + target.level + ' · ' +
      KW.screens.fmt(target.base.loot.food) + ' food and ' +
      KW.screens.fmt(target.base.loot.gold) + ' gold to take.';
    $('battle-timer').textContent = KW.screens.mmss(KW.BALANCE.battleSeconds);
    $('battle-destroyed').textContent = '0%';
    $('result-card').classList.add('hidden');
    $('btn-start').classList.remove('hidden');
    $('btn-speed').classList.add('hidden');
    $('btn-collect').classList.add('hidden');
    $('deploy-bar').classList.remove('hidden');
    $('deploy-hint').textContent = 'Pick a breed, then click inside the glowing band.';
    $('battleOverlay').classList.remove('hidden');

    renderDeployBar();
    draw();
  }

  function close() {
    if (st && st.raf) cancelAnimationFrame(st.raf);
    $('battleOverlay').classList.add('hidden');
    st = null;
  }

  // ---------------------------------------------------------------- deploy

  function renderDeployBar() {
    var KW = KWns(), B = KW.BALANCE;
    var bar = $('deploy-bar');

    if (st.phase !== 'deploy') { bar.innerHTML = ''; return; }

    var chips = B.breedOrder.filter(function (k) { return (st.available[k] || 0) > 0 || countPicked(k) > 0; })
      .map(function (key) {
        var d = B.breeds[key];
        var left = st.available[key] || 0;
        return '<button class="deploy-chip' + (st.picked === key ? ' selected' : '') + '"' +
          (left ? '' : ' disabled') + ' data-breed="' + key + '">' +
          d.icon + ' ' + d.label + ' <span class="count">' + left + '</span></button>';
      });

    if (!chips.length) {
      bar.innerHTML = '<span class="muted small">No dogs ready. Train some in the Army screen.</span>';
      return;
    }
    if (st.army.length) {
      chips.push('<button class="deploy-chip" data-recall="1">↺ Recall all (' + st.army.length + ')</button>');
    }
    bar.innerHTML = chips.join('');

    bar.querySelectorAll('[data-breed]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-breed');
        st.picked = st.picked === key ? null : key;
        renderDeployBar();
      });
    });
    var recall = bar.querySelector('[data-recall]');
    if (recall) {
      recall.addEventListener('click', function () {
        st.army = [];
        st.available = Object.assign({}, st.game.state.roster);
        renderDeployBar();
        draw();
      });
    }
  }

  function countPicked(breed) {
    return st.army.filter(function (a) { return a.breed === breed; }).length;
  }

  // Must be inside the map AND within the edge band. The bounds check matters:
  // in isometric, clicks land outside the diamond easily, and without it a dog
  // could be released into empty space off the field.
  function inDeployZone(pos, grid, margin) {
    if (pos.x < 0 || pos.y < 0 || pos.x > grid || pos.y > grid) return false;
    return pos.x < margin || pos.y < margin || pos.x > grid - margin || pos.y > grid - margin;
  }

  function handleDeployClick(e) {
    if (!st || st.phase !== 'deploy') return;
    var KW = KWns(), B = KW.BALANCE;
    var canvas = $('battleCanvas');
    var grid = st.target.base.grid;
    var pos = KW.render.eventToTile(canvas, e, grid);

    if (!st.picked) { flash('Pick a breed first.'); return; }
    if ((st.available[st.picked] || 0) <= 0) { flash('No more of those ready.'); return; }
    if (!inDeployZone(pos, grid, B.deployMargin)) {
      flash('Release your dogs inside the glowing band at the edge.');
      return;
    }

    st.army.push({ breed: st.picked, x: pos.x, y: pos.y });
    st.available[st.picked] -= 1;
    if (st.available[st.picked] <= 0) st.picked = null;
    renderDeployBar();
    draw();
  }

  function flash(msg) { $('deploy-hint').textContent = msg; }

  // ---------------------------------------------------------------- run

  function start() {
    if (!st || st.phase !== 'deploy') return;
    if (!st.army.length) { flash('Release at least one dog first.'); return; }

    var KW = KWns(), P = KW.playerState;
    var seed = KW.hashSeed(st.target.id + ':' + Date.now());

    st.replay = KW.simulateBattle({
      army: st.army,
      base: st.target.base,
      seed: seed,
      modifiers: P.modifiers(st.game.state)
    });

    // Index events by tick so playback can pick them up without scanning.
    st.eventsByTick = {};
    st.replay.events.forEach(function (ev) {
      (st.eventsByTick[ev.t] = st.eventsByTick[ev.t] || []).push(ev);
    });
    st.replay.buildings.forEach(function (b) { st.hpById[b.id] = b.maxHp; });
    st.unitMeta = {};
    st.replay.units.forEach(function (u) { st.unitMeta[u.id] = u; });

    st.phase = 'playing';
    st.startedAt = performance.now();
    st.appliedTick = -1;

    $('btn-start').classList.add('hidden');
    $('btn-speed').classList.remove('hidden');
    $('btn-speed').textContent = 'Speed ×1';
    $('deploy-bar').classList.add('hidden');
    $('deploy-hint').textContent = 'The pack is loose.';
    loop();
  }

  function cycleSpeed() {
    if (!st || st.phase !== 'playing') return;
    var i = SPEEDS.indexOf(st.speed);
    var next = SPEEDS[(i + 1) % SPEEDS.length];
    // Rebase the clock so changing speed does not jump the playhead.
    var elapsed = (performance.now() - st.startedAt) * st.speed;
    st.speed = next;
    st.startedAt = performance.now() - elapsed / st.speed;
    $('btn-speed').textContent = 'Speed ×' + next;
  }

  function loop() {
    if (!st || st.phase !== 'playing') return;
    var KW = KWns();
    var rate = st.replay.tickRate;
    var elapsedSec = (performance.now() - st.startedAt) * st.speed / 1000;
    var pos = elapsedSec * rate;
    var last = st.replay.frames.length - 1;

    if (pos >= last) {
      advanceTo(last);
      draw(last, 0);
      finish();
      return;
    }

    var i = Math.floor(pos);
    advanceTo(i);
    draw(i, pos - i);

    $('battle-timer').textContent = KW.screens.mmss(KW.BALANCE.battleSeconds - i / rate);
    $('battle-destroyed').textContent = livePercent() + '%';

    st.raf = requestAnimationFrame(loop);
  }

  // Roll building damage and effects forward to `tickIndex`.
  function advanceTo(tickIndex) {
    while (st.appliedTick < tickIndex) {
      st.appliedTick++;
      var f = st.replay.frames[st.appliedTick];
      if (f) f.b.forEach(function (ch) { st.hpById[ch.i] = ch.h; });
      var evs = st.eventsByTick[st.appliedTick];
      if (evs) {
        evs.forEach(function (ev) {
          if (ev.type === 'buildingDestroyed' || ev.type === 'defendersOut') {
            st.effects.push({ type: 'debris', x: ev.x, y: ev.y, tick: st.appliedTick, life: 10 });
          } else if (ev.type === 'cageBroken') {
            st.effects.push({ type: 'freed', x: ev.x, y: ev.y, tick: st.appliedTick, life: 18 });
          }
        });
      }
    }
  }

  function livePercent() {
    var total = 0, dead = 0;
    st.replay.buildings.forEach(function (b) {
      if (b.type === 'wall') return;
      total++;
      if ((st.hpById[b.id] || 0) <= 0) dead++;
    });
    return total ? Math.round(dead / total * 100) : 0;
  }

  function skipToEnd() {
    if (!st || st.phase !== 'playing') return;
    if (st.raf) cancelAnimationFrame(st.raf);
    var last = st.replay.frames.length - 1;
    advanceTo(last);
    draw(last, 0);
    finish();
  }

  function finish() {
    var KW = KWns();
    st.phase = 'done';
    if (st.raf) cancelAnimationFrame(st.raf);

    var r = st.replay.result;
    $('battle-destroyed').textContent = Math.round(r.percentDestroyed * 100) + '%';
    $('battle-timer').textContent = KW.screens.mmss(KW.BALANCE.battleSeconds - r.secondsUsed);

    var headline = r.stars >= 3 ? 'Every cage is open'
      : r.stars === 2 ? 'Hounds are running free'
        : r.stars === 1 ? 'A raid, of sorts'
          : 'Driven off';

    $('result-card').innerHTML =
      '<h3>' + headline + '</h3>' +
      '<div class="result-stars">' + KW.screens.starString(r.stars).replace(/☆/g, '<span class="off">☆</span>') + '</div>' +
      '<div class="result-lines">' +
      '<span>Razed</span><span>' + Math.round(r.percentDestroyed * 100) + '% (' + r.destroyed + '/' + r.totalBuildings + ')</span>' +
      '<span>Hounds freed</span><span>🐕 ' + r.freedCount + ' from ' + r.cagesBroken + ' cage' + (r.cagesBroken === 1 ? '' : 's') + '</span>' +
      '<span>Food taken</span><span>🥩 ' + KW.screens.fmt(r.loot.food) + '</span>' +
      '<span>Gold taken</span><span>💰 ' + KW.screens.fmt(r.loot.gold) + '</span>' +
      '<span>Bloodline</span><span>🩸 ' + r.bloodline + '</span>' +
      '<span>Pack</span><span>' + r.attackers + ' committed, ' + r.survivors + ' survived</span>' +
      '</div>';
    $('result-card').classList.remove('hidden');
    $('btn-speed').classList.add('hidden');
    $('btn-collect').classList.remove('hidden');
    $('deploy-hint').textContent = 'Deployed dogs do not come home. Train replacements before the next raid.';
  }

  function collect() {
    if (!st || st.phase !== 'done' || st.applied) { close(); return; }
    var KW = KWns(), game = st.game;
    st.applied = true;
    KW.playerState.applyRaid(game.state, st.target, st.army, st.replay.result);
    game.save();
    var r = st.replay.result;
    var freedNote = r.joined
      ? ' ' + r.joined + ' freed hound' + (r.joined === 1 ? '' : 's') + ' joined the pack' +
        (r.turnedAway ? ' (' + r.turnedAway + ' turned away, no kennel space)' : '') + '.'
      : '';
    game.status('Raid on ' + st.target.name + ': ' + r.stars + '★, took ' +
      KW.screens.fmt(r.loot.food) + ' food and ' + KW.screens.fmt(r.loot.gold) + ' gold.' + freedNote);
    close();
    game.refresh();
  }

  // ---------------------------------------------------------------- draw

  function draw(frameIndex, blend) {
    if (!st) return;
    var KW = KWns(), B = KW.BALANCE, M = KW.baseModel, R = KW.render;
    var base = st.target.base;
    var m = R.setup($('battleCanvas'), base.grid);

    st.playTick = (frameIndex || 0) + (blend || 0);

    R.drawGround(m);
    if (st.phase === 'deploy') R.drawDeployZone(m, B.deployMargin);

    // Everything standing on the field goes into one list and is painted back
    // to front, so dogs pass correctly in front of and behind buildings.
    var drawables = [];

    base.buildings.forEach(function (b) {
      var maxHp = M.hpOf(b.type, b.level);
      var hp = st.replay ? (st.hpById[b.id] != null ? st.hpById[b.id] : maxHp) : maxHp;
      if (hp <= 0) return;
      drawables.push({
        depth: R.depthOf(b.x, b.y, M.def(b.type).size),
        paint: function () {
          R.drawBuilding(m, b.x, b.y, {
            type: b.type, size: M.def(b.type).size, level: b.level, hp: hp / maxHp
          });
        }
      });
    });

    if (st.phase === 'deploy') {
      st.army.forEach(function (a) {
        drawables.push({
          depth: R.depthOf(a.x, a.y, 0.5),
          paint: function () {
            R.drawDog(m, a.x, a.y, {
              color: B.breeds[a.breed].color, facing: 1, phase: 0, moving: false
            });
          }
        });
      });
    } else if (st.replay) {
      collectDogs(m, drawables, frameIndex || 0, blend || 0);
    }

    drawables.sort(function (a, b) { return a.depth - b.depth; });
    drawables.forEach(function (d) { d.paint(); });

    drawEffects(m);
  }

  function collectDogs(m, out, i, blend) {
    var KW = KWns(), B = KW.BALANCE, R = KW.render;
    var frames = st.replay.frames;
    var cur = frames[Math.min(i, frames.length - 1)];
    var next = frames[Math.min(i + 1, frames.length - 1)];
    if (!cur) return;

    var nextById = {};
    next.u.forEach(function (u) { nextById[u.i] = u; });

    cur.u.forEach(function (u) {
      var meta = st.unitMeta[u.i];
      if (!meta) return;
      var n = nextById[u.i];
      // Interpolate toward the next frame so a 10 Hz simulation reads smoothly.
      var x = n ? u.x + (n.x - u.x) * blend : u.x;
      var y = n ? u.y + (n.y - u.y) * blend : u.y;

      // Screen-space heading: moving +x and -y both read as "rightward" in
      // isometric, so the sprite flips on the difference of the two.
      if (n) {
        var sdx = (n.x - u.x) - (n.y - u.y);
        if (Math.abs(sdx) > 0.0004) st.facing[u.i] = sdx > 0 ? 1 : -1;
      }

      var isDef = meta.side === 'def';
      out.push({
        depth: R.depthOf(x, y, 0.5),
        paint: function () {
          R.drawDog(m, x, y, {
            color: isDef ? '#d97b5a' : (B.breeds[meta.breed] ? B.breeds[meta.breed].color : '#ccc'),
            facing: st.facing[u.i] || 1,
            phase: (i + blend) * 0.62 + u.i * 1.3,
            moving: !u.a,
            attacking: !!u.a,
            defender: isDef,
            hp: meta.maxHp ? u.h / meta.maxHp : 1
          });
        }
      });
    });
  }

  function drawEffects(m) {
    var R = KWns().render;
    var now = st.playTick;
    st.effects = st.effects.filter(function (e) { return now - e.tick < e.life; });
    st.effects.forEach(function (e) {
      var p = Math.max(0, (now - e.tick) / e.life);
      if (e.type === 'freed') {
        R.drawFreedBurst(m, e.x, e.y, p);
        R.drawFloatText(m, e.x, e.y, 'hounds freed', p, '#9fe08a');
      } else {
        R.drawDebris(m, e.x, e.y, p);
      }
    });
  }

  // ---------------------------------------------------------------- wiring

  function mount() {
    $('battleCanvas').addEventListener('click', handleDeployClick);
    $('btn-start').addEventListener('click', start);
    $('btn-speed').addEventListener('click', cycleSpeed);
    $('btn-collect').addEventListener('click', collect);
    $('btn-leave').addEventListener('click', function () {
      if (!st) return;
      if (st.phase === 'deploy') { close(); return; }
      if (st.phase === 'playing') { skipToEnd(); return; }
      collect();
    });
  }

  return { battle: { mount: mount, open: open, close: close } };
});
