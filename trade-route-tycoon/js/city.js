// ======================================================================
// city.js — the city-building half (the Grepolis layer)
// ----------------------------------------------------------------------
// An isometric city you build up: upgrade buildings (each takes time via a
// one-at-a-time queue) within population & storage caps, train hoplites and
// warships, all to fund and defend your empire. Production + queues tick on
// the SeaScene timer too, so cities grow whether you sail or manage.
// ======================================================================

// ---- Building definitions ---------------------------------------------
// base = level-1 cost. Cost to reach level L = base × 1.5^(L-1) (rounded to 5).
// max = absolute cap; a building also can't exceed the Senate's level.
// pop = population each level consumes (Farm provides population instead).
// build = base construction seconds (grows ×1.4 per level, faster at high Senate).
const BUILDINGS = {
  senate:    { name: "Senate",      icon: "🏛", role: "gate",    max: 12, pop: 6, build: 10, base: { wood: 90, stone: 90, silver: 60 }, hue: 0xe8e2d0, roof: 0xc24a3a },
  timber:    { name: "Timber Camp", icon: "🪵", produces: "wood",   rate: 0.7,  max: 15, pop: 4, build: 7,  base: { wood: 50, stone: 30, silver: 10 }, hue: 0x8a5a2c, roof: 0x5a3a1c },
  quarry:    { name: "Quarry",      icon: "⛏️", produces: "stone",  rate: 0.6,  max: 15, pop: 4, build: 7,  base: { wood: 40, stone: 30, silver: 15 }, hue: 0x9a9a9a, roof: 0x6b6b6b },
  mine:      { name: "Silver Mine", icon: "🪙", produces: "silver", rate: 0.45, max: 15, pop: 4, build: 8,  base: { wood: 50, stone: 40, silver: 15 }, hue: 0x70788a, roof: 0x4a5060 },
  farm:      { name: "Farm",        icon: "🌾", role: "pop",     max: 12, pop: 0, build: 8,  base: { wood: 60, stone: 60, silver: 20 }, hue: 0xb7c46a, roof: 0x8a6a3a },
  warehouse: { name: "Warehouse",   icon: "📦", role: "storage", max: 12, pop: 5, build: 8,  base: { wood: 50, stone: 70, silver: 20 }, hue: 0xa9743f, roof: 0x6b4a26 },
  temple:    { name: "Temple",      icon: "⛩️", produces: "favor", rate: 0.1,  max: 10, pop: 6, build: 10, base: { wood: 60, stone: 80, silver: 60 }, hue: 0xf2ecdc, roof: 0xc8a24a },
  barracks:  { name: "Barracks",    icon: "🛡️", role: "hoplite", max: 10, pop: 6, build: 10, base: { wood: 70, stone: 50, silver: 40 }, hue: 0x8a3a30, roof: 0x5a241c },
  harbor:    { name: "Harbor",      icon: "⚓", role: "warship", max: 10, pop: 6, build: 12, base: { wood: 80, stone: 70, silver: 50 }, hue: 0x4a6b8a, roof: 0x2f4a66 },
  walls:     { name: "City Walls",  icon: "🧱", role: "defense", max: 10, pop: 5, build: 9,  base: { wood: 60, stone: 100, silver: 20 }, hue: 0xb5b0a0, roof: 0x80796b },
  academy:   { name: "Academy",     icon: "🏺", role: "research", max: 5, pop: 6, build: 11, base: { wood: 80, stone: 60, silver: 70 }, hue: 0xb0a8d0, roof: 0x6a5a8a },
};
const HOPLITE = { cost: { wood: 25, stone: 15, silver: 30 }, pop: 3, time: 10 };
const WARSHIP = { cost: { wood: 80, stone: 40, silver: 120 }, pop: 8, time: 25 };

// Default building slots on the isometric grid (gx, gy). The grid is wider than
// the defaults so there's open land to drag buildings into.
const PLOTS = {
  walls: [0, 0], mine: [1, 0], quarry: [2, 0],
  timber: [0, 1], senate: [1, 1], temple: [2, 1],
  warehouse: [0, 2], farm: [1, 2], barracks: [2, 2],
  harbor: [1, 3], academy: [3, 1],
};
const GRID = { cols: 5, rows: 4 };
const defaultLayout = () => Object.fromEntries(Object.keys(PLOTS).map((k) => [k, [PLOTS[k][0], PLOTS[k][1]]]));

