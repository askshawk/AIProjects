import { CATEGORIES, CATEGORY_INFO, type Category } from "./categories";
import { addDays, dayKey, startOfDay } from "./time";

/**
 * Pure number-crunching over finished sessions, so it's easy to test.
 * Every day boundary is in the app's time zone (see time.ts).
 */

export type Span = { category: Category; startedAt: Date; endedAt: Date };
export type Totals = Record<Category, number>;

export const emptyTotals = (): Totals => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Totals;

/**
 * Minutes per category per calendar day. A session that runs past midnight
 * (a late gaming night) is split, so each day gets only its own share.
 */
export function minutesByDay(spans: Span[], tz: string): Map<string, Totals> {
  const days = new Map<string, Totals>();
  for (const s of spans) {
    let cursor = s.startedAt.getTime();
    const end = s.endedAt.getTime();
    while (cursor < end) {
      const key = dayKey(new Date(cursor), tz);
      const nextMidnight = startOfDay(addDays(key, 1), tz).getTime();
      const sliceEnd = Math.min(end, nextMidnight);
      const totals = days.get(key) ?? emptyTotals();
      totals[s.category] += (sliceEnd - cursor) / 60000;
      days.set(key, totals);
      cursor = sliceEnd;
    }
  }
  return days;
}

export const focusMinutes = (t: Totals) => CATEGORIES.filter((c) => CATEGORY_INFO[c].focus).reduce((n, c) => n + t[c], 0);

export function sumTotals(list: Totals[]): Totals {
  const out = emptyTotals();
  for (const t of list) for (const c of CATEGORIES) out[c] += t[c];
  return out;
}

/** A day counts toward the streak with at least this much focus time. */
export const STREAK_MINUTES = 30;

/**
 * Consecutive days with real focus time, ending today. Today not done yet
 * doesn't break it: the streak counts back from yesterday until you log today.
 */
export function focusStreak(days: Map<string, Totals>, today: string): number {
  const counts = (key: string) => focusMinutes(days.get(key) ?? emptyTotals()) >= STREAK_MINUTES;
  let key = counts(today) ? today : addDays(today, -1);
  let streak = 0;
  while (counts(key)) {
    streak++;
    key = addDays(key, -1);
  }
  return streak;
}

/**
 * Focus minutes per gaming minute, as "3.2 to 1". Null when there's no gaming
 * to divide by, so the page can say so instead of showing infinity.
 */
export function focusRatio(totals: Totals): number | null {
  if (totals.gaming < 1) return null;
  return Math.round((focusMinutes(totals) / totals.gaming) * 10) / 10;
}

export type GoalStatus = {
  category: Category;
  minutes: number;
  goal: number;
  /** 0 to 1+, share of the goal used or reached. */
  progress: number;
  /** Targets: reached it. Gaming cap: still under it. */
  onTrack: boolean;
};

export function goalStatus(totals: Totals, goals: Partial<Record<Category, number>>): GoalStatus[] {
  return CATEGORIES.filter((c) => (goals[c] ?? 0) > 0).map((c) => {
    const goal = goals[c]!;
    const minutes = totals[c];
    const isCap = !CATEGORY_INFO[c].focus;
    return { category: c, minutes, goal, progress: minutes / goal, onTrack: isCap ? minutes <= goal : minutes >= goal };
  });
}

/**
 * The minutes to save when you stop a timer. A countdown you leave running
 * past zero is capped at its planned length, since you probably stopped
 * working when it went off; a stopwatch records what actually elapsed.
 */
export function suggestedMinutes(startedAt: Date, plannedMinutes: number | null, now: Date): number {
  const elapsed = Math.max(0, (now.getTime() - startedAt.getTime()) / 60000);
  const capped = plannedMinutes ? Math.min(elapsed, plannedMinutes) : elapsed;
  return Math.max(1, Math.round(capped));
}

/**
 * Where a finished session lands once you've confirmed its length. It always
 * ends now (or at its start + length, if that's earlier). Saving more minutes
 * than actually elapsed means you started before you hit Start, so the start
 * moves earlier instead of the end moving into the future.
 */
export function finishBounds(startedAt: Date, minutes: number, now: Date): { startedAt: Date; endedAt: Date } {
  const end = Math.min(now.getTime(), startedAt.getTime() + minutes * 60000);
  return { startedAt: new Date(end - minutes * 60000), endedAt: new Date(end) };
}
