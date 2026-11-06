/**
 * The four kinds of time the app tracks. Gaming is the only one that isn't
 * focus time: its goal is a cap ("at most"), the others are targets.
 */

export const CATEGORIES = ["deep_work", "dev", "learning", "gaming"] as const;
export type Category = (typeof CATEGORIES)[number];

type CategoryInfo = {
  label: string;
  /** Shown under the start button. */
  hint: string;
  focus: boolean;
  /** Countdown length offered first; null starts a stopwatch. */
  defaultMinutes: number | null;
  /** CSS colour variable, in fixed order (see globals.css). */
  color: string;
};

export const CATEGORY_INFO: Record<Category, CategoryInfo> = {
  deep_work: { label: "Deep Work", hint: "Phone down, job tasks only", focus: true, defaultMinutes: 120, color: "var(--cat-1)" },
  dev: { label: "Dev", hint: "Building your projects", focus: true, defaultMinutes: 90, color: "var(--cat-2)" },
  learning: { label: "Learning", hint: "Courses, reading, practice", focus: true, defaultMinutes: 60, color: "var(--cat-3)" },
  gaming: { label: "Gaming", hint: "Open-ended stopwatch", focus: false, defaultMinutes: null, color: "var(--cat-4)" },
};

export const FOCUS_CATEGORIES = CATEGORIES.filter((c) => CATEGORY_INFO[c].focus);

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** "2h 05m", "45m", "0m". */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return `${h}h ${String(rest).padStart(2, "0")}m`;
}

/** "12.5" hours, one decimal, for tiles and charts. */
export function formatHours(minutes: number): string {
  return (Math.round((minutes / 60) * 10) / 10).toString();
}