const round5 = (n) => Math.round(n / 5) * 5;
const bldgCost = (key, level) => {
  const m = Math.pow(1.5, level), b = BUILDINGS[key].base;
  return { wood: round5(b.wood * m), stone: round5(b.stone * m), silver: round5(b.silver * m) };
};
const buildTime = (key, level, senateLvl) =>
  Math.max(2, Math.round(BUILDINGS[key].build * Math.pow(1.4, level) * (1 - 0.04 * senateLvl)));
const costStr = (c) => {
  const p = [];
  if (c.wood) p.push(`${c.wood}🪵`);
  if (c.stone) p.push(`${c.stone}⛏️`);
  if (c.silver) p.push(`${c.silver}🪙`);
  return p.join("  ");
};

class CityScene extends Phaser.Scene {
  constructor() { super("city"); }

  create(data) {
    this.cameras.main.setZoom(DPR);            // crisp on retina, world in CSS px
    this.W = this.scale.width / DPR;
    this.H = this.scale.height / DPR;
    this.cameras.main.centerOn(this.W / 2, this.H / 2);   // worldView top-left = (0,0)
    this.sea = this.scene.get("sea");
    this.isl = ISLAND_DEFS[data.islandIndex];
    this.player = this.sea.player;
    this.city = this.sea.ensureCity(this.isl);
    this.hw = 46; this.hh = 24;                 // iso tile half-width / half-height

    this.buildBackground();
    this.computeOrigin();

    this.layout = this.city.layout || (this.city.layout = defaultLayout());
    // Backfill any building/slot a pre-existing save might be missing (e.g. Academy).
    for (const k of Object.keys(BUILDINGS)) {
      if (this.city.buildings[k] == null) this.city.buildings[k] = 0;
      if (!this.layout[k]) this.layout[k] = PLOTS[k] ? [PLOTS[k][0], PLOTS[k][1]] : [4, 3];
    }
    this.groundGfx = this.add.graphics().setDepth(1);
    this.buildGfx = this.add.graphics().setDepth(2);
    this.ghost = this.add.graphics().setDepth(6);
    this.labels = [];
    this.zones = {};
    for (const key of Object.keys(BUILDINGS)) this.addZone(key);

    // Top bar
    this.add.rectangle(0, 0, this.W, 64, 0x10221a, 0.88).setOrigin(0).setDepth(8);
    this.title = this.add.text(this.W / 2, 8, "", { fontFamily: "Georgia, serif", fontSize: "20px", color: "#f7e7b0" }).setOrigin(0.5, 0).setDepth(9);
    this.resText = this.add.text(this.W / 2, 36, "", { fontFamily: "monospace", fontSize: "14px", color: "#fdf6e3" }).setOrigin(0.5, 0).setDepth(9);
    this.queueText = this.add.text(this.W / 2, 74, "", { fontFamily: "sans-serif", fontSize: "13px", color: "#cde9d6" }).setOrigin(0.5, 0).setDepth(9);

    const back = this.add.text(this.W / 2, this.H - 34, "⛵ Return to Sea", {
      fontFamily: "sans-serif", fontSize: "15px", color: "#0b1d2a", backgroundColor: "#d4af5a", padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(9).setInteractive({ useHandCursor: true });
    back.on("pointerup", () => this.returnToSea());

    this.buildPopup();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.sea.tickAllCities(1) });
    this.renderCity();
    this.positionZones();
    this.refresh();
  }

