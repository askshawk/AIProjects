"use client";

import { useEffect, useRef, useState } from "react";
import { formatSeconds } from "@/lib/warmup";

/**
 * A rest countdown, started by tapping the prescribed rest.
 *
 * Rest between sets is prescribed by most of these programs and was being
 * rendered nowhere — a lifter had to use a separate phone timer, which means
 * leaving the app mid-session. It vibrates rather than beeps: phones are on
 * silent in gyms, and audio would need a user-gesture unlock anyway.
 */
export function RestTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const endsAt = useRef<number | null>(null);

  useEffect(() => {
    if (remaining === null) return;

    const tick = () => {
      if (endsAt.current === null) return;
      // Recomputed from a timestamp rather than decremented, so a backgrounded
      // tab (the phone locking mid-set) doesn't drift or freeze the count.
      const left = Math.ceil((endsAt.current - Date.now()) / 1000);
      if (left <= 0) {
        setRemaining(0);
        navigator.vibrate?.([200, 100, 200]);
        endsAt.current = null;
        return;
      }
      setRemaining(left);
    };

    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [remaining]);

  const start = () => {
    endsAt.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
  };

  const stop = () => {
    endsAt.current = null;
    setRemaining(null);
  };

  if (remaining === null) {
    return (
      <button
        type="button"
        onClick={start}
        title={`Start a ${formatSeconds(seconds)} rest timer`}
        className="flex min-h-11 items-center rounded px-2 font-mono text-xs text-muted transition-colors hover:bg-surface-raised hover:text-accent"
      >
        rest {formatSeconds(seconds)}
      </button>
    );
  }

  const done = remaining === 0;
  return (
    <button
      type="button"
      onClick={done ? start : stop}
      title={done ? "Rest again" : "Cancel the timer"}
      className={`flex min-h-11 items-center rounded px-2 font-mono text-xs tabular-nums transition-colors ${
        done
          ? "bg-accent/20 font-semibold text-accent"
          : "bg-surface-raised text-foreground"
      }`}
    >
      {done ? "go" : formatSeconds(remaining)}
      {/* Vibration signals completion silently to a screen reader — this
          announces it too, without narrating the countdown itself. */}
      <span className="sr-only" aria-live="assertive">
        {done ? "Rest complete" : ""}
      </span>
    </button>
  );
}
