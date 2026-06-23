"use client";

// Bridges React ↔ Phaser. Phaser touches `window`, so this component must only
// ever run in the browser — pages import it via next/dynamic({ ssr: false }).
//
// Pattern: create the Phaser.Game once on mount; whenever `data` changes, stash
// it in the game registry and emit "data-updated" so the active scene redraws.
// This keeps the canvas in sync with server state without recreating the game.

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { CityScene } from "./phaser/CityScene";
import { MapScene } from "./phaser/MapScene";

const WIDTH = 560;
const HEIGHT = 360;

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
      style={{ width: WIDTH, height: HEIGHT, maxWidth: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid var(--line)" }}
    />
  );
}
