// World map — an isometric archipelago of shared islands (C1).
//
// Every 4×4 block of the grid is one island holding up to 16 cities owned by
// different players (see web/lib/islands.ts / server world.py). Land armies
// march freely within an island; crossing between islands is a sea voyage.
// Cities are clickable (an enemy click emits "city-selected", which the React
// map page turns into a march form); empty slots on an occupied island emit
// "cell-selected" to pre-fill the found-colony form. Drag to pan, wheel zoom.
//
// Three layers with different lifetimes:
//   sea    — built once in create(), survives every data update (depth < 0)
//   world  — islands/decor/labels/hit-zones, rebuilt on "data-updated"
//   armies — persistent marching tokens, reconciled on "movements-updated"
// The world layer is torn down by tracking what it created (see `track`) rather
// than children.removeAll(), which would take the sea and armies with it.

import * as Phaser from "phaser";
import type { Movement, WorldCity } from "@/lib/api";
import { ISLAND_SIZE, islandOf } from "@/lib/islands";
import { TERRAIN, BUILDINGS, UNITS, isSvg, type AssetSlot } from "./assetManifest";
import { SkyLayer } from "./sky";

// `mine`/`allies` are sets of "x,y" coords: own cities wear the laurel-gold
// ring, allied cities a blue ring.
export type MapData = { cities: WorldCity[]; mine: string[]; allies: string[] };

/** Movements plus the server clock they should be timed against. */
export type MovementData = { movements: Movement[]; serverNowMs: number | null };

// A live army token: the container plus what update() needs to place it.
type ArmyToken = {
  container: Phaser.GameObjects.Container;
  route: Phaser.GameObjects.Graphics | null;
  marker: Phaser.GameObjects.GameObject | null; // "found" target flag, if any
  eta: Phaser.GameObjects.Text;
  chevron: Phaser.GameObjects.Triangle;
  fx: number; fy: number; tx: number; ty: number;
  hasOrigin: boolean;
  departsMs: number;
  arrivesMs: number;
  colour: number;
  kind: Movement["kind"];
  lastSecs: number;
  arriving: boolean;
};

// A city label pair, tracked so the zoom/hover policy can toggle visibility
// without rebuilding the world.
type CityLabels = { name: Phaser.GameObjects.Text; owner: Phaser.GameObjects.Text; isMine: boolean };