  // ---- isometric helpers ----------------------------------------------
  iso(gx, gy) { return { x: this.origin.x + (gx - gy) * this.hw, y: this.origin.y + (gx + gy) * this.hh }; }
  computeOrigin() {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let gx = 0; gx < GRID.cols; gx++) for (let gy = 0; gy < GRID.rows; gy++) {
      const x = (gx - gy) * this.hw, y = (gx + gy) * this.hh;
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    this.origin = { x: this.W / 2 - (minx + maxx) / 2, y: 116 - miny };
  }
  // The full grid of cells (for centering + drop targets).
  cellCenter(gx, gy) { return this.iso(gx, gy); }
  nearestCell(x, y) {
    let best = null, bd = 1e9;
    for (let gx = 0; gx < GRID.cols; gx++) for (let gy = 0; gy < GRID.rows; gy++) {
      const p = this.iso(gx, gy), d = Phaser.Math.Distance.Between(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = [gx, gy]; }
    }
    return bd < this.hw ? best : null;
  }
  cellFree(cell, key) {
    for (const k of Object.keys(this.layout)) if (k !== key && this.layout[k][0] === cell[0] && this.layout[k][1] === cell[1]) return false;
    return true;
  }
  drawDiamond(g, cx, cy, hw, hh, col, alpha) {
    g.fillStyle(col, alpha == null ? 1 : alpha);
    g.beginPath(); g.moveTo(cx, cy - hh); g.lineTo(cx + hw, cy); g.lineTo(cx, cy + hh); g.lineTo(cx - hw, cy); g.closePath(); g.fillPath();
  }
  drawIsoBox(g, cx, cy, hw, hh, ht, top, left, right) {
    const ty = cy - ht;
    g.fillStyle(top, 1); g.beginPath(); g.moveTo(cx, ty - hh); g.lineTo(cx + hw, ty); g.lineTo(cx, ty + hh); g.lineTo(cx - hw, ty); g.closePath(); g.fillPath();
    g.fillStyle(left, 1); g.beginPath(); g.moveTo(cx - hw, ty); g.lineTo(cx, ty + hh); g.lineTo(cx, ty + hh + ht); g.lineTo(cx - hw, ty + ht); g.closePath(); g.fillPath();
    g.fillStyle(right, 1); g.beginPath(); g.moveTo(cx, ty + hh); g.lineTo(cx + hw, ty); g.lineTo(cx + hw, ty + ht); g.lineTo(cx, ty + hh + ht); g.closePath(); g.fillPath();
  }
  shade(col, f) {
    const c = Phaser.Display.Color.IntegerToColor(col);
    return Phaser.Display.Color.GetColor(Math.round(c.red * f), Math.round(c.green * f), Math.round(c.blue * f));
  }

  buildBackground() {
    this.add.rectangle(0, 0, this.W, this.H, 0x12557e).setOrigin(0).setDepth(0);   // sea
    this.add.ellipse(this.W / 2, this.H * 0.52, this.W * 1.15, this.H * 1.1, 0xc9a86a).setDepth(0); // sand
    this.add.ellipse(this.W / 2, this.H * 0.52, this.W * 1.0, this.H * 0.96, 0x6a994e).setDepth(0); // grass
  }

  // A draggable handle per building: tap opens its popup, drag relocates it.
  addZone(key) {
    const z = this.add.rectangle(0, 0, this.hw * 1.3, this.hh * 2.0, 0xffffff, 0.001).setDepth(7);
    z.setInteractive({ useHandCursor: true, draggable: true });
    z.on("dragstart", () => { z._ox = z.x; z._oy = z.y; });
    z.on("drag", (p, dx, dy) => { z.x = dx; z.y = dy; this.showGhost(key, dx, dy + 14); });
    z.on("dragend", () => this.finishDrag(key, z));
    this.zones[key] = z;
  }
  positionZones() {
    for (const key of Object.keys(this.zones)) {
      const [gx, gy] = this.layout[key], p = this.iso(gx, gy);
      this.zones[key].setPosition(p.x, p.y - 14);
    }
  }
  showGhost(key, x, y) {
    const cell = this.nearestCell(x, y);
    this.ghost.clear();
    if (!cell) return;
    const p = this.iso(cell[0], cell[1]);
    this.drawDiamond(this.ghost, p.x, p.y, this.hw * 0.7, this.hh * 0.7, this.cellFree(cell, key) ? 0x7fe07f : 0xe06b6b, 0.45);
  }
  finishDrag(key, z) {
    this.ghost.clear();
    const moved = Phaser.Math.Distance.Between(z.x, z.y, z._ox, z._oy);
    if (moved < 12) { this.positionZones(); this.openPopup(key); return; }   // a tap, not a drag
    const cell = this.nearestCell(z.x, z.y + 14);
    if (cell && this.cellFree(cell, key)) this.layout[key] = cell;
    this.positionZones(); this.renderCity();
  }

