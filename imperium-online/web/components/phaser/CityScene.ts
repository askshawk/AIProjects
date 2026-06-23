// City view — top-down Stronghold/Civ-mobile style.
//
// Lays a 14x9 grass tilemap, runs a dirt path through it, plants trees and
// rocks for atmosphere, then drops the four buildings as Kenney sprites at
// fixed positions. Pending builds get a translucent scaffold overlay + bob
// tween; chimney smoke particles drift from the Forum. The whole scene reads
// from the city data pushed in by React via the game registry.

import * as Phaser from "phaser";
import type { City, BuildJob } from "@/lib/api";

const ASSETS = "/assets/medieval";
const TILE = 64;
const COLS = 14;
const ROWS = 9;

// Per-building scene placement (in tile units). Picked so the Forum sits at
// the path crossing, with the producers fanning out around it.
type BuildingKey = "forum" | "timber_camp" | "quarry" | "silver_mine" | "farm";
type Placement = {
  key: BuildingKey;
  levelField: keyof City;
  label: string;
  col: number;
  row: number;
  smoke?: boolean;
};
const PLACEMENTS: Placement[] = [
  { key: "forum",       levelField: "forum_level",       label: "Forum",       col: 7, row: 4, smoke: true },
  { key: "timber_camp", levelField: "timber_camp_level", label: "Timber Camp", col: 3, row: 2 },
  { key: "quarry",      levelField: "quarry_level",      label: "Quarry",      col: 11, row: 2 },
  { key: "silver_mine", levelField: "silver_mine_level", label: "Silver Mine", col: 3, row: 7 },
  { key: "farm",        levelField: "farm_level",        label: "Farm",        col: 11, row: 7 },
];

// Tiles that aren't pure grass — drawn on top of the grass base layer.
const PATHS: { col: number; row: number; tile: "h" | "v" | "x" }[] = [
  { col: 7, row: 0, tile: "v" }, { col: 7, row: 1, tile: "v" },
  { col: 7, row: 2, tile: "v" }, { col: 7, row: 3, tile: "v" },
  { col: 7, row: 5, tile: "v" }, { col: 7, row: 6, tile: "v" },
  { col: 7, row: 7, tile: "v" }, { col: 7, row: 8, tile: "v" },
  { col: 0, row: 4, tile: "h" }, { col: 1, row: 4, tile: "h" },
  { col: 2, row: 4, tile: "h" }, { col: 3, row: 4, tile: "h" },
  { col: 4, row: 4, tile: "h" }, { col: 5, row: 4, tile: "h" },
  { col: 6, row: 4, tile: "h" }, { col: 7, row: 4, tile: "x" },
  { col: 8, row: 4, tile: "h" }, { col: 9, row: 4, tile: "h" },
  { col: 10, row: 4, tile: "h" }, { col: 11, row: 4, tile: "h" },
  { col: 12, row: 4, tile: "h" }, { col: 13, row: 4, tile: "h" },
];

// Decorative props — trees near the forest edge, rocks near the quarry.
const DECOR: { x: number; y: number; key: "tree_pine" | "tree_fir" | "rock_grey" | "rock_brown" }[] = [
  { x: 1.2, y: 1.0, key: "tree_fir" }, { x: 0.5, y: 2.4, key: "tree_pine" },
  { x: 1.8, y: 3.2, key: "tree_pine" }, { x: 0.7, y: 0.6, key: "tree_fir" },
  { x: 4.6, y: 1.1, key: "tree_fir" }, { x: 5.7, y: 0.5, key: "tree_pine" },
  { x: 12.6, y: 0.6, key: "rock_brown" }, { x: 13.2, y: 1.8, key: "rock_grey" },
  { x: 10.2, y: 0.8, key: "rock_grey" }, { x: 9.4, y: 1.5, key: "rock_brown" },
  { x: 12.2, y: 3.2, key: "rock_grey" },
  { x: 0.5, y: 6.4, key: "tree_pine" }, { x: 1.5, y: 6.0, key: "tree_fir" },
  { x: 1.0, y: 8.2, key: "tree_fir" }, { x: 4.6, y: 8.1, key: "tree_pine" },
  { x: 12.8, y: 7.0, key: "tree_fir" }, { x: 11.4, y: 8.3, key: "tree_pine" },
  { x: 9.8, y: 7.6, key: "tree_fir" }, { x: 13.0, y: 5.4, key: "tree_pine" },
];

export class CityScene extends Phaser.Scene {
  private buildingSprites = new Map<BuildingKey, Phaser.GameObjects.Image>();
  private buildingLabels = new Map<BuildingKey, Phaser.GameObjects.Text>();
  private scaffolds = new Map<BuildingKey, Phaser.GameObjects.Image>();
  private titleText?: Phaser.GameObjects.Text;

  constructor() {
    super("city");
  }

