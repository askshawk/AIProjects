// The shared world clock, client side (B4).
//
// The server owns the cycle; we fetch its constants once and then derive the
// phase locally every frame against the skew-corrected clock. That keeps the
// sky in sync across players without polling, and means the tint and the
// gameplay night bonus are driven by the same source of truth.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type WorldClock = {
  serverNowMs: number;
  cycleSeconds: number;
  nightStart: number; // cycle fractions; the window wraps past midnight
  nightEnd: number;
  nightDefenseBonus: number;
  /** serverNow − localNow at the moment we fetched, for skew correction. */
  skewMs: number;
};

export type PhaseName = "night" | "dawn" | "day" | "dusk";

export async function fetchWorldClock(): Promise<WorldClock> {
  const res = await fetch(`${API_URL}/world/time`);
  if (!res.ok) throw new Error("Failed to read the world clock");
  const d = await res.json();
  return {
    serverNowMs: d.server_now_ms,
    cycleSeconds: d.cycle_seconds,
    nightStart: d.night_start,
    nightEnd: d.night_end,
    nightDefenseBonus: d.night_defense_bonus,
    skewMs: d.server_now_ms - Date.now(),
  };
}

/** Current position in the cycle, in [0,1) where 0 is midnight. */
export function phaseNow(clock: WorldClock, nowMs = Date.now()): number {
  const serverNow = nowMs + clock.skewMs;
  const seconds = serverNow / 1000;
  return ((seconds % clock.cycleSeconds) + clock.cycleSeconds) % clock.cycleSeconds / clock.cycleSeconds;
}

export function isNight(clock: WorldClock, phase: number): boolean {
  return phase >= clock.nightStart || phase < clock.nightEnd;
}

export function phaseName(clock: WorldClock, phase: number): PhaseName {
  if (isNight(clock, phase)) return "night";
  if (phase < 8 / 24) return "dawn";
  if (phase < 18 / 24) return "day";
  return "dusk";
}

/** Seconds until night begins (by day) or ends (by night). */
export function secondsUntilChange(clock: WorldClock, phase: number): number {
  const target = isNight(clock, phase) ? clock.nightEnd : clock.nightStart;
  const delta = (target - phase + 1) % 1;
  return delta * clock.cycleSeconds;
}

// --- sky tint ---------------------------------------------------------------

// Keyframes around the cycle: an overlay colour and how strongly it washes the
// scene. Midnight is a deep blue veil; noon is untinted; dawn and dusk are
// warm. Values are interpolated so the sky slides rather than steps.
type Stop = { at: number; colour: [number, number, number]; alpha: number };

const STOPS: Stop[] = [
  { at: 0.0,      colour: [6, 14, 44],   alpha: 0.68 }, // midnight
  { at: 5 / 24,   colour: [18, 26, 66],  alpha: 0.60 }, // last dark hour
  { at: 6.5 / 24, colour: [214, 120, 66], alpha: 0.32 }, // sunrise
  { at: 8 / 24,   colour: [255, 214, 160], alpha: 0.10 }, // early morning
  { at: 12 / 24,  colour: [255, 255, 255], alpha: 0.0 },  // noon
  { at: 16 / 24,  colour: [255, 206, 150], alpha: 0.07 }, // afternoon
  { at: 19 / 24,  colour: [230, 110, 58], alpha: 0.30 }, // sunset
  { at: 20.5 / 24, colour: [44, 38, 100], alpha: 0.50 }, // twilight
  { at: 1.0,      colour: [6, 14, 44],   alpha: 0.68 }, // back to midnight
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Overlay colour (0xRRGGBB) + alpha for a given phase. */
export function skyTint(phase: number): { colour: number; alpha: number } {
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (phase >= STOPS[i].at && phase <= STOPS[i + 1].at) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = Math.min(1, Math.max(0, (phase - lo.at) / span));
  const rgb = [0, 1, 2].map((i) => Math.round(lerp(lo.colour[i], hi.colour[i], t)));
  return {
    colour: (rgb[0] << 16) | (rgb[1] << 8) | rgb[2],
    alpha: lerp(lo.alpha, hi.alpha, t),
  };
}

/** mm:ss for the UI countdown. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