  // ---- render the city (only when something changes) ------------------
  renderCity() {
    this.groundGfx.clear();
    this.buildGfx.clear();
    this.labels.forEach((l) => l.destroy());
    this.labels = [];

    // full grid of ground tiles — also the drop targets when moving buildings
    for (let gx = 0; gx < GRID.cols; gx++) for (let gy = 0; gy < GRID.rows; gy++) {
      const p = this.iso(gx, gy);
      this.drawDiamond(this.groundGfx, p.x, p.y, this.hw * 0.96, this.hh * 0.96, 0x5f8a47);
      this.drawDiamond(this.groundGfx, p.x, p.y, this.hw * 0.8, this.hh * 0.8, 0x6fa055, 0.55);
    }

    // buildings, back-to-front by their current layout cell
    const order = Object.keys(this.layout).sort((a, b) => (this.layout[a][0] + this.layout[a][1]) - (this.layout[b][0] + this.layout[b][1]));
    for (const key of order) {
      const [gx, gy] = this.layout[key];
      const p = this.iso(gx, gy);
      const lvl = this.city.buildings[key];
      const b = BUILDINGS[key];
      if (lvl <= 0) {
        // empty plot marker
        this.drawDiamond(this.buildGfx, p.x, p.y, this.hw * 0.5, this.hh * 0.5, 0x4a6b3a, 0.5);
        const t = this.add.text(p.x, p.y - 6, "+", { fontFamily: "sans-serif", fontSize: "20px", color: "#dfeecf" }).setOrigin(0.5).setDepth(3);
        this.labels.push(t);
      } else {
        const ht = 16 + lvl * 5;
        this.drawDiamond(this.buildGfx, p.x, p.y + 2, this.hw * 0.8, this.hh * 0.8, 0x4a4036, 0.5); // shadow
        this.drawIsoBox(this.buildGfx, p.x, p.y, this.hw * 0.62, this.hh * 0.62, ht, b.hue, this.shade(b.hue, 0.7), this.shade(b.hue, 0.85));
        // roof cap
        this.drawDiamond(this.buildGfx, p.x, p.y - ht - 6, this.hw * 0.66, this.hh * 0.66, b.roof);
      }
      const icon = this.add.text(p.x, p.y - (lvl > 0 ? 30 + lvl * 5 : 22), b.icon, { fontSize: "18px" }).setOrigin(0.5).setDepth(4);
      const tag = this.add.text(p.x, p.y + this.hh + 4, `${b.name} ${lvl > 0 ? "Lv " + lvl : ""}`, {
        fontFamily: "sans-serif", fontSize: "11px", color: "#fdf6e3", backgroundColor: "rgba(10,20,14,0.55)", padding: { x: 4, y: 1 },
      }).setOrigin(0.5, 0).setDepth(4);
      this.labels.push(icon, tag);
    }
    this._sig = this.signature();
  }
  signature() { return Object.values(this.city.buildings).join(",") + "|" + (this.city.buildQueue ? this.city.buildQueue.key : "-"); }

  // ---- gameplay helpers ----------------------------------------------
  maxLevelFor(key) {
    const b = BUILDINGS[key];
    return key === "senate" ? b.max : Math.min(b.max, this.city.buildings.senate);
  }
  popUsed() {
    let p = (this.city.warships || 0) * WARSHIP.pop;
    for (const k of Object.keys(BUILDINGS)) p += BUILDINGS[k].pop * this.city.buildings[k];
    return p;
  }
  popCap() { return 60 + 25 * this.city.buildings.farm; }
  storageCap() { return 250 + 200 * this.city.buildings.warehouse; }
  canAfford(c) { return this.city.wood >= c.wood && this.city.stone >= c.stone && this.city.silver >= c.silver; }
  spend(c) { this.city.wood -= c.wood; this.city.stone -= c.stone; this.city.silver -= c.silver; }
  effBuildTime(key, lvl) {   // Engineering research speeds builds
    let t = buildTime(key, lvl, this.city.buildings.senate);
    if (this.player.research && this.player.research.engineering) t = Math.max(2, Math.round(t * 0.8));
    return t;
  }
  unitCost(type) {           // Shipwrights research cuts unit cost
    const u = type === "warship" ? WARSHIP : HOPLITE;
    if (this.player.research && this.player.research.shipwrights)
      return { wood: round5(u.cost.wood * 0.8), stone: round5(u.cost.stone * 0.8), silver: round5(u.cost.silver * 0.8) };
    return u.cost;
  }

