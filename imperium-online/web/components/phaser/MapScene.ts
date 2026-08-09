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
import type { WorldCity } from "@/lib/api";
import { TERRAIN, BUILDINGS, isSvg, type AssetSlot } from "./assetManifest";

// `mine`/`allies` are sets of "x,y" coords: own cities wear the laurel-gold
// ring, allied cities a blue ring.
export type MapData = { cities: WorldCity[]; mine: string[]; allies: string[] };

// Island spacing on screen (wider than a tile so open sea shows between them).
const ISO_X = 150;
const ISO_Y = 78;

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

    this.redraw(this.registry.get("data") as MapData | undefined);
    this.game.events.on("data-updated", (data: MapData) => this.redraw(data), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("data-updated", undefined, this);
    });
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
  }

  // --- world layer -------------------------------------------------------

  private redraw(data?: MapData) {
    for (const o of this.worldObjects) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.worldObjects.length = 0;
    if (!data) return;

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const toScreen = (gx: number, gy: number) => ({
      x: cx + (gx - gy) * ISO_X / 2,
      y: cy + (gx + gy) * ISO_Y / 2,
    });

    // Clamp panning to the populated world plus a margin of open sea, so the
    // map can't be dragged off into an endless void.
    const xs = data.cities.map((c) => c.x);
    const ys = data.cities.map((c) => c.y);
    if (xs.length) {
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
