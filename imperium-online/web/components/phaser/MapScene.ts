// Shared-world map — sea, islands, cities.
//
// Each cell of the grid is rendered as a sea tile. Cities are placed on small
// "island" patches (grass tile + rocks/trees + the Forum sprite) — yours
// highlighted with a laurel-gold ring. Drag-pan and wheel-zoom supported.

import * as Phaser from "phaser";
import type { WorldCity } from "@/lib/api";

const ASSETS = "/assets/medieval";
const CELL = 96;

export type MapData = { cities: WorldCity[]; mine: { x: number; y: number } | null };

export class MapScene extends Phaser.Scene {
  constructor() {
    super("map");
  }

  preload() {
    this.load.image("sea", `${ASSETS}/sea.png`);
    this.load.image("shallows", `${ASSETS}/shallows.png`);
    this.load.image("grass", `${ASSETS}/grass.png`);
    this.load.image("forum", `${ASSETS}/forum.png`);
    this.load.image("tree_pine", `${ASSETS}/tree_pine.png`);
    this.load.image("rock_grey", `${ASSETS}/rock_grey.png`);
  }

  create() {
    this.cameras.main.setBackgroundColor("#5a93ad");

    // Input: drag to pan, wheel to zoom.
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

    // Establish a window around (0,0) and the populated cells so the sea
    // tilemap has something to fill even before the player explores.
    const xs = data.cities.map((c) => c.x);
    const ys = data.cities.map((c) => c.y);
    const minX = Math.min(0, ...xs) - 3;
    const maxX = Math.max(0, ...xs) + 3;
    const minY = Math.min(0, ...ys) - 3;
    const maxY = Math.max(0, ...ys) + 3;

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const toScreen = (gx: number, gy: number) => ({ x: cx + gx * CELL, y: cy + gy * CELL });

    // Sea + a thin band of shallows around populated tiles.
    const populated = new Set(data.cities.map((c) => `${c.x},${c.y}`));
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const { x, y } = toScreen(gx, gy);
        const nearLand =
          populated.has(`${gx + 1},${gy}`) || populated.has(`${gx - 1},${gy}`) ||
          populated.has(`${gx},${gy + 1}`) || populated.has(`${gx},${gy - 1}`);
        const tex = nearLand ? "shallows" : "sea";
        this.add.image(x, y, tex).setOrigin(0.5, 0.5).setDisplaySize(CELL, CELL);
      }
    }

    // Cities — grass patch under each, then the forum sprite. Yours wears a
    // laurel-gold ring.
    for (const c of data.cities) {
      const { x, y } = toScreen(c.x, c.y);
      const isMine = !!(data.mine && c.x === data.mine.x && c.y === data.mine.y);

      // small grass island
      this.add.image(x, y, "grass").setOrigin(0.5, 0.5).setDisplaySize(CELL * 0.85, CELL * 0.85);

      if (isMine) {
        // laurel-gold ring
        this.add.circle(x, y, CELL * 0.46, 0xb7892f, 0)
          .setStrokeStyle(3, 0xb7892f, 1);
      }

      // An invisible hit-zone over each city. Clicking emits a selection event
      // that React (the map page) turns into a "send army" form. Enemy cities
      // get a hover highlight to signal they're attackable.
      const hit = this.add
        .rectangle(x, y, CELL * 0.9, CELL * 0.9, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: !isMine });
      hit.on("pointerover", () => { if (!isMine) hit.setFillStyle(0xb5532f, 0.12); });
      hit.on("pointerout", () => hit.setFillStyle(0xffffff, 0.001));
      hit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        // Ignore the pointerup that ends a drag-pan — only true clicks select.
        if (pointer.getDistance() < 8) this.game.events.emit("city-selected", c);
      });

      // city sprite
      this.add.image(x, y + 4, "forum").setOrigin(0.5, 0.7).setScale(0.85);

      // tiny ground decor for a touch of life
      this.add.image(x - CELL * 0.32, y - CELL * 0.1, "tree_pine").setOrigin(0.5, 1).setScale(0.55);
      this.add.image(x + CELL * 0.30, y + CELL * 0.18, "rock_grey").setOrigin(0.5, 1).setScale(0.55);

      // name + owner labels (drawn at high depth so they sit above everything)
      this.add
        .text(x, y + CELL * 0.34, c.name, {
          fontFamily: '"Cinzel", serif',
          fontSize: "14px",
          fontStyle: isMine ? "bold" : "normal",
          color: "#2b2620",
          backgroundColor: "rgba(247,238,213,0.9)",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5, 0);
      this.add
        .text(x, y + CELL * 0.34 + 22, c.owner, {
          fontFamily: '"Marcellus SC", serif',
          fontSize: "10px",
          color: "#5a4f40",
        })
        .setOrigin(0.5, 0);
    }
  }
}