  upgrade(key) {
    if (this.city.buildQueue) return this.toast("A build is already underway");
    const lvl = this.city.buildings[key];
    if (lvl >= this.maxLevelFor(key)) return this.toast(lvl >= BUILDINGS[key].max ? "Max level" : "Raise the Senate first");
    const cost = bldgCost(key, lvl);
    if (!this.canAfford(cost)) return this.toast("Not enough resources");
    if (this.popUsed() + BUILDINGS[key].pop > this.popCap()) return this.toast("Not enough population — upgrade the Farm");
    this.spend(cost);
    const t = this.effBuildTime(key, lvl);
    this.city.buildQueue = { key, total: t, left: t };
    this.closePopup(); this.refresh();
  }
  train(type) {
    if (this.city.recruitQueue) return this.toast("Already recruiting");
    const u = type === "warship" ? WARSHIP : HOPLITE;
    const need = type === "warship" ? "harbor" : "barracks";
    if (this.city.buildings[need] < 1) return this.toast(`Build the ${BUILDINGS[need].name} first`);
    const cost = this.unitCost(type);
    if (!this.canAfford(cost)) return this.toast("Not enough resources");
    if (type === "warship" && this.popUsed() + u.pop > this.popCap()) return this.toast("Not enough population");
    this.spend(cost);
    this.city.recruitQueue = { type, total: u.time, left: u.time };
    this.closePopup(); this.refresh();
  }

