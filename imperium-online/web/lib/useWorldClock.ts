"use client";

// Subscribe to the shared world clock (B4).
//
// Fetches the cycle constants once, then ticks locally — no polling. Re-syncs
// occasionally so a long-lived tab can't drift from the server.

import { useEffect, useState } from "react";
import {
  fetchWorldClock,
  isNight,
  phaseName,
  phaseNow,
  secondsUntilChange,
  type PhaseName,
  type WorldClock,
} from "@/lib/dayNight";

export type WorldPhase = {
  clock: WorldClock;
  phase: number;
  name: PhaseName;
  night: boolean;
  secondsUntilChange: number;
};

const RESYNC_MS = 10 * 60 * 1000;

export function useWorldClock(): WorldPhase | null {
  const [clock, setClock] = useState<WorldClock | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const sync = () => {
      fetchWorldClock()
        .then((c) => { if (alive) setClock(c); })
        .catch(() => { /* leave the sky as-is; it's decorative until this lands */ });
    };
    sync();
    const resync = setInterval(sync, RESYNC_MS);
    return () => { alive = false; clearInterval(resync); };
  }, []);

  // Re-render once a second so the countdown and phase label stay current.
  useEffect(() => {
    if (!clock) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [clock]);

  if (!clock) return null;
  const phase = phaseNow(clock);
  return {
    clock,
    phase,
    name: phaseName(clock, phase),
    night: isNight(clock, phase),
    secondsUntilChange: secondsUntilChange(clock, phase),
  };
}
