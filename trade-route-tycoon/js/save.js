// ======================================================================
// save.js — localStorage save / load of the whole game
// ----------------------------------------------------------------------
// Snapshots the mutable game state (player, every island's ownership +
// city, port markets, the ship, the rival) to localStorage and restores
// it. The SeaScene loads on boot if a save exists and auto-saves on a
// timer + after key events. Cities/queues/layouts are plain data, so they
// serialize cleanly; Phaser objects (banners, sprites) are re-synced on load.
// ======================================================================

(function () {
  const KEY = "aegean.save.v1";

  window.Save = {
    exists() { return !!localStorage.getItem(KEY); },
    clear() { localStorage.removeItem(KEY); },

    save(scene) {
      try {
        const p = scene.player;
        const data = {
          player: {
            gold: p.gold, favor: p.favor, hoplites: p.hoplites, holdCap: p.holdCap,
            speed: p.speed, windResist: p.windResist,
            upgrades: { ...p.upgrades }, standing: { ...p.standing }, cargo: { ...p.cargo },
            diplomacy: { ...p.diplomacy }, research: { ...p.research },
            questsDone: { ...p.questsDone }, questFlags: { ...p.questFlags },
          },
          islands: ISLAND_DEFS.map((i) => ({ name: i.name, owner: i.owner, garrison: i.garrison, city: i.city || null })),
          ports: scene.ports.map((pt) => ({ name: pt.name, stock: { ...pt.market.stock } })),
          ship: { x: Math.round(scene.ship.x), y: Math.round(scene.ship.y), rot: scene.ship.rotation },
          rivalGold: scene.rival ? scene.rival.gold : 240,
          routes: scene.traders ? scene.traders.map((tr) => ({ buy: tr.buyPort.name, good: tr.good, sell: tr.sellPort.name })) : [],
          t: Date.now(),
        };
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (e) { return false; }
    },

    load(scene) {
      let data;
      try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { return false; }
      if (!data) return false;

      Object.assign(scene.player, data.player);
      if (scene.ship && scene.ship.body) scene.ship.body.setMaxVelocity(scene.player.speed);

      for (const si of data.islands || []) {
        const isl = ISLAND_DEFS.find((i) => i.name === si.name);
        if (!isl) continue;
        isl.owner = si.owner;
        isl.garrison = si.garrison;
        if (si.city) isl.city = si.city;
        if (isl._banner) isl._banner.setFillStyle((FACTIONS[isl.owner] || FACTIONS.neutral).color);
      }
      for (const sp of data.ports || []) {
        const pt = scene.ports.find((x) => x.name === sp.name);
        if (pt && sp.stock) pt.market.stock = sp.stock;
      }
      if (data.ship) { scene.ship.setPosition(data.ship.x, data.ship.y); scene.ship.rotation = data.ship.rot; }
      if (scene.rival && data.rivalGold != null) scene.rival.gold = data.rivalGold;
      if (data.routes && scene.hireTrader) data.routes.forEach((r) => { try { scene.hireTrader(r.buy, r.good, r.sell, true); } catch (e) {} });
      return true;
    },
  };
})();
