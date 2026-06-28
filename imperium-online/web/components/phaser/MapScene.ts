// World map — isometric open sea dotted with island city-states.
//
// Each city sits on its own island at an isometric position derived from its
// world-grid coordinate; the viewer's own city wears a laurel-gold ring.
// Cities are clickable (an enemy click emits "city-selected", which the React
// map page turns into a march form). Drag to pan, wheel to zoom.

import * as Phaser from "phaser";
import type { WorldCity } from "@/lib/api";
import { TERRAIN, BUILDINGS, isSvg, type AssetSlot } from "./assetManifest";

// `mine` is the set of the viewer's own city coordinates ("x,y") — a user can
// own several, and they all wear the laurel-gold ring.
export type MapData = { cities: WorldCity[]; mine: string[] };

// Island spacing on screen (wider than a tile so open sea shows between them).
const ISO_X = 150;
const ISO_Y = 78;

export class MapScene extends Phaser.Scene {
  constructor() {
    super("map");
  }

  preload() {
    const load = (key: string, slot: AssetSlot) => {
      if (isSvg(slot)) this.load.svg(key, slot.src, { width: slot.w, height: slot.h });
      else this.load.image(key, slot.src);
    };
    for (const key of ["island", "cypress", "rocks"]) load(key, TERRAIN[key]);
    load("forum", BUILDINGS.forum);
  }

  create() {
    this.cameras.main.setBackgroundColor("#3f7fa6");

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

  private redraw(data?: MapData) {
    this.children.removeAll();
    if (!data) return;

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const toScreen = (gx: number, gy: number) => ({
      x: cx + (gx - gy) * ISO_X / 2,
      y: cy + (gx + gy) * ISO_Y / 2 - (gx + gy) * 0, // (kept linear; islands self-depth)
    });

    // Faint sea shimmer across the populated span.
    const xs = data.cities.map((c) => c.x);
    const ys = data.cities.map((c) => c.y);
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(2, 0x5a97b8, 0.5);
    const minX = Math.min(0, ...xs) - 2, maxX = Math.max(0, ...xs) + 2;
    const minY = Math.min(0, ...ys) - 2, maxY = Math.max(0, ...ys) + 2;
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const { x, y } = toScreen(gx, gy);
        g.beginPath();
        g.moveTo(x - 14, y); g.lineTo(x - 6, y - 4); g.lineTo(x + 2, y); g.lineTo(x + 10, y - 4);
        g.strokePath();
      }
    }

    for (const c of data.cities) {
      const { x, y } = toScreen(c.x, c.y);
      const isMine = data.mine.includes(`${c.x},${c.y}`);
      const depth = (c.x + c.y) * 10 + 100;

      this.add.image(x, y, "island").setOrigin(0.5, 0.5).setDepth(depth);

      if (isMine) {
        this.add.circle(x, y - 6, 56, 0xb7892f, 0).setStrokeStyle(4, 0xb7892f, 1).setDepth(depth + 1);
      }

      this.add.image(x - 34, y - 6, "cypress").setOrigin(0.5, 1).setScale(0.5).setDepth(depth + 1);
      this.add.image(x + 30, y + 4, "rocks").setOrigin(0.5, 1).setScale(0.5).setDepth(depth + 1);
      this.add.image(x, y - 2, "forum").setOrigin(0.5, 0.78).setScale(0.62).setDepth(depth + 2);

      this.add.text(x, y + 30, c.name, {
        fontFamily: '"Cinzel", serif',
        fontSize: "14px",
        fontStyle: isMine ? "bold" : "normal",
        color: "#2b2620",
        backgroundColor: "rgba(247,238,213,0.92)",
        padding: { x: 6, y: 2 },
      }).setOrigin(0.5, 0).setDepth(depth + 3);
      this.add.text(x, y + 52, c.owner, {
        fontFamily: '"Marcellus SC", serif', fontSize: "10px", color: "#e9f3f8",
      }).setOrigin(0.5, 0).setDepth(depth + 3);

      // Click-to-march hit zone (enemy cities get a hover highlight).
      const hit = this.add.rectangle(x, y - 6, 110, 90, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: !isMine }).setDepth(depth + 4);
      hit.on("pointerover", () => { if (!isMine) hit.setFillStyle(0xb5532f, 0.14); });
      hit.on("pointerout", () => hit.setFillStyle(0xffffff, 0.001));
      hit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() < 8) this.game.events.emit("city-selected", c);
      });
    }
  }
}
