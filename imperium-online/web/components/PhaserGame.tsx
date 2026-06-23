"use client";

// Bridges React ↔ Phaser. Phaser touches `window`, so this component must only
// ever run in the browser — pages import it via next/dynamic({ ssr: false }).
//
// Pattern: create the Phaser.Game once on mount; whenever `data` changes, stash
// it in the game registry and emit "data-updated" so the active scene redraws.
// This keeps the canvas in sync with server state without recreating the game.

import { useEffect, useRef } from "react";
// Namespace import: Phaser's ESM build has no default export under Next's
// bundler, so `import Phaser from "phaser"` warns. `import * as` is the
// supported form and gives us Phaser.Game, Phaser.Scene, etc.
import * as Phaser from "phaser";
import { CityScene } from "./phaser/CityScene";
import { MapScene } from "./phaser/MapScene";

// Sized to fit half of the .grid-2 layout at our container width; Phaser FIT
// mode handles scaling inside the frame on smaller viewports.
const WIDTH = 896;
const HEIGHT = 576;

export default function PhaserGame({ kind, data }: { kind: "city" | "map"; data: unknown }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const dataRef = useRef<unknown>(data);
  dataRef.current = data;

  // Create the game once.
  useEffect(() => {
    if (!containerRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: "#e6ddcc",
      // Crisp tile edges (no anti-alias seams between grass tiles) and pixel-
      // snapped sprite positions. These two flags are what makes a 2D tilemap
      // look clean instead of slightly blurry/seamed.
      pixelArt: false,
      roundPixels: true,
      render: { antialias: false, pixelArt: false },
      scene: kind === "city" ? [CityScene] : [MapScene],
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    // Seed the registry so the scene has data the instant it boots.
    game.registry.set("data", dataRef.current);
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // kind never changes for a given mount (each page uses one kind).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new data into the running game.
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set("data", data);
    game.events.emit("data-updated", data);
  }, [data]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        aspectRatio: `${WIDTH} / ${HEIGHT}`,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--line-strong)",
        boxShadow: "inset 0 0 0 3px var(--parchment), 0 2px 6px var(--shadow)",
      }}
    />
  );
}
