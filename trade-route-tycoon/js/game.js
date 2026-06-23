// ======================================================================
// game.js — Aegean Trader (Greek/Roman trading game)
// ----------------------------------------------------------------------
// A Grepolis-flavored merchant sim set in the classical Mediterranean.
// Systems: animated WebGL ocean, day/night, wind, storms (Poseidon's mood)
// with Zeus's lightning, a rival Phoenician trader you compete against,
// ship upgrades bought at a city's shipyard, and an Oracle (LLM) advisor.
//
// Economy + pathfinding live in economy.js / pathfinding.js.
// ======================================================================

const WORLD = { width: 7200, height: 5200 };
const SHIP = { turnRate: 2.4 };
const LOT = 5;
const DAY_LENGTH = 130;   // seconds for a full day/night cycle

// Factions of the Middle Sea (Grepolis-style allegiances).
const FACTIONS = {
  player:   { name: "Your Polis",           color: 0xf2c14e },  // islands you own
  delian:   { name: "Delian League",        color: 0x4f9ad6 },  // Athens-led
  pelop:    { name: "Peloponnesian League", color: 0xc0392b },  // Sparta-led
  carthage: { name: "Carthage",             color: 0x8e44ad },  // Hanno's people
  free:     { name: "Free City",            color: 0xc9a86a },
  neutral:  { name: "Unclaimed",            color: 0x8a8f98 },
};

const SIEGE_TIME = 15;   // seconds for a siege to resolve
const FOUND_COST = { gold: 250, favor: 8 };   // colonize an empty island
const WIN_CITIES = 6;    // own this many islands → hegemony victory

// Research (unlocked by the Academy building; effects are global to your empire).
const TECHS = {
  engineering: { name: "Engineering",   icon: "📐", tier: 1, cost: { gold: 220, favor: 5 },  desc: "−20% build time" },
  agriculture: { name: "Agriculture",   icon: "🌿", tier: 1, cost: { gold: 220, favor: 5 },  desc: "+15% resource output" },
  phalanx:     { name: "Phalanx Drill", icon: "🛡️", tier: 2, cost: { gold: 360, favor: 8 },  desc: "+25% army strength" },
  shipwrights: { name: "Shipwrights",   icon: "⚓", tier: 2, cost: { gold: 360, favor: 8 },  desc: "−20% unit cost" },
  masonry:     { name: "Masonry",       icon: "🧱", tier: 3, cost: { gold: 520, favor: 12 }, desc: "City Walls +50% defense" },
};

// Starter quests that teach the loop.
const QUESTS = [
  { id: "trade",   name: "First Trade",       desc: "Sell any good at a city", reward: { gold: 100 } },
  { id: "favor",   name: "Favor of the Gods", desc: "Reach 15 Favor",          reward: { gold: 150 } },
  { id: "army",    name: "Raise an Army",     desc: "Field 40 hoplites",       reward: { gold: 200 } },
  { id: "expand",  name: "Expand the Realm",  desc: "Own a second city",       reward: { gold: 300 } },
  { id: "academy", name: "Seat of Learning",  desc: "Build an Academy",        reward: { favor: 12 } },
  { id: "siege",   name: "Conqueror",         desc: "Win a siege or defense",  reward: { gold: 400 } },
];

// Greek/Roman city-states. Each produces some goods (cheap) and wants others.
const PORT_DEFS = [
  { name: "Athenai",     x: 760,  y: 4380, color: 0xf2c14e, landmark: "temple", faction: "delian", produces: ["Pottery", "Olive Oil"], demands: ["Grain", "Marble"] },
  { name: "Sparta",      x: 820,  y: 820,  color: 0xc24a3a, landmark: "temple", faction: "pelop",  produces: ["Grain"], demands: ["Wine", "Pottery"] },
  { name: "Korinthos",   x: 3600, y: 540,  color: 0xb5e48c, landmark: "temple", faction: "delian", produces: ["Wine"], demands: ["Olive Oil", "Tyrian Purple"] },
  { name: "Rhodos",      x: 6480, y: 940,  color: 0x8ecae6, landmark: "temple", faction: "free",   produces: ["Marble"], demands: ["Grain", "Wine"] },
  { name: "Syrakousai",  x: 6300, y: 4480, color: 0xcdb4db, landmark: "temple", faction: "pelop",  produces: ["Grain", "Wine"], demands: ["Pottery", "Marble"] },
  { name: "Alexandreia", x: 3720, y: 4720, color: 0xffd27a, landmark: "pharos", faction: "free",   produces: ["Tyrian Purple"], demands: ["Olive Oil", "Grain"] },
];

// Islands carry a name, an owner faction, and a garrison (foundations for the
// future siege + city-building layer — see the roadmap).
const ISLAND_DEFS = [
  { x: 1700, y: 3200, r: 110, name: "Melos",   owner: "player",  garrison: 30 },
  { x: 3500, y: 2400, r: 170, name: "Naxos",   owner: "delian",  garrison: 40 },
  { x: 2300, y: 1500, r: 125, name: "Delos",   owner: "free",    garrison: 20 },
  { x: 5000, y: 3500, r: 140, name: "Thera",   owner: "pelop",   garrison: 35 },
  { x: 5400, y: 1900, r: 115, name: "Ikaria",  owner: "free",    garrison: 18 },
  { x: 4600, y: 1150, r: 95,  name: "Kythera", owner: "pelop",   garrison: 12 },
  // Unclaimed islands — empty land you can found a city on.
  { x: 2700, y: 3700, r: 105, name: "Paros",   owner: "neutral", garrison: 0 },
  { x: 4300, y: 3900, r: 120, name: "Skyros",  owner: "neutral", garrison: 0 },
  { x: 5800, y: 2900, r: 100, name: "Lemnos",  owner: "neutral", garrison: 0 },
  { x: 2500, y: 2300, r: 110, name: "Andros",  owner: "neutral", garrison: 0 },
  { x: 6100, y: 3500, r: 95,  name: "Samos",   owner: "neutral", garrison: 0 },
];

// Ship upgrades, bought with gold at any city's shipyard.
const UPGRADES = {
  hold: { name: "Cargo Hold", icon: "📦", desc: "+10 capacity",      base: 150, max: 4 },
  sail: { name: "Sails",      icon: "⛵", desc: "+18 speed",          base: 200, max: 4 },
  hull: { name: "Oak Hull",   icon: "🛡", desc: "+storm resistance",  base: 250, max: 4 },
};

// Divine powers bought with Favor (Grepolis-style). Effects reuse existing systems.
const POWERS = {
  poseidon: { god: "Poseidon", icon: "🔱", label: "Calm the Seas", cost: 8 },
  zeus:     { god: "Zeus",     icon: "⚡", label: "Thunderbolt",   cost: 6 },
  hermes:   { god: "Hermes",   icon: "☤", label: "Blessing (+25% sales)", cost: 10 },
  athena:   { god: "Athena",   icon: "🦉", label: "Oracle's Wisdom", cost: 5 },
  ares:     { god: "Ares",     icon: "⚔", label: "Rally the Defenders", cost: 15 },
};
const upgradeCost = (type, tier) => UPGRADES[type].base * (tier + 1);

// ----------------------------------------------------------------------
// Ocean shader. fbm waves → surface normal → sun glints; deep→shallow
// Aegean color gradient; foam in the crests; uDay tints day/night; uStorm
// raises the swell, greys the water, and thickens the foam during storms.
// ----------------------------------------------------------------------
const OCEAN_FRAG = `
precision mediump float;
uniform float uTime;
uniform vec2  uScroll;
uniform float uDay;
uniform float uStorm;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float v=0.0, a=0.5; for (int i=0;i<4;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }

void main(){
  vec2 world = gl_FragCoord.xy + vec2(uScroll.x, -uScroll.y);
  vec2 uv = world / 120.0;
  float t = uTime * (0.55 + uStorm * 0.5);
  vec2 flow = vec2(t * 0.25, -t * 0.18);
  float amp = 1.0 + uStorm * 1.6;

  float e = 0.05;
  float h  = fbm(uv + flow) * amp;
  float hx = (fbm(uv + vec2(e,0.0) + flow) - fbm(uv - vec2(e,0.0) + flow)) * amp;
  float hy = (fbm(uv + vec2(0.0,e) + flow) - fbm(uv - vec2(0.0,e) + flow)) * amp;
  float swell = (sin(uv.x*0.9 + t*1.1) * 0.5 + sin(uv.y*1.1 - t*0.8) * 0.5) * amp;
  vec3 n = normalize(vec3(-hx - 0.02*swell, -hy, 0.32));

  vec3 deep    = mix(vec3(0.02, 0.22, 0.36), vec3(0.05, 0.11, 0.13), uStorm);
  vec3 shallow = mix(vec3(0.11, 0.58, 0.62), vec3(0.22, 0.32, 0.33), uStorm);
  float crest = clamp(h * 0.6 + swell * 0.15 + 0.4, 0.0, 1.0);
  vec3 col = mix(deep, shallow, crest);

  vec3 lightDir = normalize(vec3(0.45, 0.35 + 0.4*uDay, 0.8));
  float spec = pow(max(dot(n, lightDir), 0.0), 30.0);
  vec3 glint = mix(vec3(0.5,0.6,0.9), vec3(1.0,0.93,0.75), uDay);
  col += spec * glint * (0.35 + 0.65*uDay) * (1.0 - 0.5*uStorm);

  float foamThresh = mix(0.74, 0.55, uStorm);
  float foam = smoothstep(foamThresh, foamThresh + 0.18, fbm(uv * 1.7 + vec2(-t*0.4, t*0.12)));
  col = mix(col, vec3(0.86, 0.93, 0.97), foam * (0.45 + 0.4*uStorm));

  vec3 night = vec3(0.02, 0.05, 0.13);
  col = mix(night, col, 0.30 + 0.70 * uDay);
  col *= (1.0 - 0.30 * uStorm);
  gl_FragColor = vec4(col, 1.0);
}
`;

class SeaScene extends Phaser.Scene {
  constructor() { super("sea"); }

  preload() {
    this.makeDotTexture();
    this.makeRainTexture();
  }

  create() {
    const W = this.scale.width, H = this.scale.height;

    this.buildOcean(W, H);

    this.grid = new Grid(WORLD.width, WORLD.height, 110);   // coarse grid → snappy A* on the big map
    this.islandGroup = this.physics.add.staticGroup();
    this.pharosLights = [];
    for (const isl of ISLAND_DEFS) { this.buildIsland(isl); this.grid.blockCircle(isl.x, isl.y, isl.r); }
    this.ports = PORT_DEFS.map((p) => this.buildPort(p));

    // --- Player state ---
    this.player = {
      gold: 240, cargo: {}, holdCap: 30, speed: 150, windResist: 0,
      favor: 0, hoplites: 25, standing: { delian: 0, pelop: 0, carthage: 0 },
      upgrades: { hold: 0, sail: 0, hull: 0 },
      diplomacy: { delian: "neutral", pelop: "neutral", carthage: "neutral" },
      research: {}, questsDone: {}, questFlags: {},
    };
    this.traders = [];
    for (const g of GOODS) this.player.cargo[g] = 0;
    this.siege = null;
    // Give your starting island a working city so it produces from turn one.
    ISLAND_DEFS.forEach((isl) => { if (isl.owner === "player") this.ensureCity(isl); });

    this.buildShip(2150, 3250);   // open water near your home island, Melos
    this.buildRival();
    // Hard collision so the ship cannot cross islands — it stops at the beach.
    this.physics.add.collider(this.ship, this.islandGroup);

    // --- Wake + bow spray ---
    this.wake = this.add.particles(0, 0, "dot", {
      speed: 0, lifespan: 700, frequency: 60,
      scale: { start: 0.7, end: 0 }, alpha: { start: 0.4, end: 0 }, tint: 0xffffff,
    }).setDepth(3);
    this.wake.startFollow(this.ship);
    this.spray = this.add.particles(0, 0, "dot", {
      lifespan: 450, speed: { min: 20, max: 70 }, scale: { start: 0.5, end: 0 },
      alpha: { start: 0.6, end: 0 }, tint: 0xeaf6ff, emitting: false,
    }).setDepth(7);

    // --- Camera + bounds ---
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.ship, true, 0.08, 0.08);
    this.cameras.main.setZoom(DPR);   // keep world in CSS px while rendering at device px
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.ship.body.setCollideWorldBounds(true);

