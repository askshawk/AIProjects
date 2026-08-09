// The sky veil (B4) — shared by both scenes.
//
// A single screen-locked rectangle tinted from the world clock: deep blue at
// night, warm at dawn and dusk, invisible at noon. Because the phase comes from
// the server, every player's world darkens at the same moment.
//
// The clock is pushed in from React (PhaserGame emits "clock-updated"); the
// layer just renders whatever phase it was last told about, re-deriving the
// exact tint each frame so the transition is continuous rather than stepped.

import * as Phaser from "phaser";
import { phaseNow, skyTint, type WorldClock } from "@/lib/dayNight";

const PIXEL_KEY = "sky-pixel";

export class SkyLayer {
  private rect?: Phaser.GameObjects.Image;
  private clock: WorldClock | null = null;
  private reduceMotion: boolean;

  constructor(private scene: Phaser.Scene, depth = 9000) {
    this.reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // A tinted Image rather than a Rectangle: a partially transparent Shape
    // stretched over the viewport would not render here (it draws at alpha 1
    // and disappears below it), whereas a stretched image tints reliably —
    // the same approach the city's lamp glows already use.
    if (!scene.textures.exists(PIXEL_KEY)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 8, 8);
      g.generateTexture(PIXEL_KEY, 8, 8);
      g.destroy();
    }

    this.rect = scene.add
      .image(scene.scale.width / 2, scene.scale.height / 2, PIXEL_KEY)
      .setDisplaySize(scene.scale.width, scene.scale.height)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(depth);

    this.clock = (scene.registry.get("clock") as WorldClock | undefined) ?? null;
    scene.game.events.on("clock-updated", this.onClock, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off("clock-updated", this.onClock, this);
      this.rect?.destroy();
      this.rect = undefined;
    });
  }

  private onClock(clock: WorldClock) {
    this.clock = clock;
  }

  /** Call from the scene's update(). Cheap: a couple of setters. */
  update() {
    if (!this.rect || !this.clock) return;
    const { colour, alpha } = skyTint(phaseNow(this.clock));
    this.rect.setTint(colour);
    this.rect.setAlpha(alpha);
    // A scroll-locked object still scales with camera zoom, so counter it to
    // keep the veil exactly covering the viewport on the zoomable world map.
    const zoom = this.scene.cameras.main.zoom || 1;
    this.rect.setDisplaySize(this.scene.scale.width / zoom, this.scene.scale.height / zoom);
  }

  /** Whether it is currently dark enough to warrant lit windows. */
  isDark(): boolean {
    if (!this.clock) return false;
    return skyTint(phaseNow(this.clock)).alpha > 0.24;
  }

  get motionReduced(): boolean {
    return this.reduceMotion;
  }
}
