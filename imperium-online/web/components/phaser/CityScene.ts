// Phaser scene for the city view. Purely a renderer: it reads the latest city
// data (pushed in from React via the game registry) and draws four building
// plots with their current levels. No game logic lives here — the server owns
// all state; this just visualizes it.

import Phaser from "phaser";
import type { City } from "@/lib/api";

const PLOTS: { key: keyof City; label: string; color: number }[] = [
  { key: "forum_level", label: "Forum", color: 0xb7892f },
  { key: "timber_camp_level", label: "Timber Camp", color: 0x5c6b3f },
  { key: "quarry_level", label: "Quarry", color: 0x8a8278 },
  { key: "silver_mine_level", label: "Silver Mine", color: 0x6b7b8c },
];

export class CityScene extends Phaser.Scene {
  constructor() {
    super("city");
  }

  create() {
    this.cameras.main.setBackgroundColor("#e6ddcc");
    this.redraw(this.registry.get("data") as City | undefined);
    // React pushes new data by emitting this event on the game bus.
    this.game.events.on("data-updated", (data: City) => this.redraw(data), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("data-updated", undefined, this);
    });
  }

  private redraw(city?: City) {
    this.children.removeAll();
    const w = this.scale.width;

    this.add.text(w / 2, 24, city ? city.name : "…", {
      fontFamily: "Georgia, serif",
      fontSize: "24px",
      color: "#2b2620",
    }).setOrigin(0.5, 0.5);

    if (!city) return;

    // A 2x2 grid of building plots.
    const cols = 2;
    const plotW = 150;
    const plotH = 90;
    const gapX = 40;
    const gapY = 36;
    const totalW = cols * plotW + (cols - 1) * gapX;
    const startX = (w - totalW) / 2;
    const startY = 70;

    PLOTS.forEach((plot, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (plotW + gapX);
      const y = startY + row * (plotH + gapY);
      const level = city[plot.key] as number;

      this.add.rectangle(x, y, plotW, plotH, plot.color, 0.9)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x2b2620, 0.25);
      // A little stack of "blocks" implying the building's height by level.
      const blocks = Math.min(level, 8);
      for (let b = 0; b < blocks; b++) {
        this.add.rectangle(x + 12 + b * 14, y + plotH - 14, 10, 10 + b, 0xffffff, 0.35).setOrigin(0, 1);
      }
      this.add.text(x + 10, y + 8, plot.label, {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: "#fffdf8",
      });
      this.add.text(x + plotW - 10, y + 8, `Lv ${level}`, {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#fffdf8",
      }).setOrigin(1, 0);
    });
  }
}