/** mm:ss, or h:mm:ss for long marches — matches the MovementsPanel countdown. */
function formatEta(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const ARMY_COLOURS: Record<string, number> = {
  incoming: 0xb5532f, // enemy inbound — terracotta, matches the hover warning
  attack: 0xb7892f,   // my attack — laurel gold, matches my city ring
  reinforce: 0x4d9fd0,
  return: 0x6f8f5f,
  found: 0xd9c68a,
};

// Deterministic island names — the far-zoom navigation anchor. Hashed from the
// island coordinate so every player sees the same name.
const ISLE_NAMES = [
  "Aegina", "Melos", "Naxos", "Delos", "Paros", "Kythera", "Ithaca", "Corcyra",
  "Lemnos", "Chios", "Samos", "Rhodos", "Thera", "Kos", "Skyros", "Andros",
  "Tinos", "Icaria", "Salamis", "Seriphos", "Siphnos", "Mykonos", "Syros", "Lesbos",
];
function isleName(ix: number, iy: number): string {
  const h = Math.abs(ix * 73856093 ^ iy * 19349663);
  return ISLE_NAMES[h % ISLE_NAMES.length];
}

// Per-cell screen pitch. Cells are packed 4-to-an-island, so the pitch is much
// tighter than the old one-city-per-island layout.
const ISO_X = 120;
const ISO_Y = 62;
// Open sea between islands, in cell-widths, injected into the projection.
const GAP = 2;

// Zoom at which foreign city names appear (own cities are always labelled).
const LABEL_ZOOM = 1.0;

// The sea pattern must be power-of-two: Phaser's WebGL TileSprite repeat path
// distorts non-POT textures.
const PATTERN_W = 256;
const PATTERN_H = 128;
const SEA_KEY = "sea-pattern";

// One swell spans one island width — same absolute size as before the pitch
// change, so the ocean look carries over.
const SEA_SCALE_X = (ISO_X * 4) / PATTERN_W;
const SEA_SCALE_Y = (ISO_Y * 4) / PATTERN_H;

/** Effective coordinate: grid coordinate with sea gaps opened up at island
    boundaries. All screen positions and depths derive from this. */
function eff(g: number): number {
  return g + Math.floor(g / ISLAND_SIZE) * GAP;
}

export class MapScene extends Phaser.Scene {
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private sea?: Phaser.GameObjects.TileSprite;
  private seaInterference?: Phaser.GameObjects.TileSprite;
  private reduceMotion = false;
  // Marching armies, keyed by movement id so refreshes reconcile in place.
  private armies = new Map<number, ArmyToken>();
  private progress?: Phaser.GameObjects.Graphics;
  private sky?: SkyLayer;
  private cityLabels: CityLabels[] = [];
  // Server clock − local clock, smoothed. Armies are timed from server
  // timestamps, so a skewed local clock would misplace them.
  private skewMs = 0;

  constructor() {
    super("map");
  }

  preload() {
    const load = (key: string, slot: AssetSlot) => {
      if (isSvg(slot)) this.load.svg(key, slot.src, { width: slot.w, height: slot.h });
      else this.load.image(key, slot.src);
    };
    for (const key of ["island", "cypress", "rocks", "water", "grass"]) load(key, TERRAIN[key]);
    load("forum", BUILDINGS.forum);
    for (const [key, slot] of Object.entries(UNITS)) load(key, slot);
  }

  /** Register a world-layer object so redraw() can tear it down. */
  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.worldObjects.push(obj);
    return obj;
  }

  create() {
    this.reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Deep navy: only shows for a frame before the sea positions, and behind
    // the water's own transparent diamond corners.
    this.cameras.main.setBackgroundColor("#0e3a56");
    this.buildSea();

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.zoom = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.5, 2);
      this.applyLabelPolicy();
    });

    // Shared graphics for the travelled portion of every route.
    this.progress = this.add.graphics().setDepth(51);
    // The sky sits above the world but below nothing else — armies and islands
    // all darken together.
    this.sky = new SkyLayer(this);

    this.redraw(this.registry.get("data") as MapData | undefined);
    this.syncArmies(this.registry.get("movements") as MovementData | undefined);
    this.game.events.on("data-updated", (data: MapData) => this.redraw(data), this);
    this.game.events.on("movements-updated", (m: MovementData) => this.syncArmies(m), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("data-updated", undefined, this);
      this.game.events.off("movements-updated", undefined, this);
    });
  }

  /** Screen position of a world-grid coordinate. Shared by islands, cities and
      armies, so a token lands exactly on the city it is marching to. Sea gaps
      between islands come from the effective-coordinate transform. */
  private toScreen(gx: number, gy: number): { x: number; y: number } {
    const ex = eff(gx), ey = eff(gy);
    return {
      x: this.scale.width / 2 + (ex - ey) * ISO_X / 2,
      y: this.scale.height / 2 + (ex + ey) * ISO_Y / 2,
    };
  }

  /** Painter's-order depth for a grid cell. Effective coords keep the ordering
      monotone across island gaps. */
  private depthOf(gx: number, gy: number): number {
    return (eff(gx) + eff(gy)) * 10;
  }

  /** Foreign city names show only when zoomed in (or on hover); owner lines
      only on hover. Own cities are always labelled. */
  private applyLabelPolicy() {
    const zoomed = this.cameras.main.zoom >= LABEL_ZOOM;
    for (const l of this.cityLabels) {
      l.name.setVisible(l.isMine || zoomed);
      l.owner.setVisible(false);
    }
  }

  // --- sea ---------------------------------------------------------------

  /** Stamp the painted water diamond into a POT pattern texture. Built as a
      *canvas* texture: a framebuffer-backed RenderTexture doesn't reliably get
      GL repeat-wrapping, so a TileSprite clamps it instead of tiling. */
  private makeSeaPattern(): string | null {
    if (this.textures.exists(SEA_KEY)) return SEA_KEY;
    const src = this.textures.get("water").getSourceImage() as CanvasImageSource;
    const tex = this.textures.createCanvas(SEA_KEY, PATTERN_W, PATTERN_H);
    if (!tex) return null;
    const ctx = tex.getContext();
    const stamp = (x: number, y: number) =>
      ctx.drawImage(src, x - PATTERN_W / 2, y - PATTERN_H / 2, PATTERN_W, PATTERN_H);
    stamp(PATTERN_W / 2, PATTERN_H / 2);
    stamp(0, 0); stamp(PATTERN_W, 0); stamp(0, PATTERN_H); stamp(PATTERN_W, PATTERN_H);
    tex.refresh();
    return SEA_KEY;
  }

  private buildSea() {
    const key = this.makeSeaPattern();
    if (!key) return;
    // Big enough to cover the viewport at minimum zoom (896/0.5 × 576/0.5).
    const w = 1792, h = 1152;

    this.sea = this.add.tileSprite(0, 0, w, h, key)
      .setOrigin(0.5, 0.5)
      .setTileScale(SEA_SCALE_X, SEA_SCALE_Y)
      .setTint(0x4a6f92)
      .setDepth(-1000);

    // A second copy at an incommensurate scale, drifting the other way, breaks
    // up the repeat — the painted highlights are directional and would
    // otherwise read as a regular grid at low zoom.
    this.seaInterference = this.add.tileSprite(0, 0, w, h, key)
      .setOrigin(0.5, 0.5)
      .setTileScale(SEA_SCALE_X * 1.63, SEA_SCALE_Y * 1.63)
      .setTint(0x9fc4dc)
      .setAlpha(0.20)
      .setDepth(-999);

    if (!this.reduceMotion) this.addSeaSparkle();
  }

  /** Slow, sparse glints on the water. Scroll factor < 1 so they drift gently
      against the sea rather than sitting locked to it. */
  private addSeaSparkle() {
    const tex = this.makeSoftCircle();
    this.add.particles(0, 0, tex, {
      x: { min: 0, max: this.scale.width },
      y: { min: 0, max: this.scale.height },
      lifespan: 1900,
      scale: { start: 0.1, end: 0.34, ease: "sine.out" },
      alpha: { start: 0.5, end: 0 },
      frequency: 520,
      quantity: 1,
      blendMode: "ADD",
    }).setScrollFactor(0.15).setDepth(-500);
  }

  private makeSoftCircle(): string {
    const key = "soft-circle";
    if (this.textures.exists(key)) return key;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture(key, 16, 16);
    g.destroy();
    return key;
  }

  /** A soft foam ring sized for a whole island — three concentric ellipses. */
  private makeFoamRing(): string {
    const key = "foam-ring-island";
    if (this.textures.exists(key)) return key;
    const w = 680, h = 400;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const rings: [number, number, number][] = [
      [290, 165, 0.30],
      [310, 177, 0.18],
      [330, 189, 0.10],
    ];
    for (const [rx, ry, alpha] of rings) {
      g.lineStyle(4, 0xf2f7f5, alpha);
      g.strokeEllipse(w / 2, h / 2, rx * 2, ry * 2);
    }
    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  }

  /** Keep the sea centred on the camera and scroll its texture to match, so a
      finite quad behaves like an infinite ocean at any pan or zoom. */
  private updateSea(time: number) {
    const cam = this.cameras.main;
    const v = cam.worldView;
    const drift = this.reduceMotion
      ? { x: 0, y: 0 }
      : { x: Math.sin(time / 4200) * 3, y: Math.cos(time / 6100) * 2 };

    if (this.sea) {
      this.sea.setPosition(v.centerX, v.centerY);
      this.sea.tilePositionX = (v.centerX + drift.x) / SEA_SCALE_X;
      this.sea.tilePositionY = (v.centerY + drift.y) / SEA_SCALE_Y;
    }
    if (this.seaInterference) {
      const sx = SEA_SCALE_X * 1.63, sy = SEA_SCALE_Y * 1.63;
      this.seaInterference.setPosition(v.centerX, v.centerY);
      this.seaInterference.tilePositionX = (v.centerX - drift.x * 1.6) / sx;
      this.seaInterference.tilePositionY = (v.centerY - drift.y * 1.6) / sy;
    }
  }

  update(time: number) {
    this.updateSea(time);
    this.updateArmies();
    this.sky?.update();
  }

  // --- army layer --------------------------------------------------------

  private armyColour(m: Movement): number {
    if (m.incoming_attack) return ARMY_COLOURS.incoming;
    return ARMY_COLOURS[m.kind] ?? 0x8a8580;
  }

  /** Reconcile the live token set against a fresh movement list: add what's
      new, update timings in place (recreating would restart tweens and flicker),
      and fade out what has arrived. */
  private syncArmies(data?: MovementData) {
    if (!data) return;

    // Track the server clock so interpolation doesn't drift with a bad local one.
    if (data.serverNowMs != null) {
      const sample = data.serverNowMs - Date.now();
      // EMA smooths the header's 1s granularity and RTT jitter; the clamp stops
      // one wild sample from teleporting every army.
      this.skewMs = Phaser.Math.Clamp(this.skewMs * 0.7 + sample * 0.3, -300000, 300000);
    }

    const seen = new Set<number>();
    for (const m of data.movements) {
      seen.add(m.id);
      const existing = this.armies.get(m.id);
      if (existing) {
        existing.departsMs = Date.parse(m.departs_at);
        existing.arrivesMs = Date.parse(m.arrives_at);
        continue;
      }
      this.armies.set(m.id, this.buildArmy(m));
    }

    for (const [id, token] of this.armies) {
      if (!seen.has(id) && !token.arriving) this.retireArmy(id, token);
    }
  }

  /** Arrival: let the token settle rather than blinking out of existence. */
  private retireArmy(id: number, token: ArmyToken) {
    token.arriving = true;
    token.route?.destroy();
    token.route = null;
    token.marker?.destroy();
    token.marker = null;
    this.tweens.add({
      targets: token.container,
      alpha: 0,
      scale: 1.35,
      duration: 350,
      ease: "quad.out",
      onComplete: () => {
        this.tweens.killTweensOf(token.container);
        token.container.destroy();
        this.armies.delete(id);
      },
    });
  }

  private buildArmy(m: Movement): ArmyToken {
    const colour = this.armyColour(m);
    const hasOrigin = m.from_x != null && m.from_y != null;
    // Without an origin (the city row is gone) park the token just short of the
    // target rather than drawing a march out of (0,0).
    const fx = hasOrigin ? (m.from_x as number) : m.to_x - 0.6;
    const fy = hasOrigin ? (m.from_y as number) : m.to_y - 0.6;

    const p = this.toScreen(fx, fy);
    const q = this.toScreen(m.to_x, m.to_y);

    // Dashed route beneath every island (depth 50), so paths pass behind land.
    let route: Phaser.GameObjects.Graphics | null = null;
    if (hasOrigin) {
      route = this.add.graphics().setDepth(50);
      route.lineStyle(2, colour, 0.32);
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / len, uy = dy / len;
      for (let d = 0; d < len; d += 18) {
        const e = Math.min(len, d + 10);
        route.lineBetween(p.x + ux * d, p.y + uy * d, p.x + ux * e, p.y + uy * e);
      }
    }

    // Settlers marching to an empty cell get a flag on the destination tile.
    let marker: Phaser.GameObjects.GameObject | null = null;
    if (m.kind === "found") {
      const flag = this.add.text(q.x, q.y - 6, "⚑", {
        fontFamily: "serif", fontSize: "22px", color: "#f2e4bc",
      }).setOrigin(0.5, 1).setDepth(this.depthOf(m.to_x, m.to_y) + 103);
      flag.setShadow(0, 2, "rgba(0,0,0,0.5)", 3);
      marker = flag;
    }

    const container = this.add.container(p.x, p.y);
    container.add(this.add.ellipse(0, 10, 26, 10, 0x000000, 0.22));
    container.add(this.add.circle(0, 0, 13, colour).setStrokeStyle(2, 0x2b2620, 0.75));

    // Biggest stack picks the portrait — except on a founding march, where the
    // single settler is the point of the expedition and its (usually larger)
    // escort would otherwise mask it.
    const biggest = Object.entries(m.payload).sort((a, b) => b[1] - a[1])[0]?.[0];
    const dominant = m.kind === "found" && m.payload.settler ? "settler" : biggest;
    if (dominant && this.textures.exists(dominant)) {
      container.add(this.add.image(0, 0, dominant).setOrigin(0.5, 0.5).setScale(0.086));
    } else {
      container.add(this.add.text(0, 0, "⚑", {
        fontFamily: "serif", fontSize: "15px", color: "#3a2c14",
      }).setOrigin(0.5, 0.5));
    }

    const chevron = this.add.triangle(20, 0, 0, -5, 0, 5, 9, 0, colour)
      .setStrokeStyle(1, 0x2b2620, 0.6);
    container.add(chevron);

    const total = Object.values(m.payload).reduce((a, b) => a + b, 0);
    container.add(this.add.text(11, 5, String(total), {
      fontFamily: '"Marcellus SC", serif', fontSize: "9px", color: "#fff8e6",
    }).setOrigin(0, 0).setShadow(0, 1, "rgba(0,0,0,0.8)", 2));

    const eta = this.add.text(0, 22, "", {
      fontFamily: '"Marcellus SC", serif',
      fontSize: "10px",
      color: "#2b2620",
      backgroundColor: "rgba(247,238,213,0.92)",
      padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 0);
    container.add(eta);

    // An inbound enemy attack pulses so it reads as an alarm.
    if (m.incoming_attack && !this.reduceMotion) {
      const alarm = this.add.circle(0, 0, 18, colour, 0).setStrokeStyle(2, colour, 0.9);
      container.add(alarm);
      this.tweens.add({
        targets: alarm, scale: { from: 0.85, to: 1.5 }, alpha: { from: 0.9, to: 0 },
        duration: 1200, repeat: -1, ease: "sine.out",
      });
    }

    return {
      container, route, marker, eta, chevron,
      fx, fy, tx: m.to_x, ty: m.to_y, hasOrigin,
      departsMs: Date.parse(m.departs_at),
      arrivesMs: Date.parse(m.arrives_at),
      colour, kind: m.kind, lastSecs: -1, arriving: false,
    };
  }

  private updateArmies() {
    if (!this.progress) return;
    this.progress.clear();
    if (this.armies.size === 0) return;

    const now = Date.now() + this.skewMs;

    for (const [id, a] of this.armies) {
      if (a.arriving) continue;

      const span = Math.max(1, a.arrivesMs - a.departsMs);
      const t = Phaser.Math.Clamp((now - a.departsMs) / span, 0, 1);

      const p = this.toScreen(a.fx, a.fy);
      const q = this.toScreen(a.tx, a.ty);
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.max(1, Math.hypot(dx, dy));

      // Bow the path sideways so an outbound march and its return leg don't sit
      // on top of each other.
      const bow = (a.kind === "return" ? -10 : 10) * Math.sin(Math.PI * t);
      const x = p.x + dx * t + (-dy / len) * bow;
      const y = p.y + dy * t + (dx / len) * bow;

      // Depth from the *fractional* effective-grid sum, so a token correctly
      // passes in front of nearer islands and behind farther ones. 2.5 sits
      // above the island and its props but below labels and click hit-zones.
      const fromSum = eff(a.fx) + eff(a.fy);
      const toSum = eff(a.tx) + eff(a.ty);
      const gsum = fromSum + (toSum - fromSum) * t;
      a.container.setPosition(x, y).setDepth(gsum * 10 + 102.5);
      a.chevron.setRotation(Math.atan2(dy, dx));

      if (a.hasOrigin) {
        this.progress.lineStyle(3, a.colour, 0.85);
        this.progress.lineBetween(p.x, p.y, x, y);
      }

      // setText re-rasterises a canvas — only do it when the second changes.
      const secs = Math.max(0, Math.ceil((a.arrivesMs - now) / 1000));
      if (secs !== a.lastSecs) {
        a.lastSecs = secs;
        a.eta.setText(formatEta(secs));
      }

      if (t >= 1) this.retireArmy(id, a);
    }
  }

  // --- world layer -------------------------------------------------------

  private redraw(data?: MapData) {
    for (const o of this.worldObjects) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.worldObjects.length = 0;
    this.cityLabels = [];
    if (!data) return;

    // Group cities by the island they share.
    const byIsland = new Map<string, WorldCity[]>();
    for (const c of data.cities) {
      const [ix, iy] = islandOf(c.x, c.y);
      const k = `${ix},${iy}`;
      (byIsland.get(k) ?? byIsland.set(k, []).get(k)!).push(c);
    }

    // Camera bounds from island bounding boxes plus open sea.
    if (byIsland.size) {
      const pad = 800;
      let minSx = Infinity, maxSx = -Infinity, minSy = Infinity, maxSy = -Infinity;
      for (const k of byIsland.keys()) {
        const [ix, iy] = k.split(",").map(Number);
        const centre = this.islandCentre(ix, iy);
        minSx = Math.min(minSx, centre.x - 340); maxSx = Math.max(maxSx, centre.x + 340);
        minSy = Math.min(minSy, centre.y - 200); maxSy = Math.max(maxSy, centre.y + 200);
      }
      this.cameras.main.setBounds(minSx - pad, minSy - pad, (maxSx - minSx) + pad * 2, (maxSy - minSy) + pad * 2);
    }

    for (const [k, cities] of byIsland) {
      const [ix, iy] = k.split(",").map(Number);
      this.drawIsland(ix, iy, cities, data);
    }
    this.applyLabelPolicy();
  }

  /** Screen centre of an island: midpoint of its 4×4 cell block. */
  private islandCentre(ix: number, iy: number): { x: number; y: number } {
    const a = this.toScreen(ix * ISLAND_SIZE, iy * ISLAND_SIZE);
    const b = this.toScreen(ix * ISLAND_SIZE + ISLAND_SIZE - 1, iy * ISLAND_SIZE + ISLAND_SIZE - 1);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** One shared landmass with up to 16 cities on it. */
  private drawIsland(ix: number, iy: number, cities: WorldCity[], data: MapData) {
    const centre = this.islandCentre(ix, iy);
    const baseDepth = this.depthOf(ix * ISLAND_SIZE, iy * ISLAND_SIZE);
    const occupied = new Set(cities.map((c) => `${c.x},${c.y}`));

    // Shoreline: sandbank halo + foam ring, once per island.
    this.track(this.add.ellipse(centre.x, centre.y + 6, 620, 360, 0x7fd4e0, 0.20).setDepth(baseDepth - 4));
    const ring = this.track(
      this.add.image(centre.x, centre.y + 6, this.makeFoamRing()).setOrigin(0.5, 0.5).setDepth(baseDepth - 3),
    );
    if (!this.reduceMotion) {
      this.tweens.add({
        targets: ring,
        scale: { from: 1, to: 1.045 },
        alpha: { from: 0.9, to: 0.5 },
        duration: 3600 + ((ix * 7 + iy * 13 + 400) % 900),
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
    }

    // The landmass: the painted island stretched to the block footprint (a
    // placeholder until a purpose-painted 4×4 island lands), plus a grass
    // diamond per occupied cell so cities sit on solid ground.
    this.track(
      this.add.image(centre.x, centre.y, "island").setOrigin(0.5, 0.5).setScale(0.66, 0.48).setDepth(baseDepth - 2),
    );

    // One decor pair per island, not per city.
    const west = this.toScreen(ix * ISLAND_SIZE, iy * ISLAND_SIZE + ISLAND_SIZE - 1);
    const east = this.toScreen(ix * ISLAND_SIZE + ISLAND_SIZE - 1, iy * ISLAND_SIZE);
    this.track(this.add.image(west.x - 8, west.y + 6, "cypress").setOrigin(0.5, 1).setScale(0.11).setDepth(baseDepth - 1));
    this.track(this.add.image(east.x + 10, east.y + 8, "rocks").setOrigin(0.5, 1).setScale(0.11).setDepth(baseDepth - 1));

    // Island name at the south tip — the far-zoom anchor.
    const south = this.toScreen(ix * ISLAND_SIZE + ISLAND_SIZE - 1, iy * ISLAND_SIZE + ISLAND_SIZE - 1);
    this.track(this.add.text(south.x, south.y + 44, isleName(ix, iy), {
      fontFamily: '"Marcellus SC", serif', fontSize: "12px", color: "#cfe0f0",
    }).setOrigin(0.5, 0).setAlpha(0.85).setShadow(0, 1, "rgba(0,0,0,0.6)", 2).setDepth(baseDepth - 1));

    // Cells: grass under cities, faint sand mounds marking free slots.
    for (let dx = 0; dx < ISLAND_SIZE; dx++) {
      for (let dy = 0; dy < ISLAND_SIZE; dy++) {
        const gx = ix * ISLAND_SIZE + dx, gy = iy * ISLAND_SIZE + dy;
        const pos = this.toScreen(gx, gy);
        const d = this.depthOf(gx, gy);
        if (occupied.has(`${gx},${gy}`)) {
          this.track(this.add.image(pos.x, pos.y, "grass")
            .setOrigin(0.5, 0.5).setDisplaySize(ISO_X + 2, ISO_Y + 2).setDepth(d - 1));
        } else {
          // A buildable slot: subtle mound + click-to-found.
          this.track(this.add.ellipse(pos.x, pos.y + 2, 52, 26, 0xd9c68a, 0.16).setDepth(d - 1));
          const slot = this.track(
            this.add.ellipse(pos.x, pos.y, ISO_X * 0.8, ISO_Y * 0.8, 0xffffff, 0.001)
              .setInteractive({ useHandCursor: true }).setDepth(d + 4),
          );
          slot.on("pointerover", () => slot.setFillStyle(0xd9c68a, 0.18));
          slot.on("pointerout", () => slot.setFillStyle(0xffffff, 0.001));
          slot.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            if (pointer.getDistance() < 8) this.game.events.emit("cell-selected", { x: gx, y: gy });
          });
        }
      }
    }

    // Cities.
    for (const c of cities) this.drawCity(c, data);
  }

  private drawCity(c: WorldCity, data: MapData) {
    const { x, y } = this.toScreen(c.x, c.y);
    const key = `${c.x},${c.y}`;
    const isMine = data.mine.includes(key);
    const isAllied = !isMine && data.allies.includes(key);
    const depth = this.depthOf(c.x, c.y) + 100;

    if (isMine) {
      this.track(this.add.circle(x, y - 4, 34, 0xb7892f, 0).setStrokeStyle(3, 0xb7892f, 1).setDepth(depth + 1));
    } else if (isAllied) {
      this.track(this.add.circle(x, y - 4, 34, 0x3f7fa6, 0).setStrokeStyle(3, 0x4d9fd0, 1).setDepth(depth + 1));
    }

    this.track(this.add.image(x, y, "forum").setOrigin(0.5, 0.82).setScale(0.085).setDepth(depth + 2));

    const name = this.track(this.add.text(x, y + 18, c.name, {
      fontFamily: '"Cinzel", serif',
      fontSize: "11px",
      fontStyle: isMine ? "bold" : "normal",
      color: "#2b2620",
      backgroundColor: "rgba(247,238,213,0.92)",
      padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 0).setDepth(depth + 3));
    const owner = this.track(this.add.text(x, y + 33, c.owner, {
      fontFamily: '"Marcellus SC", serif', fontSize: "9px", color: "#e9f3f8",
    }).setOrigin(0.5, 0).setShadow(0, 1, "rgba(0,0,0,0.6)", 2).setDepth(depth + 3).setVisible(false));
    this.cityLabels.push({ name, owner, isMine });

    // Click-to-march hit zone (enemy cities get a hover highlight).
    const hit = this.track(
      this.add.rectangle(x, y - 4, 80, 56, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: !isMine }).setDepth(depth + 4),
    );
    hit.on("pointerover", () => {
      if (!isMine) hit.setFillStyle(0xb5532f, 0.14);
      name.setVisible(true);
      owner.setVisible(true);
    });
    hit.on("pointerout", () => {
      hit.setFillStyle(0xffffff, 0.001);
      this.applyLabelPolicy();
    });
    hit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 8) this.game.events.emit("city-selected", c);
    });
  }
}