    // --- Weather overlays (rain, storm dimming, lightning) ---
    this.rainZone = new Phaser.Geom.Rectangle(0, -30, W, 12);
    this.rainEmitter = this.add.particles(0, 0, "rain", {
      emitZone: { type: "random", source: this.rainZone },
      lifespan: 1000, speedY: { min: 650, max: 880 }, speedX: { min: -150, max: -80 },
      alpha: { start: 0.5, end: 0.12 }, quantity: 2, frequency: 30,
    }).setScrollFactor(0).setDepth(800);
    this.rainEmitter.stop();
    this.stormOverlay = this.add.rectangle(0, 0, W, H, 0x2a3038).setOrigin(0).setScrollFactor(0).setDepth(850).setAlpha(0);
    this.nightOverlay = this.add.rectangle(0, 0, W, H, 0x0a1430).setOrigin(0).setScrollFactor(0).setDepth(860).setAlpha(0);
    this.lightningFlash = this.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0).setScrollFactor(0).setDepth(950).setAlpha(0);
    this.boltGfx = this.add.graphics().setScrollFactor(0).setDepth(951);

    // --- Input ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");
    this.pathGfx = this.add.graphics().setDepth(3);
    this.route = [];
    this.input.on("pointerdown", (p) => {
      if (p.worldX == null) return;
      // Click an island → inspect it; click open sea → auto-sail there.
      const isl = ISLAND_DEFS.find((i) => Phaser.Math.Distance.Between(p.worldX, p.worldY, i.x, i.y) < i.r);
      if (isl) this.openIsland(isl); else this.planRoute(p.worldX, p.worldY);
    });

    // --- Atmosphere/economy state ---
    this.wind = { angle: Phaser.Math.FloatBetween(0, Math.PI * 2), speed: 0.5 };
    this.dayPhase = 0.18;
    this.weather = { intensity: 0, target: 0 };
    this.stormActive = false;
    this.blessing = 1;

    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.ports.forEach((p) => p.market.tick()) });
    // Your cities produce resources while you sail.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickAllCities(1) });
    // Factions push back: a grace period, then periodic counter-sieges.
    this.time.delayedCall(120000, () => {
      this.maybeCounterSiege();
      this.time.addEvent({ delay: 80000, loop: true, callback: () => this.maybeCounterSiege() });
    });
    // Rival empires expand on their own — colonies, reinforcements, conquests.
    this.time.addEvent({ delay: 55000, loop: true, callback: () => this.factionTurn() });
    this.time.addEvent({ delay: 8000, loop: true, callback: () => {
      this.wind.angle += Phaser.Math.FloatBetween(-0.4, 0.4);
      this.wind.speed = Phaser.Math.Clamp(this.wind.speed + Phaser.Math.FloatBetween(-0.15, 0.15), 0.2, 0.85);
    }});
    // Poseidon's mood: a new weather target every ~75s, heavily skewed to calm.
    this.time.addEvent({ delay: 75000, loop: true, callback: () => {
      const r = Math.random();
      this.weather.target = Math.pow(r, 3);  // storms rare
    }});
    // Hermes' blessing: periodic +25% sale prices.
    this.time.addEvent({ delay: Phaser.Math.Between(45000, 70000), loop: true, callback: () => this.grantBlessing() });

    // --- Overlays + HTML UI ---
    this.siegeGfx = this.add.graphics().setDepth(5);     // your offensive siege ring
    this.incomingGfx = this.add.graphics().setDepth(5);  // enemy counter-siege ring
    this.incoming = null;
    this.currentPort = null;
    this.bindUI();
    const mm = document.getElementById("minimap");
    this.minimapCtx = mm.getContext("2d");
    mm.style.cursor = "crosshair";
    mm.title = "Click to set a course";
    mm.addEventListener("click", (e) => {
      const r = mm.getBoundingClientRect();
      this.planRoute((e.clientX - r.left) / r.width * WORLD.width, (e.clientY - r.top) / r.height * WORLD.height);
    });
    this.scale.on("resize", (s) => this.onResize(s.width, s.height));
    this.time.delayedCall(700, () => this.showEvent(
      "⚓ Welcome, Navarch! Trade between the poleis, win the gods' Favor, and grow your empire from Melos."));

    // Persistence: restore a save if present, then auto-save periodically.
    if (window.Save && Save.exists()) Save.load(this);
    this.time.addEvent({ delay: 12000, loop: true, callback: () => window.Save && Save.save(this) });
    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.checkQuestsAndWin() });
  }

  onResize(w, h) {
    if (this.water && this.water.setSize) this.water.setSize(w, h);
    if (this.waterFallback) this.waterFallback.setSize(w, h);
    [this.stormOverlay, this.nightOverlay, this.lightningFlash].forEach((o) => o && o.setSize(w, h));
    if (this.rainZone) this.rainZone.width = w;
  }

  update(_time, delta) {
    const dt = delta / 1000;
    const t = this.time.now / 1000;
    const left  = this.cursors.left.isDown  || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const fwd   = this.cursors.up.isDown    || this.keys.W.isDown;
    const back  = this.cursors.down.isDown  || this.keys.S.isDown;

    if (left || right || fwd || back) this.route = [];
    if (this.route.length) {
      this.followRoute(dt);
    } else {
      if (left)  this.ship.rotation -= SHIP.turnRate * dt;
      if (right) this.ship.rotation += SHIP.turnRate * dt;
      const heading = this.ship.rotation - Math.PI / 2;
      if (fwd)  this.physics.velocityFromRotation(heading, this.player.speed, this.ship.body.velocity);
      if (back) this.physics.velocityFromRotation(heading, -this.player.speed * 0.4, this.ship.body.velocity);
      if (!fwd && !back) this.ship.body.velocity.scale(0.96);
    }

    // Wind + storm push (the hull upgrade dampens it) — only while sailing manually,
    // so the autopilot can hold its course through a gale.
    if (!this.route.length) {
      const gust = this.wind.speed + this.weather.intensity * 1.6;
      const push = gust * 9 * (1 - this.player.windResist) * dt;
      this.ship.body.velocity.x += Math.cos(this.wind.angle) * push;
      this.ship.body.velocity.y += Math.sin(this.wind.angle) * push;
    }

    this.updateWeather(dt, t);
    this.updateDayNight(dt, t);
    this.updateShipVisuals(t);
    this.updateSiege(dt);
    this.updateIncoming(dt);
    try { this.updateRival(dt, t); } catch (e) { /* keep the loop alive */ }
    try { this.updateTraders(dt, t); } catch (e) { /* keep the loop alive */ }

    // Bow spray at speed.
    if (this.ship.body.speed > 90 && Math.random() < 0.6) {
      const bow = this.ship.rotation - Math.PI / 2;
      this.spray.emitParticleAt(this.ship.x + Math.cos(bow) * 22, this.ship.y + Math.sin(bow) * 22, 1);
    }

    const near = this.nearestPortInRange();
    if (near !== this.currentPort) { this.currentPort = near; if (near) this.openMarket(near); else this.closeMarket(); }

    this.updateHud(near);
    this.updateWindIndicator();
    if ((this.tickCount = (this.tickCount || 0) + 1) % 4 === 0) this.drawMinimap();
  }

  // ---------------------------------------------------------------------
  // Weather / day-night
  // ---------------------------------------------------------------------
  updateWeather(dt, t) {
    const w = this.weather;
    w.intensity = Phaser.Math.Linear(w.intensity, w.target, dt * 0.12);
    const storm = Phaser.Math.Clamp((w.intensity - 0.3) / 0.7, 0, 1); // 0..1 storminess
    if (this.water && this.water.setUniform) this.water.setUniform("uStorm.value", storm);
    this.stormOverlay.setAlpha(storm * 0.4);

    // Rain
    if (w.intensity > 0.22) {
      if (!this.rainEmitter.emitting) this.rainEmitter.start();
      this.rainEmitter.setFrequency(storm > 0.4 ? 12 : 38, storm > 0.4 ? 4 : 2);
    } else if (this.rainEmitter.emitting) {
      this.rainEmitter.stop();
    }

    // Storm onset banner (Poseidon)
    const isStorm = storm > 0.45;
    if (isStorm && !this.stormActive) this.showEvent("🔱 Poseidon's wrath — a tempest rises!");
    this.stormActive = isStorm;

    // Zeus's lightning during storms
    if (isStorm && Math.random() < 0.012) this.strikeLightning();
  }

  updateDayNight(dt, t) {
    this.dayPhase = (this.dayPhase + dt / DAY_LENGTH) % 1;
    const sun = Math.max(0, Math.sin(this.dayPhase * Math.PI * 2));
    if (this.water && this.water.setUniform) {
      this.water.setUniform("uTime.value", t);
      this.water.setUniform("uScroll.value.x", this.cameras.main.scrollX);
      this.water.setUniform("uScroll.value.y", this.cameras.main.scrollY);
      this.water.setUniform("uDay.value", sun);
    }
    this.nightOverlay.setAlpha((1 - sun) * 0.5);
    // Pharos lighthouse glows brighter at night.
    for (const l of this.pharosLights) { l.halo.setAlpha(0.25 + (1 - sun) * 0.5); l.core.setAlpha(0.7 + (1 - sun) * 0.3); }
    this.sun = sun;
  }

  strikeLightning() {
    this.lightningFlash.setAlpha(0.55);
    this.tweens.add({ targets: this.lightningFlash, alpha: 0, duration: 220 });
    const x = Phaser.Math.Between(40, this.scale.width - 40);
    const g = this.boltGfx.clear().lineStyle(2.5, 0xffffff, 0.95).beginPath();
    let cx = x, cy = 0;
    g.moveTo(cx, cy);
    while (cy < this.scale.height * 0.6) { cy += Phaser.Math.Between(20, 50); cx += Phaser.Math.Between(-30, 30); g.lineTo(cx, cy); }
    g.strokePath();
    this.tweens.add({ targets: this.boltGfx, alpha: 0, duration: 260, onComplete: () => { this.boltGfx.clear().setAlpha(1); } });
  }

  grantBlessing() {
    this.blessing = 1.25;
    this.showEvent("☤ Hermes blesses your trade — sale prices +25% for a time!");
    this.time.delayedCall(13000, () => { this.blessing = 1; });
  }

  // ---------------------------------------------------------------------
  // Ship visuals (player)
  // ---------------------------------------------------------------------
  updateShipVisuals(t) {
    this.shipVis.y = Math.sin(t * 2.2) * 1.6 + this.weather.intensity * Math.sin(t * 5) * 1.5;
    this.shipVis.rotation = Math.sin(t * 1.6) * 0.04 + this.weather.intensity * Math.sin(t * 4) * 0.05;
    const windAlign = Math.cos(this.wind.angle - (this.ship.rotation - Math.PI / 2));
    this.sail.scaleX = (0.85 + 0.15 * Math.sin(t * 3)) * (0.7 + 0.3 * Phaser.Math.Clamp(windAlign, -1, 1));
    this.flag.scaleX = 0.5 + 0.5 * Math.sin(t * 7);
  }

  // ---------------------------------------------------------------------
  // Rival Phoenician trader
  // ---------------------------------------------------------------------
  buildRival() {
    const start = this.ports[3]; // Rhodos
    const c = this.add.container(start.x, start.y - 160).setDepth(6);
    c.add(this.add.ellipse(3, 6, 30, 46, 0x001018, 0.28));
    const parts = this.makeGalley(0x4a3550, 0x6a5070, 0x7b3f8f, 0xe0c060, false, true);
    c.add(parts.vis);
    this.rivalLabel = this.add.text(start.x, start.y - 190, "Hanno of Carthage", {
      fontFamily: "sans-serif", fontSize: "12px", color: "#e8c9f0",
      backgroundColor: "rgba(40,20,50,0.6)", padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth(7);
    this.rival = { ship: c, sail: parts.sail, flag: parts.flag, gold: 240, cargoQty: 0, good: null,
      state: "choosing", route: [], speed: 110, buyPort: null, sellPort: null };
  }

  updateRival(dt, t) {
    const r = this.rival;
    r.sail.scaleX = 0.85 + 0.15 * Math.sin(t * 3 + 1);
    r.flag.scaleX = 0.5 + 0.5 * Math.sin(t * 7 + 1);
    r.ship.list[1].y = Math.sin(t * 2.2 + 1) * 1.4;          // bob the visual sub-container
    this.rivalLabel.setPosition(r.ship.x, r.ship.y - 34);

    if (r.route.length) {
      const wp = r.route[0];
      const ang = Phaser.Math.Angle.Between(r.ship.x, r.ship.y, wp.x, wp.y);
      r.ship.rotation = Phaser.Math.Angle.RotateTo(r.ship.rotation, ang + Math.PI / 2, 2.2 * dt);
      r.ship.x += Math.cos(ang) * r.speed * dt;
      r.ship.y += Math.sin(ang) * r.speed * dt;
      if (Phaser.Math.Distance.Between(r.ship.x, r.ship.y, wp.x, wp.y) < 24) r.route.shift();
      return;
    }

    // Arrived — act on the current goal.
    if (r.state === "toBuy" && r.buyPort) {
      const price = r.buyPort.market.buyPrice(r.good);
      const qty = Math.min(LOT, Math.floor(r.gold / price));
      if (qty > 0) { r.gold -= price * qty; r.cargoQty = qty; r.buyPort.market.applyBuy(r.good, qty); }
      r.route = aStar(this.grid, r.ship.x, r.ship.y, r.sellPort.x, r.sellPort.y).slice(1);
      r.state = "toSell";
      return;
    }
    if (r.state === "toSell" && r.sellPort && r.cargoQty > 0) {
      r.gold += r.sellPort.market.sellPrice(r.good) * r.cargoQty;
      r.sellPort.market.applySell(r.good, r.cargoQty);
      r.cargoQty = 0;
    }

    // Choose a new deal: best (cheap buy → high sell) good across the ports.
    const deal = this.chooseRivalDeal();
    if (deal) {
      r.good = deal.good; r.buyPort = deal.buy; r.sellPort = deal.sell;
      r.route = aStar(this.grid, r.ship.x, r.ship.y, deal.buy.x, deal.buy.y).slice(1);
      r.state = "toBuy";
    } else {
      // No profit anywhere — wander to a random port.
      const p = Phaser.Utils.Array.GetRandom(this.ports);
      r.route = aStar(this.grid, r.ship.x, r.ship.y, p.x, p.y).slice(1);
      r.state = "choosing";
    }
  }

  chooseRivalDeal() {
    let best = null;
    for (const g of GOODS) {
      let buy = this.ports[0], sell = this.ports[0];
      for (const p of this.ports) {
        if (p.market.buyPrice(g) < buy.market.buyPrice(g)) buy = p;
        if (p.market.sellPrice(g) > sell.market.sellPrice(g)) sell = p;
      }
      if (buy === sell) continue;
      const margin = sell.market.sellPrice(g) - buy.market.buyPrice(g);
      if (margin > 8 && (!best || margin > best.margin)) best = { good: g, buy, sell, margin };
    }
    return best;
  }

  // ---------------------------------------------------------------------
  // Auto-sail (A*)
  // ---------------------------------------------------------------------
  followRoute(dt) {
    const wp = this.route[0];
    const dist = Phaser.Math.Distance.Between(this.ship.x, this.ship.y, wp.x, wp.y);
    // Arrival radius ≥ turn radius so the ship never has to orbit a waypoint.
    const arrive = this.route.length === 1 ? 18 : Math.max(35, (this.player.speed / SHIP.turnRate) * 0.6);
    if (dist < arrive) {
      this.route.shift();
      if (!this.route.length) { this.ship.body.velocity.set(0, 0); this.pathGfx.clear(); return; }
      return;
    }
    const target = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, wp.x, wp.y) + Math.PI / 2;
    this.ship.rotation = Phaser.Math.Angle.RotateTo(this.ship.rotation, target, SHIP.turnRate * dt);
    // Ease forward speed down for sharp turns (prevents orbiting) and near the final stop.
    const headingErr = Phaser.Math.Angle.Wrap(target - this.ship.rotation);
    const last = this.route.length === 1;
    let eff = this.player.speed * Math.max(0.25, Math.cos(headingErr));
    if (last) eff *= Phaser.Math.Clamp(dist / 120, 0.3, 1);
    this.physics.velocityFromRotation(this.ship.rotation - Math.PI / 2, eff, this.ship.body.velocity);
    this.drawRoute();
  }
  planRoute(x, y) {
    this.route = this.smoothPath(aStar(this.grid, this.ship.x, this.ship.y, x, y)).slice(1);
    this.drawRoute();
  }
  // String-pull the A* path: collapse runs of waypoints into straight legs with
  // clear line-of-sight, so the ship sails long clean legs instead of zig-zags.
  smoothPath(path) {
    if (path.length <= 2) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      while (j > i + 1 && !this.lineClear(path[i], path[j])) j--;
      out.push(path[j]); i = j;
    }
    return out;
  }
  lineClear(a, b) {
    const steps = Math.ceil(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / (this.grid.cell * 0.5));
    for (let k = 0; k <= steps; k++) {
      const c = this.grid.worldToCell(Phaser.Math.Linear(a.x, b.x, k / steps), Phaser.Math.Linear(a.y, b.y, k / steps));
      if (this.grid.isBlocked(c.col, c.row)) return false;
    }
    return true;
  }
  drawRoute() {
    this.pathGfx.clear();
    if (!this.route.length) return;
    this.pathGfx.lineStyle(2, 0xffffff, 0.35).beginPath();
    this.pathGfx.moveTo(this.ship.x, this.ship.y);
    for (const wp of this.route) this.pathGfx.lineTo(wp.x, wp.y);
    this.pathGfx.strokePath();
    const last = this.route[this.route.length - 1];
    this.pathGfx.fillStyle(0xffffff, 0.5).fillCircle(last.x, last.y, 6);
  }
  nearestPortInRange() {
    for (const p of this.ports)
      if (Phaser.Math.Distance.Between(this.ship.x, this.ship.y, p.x, p.y) < 130) return p;
    return null;
  }

  // ---------------------------------------------------------------------
  // Trading + upgrades
  // ---------------------------------------------------------------------
  cargoTotal() { return GOODS.reduce((s, g) => s + this.player.cargo[g], 0); }
  buy(port, good) {
    const cost = Math.ceil(port.market.buyPrice(good) * LOT * this.priceMod(port).buy);
    if (this.player.gold < cost) return this.flashMarket("Not enough gold");
    if (this.cargoTotal() + LOT > this.player.holdCap) return this.flashMarket("Cargo hold full");
    this.player.gold -= cost; this.player.cargo[good] += LOT;
    port.market.applyBuy(good, LOT); this.bumpStanding(port); this.renderMarket(port);
    this.floatText(this.ship.x, this.ship.y - 22, `-${cost}d`, "#e7a0a0");
  }
  sell(port, good) {
    const qty = Math.min(LOT, this.player.cargo[good]);
    if (qty <= 0) return this.flashMarket(`No ${good} to sell`);
    const earned = Math.round(port.market.sellPrice(good) * qty * this.blessing * this.priceMod(port).sell);
    this.player.gold += earned;
    this.player.cargo[good] -= qty;
    // Trading earns the gods' Favor — luxuries please them most.
    const fav = good === "Tyrian Purple" ? 5 : 1;
    this.player.favor += fav;
    this.player.questFlags.traded = true;
    port.market.applySell(good, qty); this.bumpStanding(port); this.renderMarket(port);
    this.floatText(this.ship.x, this.ship.y - 22, `+${earned}d  +${fav}⚱`, "#b9e88f");
    if (window.SFX) SFX.play("coin");
  }
  // Trading at a faction's city raises your standing with it.
  bumpStanding(port) {
    if (port.faction && this.player.standing[port.faction] != null) this.player.standing[port.faction] += 1;
  }
  buyUpgrade(type) {
    const tier = this.player.upgrades[type];
    if (tier >= UPGRADES[type].max) return;
    const cost = upgradeCost(type, tier);
    if (this.player.gold < cost) return this.flashShipyard("Not enough gold");
    this.player.gold -= cost;
    this.player.upgrades[type] = tier + 1;
    if (type === "hold") this.player.holdCap = 30 + this.player.upgrades.hold * 10;
    if (type === "sail") { this.player.speed = 150 + this.player.upgrades.sail * 18; this.ship.body.setMaxVelocity(this.player.speed); }
    if (type === "hull") this.player.windResist = this.player.upgrades.hull * 0.22;
    this.renderShipyard();
    if (this.currentPort) this.renderMarket(this.currentPort);
  }

  // ---------------------------------------------------------------------
  // HUD / minimap / wind / banners
  // ---------------------------------------------------------------------
  updateHud(near) {
    const tip = near ? `⚓ Docked at ${near.name}`
      : (this.siege ? `⚔ Besieging ${this.siege.isl.name}…`
      : (this.route.length ? "⛵ Auto-sailing…" : "Click the sea to set sail."));
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set("gold-val", this.player.gold);
    set("favor-val", this.player.favor);
    set("army-val", this.player.hoplites);
    set("hold-val", `${this.cargoTotal()}/${this.player.holdCap}`);
    set("status-tip", tip);
    const lead = this.player.gold >= this.rival.gold;
    document.getElementById("scoreboard").innerHTML =
      `<span class="${lead ? "ahead" : ""}">⚓ You ${this.player.gold}d</span>` +
      ` · <span class="${!lead ? "ahead" : ""}">☾ Hanno ${this.rival.gold}d</span>`;
    const st = document.getElementById("standing-line");
    if (st) st.innerHTML =
      `<span style="color:#7fbef0">Delian ${this.fmt(this.player.standing.delian)}</span> · ` +
      `<span style="color:#e07a6e">Pelop ${this.fmt(this.player.standing.pelop)}</span>`;
    // Dim powers you can't yet afford.
    document.querySelectorAll(".god[data-power]").forEach((btn) => {
      const pw = POWERS[btn.dataset.power];
      if (pw && !pw.locked) btn.classList.toggle("cant", this.player.favor < pw.cost);
    });
  }
  fmt(n) { return n > 0 ? "+" + n : "" + n; }
  // Floating world-space text for trade/combat feedback.
  floatText(x, y, msg, color = "#ffe9a8") {
    const t = this.add.text(x, y, msg, {
      fontFamily: "monospace", fontSize: "15px", color, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, y: y - 38, alpha: 0, duration: 950, ease: "Cubic.out", onComplete: () => t.destroy() });
  }
  updateWindIndicator() {
    const arrow = document.getElementById("wind-arrow");
    if (arrow) arrow.style.transform = `rotate(${this.wind.angle + Math.PI / 2}rad)`;
    const lbl = document.getElementById("wind-strength");
    if (lbl) {
      const labels = ["calm", "light", "fresh", "strong"];
      lbl.textContent = this.stormActive ? "GALE" : labels[Math.min(3, Math.floor(this.wind.speed * 4))];
    }
    const wx = document.getElementById("weather");
    if (wx) {
      const i = this.weather.intensity;
      wx.textContent = i > 0.45 ? "⛈ Storm — Poseidon rages" : i > 0.22 ? "🌧 Rain — the sea stirs" : "☀ Fair winds";
    }
  }
  showEvent(text) {
    const el = document.getElementById("event-banner");
    el.textContent = text; el.classList.add("show");
    clearTimeout(this._evt); this._evt = setTimeout(() => el.classList.remove("show"), 3300);
  }
  drawMinimap() {
    const ctx = this.minimapCtx, w = ctx.canvas.width, h = ctx.canvas.height;
    const sx = w / WORLD.width, sy = h / WORLD.height;
    ctx.fillStyle = "#0e3a57"; ctx.fillRect(0, 0, w, h);
    for (const isl of ISLAND_DEFS) { ctx.fillStyle = isl.owner === "player" ? "#f2c14e" : "#6a994e"; ctx.beginPath(); ctx.arc(isl.x * sx, isl.y * sy, Math.max(2, isl.r * sx), 0, 7); ctx.fill(); }
    for (const p of this.ports) { ctx.fillStyle = "#" + p.color.toString(16).padStart(6, "0"); ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 3, 0, 7); ctx.fill(); }
    // rival
    ctx.fillStyle = "#b06cc8"; ctx.beginPath(); ctx.arc(this.rival.ship.x * sx, this.rival.ship.y * sy, 2.5, 0, 7); ctx.fill();
    // your auto-trader galleys
    ctx.fillStyle = "#6fe0c0";
    for (const tr of this.traders) { ctx.beginPath(); ctx.arc(tr.ship.x * sx, tr.ship.y * sy, 2, 0, 7); ctx.fill(); }
    // island under counter-siege — pulsing red ring
    if (this.incoming) {
      const a = 0.45 + 0.45 * Math.sin(this.time.now / 130);
      ctx.strokeStyle = `rgba(214,40,40,${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.incoming.isl.x * sx, this.incoming.isl.y * sy, 6, 0, 7); ctx.stroke();
    }
    const v = this.cameras.main.worldView;
    ctx.strokeStyle = "#ffffff88"; ctx.lineWidth = 1; ctx.strokeRect(v.x * sx, v.y * sy, v.width * sx, v.height * sy);
    ctx.save();
    ctx.translate(this.ship.x * sx, this.ship.y * sy); ctx.rotate(this.ship.rotation);
    ctx.fillStyle = "#ffe9a8"; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3, 4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // HTML UI: market, shipyard, oracle
  // ---------------------------------------------------------------------
  bindUI() {
    this.elMarket = document.getElementById("market");
    this.elMarketTitle = document.getElementById("market-title");
    this.elMarketRows = document.getElementById("market-rows");
    this.elMarketFlash = document.getElementById("market-flash");
    this.elHmOut = document.getElementById("hm-out");
    this.elShipyard = document.getElementById("shipyard");
    this.elShipyardRows = document.getElementById("shipyard-rows");
    this.elShipyardFlash = document.getElementById("shipyard-flash");
    document.getElementById("ask-hm").addEventListener("click", () => this.askOracle());
    document.getElementById("open-shipyard").addEventListener("click", () => {
      this.elShipyard.classList.toggle("hidden"); this.renderShipyard();
    });
    document.getElementById("close-shipyard").addEventListener("click", () => this.elShipyard.classList.add("hidden"));

    // Pantheon — divine powers spent with Favor.
    const powers = { poseidon: () => this.powerPoseidon(), zeus: () => this.powerZeus(),
      hermes: () => this.powerHermes(), athena: () => this.powerAthena(), ares: () => this.powerAres() };
    document.querySelectorAll(".god[data-power]").forEach((btn) => {
      const key = btn.dataset.power;
      if (powers[key]) btn.addEventListener("click", () => powers[key]());
    });

    // Island inspector — Lay Siege (enemy) or Reinforce (yours)
    document.getElementById("close-island").addEventListener("click", () =>
      document.getElementById("island-panel").classList.add("hidden"));
    document.getElementById("btn-siege").addEventListener("click", () => {
      const isl = this._selectedIsland; if (!isl) return;
      if (isl.owner === "player") this.reinforce(isl);
      else if (isl.owner !== "neutral") this.laySiege(isl);
    });
    document.getElementById("btn-city").addEventListener("click", () => {
      const isl = this._selectedIsland; if (!isl) return;
      if (isl.owner === "player") this.buildCity(isl);
      else if (isl.owner === "neutral") this.foundCity(isl);
    });
    const restart = document.getElementById("restart");
    if (restart) restart.addEventListener("click", () => { if (window.Save) Save.clear(); location.reload(); });

    // Save / Load / New Game
    const sv = document.getElementById("btn-save");
    if (sv) sv.addEventListener("click", () => { if (window.Save && Save.save(this)) this.showEvent("💾 Game saved."); });
    const ld = document.getElementById("btn-load");
    if (ld) ld.addEventListener("click", () => location.reload());
    const nw = document.getElementById("btn-new");
    if (nw) nw.addEventListener("click", () => {
      if (confirm("Abandon this game and start a new one?")) { if (window.Save) Save.clear(); location.reload(); }
    });

    // Quests / Diplomacy / Research / Trade-route modals
    document.querySelectorAll("#menu-row [data-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.modal, m = document.getElementById(id);
        const open = !m.classList.contains("hidden");
        document.querySelectorAll(".modal").forEach((x) => x.classList.add("hidden"));
        if (!open) { m.classList.remove("hidden"); this.renderModal(id); }
      });
    });
    document.querySelectorAll(".modal-close").forEach((c) =>
      c.addEventListener("click", () => document.getElementById(c.dataset.modal).classList.add("hidden")));
    const vc = document.getElementById("victory-continue");
    if (vc) vc.addEventListener("click", () => document.getElementById("victory").classList.add("hidden"));
    const vn = document.getElementById("victory-new");
    if (vn) vn.addEventListener("click", () => { if (window.Save) Save.clear(); location.reload(); });

    const mute = document.getElementById("btn-mute");
    if (mute) {
      mute.textContent = window.SFX && SFX.isMuted() ? "🔇" : "🔊";
      mute.addEventListener("click", () => { const m = window.SFX && SFX.toggleMute(); mute.textContent = m ? "🔇" : "🔊"; });
    }
  }

  // -- Divine powers (reuse existing systems) ---------------------------
  spendFavor(key) {
    const pw = POWERS[key];
    if (pw.locked) return false;
    if (this.player.favor < pw.cost) { this.showEvent(`Not enough Favor for ${pw.god} (need ${pw.cost})`); return false; }
    this.player.favor -= pw.cost;
    return true;
  }
  powerPoseidon() {
    if (!this.spendFavor("poseidon")) return;
    this.weather.target = 0;
    if (this.incoming) { this.incoming.attackers = Math.round(this.incoming.attackers * 0.6); this.showEvent("🔱 Poseidon scatters the enemy fleet — their assault is broken!"); }
    else this.showEvent("🔱 Poseidon calms the seas.");
  }
  powerZeus()   { if (!this.spendFavor("zeus")) return; this.strikeLightning(); this.showEvent("⚡ Zeus hurls a thunderbolt!"); }
  powerHermes() { if (!this.spendFavor("hermes")) return; this.grantBlessing(); }
  powerAthena() { if (!this.spendFavor("athena")) return; this.showEvent("🦉 Athena lends her wisdom."); this.askOracle(); }
  powerAres() {
    if (!this.spendFavor("ares")) return;
    const isl = this.incoming ? this.incoming.isl : null;
    if (isl) { isl.garrison += 15; this.floatText(isl.x, isl.y - 10, "+15 hoplites", "#ffe9a8"); this.showEvent(`⚔ Ares rallies ${isl.name} — +15 to its garrison!`); }
    else this.showEvent("⚔ Ares finds no battle to join right now.");
  }

  // -- Island inspector: found / siege / manage islands ----------------
  openIsland(isl) {
    this._selectedIsland = isl;
    const owner = FACTIONS[isl.owner] || FACTIONS.neutral;
    const mine = isl.owner === "player";
    const neutral = isl.owner === "neutral";
    const near = Phaser.Math.Distance.Between(this.ship.x, this.ship.y, isl.x, isl.y) < isl.r + 180;
    document.getElementById("island-name").textContent = `🏝 ${isl.name}`;
    document.getElementById("island-owner").innerHTML =
      `${neutral ? "" : "Held by "}<b style="color:#${owner.color.toString(16).padStart(6, "0")}">${owner.name}</b>`;
    document.getElementById("island-garrison").textContent = mine
      ? `Defense: ${this.islandDefense(isl)}  (garrison ${isl.garrison}${isl.city ? ` · walls ${isl.city.buildings.walls} · ⚓ ${isl.city.warships || 0}` : ""})`
      : neutral ? "Empty land — ripe for a new colony"
      : `Garrison: ${isl.garrison} hoplites`;
    document.getElementById("island-extra").textContent = neutral
      ? `${near ? "In range" : "Sail closer to found a city"}`
      : `Your army: ${this.player.hoplites} hoplites${mine ? "" : near ? " · in range" : " · sail closer to attack"}`;

    const siegeBtn = document.getElementById("btn-siege");
    const cityBtn = document.getElementById("btn-city");
    if (mine) {
      siegeBtn.textContent = `🛡 Reinforce (+${Math.min(this.player.hoplites, 20)})`;
      siegeBtn.disabled = !near || this.player.hoplites <= 0;
      cityBtn.textContent = "🏛 Enter City"; cityBtn.disabled = false;
    } else if (neutral) {
      siegeBtn.textContent = "— uninhabited"; siegeBtn.disabled = true;
      cityBtn.textContent = `🏛 Found City (${FOUND_COST.gold}d + ${FOUND_COST.favor}⚱)`;
      cityBtn.disabled = !near || this.player.gold < FOUND_COST.gold || this.player.favor < FOUND_COST.favor;
    } else {
      siegeBtn.textContent = `⚔ Lay Siege (${this.player.hoplites} vs ${isl.garrison})`;
      siegeBtn.disabled = !near || this.player.hoplites <= 0 || !!this.siege;
      cityBtn.textContent = "🏛 Held by rivals"; cityBtn.disabled = true;
    }
    document.getElementById("island-panel").classList.remove("hidden");
  }
  foundCity(isl) {
    if (isl.owner !== "neutral") return;
    if (Phaser.Math.Distance.Between(this.ship.x, this.ship.y, isl.x, isl.y) >= isl.r + 180)
      return this.showEvent("Sail closer to found a city.");
    if (this.player.gold < FOUND_COST.gold || this.player.favor < FOUND_COST.favor)
      return this.showEvent(`Founding ${isl.name} costs ${FOUND_COST.gold}d + ${FOUND_COST.favor} Favor.`);
    this.player.gold -= FOUND_COST.gold; this.player.favor -= FOUND_COST.favor;
    isl.owner = "player"; isl.garrison = 10; this.ensureCity(isl);
    if (isl._banner) {
      isl._banner.setFillStyle(FACTIONS.player.color);
      this.tweens.add({ targets: isl._banner, scale: { from: 2, to: 1 }, duration: 650, ease: "Back.out" });
    }
    this.floatText(isl.x, isl.y - 10, "Colonized!", "#ffe9a8");
    this.showEvent(`🏛 You found a new polis on ${isl.name}!`);
    document.getElementById("island-panel").classList.add("hidden");
    if (window.Save) Save.save(this);
  }

  // -- City state + production -----------------------------------------
  ensureCity(isl) {
    if (!isl.city) {
      const home = isl.name === "Melos";   // your starting polis comes with a Barracks
      isl.city = {
        wood: home ? 180 : 90, stone: home ? 150 : 70, silver: home ? 110 : 40, _fav: 0,
        warships: 0, buildQueue: null, recruitQueue: null,
        buildings: {
          senate: 1, timber: 1, quarry: 1, mine: 1, farm: 1, warehouse: 1,
          temple: 0, barracks: home ? 1 : 0, harbor: 0, walls: 0, academy: 0,
        },
      };
    }
    return isl.city;
  }
  tickCity(isl, secs) {
    const c = isl.city; if (!c) return;
    const b = c.buildings;
    const mult = (1 + 0.05 * b.senate) * (this.player.research.agriculture ? 1.15 : 1);   // Agriculture research
    const cap = 250 + 200 * b.warehouse;
    c.wood   = Math.min(cap, c.wood   + BUILDINGS.timber.rate * b.timber * mult * secs);
    c.stone  = Math.min(cap, c.stone  + BUILDINGS.quarry.rate * b.quarry * mult * secs);
    c.silver = Math.min(cap, c.silver + BUILDINGS.mine.rate   * b.mine   * mult * secs);
    c._fav  += BUILDINGS.temple.rate * b.temple * secs;
    while (c._fav >= 1) { this.player.favor += 1; c._fav -= 1; }
    // Build & recruit queues progress here, so cities grow while you sail.
    if (c.buildQueue) { c.buildQueue.left -= secs; if (c.buildQueue.left <= 0) { b[c.buildQueue.key] += 1; c.buildQueue = null; if (window.SFX) SFX.play("build"); } }
    if (c.recruitQueue) { c.recruitQueue.left -= secs; if (c.recruitQueue.left <= 0) {
      if (c.recruitQueue.type === "warship") c.warships = (c.warships || 0) + 1; else this.player.hoplites += 1;
      c.recruitQueue = null; if (window.SFX) SFX.play("build");
    } }
  }
  tickAllCities(secs) {
    for (const isl of ISLAND_DEFS) if (isl.owner === "player" && isl.city) this.tickCity(isl, secs);
  }
  buildCity(isl) {
    this.ensureCity(isl);
    document.getElementById("island-panel").classList.add("hidden");
    document.body.classList.add("in-city");
    this.scene.pause();
    this.scene.launch("city", { islandIndex: ISLAND_DEFS.indexOf(isl) });
  }

  // -- Sieges (Grepolis-style timer assault) ---------------------------
  laySiege(isl) {
    if (this.siege) return this.showEvent("You are already besieging a city.");
    if (isl.owner === "player") return;
    if (Phaser.Math.Distance.Between(this.ship.x, this.ship.y, isl.x, isl.y) >= isl.r + 180)
      return this.showEvent("Sail closer to lay siege.");
    if (this.player.hoplites <= 0) return this.showEvent("No hoplites — train them at a city's Barracks.");
    const d = this.player.diplomacy[isl.owner];
    if (d === "peace" || d === "allied") {
      this.player.diplomacy[isl.owner] = "war";
      this.player.standing[isl.owner] = (this.player.standing[isl.owner] || 0) - 5;
      this.showEvent(`⚔ War declared on ${FACTIONS[isl.owner].name}!`);
    }
    const attackers = this.player.hoplites;
    this.player.hoplites = 0;
    this.siege = { isl, attackers, total: SIEGE_TIME, left: SIEGE_TIME };
    this.showEvent(`⚔ Besieging ${isl.name} — ${attackers} hoplites vs ${isl.garrison}.`);
    if (window.SFX) SFX.play("horn");
    document.getElementById("island-panel").classList.add("hidden");
  }
  updateSiege(dt) {
    const el = document.getElementById("siege");
    this.siegeGfx.clear();
    if (!this.siege) { if (el && el.textContent) el.textContent = ""; return; }
    this.siege.left -= dt;
    if (el) el.textContent = `⚔ Besieging ${this.siege.isl.name} — ${Math.ceil(this.siege.left)}s`;
    // Progress ring around the besieged island.
    const isl = this.siege.isl, p = 1 - this.siege.left / this.siege.total;
    this.siegeGfx.lineStyle(6, 0x2a0e08, 0.5).strokeCircle(isl.x, isl.y, isl.r * 1.14);
    this.siegeGfx.lineStyle(6, 0xff6b3a, 0.95).beginPath();
    this.siegeGfx.arc(isl.x, isl.y, isl.r * 1.14, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    this.siegeGfx.strokePath();
    if (this.siege.left <= 0) this.resolveSiege();
  }
  resolveSiege() {
    const { isl, attackers } = this.siege;
    this.siege = null;
    const eff = Math.round(attackers * this.armyMul());   // Phalanx Drill research
    if (eff > isl.garrison) {
      isl.owner = "player";
      isl.garrison = Math.max(2, eff - isl.garrison);   // survivors hold the city
      this.player.questFlags.wonBattle = true;
      this.ensureCity(isl);
      if (isl._banner) {
        isl._banner.setFillStyle(FACTIONS.player.color);
        this.tweens.add({ targets: isl._banner, scale: { from: 2, to: 1 }, duration: 650, ease: "Back.out" });
      }
      this.floatText(isl.x, isl.y - 10, "Captured!", "#ffe9a8");
      this.showEvent(`🏛 ${isl.name} is yours! ${isl.garrison} hoplites garrison it.`);
    } else {
      isl.garrison = Math.max(1, isl.garrison - attackers);
      this.floatText(isl.x, isl.y - 10, "Assault repelled", "#e7a0a0");
      this.showEvent(`☠ The assault on ${isl.name} failed — your hoplites are lost.`);
    }
    if (window.Save) Save.save(this);
  }

  // -- AI counter-sieges (factions push back) --------------------------
  islandDefense(isl) {
    const c = isl.city;
    const wallMul = this.hasTech("masonry") ? 12 : 8;   // Masonry research
    const base = isl.garrison + (c ? c.buildings.walls * wallMul + (c.warships || 0) * 4 : 0);
    return Math.round(base * this.armyMul());            // Phalanx Drill research
  }
  maybeCounterSiege() {
    if (this.incoming || this.gameIsOver) return;
    const mine = ISLAND_DEFS.filter((i) => i.owner === "player");
    if (!mine.length) return;
    const target = Phaser.Utils.Array.GetRandom(mine);
    // Diplomacy: factions at peace/allied don't attack; factions at war attack more often & harder.
    const pool = [];
    for (const fac of ["delian", "pelop", "carthage"]) {
      const d = this.player.diplomacy[fac];
      if (d === "peace" || d === "allied") continue;
      pool.push(fac);
      if (d === "war") pool.push(fac, fac);
    }
    if (!pool.length) return;
    const faction = Phaser.Utils.Array.GetRandom(pool);
    const atWar = this.player.diplomacy[faction] === "war";
    const hi = (0.9 + 0.12 * mine.length) * (atWar ? 1.3 : 1);
    const attackers = Math.max(6, Math.round(this.islandDefense(target) * Phaser.Math.FloatBetween(0.55, hi)));
    this.incoming = { isl: target, faction, attackers, total: 35, left: 35 };
    this.showEvent(`⚔ ${FACTIONS[faction].name} sails to besiege ${target.name}! Rally its defenses.`);
    if (window.SFX) SFX.play("horn");
  }
  updateIncoming(dt) {
    this.incomingGfx.clear();
    const el = document.getElementById("siege");
    if (!this.incoming) return;
    this.incoming.left -= dt;
    const inc = this.incoming, p = 1 - inc.left / inc.total;
    if (el) el.textContent = `🛡 ${FACTIONS[inc.faction].name} besieges ${inc.isl.name} — ${Math.ceil(inc.left)}s (${inc.attackers} vs ${this.islandDefense(inc.isl)})`;
    this.incomingGfx.lineStyle(7, 0x300, 0.5).strokeCircle(inc.isl.x, inc.isl.y, inc.isl.r * 1.2);
    this.incomingGfx.lineStyle(7, 0xd62828, 0.95).beginPath();
    this.incomingGfx.arc(inc.isl.x, inc.isl.y, inc.isl.r * 1.2, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    this.incomingGfx.strokePath();
    if (inc.left <= 0) this.resolveIncoming();
  }
  resolveIncoming() {
    const { isl, attackers, faction } = this.incoming;
    this.incoming = null;
    document.getElementById("siege").textContent = "";
    if (attackers > this.islandDefense(isl)) {
      isl.owner = faction;
      isl.garrison = Math.max(4, Math.round(attackers * 0.4));
      if (isl._banner) isl._banner.setFillStyle(FACTIONS[faction].color);
      this.floatText(isl.x, isl.y - 10, "Lost!", "#e7a0a0");
      this.showEvent(`☠ ${isl.name} has fallen to ${FACTIONS[faction].name}.`);
      if (!ISLAND_DEFS.some((i) => i.owner === "player")) this.gameOver();
    } else {
      isl.garrison = Math.max(2, isl.garrison - Math.round(attackers * 0.4));
      this.player.questFlags.wonBattle = true;
      this.floatText(isl.x, isl.y - 10, "Defended!", "#b9e88f");
      this.showEvent(`🛡 ${isl.name} repels the ${FACTIONS[faction].name} assault!`);
    }
    if (window.Save) Save.save(this);
  }
  reinforce(isl) {
    if (isl.owner !== "player") return;
    if (Phaser.Math.Distance.Between(this.ship.x, this.ship.y, isl.x, isl.y) >= isl.r + 180)
      return this.showEvent("Sail closer to reinforce.");
    if (this.player.hoplites <= 0) return this.showEvent("No hoplites to send.");
    const n = Math.min(this.player.hoplites, 20);
    this.player.hoplites -= n; isl.garrison += n;
    this.floatText(isl.x, isl.y - 10, `+${n} garrison`, "#b9e88f");
    this.showEvent(`🛡 ${n} hoplites reinforce ${isl.name}.`);
    document.getElementById("island-panel").classList.add("hidden");
  }
  gameOver() {
    this.gameIsOver = true;
    document.getElementById("gameover").classList.remove("hidden");
    if (window.SFX) SFX.play("lose");
    this.scene.pause();
  }

  // The rival factions act on their own so the map lives and breathes.
  recolorBanner(isl) {
    if (!isl._banner) return;
    isl._banner.setFillStyle((FACTIONS[isl.owner] || FACTIONS.neutral).color);
    this.tweens.add({ targets: isl._banner, scale: { from: 1.6, to: 1 }, duration: 500, ease: "Back.out" });
  }
  factionTurn() {
    if (this.gameIsOver || this.gameWon) return;
    const actor = Phaser.Utils.Array.GetRandom(["delian", "pelop", "carthage"]);
    // Reinforce: this faction's islands harden over time.
    for (const isl of ISLAND_DEFS) if (isl.owner === actor) isl.garrison += Phaser.Math.Between(2, 5);
    const r = Math.random();
    if (r < 0.5) {
      // Found a colony on unclaimed land — races you for empty islands.
      const neutrals = ISLAND_DEFS.filter((i) => i.owner === "neutral");
      if (neutrals.length) {
        const isl = Phaser.Utils.Array.GetRandom(neutrals);
        isl.owner = actor; isl.garrison = Phaser.Math.Between(12, 22);
        this.recolorBanner(isl);
        this.showEvent(`🏛 ${FACTIONS[actor].name} founds a colony on ${isl.name}.`);
      }
    } else if (r < 0.78) {
      // Seize a weaker rival or free island (never the player's — that's a counter-siege).
      const targets = ISLAND_DEFS.filter((i) => i.owner !== "player" && i.owner !== actor && i.owner !== "neutral");
      if (targets.length && ISLAND_DEFS.some((i) => i.owner === actor)) {
        const target = Phaser.Utils.Array.GetRandom(targets);
        const force = Phaser.Math.Between(15, 42);
        if (force > target.garrison) {
          const prev = target.owner;
          target.owner = actor; target.garrison = Math.max(5, force - target.garrison);
          this.recolorBanner(target);
          this.showEvent(`⚔ ${FACTIONS[actor].name} seizes ${target.name} from ${FACTIONS[prev].name}.`);
        }
      }
    }
    if (window.Save) Save.save(this);
  }

  // ====================================================================
  // Diplomacy
  // ====================================================================
  priceMod(port) {
    const d = this.player.diplomacy[port.faction];
    if (d === "war") return { buy: 1.25, sell: 0.75 };
    if (d === "peace" || d === "allied") return { buy: 0.92, sell: 1.08 };
    return { buy: 1, sell: 1 };
  }
  setDiplo(fac, state) {
    if (state === "war") this.player.standing[fac] = (this.player.standing[fac] || 0) - 5;
    this.player.diplomacy[fac] = state;
    this.showEvent(`${FACTIONS[fac].name}: ${state}.`);
    this.renderDiplomacy();
    if (this.currentPort) this.renderMarket(this.currentPort);
    if (window.Save) Save.save(this);
  }
  renderDiplomacy() {
    const body = document.getElementById("diplomacy-body"); if (!body) return;
    body.innerHTML = "";
    for (const fac of ["delian", "pelop", "carthage"]) {
      const f = FACTIONS[fac], st = this.player.diplomacy[fac], sd = this.player.standing[fac] || 0;
      const stc = st === "war" ? "#e07a6e" : st === "allied" ? "#7fe07f" : st === "peace" ? "#8ecae6" : "#cdb98a";
      const div = document.createElement("div");
      div.style.cssText = "margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:9px";
      div.innerHTML = `<div style="font-weight:600;color:#${f.color.toString(16).padStart(6, "0")}">${f.name}` +
        `<span style="float:right;color:${stc};font-size:12px">${st} · standing ${sd > 0 ? "+" : ""}${sd}</span></div>`;
      const btns = document.createElement("div"); btns.style.cssText = "margin-top:7px;display:flex;gap:6px;flex-wrap:wrap";
      const mk = (label, cls, fn) => { const b = document.createElement("button"); b.className = "mbtn " + cls; b.textContent = label; b.style.fontSize = "11px"; b.onclick = fn; return b; };
      if (st !== "war") btns.append(mk("Declare War", "bad", () => this.setDiplo(fac, "war")));
      if (st === "war" || st === "neutral") btns.append(mk("Make Peace", "act", () => this.setDiplo(fac, "peace")));
      if (st === "peace" && sd >= 15) btns.append(mk("Propose Alliance", "act", () => this.setDiplo(fac, "allied")));
      if (st === "peace" || st === "allied") btns.append(mk("Set Neutral", "off", () => this.setDiplo(fac, "neutral")));
      div.append(btns); body.append(div);
    }
  }

  // ====================================================================
  // Research (Academy)
  // ====================================================================
  maxAcademy() {
    let m = 0;
    for (const i of ISLAND_DEFS) if (i.owner === "player" && i.city) m = Math.max(m, i.city.buildings.academy || 0);
    return m;
  }
  hasTech(k) { return !!this.player.research[k]; }
  armyMul() { return this.hasTech("phalanx") ? 1.25 : 1; }
  researchTech(key) {
    const t = TECHS[key];
    if (this.player.research[key]) return;
    if (this.maxAcademy() < t.tier) return this.showEvent(`Needs an Academy at level ${t.tier}.`);
    if (this.player.gold < t.cost.gold || this.player.favor < t.cost.favor) return this.showEvent("Not enough drachmae or Favor.");
    this.player.gold -= t.cost.gold; this.player.favor -= t.cost.favor;
    this.player.research[key] = true;
    this.showEvent(`🔬 Researched ${t.name}!`);
    this.renderResearch();
    if (window.Save) Save.save(this);
  }
  renderResearch() {
    const sub = document.getElementById("research-sub"), body = document.getElementById("research-body"); if (!body) return;
    const acad = this.maxAcademy();
    sub.style.cssText = "color:#cdb98a;font-size:12px;margin-bottom:10px";
    sub.textContent = acad ? `Academy level ${acad} — unlocks research up to tier ${acad}.` : "Build an Academy in a city to begin researching.";
    body.innerHTML = "";
    for (const key of Object.keys(TECHS)) {
      const t = TECHS[key], done = this.player.research[key], locked = acad < t.tier;
      const afford = this.player.gold >= t.cost.gold && this.player.favor >= t.cost.favor;
      const div = document.createElement("div"); div.className = "mrow";
      div.innerHTML = `<span class="mname">${t.icon} ${t.name}</span><span class="mhave" style="font-size:11px;color:#9fc3dd;text-align:left">${t.desc}</span>`;
      const b = document.createElement("button"); b.className = "mbtn " + (done || locked || !afford ? "off" : "act");
      b.textContent = done ? "✓ Done" : locked ? `Tier ${t.tier}` : `${t.cost.gold}d + ${t.cost.favor}⚱`;
      if (!done && !locked && afford) b.onclick = () => this.researchTech(key);
      div.append(b); body.append(div);
    }
  }

  // ====================================================================
  // Quests + victory
  // ====================================================================
  checkQuestsAndWin() {
    const f = this.player.questFlags, done = this.player.questsDone;
    const owned = ISLAND_DEFS.filter((i) => i.owner === "player").length;
    const cond = {
      trade: !!f.traded, favor: this.player.favor >= 15, army: this.player.hoplites >= 40,
      expand: owned >= 2,
      academy: ISLAND_DEFS.some((i) => i.owner === "player" && i.city && i.city.buildings.academy >= 1),
      siege: !!f.wonBattle,
    };
    for (const q of QUESTS) {
      if (!done[q.id] && cond[q.id]) {
        done[q.id] = true;
        if (q.reward.gold) this.player.gold += q.reward.gold;
        if (q.reward.favor) this.player.favor += q.reward.favor;
        this.showEvent(`📜 Quest complete — ${q.name}! +${q.reward.gold ? q.reward.gold + "d" : q.reward.favor + "⚱"}`);
        if (window.SFX) SFX.play("coin");
        this.renderQuests();
      }
    }
    if (!this.gameWon && owned >= WIN_CITIES) {
      this.gameWon = true;
      document.getElementById("victory").classList.remove("hidden");
      if (window.SFX) SFX.play("win");
    }
  }
  renderQuests() {
    const body = document.getElementById("quests-body"); if (!body) return;
    const done = this.player.questsDone, owned = ISLAND_DEFS.filter((i) => i.owner === "player").length;
    body.innerHTML = `<div style="margin-bottom:10px;color:#f2c14e;font-size:13px">🏛 Hegemony: ${owned}/${WIN_CITIES} cities owned</div>`;
    for (const q of QUESTS) {
      const d = !!done[q.id];
      const div = document.createElement("div"); div.style.cssText = "margin-bottom:8px;font-size:13px";
      div.innerHTML = `<span class="${d ? "qdone" : "qactive"}">${d ? "✓" : "○"} <b>${q.name}</b> — ${q.desc}</span>` +
        `<span style="float:right;color:#cdb98a;font-size:11px">${q.reward.gold ? q.reward.gold + "d" : q.reward.favor + "⚱"}</span>`;
      body.append(div);
    }
  }

  // ====================================================================
  // Automated trade routes (a small fleet of auto-trader galleys)
  // ====================================================================
  hireTrader(buyName, good, sellName, free) {
    if (!free) {
      if (this.traders.length >= 3) return this.showEvent("You can run at most 3 trade routes.");
      if (this.player.gold < 250) return this.showEvent("Hiring a galley costs 250 drachmae.");
    }
    const buyPort = this.ports.find((p) => p.name === buyName), sellPort = this.ports.find((p) => p.name === sellName);
    if (!buyPort || !sellPort || buyPort === sellPort) return this.showEvent("Pick two different cities.");
    if (!free) this.player.gold -= 250;
    const c = this.add.container(buyPort.x, buyPort.y).setDepth(6);
    c.add(this.add.ellipse(3, 6, 26, 40, 0x001018, 0.28));
    const parts = this.makeGalley(0x3a5a4a, 0x4a6a58, 0x6fb0a0, 0xcfe8d8, false, false);
    parts.vis.setScale(0.82); c.add(parts.vis);
    const label = this.add.text(buyPort.x, buyPort.y - 26, `⛵ ${good}`, {
      fontFamily: "sans-serif", fontSize: "11px", color: "#bfe8da", backgroundColor: "rgba(20,40,34,0.6)", padding: { x: 4, y: 1 },
    }).setOrigin(0.5).setDepth(7);
    const tr = { ship: c, sail: parts.sail, label, buyPort, good, sellPort, state: "toSell", route: [], cargo: 0, buyPrice: 0, speed: 130 };
    // start by buying where it spawned, then sail to sell
    tr.buyPrice = buyPort.market.buyPrice(good); tr.cargo = LOT; buyPort.market.applyBuy(good, LOT);
    tr.route = aStar(this.grid, c.x, c.y, sellPort.x, sellPort.y).slice(1);
    this.traders.push(tr);
    this.renderRoutes();
    if (!free && window.Save) Save.save(this);
  }
  updateTraders(dt, t) {
    for (const tr of this.traders) {
      tr.sail.scaleX = 0.85 + 0.15 * Math.sin(t * 3 + tr.ship.x * 0.01);
      tr.label.setPosition(tr.ship.x, tr.ship.y - 26);
      if (tr.route.length) {
        const wp = tr.route[0], ang = Phaser.Math.Angle.Between(tr.ship.x, tr.ship.y, wp.x, wp.y);
        tr.ship.rotation = Phaser.Math.Angle.RotateTo(tr.ship.rotation, ang + Math.PI / 2, 2.2 * dt);
        tr.ship.x += Math.cos(ang) * tr.speed * dt; tr.ship.y += Math.sin(ang) * tr.speed * dt;
        if (Phaser.Math.Distance.Between(tr.ship.x, tr.ship.y, wp.x, wp.y) < 24) tr.route.shift();
        continue;
      }
      if (tr.state === "toSell") {
        const profit = Math.max(0, Math.round((tr.sellPort.market.sellPrice(tr.good) - tr.buyPrice) * tr.cargo));
        this.player.gold += profit; tr.sellPort.market.applySell(tr.good, tr.cargo); tr.cargo = 0;
        if (profit > 0) this.floatText(tr.ship.x, tr.ship.y - 16, `+${profit}d`, "#b9e88f");
        tr.route = aStar(this.grid, tr.ship.x, tr.ship.y, tr.buyPort.x, tr.buyPort.y).slice(1);
        tr.state = "toBuy";
      } else {
        tr.buyPrice = tr.buyPort.market.buyPrice(tr.good); tr.cargo = LOT; tr.buyPort.market.applyBuy(tr.good, LOT);
        tr.route = aStar(this.grid, tr.ship.x, tr.ship.y, tr.sellPort.x, tr.sellPort.y).slice(1);
        tr.state = "toSell";
      }
    }
  }
  removeTrader(idx) {
    const tr = this.traders[idx]; if (!tr) return;
    tr.ship.destroy(); tr.label.destroy(); this.traders.splice(idx, 1);
    this.renderRoutes();
    if (window.Save) Save.save(this);
  }
  renderRoutes() {
    const sub = document.getElementById("routes-sub"), body = document.getElementById("routes-body"); if (!body) return;
    sub.style.cssText = "color:#cdb98a;font-size:12px;margin-bottom:10px";
    sub.textContent = `Hire a galley (250d) to auto-trade a good between two cities for passive profit. ${this.traders.length}/3 active.`;
    body.innerHTML = "";
    this.traders.forEach((tr, i) => {
      const div = document.createElement("div"); div.style.cssText = "margin-bottom:6px;font-size:12px";
      div.innerHTML = `<span style="color:#bfe8da">⛵ ${tr.good}: ${tr.buyPort.name} → ${tr.sellPort.name}</span>`;
      const b = document.createElement("button"); b.className = "mbtn bad"; b.textContent = "Recall"; b.style.cssText = "float:right;font-size:11px";
      b.onclick = () => this.removeTrader(i);
      div.append(b); body.append(div);
    });
    if (this.traders.length < 3) {
      const form = document.createElement("div"); form.style.cssText = "margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;font-size:12px;line-height:2";
      const ports = this.ports.map((p) => `<option>${p.name}</option>`).join("");
      form.innerHTML = `<div style="color:#cdb98a;margin-bottom:4px">New route</div>` +
        `Buy <select id="rt-buy">${ports}</select> <select id="rt-good">${GOODS.map((g) => `<option>${g}</option>`).join("")}</select>` +
        `<br>Sell at <select id="rt-sell">${ports}</select>`;
      const hire = document.createElement("button"); hire.className = "mbtn act"; hire.textContent = "Hire galley (250d)"; hire.style.cssText = "margin-top:8px";
      hire.onclick = () => this.hireTrader(document.getElementById("rt-buy").value, document.getElementById("rt-good").value, document.getElementById("rt-sell").value);
      form.append(hire); body.append(form);
    }
  }
  renderModal(id) {
    if (id === "quests-modal") this.renderQuests();
    else if (id === "diplomacy-modal") this.renderDiplomacy();
    else if (id === "research-modal") this.renderResearch();
    else if (id === "routes-modal") this.renderRoutes();
  }
  openMarket(port) { this.elMarket.classList.remove("hidden"); this.renderMarket(port); }
  closeMarket() { this.elMarket.classList.add("hidden"); this.elShipyard.classList.add("hidden"); }
  renderMarket(port) {
    const fac = FACTIONS[port.faction] || FACTIONS.free;
    const mod = this.priceMod(port);
    const diplo = this.player.diplomacy[port.faction];
    const tag = diplo === "war" ? ` <span style="color:#e07a6e">⚔ at war (worse prices)</span>`
      : diplo === "peace" || diplo === "allied" ? ` <span style="color:#7fe07f">🤝 ${diplo} (better prices)</span>` : "";
    this.elMarketTitle.innerHTML =
      `${port.name} <span style="color:#${fac.color.toString(16).padStart(6, "0")};font-size:12px">● ${fac.name}</span>${tag}` +
      `<div style="font-size:12px;color:#9fc3dd;font-weight:400">exports ${port.produces.join(", ")} · seeks ${port.demands.join(", ")}</div>`;
    this.elMarketRows.innerHTML = "";
    for (const g of GOODS) {
      const row = document.createElement("div");
      row.className = "mrow";
      row.innerHTML = `
        <span class="mname">${g}</span>
        <span class="mhave">×${this.player.cargo[g]}</span>
        <button class="mbtn buy">Buy ${LOT} @ ${Math.ceil(port.market.buyPrice(g) * mod.buy)}d</button>
        <button class="mbtn sell">Sell ${LOT} @ ${Math.round(port.market.sellPrice(g) * this.blessing * mod.sell)}d</button>`;
      row.querySelector(".buy").addEventListener("click", () => this.buy(port, g));
      row.querySelector(".sell").addEventListener("click", () => this.sell(port, g));
      this.elMarketRows.appendChild(row);
    }
    document.getElementById("market-gold").textContent = `${this.player.gold}d`;
  }
  renderShipyard() {
    this.elShipyardRows.innerHTML = "";
    for (const type of Object.keys(UPGRADES)) {
      const u = UPGRADES[type], tier = this.player.upgrades[type];
      const maxed = tier >= u.max;
      const row = document.createElement("div");
      row.className = "mrow";
      row.innerHTML = `
        <span class="mname">${u.icon} ${u.name}</span>
        <span class="mhave">${"●".repeat(tier)}${"○".repeat(u.max - tier)}</span>
        <button class="mbtn ${maxed ? "maxed" : "buy"}" ${maxed ? "disabled" : ""}>
          ${maxed ? "MAX" : `${u.desc} · ${upgradeCost(type, tier)}d`}</button>`;
      if (!maxed) row.querySelector("button").addEventListener("click", () => this.buyUpgrade(type));
      this.elShipyardRows.appendChild(row);
    }
  }
  flashMarket(msg) { this._flash(this.elMarketFlash, msg); }
  flashShipyard(msg) { this._flash(this.elShipyardFlash, msg); }
  _flash(el, msg) { el.textContent = msg; el.classList.add("show"); this.time.delayedCall(1200, () => el.classList.remove("show")); }

  async askOracle() {
    this.elHmOut.textContent = "The Oracle breathes the sacred vapors…";
    const snapshot = {
      drachmae: this.player.gold, cargo: this.player.cargo, capacity: this.player.holdCap,
      dockedAt: this.currentPort ? this.currentPort.name : null,
      ports: this.ports.map((p) => ({
        name: p.name, exports: p.produces, seeks: p.demands,
        prices: Object.fromEntries(GOODS.map((g) => [g, { buy: p.market.buyPrice(g), sell: p.market.sellPrice(g) }])),
      })),
    };
    try {
      const res = await fetch("/api/harbormaster", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error(`server ${res.status}`);
      this.elHmOut.textContent = (await res.json()).advice || "(the Oracle is silent)";
    } catch (e) {
      this.elHmOut.innerHTML =
        `<em>The Oracle sleeps.</em> Start the server to wake her:<br>` +
        `<code>cd trade-route-tycoon/server &amp;&amp; pip install -r requirements.txt &amp;&amp; python app.py</code>` +
        `<br>then open <code>http://localhost:5000</code>.`;
    }
  }

  // ---------------------------------------------------------------------
  // World-building: islands, ports, ships
  // ---------------------------------------------------------------------
  buildIsland(isl) {
    const owner = FACTIONS[isl.owner] || FACTIONS.neutral;
    const rng = new Phaser.Math.RandomDataGenerator([isl.name]);
    const c = this.add.container(isl.x, isl.y).setDepth(1);
    // layered shallows so each island sits in believable shallow water
    c.add(this.add.ellipse(0, 4, isl.r * 2.7, isl.r * 2.5, 0x57c7c2, 0.16));
    c.add(this.add.ellipse(0, 2, isl.r * 2.2, isl.r * 2.0, 0x3fa9b0, 0.16));
    c.add(this.add.ellipse(6, 10, isl.r * 2.1, isl.r * 1.9, 0x001018, 0.22));
    const surf = this.add.circle(0, 0, isl.r * 1.04, 0xffffff, 0).setStrokeStyle(5, 0xdfeef5, 0.5);
    c.add(surf);
    this.tweens.add({ targets: surf, scale: { from: 1.0, to: 1.05 }, alpha: { from: 0.5, to: 0.15 }, duration: 2200, yoyo: true, repeat: -1, ease: "Sine.inOut" });

    const g = this.add.graphics().setDepth(1);
    // jittered blobs → each island gets a distinct silhouette
    const base = [[0, 0, 1], [-0.45, 0.3, 0.6], [0.5, -0.2, 0.55], [0.2, 0.5, 0.5], [-0.3, -0.4, 0.5]];
    const blobs = base.map(([dx, dy, s], i) => i === 0 ? [dx, dy, s]
      : [dx + (rng.frac() - 0.5) * 0.3, dy + (rng.frac() - 0.5) * 0.3, s * (0.8 + rng.frac() * 0.5)]);
    const paint = (col, k) => { g.fillStyle(col, 1); for (const [dx, dy, s] of blobs) g.fillCircle(isl.x + dx * isl.r, isl.y + dy * isl.r, isl.r * s * k); };
    paint(0xe6d2a6, 1);     // pale beach
    paint(0xd8c08a, 0.92);  // wet sand
    paint(0xc9a86a, 0.82);  // dry sand
    paint(0x6a994e, 0.6);   // grass
    g.fillStyle(0x57843f, 1); g.fillCircle(isl.x - isl.r * 0.15, isl.y - isl.r * 0.1, isl.r * 0.4);
    g.lineStyle(3, 0xf2fbfb, 0.5); g.strokeCircle(isl.x, isl.y, isl.r * 0.99);   // foam line

    const rocks = Math.round(isl.r / 22);
    for (let i = 0; i < rocks; i++) {
      const a = rng.frac() * Math.PI * 2, rr = isl.r * (0.82 + rng.frac() * 0.16);
      this.drawRock(g, isl.x + Math.cos(a) * rr, isl.y + Math.sin(a) * rr, 0.7 + rng.frac() * 0.9);
    }
    if (isl.r >= 120) this.drawTemple(g, isl.x, isl.y - isl.r * 0.22, 0.9 + isl.r / 320);
    const trees = Math.round(isl.r / 15);
    for (let i = 0; i < trees; i++) {
      const a = rng.frac() * Math.PI * 2, rad = isl.r * 0.22 + rng.frac() * isl.r * 0.3;
      const x = isl.x + Math.cos(a) * rad, y = isl.y + Math.sin(a) * rad, s = 0.8 + rng.frac() * 0.7;
      if (rng.frac() < 0.5) this.drawCypress(g, x, y, s); else this.drawOlive(g, x, y, s);
    }
    const ss = 0.8 + isl.r / 400, sx0 = isl.x, sy0 = isl.y + isl.r * 0.28;
    this.drawSettlement(g, sx0, sy0, ss, owner.color);
    // Faction banner cloth as its own object so capture can recolor it.
    isl._banner = this.add.rectangle(sx0 + 18 * ss, sy0 - 12.5 * ss, 10 * ss, 7 * ss, owner.color).setDepth(1);

    // Name label
    this.add.text(isl.x, isl.y + isl.r * 0.62, isl.name, {
      fontFamily: "Georgia, serif", fontSize: "12px", color: "#fdf6e3",
      backgroundColor: "rgba(11,29,42,0.45)", padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth(1);

    // --- Hard collision body: a static circle centered on the island ---
    // setCircle(R) makes width=2R, but leaves the body's top-left where the 8px
    // dot was, so we reposition the top-left to (cx-R, cy-R) and recenter.
    const R = isl.r * 0.8;
    const body = this.islandGroup.create(isl.x, isl.y, "dot").setVisible(false);
    body.body.setCircle(R);
    body.body.position.set(isl.x - R, isl.y - R);
    body.body.updateCenter();
  }
  drawRock(g, x, y, s) {
    g.fillStyle(0x3a3e42, 0.3); g.fillEllipse(x + 2 * s, y + 2 * s, 10 * s, 5 * s);
    g.fillStyle(0x6b6f73, 1); g.fillCircle(x, y, 4 * s);
    g.fillStyle(0x878c90, 1); g.fillCircle(x - 1.2 * s, y - 1.2 * s, 2.4 * s);
  }
  drawSettlement(g, x, y, s, color) {
    const house = (hx, hy, w) => {
      g.fillStyle(0x0e2a12, 0.18); g.fillEllipse(hx + 2 * s, hy + w * 0.5, w * 1.4, w * 0.5);
      g.fillStyle(0xe8e0cd, 1); g.fillRect(hx - w / 2, hy - w * 0.45, w, w * 0.7);
      g.fillStyle(0xb5402f, 1); g.fillTriangle(hx - w / 2 - 1.5, hy - w * 0.45, hx + w / 2 + 1.5, hy - w * 0.45, hx, hy - w * 1.05);
    };
    house(x - 9 * s, y, 11 * s);
    house(x + 7 * s, y + 3 * s, 9 * s);
    house(x - 1 * s, y + 9 * s, 8 * s);
    g.fillStyle(0x5a4a32, 1); g.fillRect(x + 13 * s, y - 16 * s, 1.6 * s, 22 * s);    // banner pole
    // (the banner cloth is a separate Rectangle so it can be recolored on capture)
  }
  drawCypress(g, x, y, s) {
    g.fillStyle(0x0e2a12, 0.22); g.fillEllipse(x + 3 * s, y + 6 * s, 12 * s, 6 * s);
    g.fillStyle(0x4a3018, 1); g.fillRect(x - 1.5 * s, y - 2 * s, 3 * s, 8 * s);
    g.fillStyle(0x274d24, 1); g.fillTriangle(x - 6 * s, y, x + 6 * s, y, x, y - 18 * s);
    g.fillStyle(0x336b2e, 1); g.fillTriangle(x - 5 * s, y - 6 * s, x + 5 * s, y - 6 * s, x, y - 20 * s);
  }
  drawOlive(g, x, y, s) {
    g.fillStyle(0x0e2a12, 0.2); g.fillEllipse(x + 3 * s, y + 5 * s, 14 * s, 6 * s);
    g.fillStyle(0x5a3b22, 1); g.fillRect(x - 1.5 * s, y - 1 * s, 3 * s, 7 * s);
    g.fillStyle(0x7d9a6a, 1); g.fillCircle(x, y - 5 * s, 7 * s);
    g.fillStyle(0x97b389, 1); g.fillCircle(x - 3 * s, y - 3 * s, 5 * s);
    g.fillStyle(0x6b8a5a, 1); g.fillCircle(x + 3 * s, y - 7 * s, 4 * s);
  }
  drawTemple(g, x, y, s) {
    g.fillStyle(0xe8e2d0, 1); g.fillRect(x - 18 * s, y + 6 * s, 36 * s, 5 * s);
    g.fillStyle(0xcfc7b0, 1); g.fillRect(x - 18 * s, y + 9 * s, 36 * s, 2 * s);
    g.fillStyle(0xf2ecdc, 1); for (let i = -2; i <= 2; i++) g.fillRect(x + i * 8 * s - 2 * s, y - 14 * s, 4 * s, 20 * s);
    g.fillStyle(0xd6cdb6, 0.7); for (let i = -2; i <= 2; i++) g.fillRect(x + i * 8 * s + 0.8 * s, y - 14 * s, 1.4 * s, 20 * s);
    g.fillStyle(0xf2ecdc, 1); g.fillRect(x - 18 * s, y - 18 * s, 28 * s, 4 * s);
    g.fillStyle(0xece4d0, 1); g.fillTriangle(x - 18 * s, y - 18 * s, x + 4 * s, y - 18 * s, x - 7 * s, y - 26 * s);
  }

  buildPort(p) {
    const c = this.add.container(p.x, p.y).setDepth(2);
    const radius = this.add.circle(0, 0, 130, p.color, 0.08).setStrokeStyle(2, p.color, 0.4);
    const g = this.add.graphics();
    g.fillStyle(0x001018, 0.22); g.fillEllipse(6, 14, 134, 112);
    g.fillStyle(0xc9a86a, 1); g.fillCircle(0, 0, 54); g.fillCircle(-30, 10, 26); g.fillCircle(28, 14, 22);
    g.fillStyle(0x6a994e, 1); g.fillCircle(-14, -8, 28);
    g.fillStyle(0x4a3a1f, 1); g.fillRect(-7, 18, 14, 78);              // pier
    g.lineStyle(2, 0x2b2114, 1); for (let y = 26; y < 92; y += 13) g.lineBetween(-7, y, 7, y);

    const extra = [];
    if (p.landmark === "pharos") {
      // Pharos of Alexandria: a tapering tower with a glowing beacon.
      g.fillStyle(0xeae3d2, 1); g.fillRect(-14, -34, 28, 38);
      g.fillStyle(0xf2ecdc, 1); g.fillRect(-10, -64, 20, 30);
      g.fillStyle(0xe6ddc8, 1); g.fillRect(-6, -84, 12, 20);
      g.lineStyle(2, 0xcabf9e, 1); g.lineBetween(-14, -34, 14, -34); g.lineBetween(-10, -64, 10, -64);
      const halo = this.add.circle(0, -88, 22, 0xffcf6a, 0.3).setBlendMode(Phaser.BlendModes.ADD);
      const core = this.add.circle(0, -88, 6, 0xfff0c0, 0.9);
      this.tweens.add({ targets: halo, scale: { from: 0.85, to: 1.15 }, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.pharosLights.push({ halo, core });
      extra.push(halo, core);
    } else {
      // A marble temple on the acropolis.
      g.fillStyle(0xe8e2d0, 1); g.fillRect(-30, -6, 60, 8);
      g.fillStyle(0xf2ecdc, 1); for (let i = -2; i <= 2; i++) g.fillRect(i * 12 - 3, -34, 6, 28);
      g.fillStyle(0xd6cdb6, 0.7); for (let i = -2; i <= 2; i++) g.fillRect(i * 12 - 1.5, -34, 2, 28);
      g.fillStyle(0xeae2cd, 1); g.fillRect(-32, -40, 64, 6);
      g.fillStyle(0xece4d0, 1); g.fillTriangle(-32, -40, 32, -40, 0, -56);
      g.fillStyle(p.color, 1); g.fillRect(-33, -42, 66, 3);
    }
    const label = this.add.text(0, -70, p.name, {
      fontFamily: "Georgia, serif", fontSize: "15px", color: "#fdf6e3",
      backgroundColor: "rgba(11,29,42,0.55)", padding: { x: 7, y: 3 },
    }).setOrigin(0.5);
    c.add([radius, g, ...extra, label]);
    return { ...p, market: new Market(p.produces, p.demands), container: c };
  }

  // A Greek war-galley: oars, painted eye, bronze ram, square emblem sail.
  makeGalley(hullColor, deckColor, sailColor, emblemColor, eye, ram) {
    const vis = this.add.container(0, 0);
    const hull = this.add.graphics();
    if (ram) { hull.fillStyle(0xa9802f, 1); hull.fillTriangle(0, -33, -4, -27, 4, -27); }
    hull.lineStyle(2, 0x3a2614, 1);
    for (let i = -6; i <= 14; i += 6) { hull.lineBetween(-10, i, -16, i + 2); hull.lineBetween(10, i, 16, i + 2); }
    hull.fillStyle(hullColor, 1);
    hull.beginPath(); hull.moveTo(0, -28); hull.lineTo(9, -10); hull.lineTo(10, 16);
    hull.lineTo(5, 26); hull.lineTo(-5, 26); hull.lineTo(-10, 16); hull.lineTo(-9, -10);
    hull.closePath(); hull.fillPath();
    hull.fillStyle(deckColor, 1);
    hull.beginPath(); hull.moveTo(0, -22); hull.lineTo(7, -8); hull.lineTo(8, 14); hull.lineTo(-8, 14); hull.lineTo(-7, -8);
    hull.closePath(); hull.fillPath();
    if (eye) {
      hull.fillStyle(0xffffff, 1); hull.fillCircle(-5, -16, 3); hull.fillCircle(5, -16, 3);
      hull.fillStyle(0x202020, 1); hull.fillCircle(-5, -16, 1.4); hull.fillCircle(5, -16, 1.4);
    }
    const mast = this.add.graphics(); mast.fillStyle(0x3a2614, 1); mast.fillRect(-1.5, -20, 3, 32);
    const sail = this.add.graphics();
    sail.fillStyle(0x3a2614, 1); sail.fillRect(-14, -18, 28, 2);          // yard
    sail.fillStyle(sailColor, 1); sail.fillRect(-13, -16, 26, 22);        // canvas
    sail.fillStyle(0x000000, 0.12); sail.fillRect(2, -16, 11, 22);        // shading
    sail.fillStyle(emblemColor, 1); sail.fillRect(-13, -16, 26, 2); sail.fillRect(-13, 2, 26, 2); // meander border
    sail.fillCircle(0, -5, 6); sail.fillStyle(sailColor, 1); sail.fillCircle(0, -5, 3);           // emblem
    const flag = this.add.graphics(); flag.fillStyle(emblemColor, 1);
    flag.beginPath(); flag.moveTo(0, -24); flag.lineTo(12, -22); flag.lineTo(0, -20); flag.closePath(); flag.fillPath();
    vis.add([hull, mast, sail, flag]);
    return { vis, sail, flag };
  }

  buildShip(x, y) {
    const c = this.add.container(x, y).setDepth(6);
    this.physics.world.enable(c);
    c.body.setSize(24, 28); c.body.setOffset(-12, -14); c.body.setMaxVelocity(this.player.speed);
    c.add(this.add.ellipse(3, 6, 30, 46, 0x001018, 0.28));
    const parts = this.makeGalley(0x6b4a26, 0x9a6e38, 0xefe7d2, 0xb5402f, true, true);
    c.add(parts.vis);
    this.ship = c; this.shipVis = parts.vis; this.sail = parts.sail; this.flag = parts.flag;
  }

  makeDotTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4); g.generateTexture("dot", 8, 8); g.destroy();
  }
  makeRainTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xcfe6ff, 1); g.fillRoundedRect(0, 0, 3, 16, 1.5); g.generateTexture("rain", 3, 16); g.destroy();
  }

  buildOcean(W, H) {
    try {
      const base = new Phaser.Display.BaseShader("ocean", OCEAN_FRAG, undefined, {
        uTime: { type: "1f", value: 0 }, uScroll: { type: "2f", value: { x: 0, y: 0 } },
        uDay: { type: "1f", value: 1 }, uStorm: { type: "1f", value: 0 },
      });
      this.water = this.add.shader(base, 0, 0, W, H).setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
    } catch (e) {
      this.waterFallback = this.add.rectangle(0, 0, W, H, 0x12557e).setOrigin(0).setScrollFactor(0).setDepth(-100);
    }
  }
}

// Render at the device's pixel ratio so nothing is blurry on retina screens.
const DPR = Math.min(window.devicePixelRatio || 1, 2);

const config = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b1d2a",
  width: window.innerWidth * DPR,
  height: window.innerHeight * DPR,
  scale: { mode: Phaser.Scale.NONE },
  physics: { default: "arcade", arcade: { debug: false } },
  scene: [SeaScene, CityScene],
};

window.game = new Phaser.Game(config);

// The WebGL buffer is sized in device px (crisp); the canvas displays at CSS px;
// each camera zooms by DPR so world coordinates stay in CSS pixels.
function fitToDPR() {
  if (!window.game || !window.game.canvas) return;
  const w = window.innerWidth, h = window.innerHeight;
  window.game.scale.resize(w * DPR, h * DPR);
  const c = window.game.canvas;
  c.style.width = w + "px";
  c.style.height = h + "px";
  window.game.scene.scenes.forEach((s) => {
    if (s.cameras && s.cameras.main) s.cameras.main.setZoom(DPR);
  });
}
window.game.events.once("ready", fitToDPR);
window.addEventListener("resize", fitToDPR);
