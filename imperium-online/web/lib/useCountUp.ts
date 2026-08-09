"use client";

// Smoothly tween a displayed number toward its target (Phase 8B — game feel).
//
// Resources jump in discrete steps every refresh; count-up makes the ledger
// feel alive by easing from the old value to the new one over ~500ms. Pure
// requestAnimationFrame, no deps. Returns the current animated value (already
// floored) for direct rendering.

import { useEffect, useRef, useState } from "react";

const DURATION = 550; // ms per transition
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCountUp(target: number): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Snap on first paint / large resets (e.g. switching cities) so we don't
    // spin a long tween across an unrelated jump.
    const from = fromRef.current;
    if (Math.abs(target - from) > from * 4 + 1000) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    let mounted = true;
    startRef.current = 0;

    const step = (ts: number) => {
      if (!mounted) return;
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / DURATION);
      const eased = easeOut(t);
      const current = from + (target - from) * eased;
      setValue(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = target; // resume next tween from where we are
    };
  }, [target]);

  return Math.floor(value);
}
