// Phaser scene for the shared world map. Plots every city returned by the
// server on a grid, with the viewer's own cities highlighted. Drag to pan.

import Phaser from "phaser";
import type { WorldCity } from "@/lib/api";

export type MapData = { cities: WorldCity[]; mine: { x: number; y: number } | null };

const CELL = 70; // pixels per grid unit

export class MapScene extends Phaser.Scene {
  constructor() {
    super("map");
  }

  create() {
    this.cameras.main.setBackgroundColor("#eef3f6"); // a pale "sea"
    this.redraw(this.registry.get("data") as MapData | undefined);
    this.game.events.on("data-updated", (data: MapData) => this.redraw(data), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("data-updated", undefined, this);
    });

    // Simple drag-to-pan.
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.cameras.main.scrollX -= p.x - p.prevPosition.x;
      this.cameras.main.scrollY -= p.y - p.prevPosition.y;
    });
  }

  private redraw(data?: MapData) {
    this.children.removeAll();
    if (!data) return;

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const toScreen = (gx: number, gy: number) => ({ x: cx + gx * CELL, y: cy + gy * CELL });

    // Faint grid lines around the populated area.
    const xs = data.cities.map((c) => c.x);
    const ys = data.cities.map((c) => c.y);
    const minX = Math.min(0, ...xs) - 2;
    const maxX = Math.max(0, ...xs) + 2;
    const minY = Math.min(0, ...ys) - 2;
    const maxY = Math.max(0, ...ys) + 2;
    const g = this.add.graphics();
    g.lineStyle(1, 0xc7d3da, 1);
    for (let gx = minX; gx <= maxX; gx++) {
      const a = toScreen(gx, minY);
      const b = toScreen(gx, maxY);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let gy = minY; gy <= maxY; gy++) {
      const a = toScreen(minX, gy);
      const b = toScreen(maxX, gy);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    data.cities.forEach((c) => {
      const { x, y } = toScreen(c.x, c.y);
      const isMine = data.mine && c.x === data.mine.x && c.y === data.mine.y;
      this.add.circle(x, y, 12, isMine ? 0xb5532f : 0x5c6b3f).setStrokeStyle(2, 0x2b2620, 0.4);
      this.add.text(x, y + 18, `${c.name}`, {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        fontStyle: isMine ? "bold" : "normal",
        color: "#2b2620",
      }).setOrigin(0.5, 0);
      this.add.text(x, y + 34, `${c.owner}`, {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#7a715f",
      }).setOrigin(0.5, 0);
    });
  }
}
