// World map — isometric open sea dotted with island city-states.
//
// Each city sits on its own island at an isometric position derived from its
// world-grid coordinate; the viewer's own city wears a laurel-gold ring.
// Cities are clickable (an enemy click emits "city-selected", which the React
// map page turns into a march form). Drag to pan, wheel to zoom.
//
// Three layers with different lifetimes:
//   sea    — built once in create(), survives every data update (depth < 0)
//   world  — islands/decor/labels/hit-zones, rebuilt on "data-updated"
//   armies — persistent marching tokens, reconciled on "movements-updated"
// The world layer is torn down by tracking what it created (see `track`) rather
// than children.removeAll(), which would take the sea and armies with it.

import * as Phaser from "phaser";
import type { Movement, WorldCity } from "@/lib/api";
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

// Island spacing on screen. An island renders ~192×144, so the step has to
// clear that or neighbours collide — with open sea (and room for marching
// armies to be legible) between them.
const ISO_X = 240;
const ISO_Y = 124;

// The sea pattern must be power-of-two: Phaser's WebGL TileSprite repeat path
// distorts non-POT textures. 256×128 holds exactly one lattice cell (two
// diamond centres), so tiling it reproduces the diamond grid seamlessly.
const PATTERN_W = 256;
const PATTERN_H = 128;
const SEA_KEY = "sea-pattern";

// One swell spans two island cells, so waves are large and the repeat is less
// obvious than tiling at the lattice pitch.
const SEA_SCALE_X = (ISO_X * 2) / PATTERN_W;
const SEA_SCALE_Y = (ISO_Y * 2) / PATTERN_H;

export class MapScene extends Phaser.Scene {
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private sea?: Phaser.GameObjects.TileSprite;
  private seaInterference?: Phaser.GameObjects.TileSprite;
  private reduceMotion = false;
  // Marching armies, keyed by movement id so refreshes reconcile in place.
  private armies = new Map<number, ArmyToken>();
  private progress?: Phaser.GameObjects.Graphics;
  private sky?: SkyLayer;
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
    for (const key of ["island", "cypress", "rocks", "water"]) load(key, TERRAIN[key]);
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
    // the water's own transparent diamond corners. Dark on purpose — a light
    // background would make any tiling seam glow.
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

  /** Screen position of a world-grid coordinate. Shared by islands and armies
      so a token lands exactly on the city it is marching to. */
  private toScreen(gx: number, gy: number): { x: number; y: number } {
    return {
      x: this.scale.width / 2 + (gx - gy) * ISO_X / 2,
      y: this.scale.height / 2 + (gx + gy) * ISO_Y / 2,
    };
  }

  // --- sea ---------------------------------------------------------------

  /** Stamp the painted water diamond into a POT pattern texture: one centred
      diamond plus the four corner quarters, which together form the repeating
      unit of the isometric lattice.

      Built as a *canvas* texture, not a RenderTexture: a RenderTexture is
      framebuffer-backed and doesn't reliably get GL repeat-wrapping, so a
      TileSprite clamps it instead of tiling. */
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

    // Swells run at twice the island lattice: bigger, calmer waves that repeat
    // half as often across the viewport, so the tiling reads as ocean rather
    // than as a quilt.
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

