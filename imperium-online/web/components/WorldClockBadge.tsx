"use client";

// The world clock, made legible (B4).
//
// Night isn't just a mood here — defenders fight at double strength — so the
// player needs to see the phase and know how long it lasts before committing
// an army. Sits in the top bar next to the city switcher.

import { useWorldClock } from "@/lib/useWorldClock";
import { formatCountdown } from "@/lib/dayNight";

const GLYPH = { night: "🌙", dawn: "🌅", day: "☀️", dusk: "🌇" } as const;
const LABEL = { night: "Night", dawn: "Dawn", day: "Day", dusk: "Dusk" } as const;

export default function WorldClockBadge() {
  const world = useWorldClock();
  if (!world) return null;

  const bonus = world.clock.nightDefenseBonus;
  const title = world.night
    ? `Night — defenders fight at ×${bonus} strength. Ends in ${formatCountdown(world.secondsUntilChange)}.`
    : `${LABEL[world.name]} — night falls in ${formatCountdown(world.secondsUntilChange)}, doubling defenders.`;

  return (
    <span className={`world-clock${world.night ? " is-night" : ""}`} title={title}>
      <span className="wc-glyph" aria-hidden>{GLYPH[world.name]}</span>
      <span className="wc-label">{LABEL[world.name]}</span>
      {world.night && <span className="wc-bonus">defence ×{bonus}</span>}
      <span className="wc-count">{formatCountdown(world.secondsUntilChange)}</span>
    </span>
  );
}
