// City view — TRUE isometric (2.5D), Grepolis-style.
//
// Lays a diamond grass grid with a dirt-path cross, then places each building
// as an isometric sprite with bottom-centre anchored on its tile and a soft
// contact shadow beneath it. Depth is painter's-order (back-to-front) so closer
// buildings correctly overlap farther ones. The scene reads city data pushed in
// from React via the registry; building art comes from the manifest so painted
// sprites can be dropped in later (see ART.md).

import * as Phaser from "phaser";
import type { City, BuildJob } from "@/lib/api";
import { TILE_W, TILE_H, toScreen, depthOf } from "./iso";
import { BUILDINGS, TERRAIN, isSvg, type AssetSlot } from "./assetManifest";

const GRID = 6; // GRID×GRID diamond of tiles

type BuildingKey = "forum" | "timber_camp" | "quarry" | "silver_mine" | "farm" | "barracks";
type Placement = {
  key: BuildingKey;
  levelField: keyof City;
  label: string;
  gx: number;
  gy: number;
  smoke?: boolean;
};

// Placed on the diamond grid (gx grows down-right, gy down-left).
const PLACEMENTS: Placement[] = [
  { key: "forum",       levelField: "forum_level",       label: "Forum",       gx: 2, gy: 3, smoke: true },
  { key: "barracks",    levelField: "barracks_level",    label: "Barracks",    gx: 4, gy: 2 },
  { key: "timber_camp", levelField: "timber_camp_level", label: "Timber Camp", gx: 0, gy: 1 },
  { key: "quarry",      levelField: "quarry_level",      label: "Quarry",      gx: 4, gy: 0 },
  { key: "silver_mine", levelField: "silver_mine_level", label: "Silver Mine", gx: 1, gy: 5 },
  { key: "farm",        levelField: "farm_level",        label: "Farm",        gx: 5, gy: 4 },
];

// Dirt-path cells: a cross through the centre. (Cells under buildings still get
// grass so the footprint reads cleanly.)
const PATH_CELLS = new Set<string>();
for (let g = 0; g < GRID; g++) {
  PATH_CELLS.add(`3,${g}`); // one axis
  PATH_CELLS.add(`${g},3`); // the other
}

// Decorative props at free cells (cypress / rocks / amphora).
const DECOR: { gx: number; gy: number; key: "cypress" | "rocks" | "amphora" }[] = [
  { gx: 0, gy: 0, key: "cypress" }, { gx: 5, gy: 0, key: "rocks" },
  { gx: 0, gy: 5, key: "rocks" },   { gx: 5, gy: 5, key: "cypress" },
  { gx: 2, gy: 0, key: "cypress" }, { gx: 4, gy: 5, key: "amphora" },
  { gx: 0, gy: 3, key: "amphora" },
];

export class CityScene extends Phaser.Scene {
  private buildingSprites = new Map<BuildingKey, Phaser.GameObjects.Image>();
  private buildingLabels = new Map<BuildingKey, Phaser.GameObjects.Text>();
  private scaffolds = new Map<BuildingKey, Phaser.GameObjects.Image>();
  private titleText?: Phaser.GameObjects.Text;
  private originX = 0;
  private originY = 0;

  constructor() {
    super("city");
  }

  preload() {
    const load = (key: string, slot: AssetSlot) => {
      if (isSvg(slot)) this.load.svg(key, slot.src, { width: slot.w, height: slot.h });
      else this.load.image(key, slot.src);
    };
    for (const [key, slot] of Object.entries(TERRAIN)) load(key, slot);
    for (const [key, slot] of Object.entries(BUILDINGS)) load(key, slot);
  }

  private place(gx: number, gy: number): { x: number; y: number } {
    const s = toScreen(gx, gy);
    return { x: s.x + this.originX, y: s.y + this.originY };
  }