  /** A reusable soft foam ring — three concentric stroked ellipses. */
  private makeFoamRing(): string {
    const key = "foam-ring";
    if (this.textures.exists(key)) return key;
    const w = 256, h = 160;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const rings: [number, number, number][] = [
      [100, 60, 0.30],
      [108, 65, 0.18],
      [116, 70, 0.10],
    ];
    for (const [rx, ry, alpha] of rings) {
      g.lineStyle(3, 0xf2f7f5, alpha);
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
      }).setOrigin(0.5, 1).setDepth((m.to_x + m.to_y) * 10 + 103);
      flag.setShadow(0, 2, "rgba(0,0,0,0.5)", 3);
      marker = flag;
    }

    const container = this.add.container(p.x, p.y);
    container.add(this.add.ellipse(0, 10, 26, 10, 0x000000, 0.22));
    container.add(this.add.circle(0, 0, 13, colour).setStrokeStyle(2, 0x2b2620, 0.75));

    // Biggest stack in the payload picks the portrait; settlers have no sprite.
    const dominant = Object.entries(m.payload).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant && dominant !== "settler" && this.textures.exists(dominant)) {
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

      // Depth from the *fractional* grid sum, so a token correctly passes in
      // front of nearer islands and behind farther ones. 2.5 sits above the
      // island and its props but below the city label and the click hit-zone.
      const gsum = (a.fx + a.fy) + ((a.tx + a.ty) - (a.fx + a.fy)) * t;
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
    if (!data) return;

    const toScreen = (gx: number, gy: number) => this.toScreen(gx, gy);

    // Clamp panning to the populated world plus a margin of open sea, so the
    // map can't be dragged off into an endless void.
    if (data.cities.length) {
      const corners = data.cities.map((c) => toScreen(c.x, c.y));
      const pad = 800;
      const minSx = Math.min(...corners.map((p) => p.x)) - pad;
      const maxSx = Math.max(...corners.map((p) => p.x)) + pad;
      const minSy = Math.min(...corners.map((p) => p.y)) - pad;
      const maxSy = Math.max(...corners.map((p) => p.y)) + pad;
      this.cameras.main.setBounds(minSx, minSy, maxSx - minSx, maxSy - minSy);
    }

    const foam = this.makeFoamRing();

    for (const c of data.cities) {
      const { x, y } = toScreen(c.x, c.y);
      const key = `${c.x},${c.y}`;
      const isMine = data.mine.includes(key);
      const isAllied = !isMine && data.allies.includes(key);
      const depth = (c.x + c.y) * 10 + 100;

      // Shoreline: a pale sandbank halo, then the foam ring, then the island.
      this.track(this.add.ellipse(x, y + 4, 256, 152, 0x7fd4e0, 0.22).setDepth(depth - 2));
      const ring = this.track(
        this.add.image(x, y + 4, foam).setOrigin(0.5, 0.5).setDepth(depth - 1),
      );
      if (!this.reduceMotion) {
        this.tweens.add({
          targets: ring,
          scale: { from: 1, to: 1.055 },
          alpha: { from: 0.9, to: 0.45 },
          duration: 3200 + ((c.x * 7 + c.y * 13) % 900),
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
        });
      }

      this.track(this.add.image(x, y, "island").setOrigin(0.5, 0.5).setScale(0.24).setDepth(depth));

      if (isMine) {
        this.track(this.add.circle(x, y - 6, 56, 0xb7892f, 0).setStrokeStyle(4, 0xb7892f, 1).setDepth(depth + 1));
      } else if (isAllied) {
        this.track(this.add.circle(x, y - 6, 56, 0x3f7fa6, 0).setStrokeStyle(4, 0x4d9fd0, 1).setDepth(depth + 1));
      }

      this.track(this.add.image(x - 36, y, "cypress").setOrigin(0.5, 1).setScale(0.13).setDepth(depth + 1));
      this.track(this.add.image(x + 34, y + 6, "rocks").setOrigin(0.5, 1).setScale(0.13).setDepth(depth + 1));
      this.track(this.add.image(x, y, "forum").setOrigin(0.5, 0.82).setScale(0.12).setDepth(depth + 2));

      this.track(this.add.text(x, y + 30, c.name, {
        fontFamily: '"Cinzel", serif',
        fontSize: "14px",
        fontStyle: isMine ? "bold" : "normal",
        color: "#2b2620",
        backgroundColor: "rgba(247,238,213,0.92)",
        padding: { x: 6, y: 2 },
      }).setOrigin(0.5, 0).setDepth(depth + 3));
      this.track(this.add.text(x, y + 52, c.owner, {
        fontFamily: '"Marcellus SC", serif', fontSize: "10px", color: "#e9f3f8",
      }).setOrigin(0.5, 0).setDepth(depth + 3));

      // Click-to-march hit zone (enemy cities get a hover highlight).
      const hit = this.track(
        this.add.rectangle(x, y - 6, 110, 90, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: !isMine }).setDepth(depth + 4),
      );
      hit.on("pointerover", () => { if (!isMine) hit.setFillStyle(0xb5532f, 0.14); });
      hit.on("pointerout", () => hit.setFillStyle(0xffffff, 0.001));
      hit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() < 8) this.game.events.emit("city-selected", c);
      });
    }
  }
}