  // ---- popup ----------------------------------------------------------
  buildPopup() {
    this.popup = this.add.container(0, 0).setDepth(20).setVisible(false);
    this.popBg = this.add.rectangle(0, 0, 320, 200, 0x132431, 0.97).setStrokeStyle(1, 0xd4af5a).setOrigin(0.5);
    this.popTitle = this.add.text(0, -78, "", { fontFamily: "Georgia, serif", fontSize: "17px", color: "#f2c14e" }).setOrigin(0.5);
    this.popBody = this.add.text(0, -30, "", { fontFamily: "sans-serif", fontSize: "13px", color: "#dfeaf2", align: "center", lineSpacing: 4 }).setOrigin(0.5);
    this.popBtnA = this.add.text(0, 44, "", { fontFamily: "sans-serif", fontSize: "13px", color: "#0b1d2a", backgroundColor: "#d4af5a", padding: { x: 10, y: 6 }, align: "center" }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.popBtnB = this.add.text(0, 78, "", { fontFamily: "sans-serif", fontSize: "13px", color: "#0b1d2a", backgroundColor: "#8ecae6", padding: { x: 10, y: 6 }, align: "center" }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.popClose = this.add.text(146, -88, "✕", { fontFamily: "sans-serif", fontSize: "16px", color: "#9fc3dd" }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.popClose.on("pointerup", () => this.closePopup());
    this.popup.add([this.popBg, this.popTitle, this.popBody, this.popBtnA, this.popBtnB, this.popClose]);
  }
  openPopup(key) {
    this.popKey = key;
    this.popup.setPosition(this.W / 2, this.H / 2 - 10).setVisible(true);
    this.refreshPopup();
  }
  closePopup() { this.popKey = null; this.popup.setVisible(false); }
  refreshPopup() {
    if (!this.popKey) return;
    const key = this.popKey, b = BUILDINGS[key], lvl = this.city.buildings[key];
    this.popTitle.setText(`${b.icon} ${b.name}  ·  Lv ${lvl}`);
    const lines = [];
    if (b.produces) { const mult = 1 + 0.05 * this.city.buildings.senate;
      lines.push(`Produces +${Math.round(b.rate * Math.max(lvl, 1) * (b.produces === "favor" ? 1 : mult) * 60)} ${b.produces}/min at Lv ${Math.max(lvl, 1)}`); }
    if (b.role === "pop") lines.push(`Population cap: ${this.popCap()}`);
    if (b.role === "storage") lines.push(`Storage cap: ${this.storageCap()}`);
    if (b.role === "gate") lines.push(`Gates the max level of every other building`);
    if (b.role === "defense") lines.push(`Adds ${lvl * (this.player.research && this.player.research.masonry ? 12 : 8)} to this island's defense`);
    if (b.role === "research") lines.push(`Unlocks research up to tier ${lvl} — open the 🔬 Research menu`);
    this.popBody.setText(lines.join("\n"));

    // Button A = upgrade/build
    const maxed = lvl >= this.maxLevelFor(key);
    const cost = bldgCost(key, lvl);
    const t = this.effBuildTime(key, lvl);
    const can = !maxed && this.canAfford(cost) && !this.city.buildQueue && this.popUsed() + b.pop <= this.popCap();
    this.popBtnA.setText(maxed ? "Max level" : `${lvl < 1 ? "Build" : "Upgrade"} → Lv ${lvl + 1}\n${costStr(cost)} · ${t}s`)
      .setBackgroundColor(can ? "#d4af5a" : "#5e574b").setColor(can ? "#0b1d2a" : "#cdbfae");
    this.popBtnA.removeAllListeners("pointerup");
    if (can) this.popBtnA.on("pointerup", () => this.upgrade(key));

    // Button B = recruit (barracks/harbor only)
    if (key === "barracks" || key === "harbor") {
      const type = key === "barracks" ? "hoplite" : "warship";
      const u = key === "barracks" ? HOPLITE : WARSHIP;
      const ucost = this.unitCost(type);
      const ok = lvl >= 1 && this.canAfford(ucost) && !this.city.recruitQueue && (type === "hoplite" || this.popUsed() + u.pop <= this.popCap());
      this.popBtnB.setVisible(true).setText(`Train ${type === "hoplite" ? "Hoplite 🛡️" : "Warship ⚓"}\n${costStr(ucost)} · ${u.time}s`)
        .setBackgroundColor(ok ? "#8ecae6" : "#5e574b").setColor(ok ? "#0b1d2a" : "#cdbfae");
      this.popBtnB.removeAllListeners("pointerup");
      if (ok) this.popBtnB.on("pointerup", () => this.train(type));
    } else this.popBtnB.setVisible(false);
  }

  // ---- per-frame --------------------------------------------------------
  refresh() {
    this.title.setText(`🏛 ${this.isl.name} — Your Polis`);
    const cap = this.storageCap();
    this.resText.setText(
      `🪵 ${Math.floor(this.city.wood)}/${cap}   ⛏️ ${Math.floor(this.city.stone)}/${cap}   🪙 ${Math.floor(this.city.silver)}/${cap}   ⚱ ${this.player.favor}   👥 ${this.popUsed()}/${this.popCap()}   🛡️ ${this.player.hoplites}   ⚓ ${this.city.warships || 0}`
    );
    const q = [];
    if (this.city.buildQueue) q.push(`🔨 ${BUILDINGS[this.city.buildQueue.key].name} — ${Math.ceil(this.city.buildQueue.left)}s`);
    if (this.city.recruitQueue) q.push(`${this.city.recruitQueue.type === "warship" ? "⚓" : "🛡️"} ${this.city.recruitQueue.type} — ${Math.ceil(this.city.recruitQueue.left)}s`);
    this.queueText.setText(q.join("      ") || "No construction underway");
    if (this.signature() !== this._sig) this.renderCity();
    if (this.popKey) this.refreshPopup();
  }
  toast(msg) {
    if (this._t) this._t.destroy();
    this._t = this.add.text(this.W / 2, this.H - 70, msg, {
      fontFamily: "sans-serif", fontSize: "13px", color: "#ffe0a8", backgroundColor: "rgba(20,12,4,0.8)", padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(21);
    this.time.delayedCall(1300, () => { if (this._t) { this._t.destroy(); this._t = null; } });
  }
  update() { this.refresh(); }

  returnToSea() {
    document.body.classList.remove("in-city");
    if (window.Save) Save.save(this.sea);
    this.scene.resume("sea");
    this.scene.stop("city");
  }
}

window.CityScene = CityScene;
window.BUILDINGS = BUILDINGS;