  create() {
    this.cameras.main.setBackgroundColor("#4f8aa8"); // surrounding sea

    // Centre the diamond. x spans ±(GRID-1)*TILE_W/2; y spans 0..(2(GRID-1))*TILE_H/2.
    this.originX = this.scale.width / 2;
    this.originY = this.scale.height / 2 - (GRID - 1) * (TILE_H / 2) + 40;

    // --- ground: grass everywhere, path over the cross cells ---------------
    // Painted tiles are big 2:1 diamonds — display each at the tile footprint
    // (+1px to avoid hairline seams between diamonds).
    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) {
        const { x, y } = this.place(gx, gy);
        const tex = PATH_CELLS.has(`${gx},${gy}`) ? "path" : "grass";
        this.add.image(x, y, tex)
          .setOrigin(0.5, 0.5)
          .setDisplaySize(TILE_W + 1, TILE_H + 1)
          .setDepth(depthOf(gx, gy));
      }
    }

    // --- ambient sea sparkle: a few slow twinkles on the surrounding water --
    this.addSeaSparkle();

    // --- decor ------------------------------------------------------------
    for (const d of DECOR) {
      const { x, y } = this.place(d.gx, d.gy);
      const prop = this.add.image(x, y + TILE_H * 0.25, d.key)
        .setOrigin(0.5, 1)
        .setScale(TERRAIN[d.key].scale ?? 1)
        .setDepth(depthOf(d.gx, d.gy) * 10 + 5);
      // Cypress trees sway gently in the breeze (pivot at the base) — a small
      // living touch. Rocks/amphorae stay put. Phase offset by position so they
      // don't all lean in unison.
      if (d.key === "cypress") {
        prop.setAngle(-1.5);
        this.tweens.add({
          targets: prop,
          angle: 1.5,
          duration: 2200 + ((d.gx * 7 + d.gy * 13) % 600),
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
        });
      }
    }

    // --- city title plaque (HUD, fixed) -----------------------------------
    this.titleText = this.add
      .text(this.scale.width / 2, 16, "", {
        fontFamily: '"Cinzel", serif',
        fontSize: "22px",
        fontStyle: "bold",
        color: "#fff8e6",
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 2, "rgba(0,0,0,0.6)", 3)
      .setDepth(10000)
      .setScrollFactor(0);

    // --- buildings: shadow + sprite + label -------------------------------
    for (const p of PLACEMENTS) {
      const { x, y } = this.place(p.gx, p.gy);
      const d = depthOf(p.gx, p.gy) * 10;

      this.add.image(x, y + TILE_H * 0.3, "shadow")
        .setOrigin(0.5, 0.5)
        .setScale(TERRAIN.shadow.scale ?? 1)
        .setDepth(d + 1)
        .setName(`shadow_${p.key}`);

      const sprite = this.add
        .image(x, y + TILE_H * 0.5, p.key)
        .setOrigin(0.5, 1)
        .setScale(BUILDINGS[p.key].scale ?? 1)
        .setDepth(d + 5);
      this.buildingSprites.set(p.key, sprite);

      const label = this.add
        .text(x, y + TILE_H * 0.5, p.label, {
          fontFamily: '"Marcellus SC", serif',
          fontSize: "11px",
          color: "#2b2620",
          backgroundColor: "rgba(247,238,213,0.88)",
          padding: { x: 5, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setDepth(d + 6);
      this.buildingLabels.set(p.key, label);

      if (p.smoke) {
        const tex = this.makeSoftCircle();
        this.add
          .particles(x, y - 90, tex, {
            lifespan: 2600,
            speed: { min: 5, max: 14 },
            angle: { min: -110, max: -70 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.45, end: 0 },
            quantity: 1,
            frequency: 900,
            blendMode: "ADD",
          })
          .setDepth(d + 7);
      }
    }

    this.redraw(this.registry.get("data") as City | undefined);
    this.game.events.on("data-updated", (data: City) => this.redraw(data), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("data-updated", undefined, this);
    });
  }

  /** Slow, sparse glints on the surrounding sea — ambient life, drawn behind
      the island (negative depth) so it never covers the city. No new asset. */
  private addSeaSparkle() {
    const tex = this.makeSoftCircle();
    this.add
      .particles(0, 0, tex, {
        x: { min: 0, max: this.scale.width },
        y: { min: 0, max: this.scale.height },
        lifespan: 1800,
        // grow a touch while fading right out — reads as a glint on the water
        scale: { start: 0.12, end: 0.4, ease: "sine.out" },
        alpha: { start: 0.6, end: 0 },
        frequency: 380,
        quantity: 1,
        blendMode: "ADD",
      })
      .setDepth(-10);
  }

  /** A soft white circle texture for the smoke emitter (no extra asset). */
  private makeSoftCircle(): string {
    const key = "soft-circle";
    if (this.textures.exists(key)) return key;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture(key, 16, 16);
    g.destroy();
    return key;
  }

  /** React-driven update: title, level labels, scaffold state, build punch.
      A level-0 (unbuilt) building shows nothing until it's under construction. */
  private redraw(city?: City) {
    if (!city) return;
    if (this.titleText) this.titleText.setText(city.name.toUpperCase());

    const pending = new Map<string, BuildJob>();
    for (const j of city.build_jobs) if (!pending.has(j.building)) pending.set(j.building, j);

    for (const p of PLACEMENTS) {
      const level = city[p.levelField] as number;
      const sprite = this.buildingSprites.get(p.key);
      const label = this.buildingLabels.get(p.key);
      const shadow = this.children.getByName(`shadow_${p.key}`) as Phaser.GameObjects.Image | null;

      const exists = level > 0;
      const underConstruction = pending.has(p.key);
      sprite?.setVisible(exists);
      shadow?.setVisible(exists || underConstruction);
      label?.setVisible(exists || underConstruction);
      label?.setText(`${p.label} · ${level}`);

      // Building tier: the manifest base scale (sized for the high-res painted
      // PNG) plus a gentle bump at higher level bands.
      const base = BUILDINGS[p.key].scale ?? 1;
      if (sprite && exists) {
        const band = level >= 8 ? 1.16 : level >= 4 ? 1.07 : 1.0;
        if (!underConstruction) sprite.setScale(base * band);
      }

      let scaffold = this.scaffolds.get(p.key);
      if (underConstruction && !scaffold && sprite) {
        // A translucent "ghost" of the building itself, gently bobbing — reads
        // as a structure going up. Works even for the still-unbuilt Barracks.
        scaffold = this.add
          .image(sprite.x, sprite.y, p.key)
          .setOrigin(0.5, 1)
          .setScale(base)
          .setAlpha(0.4)
          .setTint(0xbfa46a)
          .setDepth(sprite.depth + 0.1);
        this.tweens.add({ targets: scaffold, y: scaffold.y - 4, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.scaffolds.set(p.key, scaffold);
      } else if (!underConstruction && scaffold) {
        scaffold.destroy();
        this.scaffolds.delete(p.key);
        if (sprite) {
          this.tweens.add({ targets: sprite, scale: { from: sprite.scale * 1.12, to: sprite.scale }, duration: 420, ease: "back.out" });
        }
      }
    }
  }
}