  preload() {
    this.load.image("grass", `${ASSETS}/grass.png`);
    this.load.image("path_h", `${ASSETS}/path_horiz.png`);
    this.load.image("path_v", `${ASSETS}/path_vert.png`);
    this.load.image("path_x", `${ASSETS}/path_cross.png`);
    this.load.image("tree_pine", `${ASSETS}/tree_pine.png`);
    this.load.image("tree_fir", `${ASSETS}/tree_fir.png`);
    this.load.image("rock_grey", `${ASSETS}/rock_grey.png`);
    this.load.image("rock_brown", `${ASSETS}/rock_brown.png`);
    this.load.image("scaffold", `${ASSETS}/scaffold.png`);
    for (const p of PLACEMENTS) {
      this.load.image(p.key, `${ASSETS}/${p.key}.png`);
    }
  }

  create() {
    this.cameras.main.setBackgroundColor("#3f5832");

    // --- ground -----------------------------------------------------------
    // Grass everywhere first, then path tiles on top of the affected cells.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.add.image(c * TILE, r * TILE, "grass").setOrigin(0, 0);
      }
    }
    for (const p of PATHS) {
      const tex = p.tile === "h" ? "path_h" : p.tile === "v" ? "path_v" : "path_x";
      this.add.image(p.col * TILE, p.row * TILE, tex).setOrigin(0, 0);
    }

    // --- decor (rocks + trees) -------------------------------------------
    for (const d of DECOR) {
      this.add.image(d.x * TILE + TILE / 2, d.y * TILE + TILE / 2, d.key).setOrigin(0.5, 1).setDepth(d.y);
    }

    // --- city title plaque -----------------------------------------------
    this.titleText = this.add
      .text(this.scale.width / 2, 18, "", {
        fontFamily: '"Cinzel", serif',
        fontSize: "20px",
        fontStyle: "bold",
        color: "#fff8e6",
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 1, "rgba(0,0,0,0.7)", 2)
      .setDepth(1000)
      .setScrollFactor(0);

    // --- buildings -------------------------------------------------------
    for (const p of PLACEMENTS) {
      const px = p.col * TILE + TILE / 2;
      const py = p.row * TILE + TILE / 2;
      const sprite = this.add
        .image(px, py, p.key)
        .setOrigin(0.5, 0.85)
        .setScale(1.6)
        .setDepth(p.row + 0.5);
      this.buildingSprites.set(p.key, sprite);

      const label = this.add
        .text(px, py + 22, p.label, {
          fontFamily: '"Marcellus SC", serif',
          fontSize: "11px",
          color: "#2b2620",
          backgroundColor: "rgba(247,238,213,0.85)",
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setDepth(p.row + 0.6);
      this.buildingLabels.set(p.key, label);

      // Forum chimney smoke — subtle, additive blend, low rate.
      if (p.smoke) {
        const tex = this.makeSoftCircle();
        this.add
          .particles(px, py - 18, tex, {
            lifespan: 2400,
            speed: { min: 6, max: 16 },
            angle: { min: -110, max: -70 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.5, end: 0 },
            quantity: 1,
            frequency: 800,
            blendMode: "ADD",
          })
          .setDepth(p.row + 0.7);
      }
    }

    // First render uses whatever React already pushed into the registry.
    this.redraw(this.registry.get("data") as City | undefined);
    this.game.events.on("data-updated", (data: City) => this.redraw(data), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("data-updated", undefined, this);
    });
  }

  /** Generate a 16×16 soft white circle texture once for the smoke emitter
      (saves loading another asset). */
  private makeSoftCircle(): string {
    const key = "soft-circle";
    if (this.textures.exists(key)) return key;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture(key, 16, 16);
    g.destroy();
    return key;
  }

  /** React-driven update: refresh the city title, building level labels,
      and the scaffold overlay state. Cheap — no recreation, just mutation. */
  private redraw(city?: City) {
    if (!city) return;
    if (this.titleText) this.titleText.setText(city.name.toUpperCase());

    const pendingByBuilding = new Map<string, BuildJob>();
    for (const j of city.build_jobs) {
      if (!pendingByBuilding.has(j.building)) pendingByBuilding.set(j.building, j);
    }

    for (const p of PLACEMENTS) {
      const level = city[p.levelField] as number;
      const label = this.buildingLabels.get(p.key);
      label?.setText(`${p.label} · ${level}`);

      const isUnderConstruction = pendingByBuilding.has(p.key);
      let scaffold = this.scaffolds.get(p.key);
      if (isUnderConstruction && !scaffold) {
        const sprite = this.buildingSprites.get(p.key)!;
        scaffold = this.add
          .image(sprite.x, sprite.y - 6, "scaffold")
          .setOrigin(0.5, 0.85)
          .setScale(1.6)
          .setAlpha(0.85)
          .setDepth(sprite.depth + 0.1);
        this.tweens.add({
          targets: scaffold,
          y: scaffold.y - 3,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
        });
        this.scaffolds.set(p.key, scaffold);
      } else if (!isUnderConstruction && scaffold) {
        scaffold.destroy();
        this.scaffolds.delete(p.key);
        // Brief "I finished!" punch on the underlying building.
        const sprite = this.buildingSprites.get(p.key);
        if (sprite) {
          this.tweens.add({
            targets: sprite,
            scale: { from: 1.15, to: 1 },
            duration: 400,
            ease: "back.out",
          });
        }
      }
    }
  }
}
