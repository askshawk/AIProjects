/*
 * Broken Collars - application shell.
 *
 * Owns the live session (state + generated rival list + transient UI flags),
 * wires up the screens, and runs the once-a-second clock that settles
 * production and training.
 */
(function () {
  'use strict';

  var KW = globalThis.KW;
  var P = KW.playerState;

  var game = {
    state: null,
    targets: [],
    ui: {
      screen: 'base',
      buildMode: null,
      selectedId: null,
      moveMode: false,
      hover: null,
      scouted: {}
    },
    save: function () { P.save(game.state); },
    status: setStatus,
    refresh: refresh
  };

  var statusTimer = null;

  function setStatus(msg) {
    var el = document.getElementById('statusbar');
    document.getElementById('status').textContent = msg;
    el.classList.add('flash');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.classList.remove('flash'); }, 1400);
  }

  // Rivals are derived from the saved map seed, so they survive a reload.
  // Loot already carried off is deducted here rather than stored on the target.
  function buildTargets() {
    var level = KW.baseModel.kennelLevel(game.state.base);
    var targets = KW.aiBases.generateTargets(game.state.mapSeed, level, 6);
    var raided = game.state.raided || {};
    targets.forEach(function (t) {
      var taken = raided[t.id];
      if (!taken) return;
      t.base.loot.food = Math.max(0, t.base.loot.food - taken.food);
      t.base.loot.gold = Math.max(0, t.base.loot.gold - taken.gold);
    });
    game.targets = targets;
  }

  function refresh() {
    KW.screens.renderHud(game);
    if (game.ui.screen === 'base') KW.screens.renderBase(game);
    else if (game.ui.screen === 'army') KW.screens.renderArmy(game);
    else if (game.ui.screen === 'raid') KW.screens.renderRaid(game);
  }

  function boot() {
    var loaded = P.load();
    game.state = loaded || P.newGame();
    if (!loaded) P.save(game.state);

    P.tick(game.state);
    buildTargets();

    KW.screens.mountBase(game);
    KW.battle.mount();

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        KW.screens.setScreen(game, tab.getAttribute('data-screen'));
      });
    });

    document.getElementById('btn-refresh-map').addEventListener('click', function () {
      P.refreshMap(game.state);
      game.ui.scouted = {};
      buildTargets();
      game.save();
      setStatus('Word arrives of new rivals in the valley.');
      refresh();
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
      if (!confirm('Wipe your kennel and start over? This cannot be undone.')) return;
      P.clear();
      game.state = P.newGame();
      game.ui.selectedId = null;
      game.ui.buildMode = null;
      game.ui.scouted = {};
      P.save(game.state);
      buildTargets();
      setStatus('A new lord takes the land.');
      refresh();
    });

    if (loaded) {
      var away = Math.round((Date.now() - loaded.lastTick) / 60000);
      setStatus(away > 1
        ? 'Welcome back. Your kennel ran itself for ' + away + ' minutes.'
        : 'Welcome back, lord.');
    }

    refresh();

    var sinceSave = 0;
    setInterval(function () {
      var kennelBefore = KW.baseModel.kennelLevel(game.state.base);
      P.tick(game.state);

      // A Kennel upgrade changes which rivals are worth showing.
      if (KW.baseModel.kennelLevel(game.state.base) !== kennelBefore) buildTargets();

      refresh();
      if (++sinceSave >= 10) { sinceSave = 0; game.save(); }
    }, 1000);

    window.addEventListener('beforeunload', function () { game.save(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
