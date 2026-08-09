"use client";

// First-login welcome (B5).
//
// A new player lands on a city with six buildings and no idea what the loop is.
// This is one dismissible scroll that names the three things worth doing, in
// order, and then never appears again. Deliberately not a multi-step tour —
// the game is legible enough once you know builds run on timers.

import { useEffect, useRef, useState } from "react";

const SEEN_KEY = "imperium_welcomed";

const STEPS = [
  {
    glyph: "🏛️",
    title: "Raise a building",
    body: "Upgrades run on real timers and finish whether or not you're online. Start the Timber Camp — everything else is paid for in wood.",
  },
  {
    glyph: "🎖️",
    title: "Train a legion",
    body: "Build the Barracks, then recruit. Soldiers eat population, so raise the Farm before you run out of citizens.",
  },
  {
    glyph: "⚔️",
    title: "March on a rival",
    body: "Every city on the world map belongs to a real player. Click one to send an army — and mind the night bonus: defenders fight twice as hard after dark.",
  },
];

export default function WelcomeScroll({ cityName }: { cityName: string }) {
  const [open, setOpen] = useState(false);
  const beginRef = useRef<HTMLButtonElement>(null);

  // Read the flag after mount — localStorage isn't available during SSR, and
  // checking it in render would desync hydration.
  useEffect(() => {
    if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus the primary action for keyboard users — but without letting the
    // browser scroll the (taller-than-viewport) scroll down to reach it, which
    // would hide the greeting at the top.
    beginRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-label="Welcome" onClick={dismiss}>
      {/* Stop clicks inside the scroll from dismissing it. */}
      <div className="welcome-scroll" onClick={(e) => e.stopPropagation()}>
        <h2>Salve, Consul</h2>
        <p className="welcome-lede">
          {cityName} is yours. The server keeps the world turning while you're away —
          resources accrue, buildings finish, armies arrive.
        </p>
        <ol className="welcome-steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <span className="ws-glyph" aria-hidden>{s.glyph}</span>
              <span className="ws-text">
                <strong>{s.title}</strong>
                <span className="muted">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <button className="btn" type="button" onClick={dismiss} ref={beginRef}>
          Begin
        </button>
      </div>
    </div>
  );
}
