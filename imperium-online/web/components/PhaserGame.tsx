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
import { useWorldClock } from "@/lib/useWorldClock";
import type { WorldClock } from "@/lib/dayNight";
import { CityScene } from "./phaser/CityScene";
import { MapScene } from "./phaser/MapScene";

// Sized to fit half of the .grid-2 layout at our container width; Phaser FIT
// mode handles scaling inside the frame on smaller viewports.
const WIDTH = 896;
const HEIGHT = 576;

export default function PhaserGame({
  kind,
  data,
  movements,
  onCitySelect,
  onCellSelect,
}: {
  kind: "city" | "map";
  data: unknown;
  /** Marching armies. Deliberately a separate channel from `data`: movements
      refresh far more often, and any new `data` identity rebuilds every island. */
  movements?: unknown;
  onCitySelect?: (city: { x: number; y: number; name: string; owner: string }) => void;
  /** Map only: an empty island slot was clicked — pre-fill the found form. */
  onCellSelect?: (cell: { x: number; y: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const dataRef = useRef<unknown>(data);
  dataRef.current = data;
  const movementsRef = useRef<unknown>(movements);
  movementsRef.current = movements;
  // The shared world clock drives the sky in both scenes.
  const world = useWorldClock();
  const clockRef = useRef<WorldClock | null>(null);
  clockRef.current = world?.clock ?? null;
  // Refs so the scene's event handlers always call the latest callbacks.
  const onCitySelectRef = useRef(onCitySelect);
  onCitySelectRef.current = onCitySelect;
  const onCellSelectRef = useRef(onCellSelect);
  onCellSelectRef.current = onCellSelect;

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
    game.registry.set("movements", movementsRef.current);
    game.registry.set("clock", clockRef.current);
    // Bridge scene → React: the map scene emits "city-selected" on a click,
    // and "cell-selected" when an empty island slot is chosen.
    game.events.on("cell-selected", (cell: { x: number; y: number }) => {
      onCellSelectRef.current?.(cell);
    });
    game.events.on("city-selected", (c: { x: number; y: number; name: string; owner: string }) => {
      onCitySelectRef.current?.(c);
    });
    gameRef.current = game;
    // Dev-only handle for automated verification (stripped from prod builds).
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    }
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

  // Marching armies travel their own channel — the scene reconciles them
  // in place rather than rebuilding the world.
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set("movements", movements);
    game.events.emit("movements-updated", movements);
  }, [movements]);

  // The world clock arrives asynchronously; hand it to the scenes when it does
  // (and on each re-sync). The sky ticks locally from there.
  useEffect(() => {
    const game = gameRef.current;
    if (!game || !world) return;
    game.registry.set("clock", world.clock);
    game.events.emit("clock-updated", world.clock);
  }, [world?.clock]);

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
