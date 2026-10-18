import { addDays, weekStartKey } from "./time";
import type { Rating } from "./srs";

/**
 * XP, ranks, and streaks. Pure functions over plain data, so the rules are
 * easy to test and to tweak in one place.
 */

/** XP for each way of earning it. Harder, "say it yourself" modes pay more. */
export const XP = {
  review: { again: 2, hard: 4, good: 6, easy: 6 } satisfies Record<Rating, number>,
  jargonMatch: 3,
  mythCorrect: 3,
  dealDeskGoodAnswer: 5,
  dealDeskWin: 20,
  explainAttempt: 5,
  explainPass: 15,
  /** Live roleplay pays its 0-100 score divided by this, so up to 25. */
  roleplayDivisor: 4,
  roleplayWin: 15,
  bossWin: 50,
} as const;

export const DEFAULT_WEEKLY_QUOTA = 600;

export function weeklyQuota(): number {
  const n = Number(process.env.WEEKLY_XP_QUOTA);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_WEEKLY_QUOTA;
}

/**
 * The rank ladder. You climb by mastered cards, not raw XP, so grinding easy
 * games can't promote you: only knowledge that survived a three-week gap
 * and an Explain It Back counts.
 */
export const RANKS = [
  { title: "BDR", mastered: 0 },
  { title: "Account Manager", mastered: 10 },
  { title: "Senior AM", mastered: 30 },
  { title: "Enterprise AE", mastered: 60 },
  { title: "VP of Sales", mastered: 100 },
] as const;

export function rankFor(mastered: number) {
  let index = 0;
  RANKS.forEach((r, i) => {
    if (mastered >= r.mastered) index = i;
  });
  const next = RANKS[index + 1];
  return {
    title: RANKS[index].title,
    index,
    next: next ? { title: next.title, needed: next.mastered - mastered } : null,
  };
}

/**
 * Consecutive active days ending today, in your time zone.
 *
 * Today not being active yet doesn't break anything: the day isn't over.
 * Each Monday-to-Sunday week also forgives one missed day (a "PTO day"), so
 * one busy day doesn't wipe out a long streak. A second miss in the same
 * week ends it. Forgiven days don't add to the count.
 */
export function computeStreak(activeDays: Set<string>, today: string): { days: number; ptoUsedThisWeek: boolean } {
  const ptoWeeks = new Set<string>();
  let streak = 0;
  let day = activeDays.has(today) ? today : addDays(today, -1);

  // Bounded so a pathological history can't spin forever.
  for (let i = 0; i < 3660; i++) {
    if (activeDays.has(day)) {
      streak++;
    } else {
      const week = weekStartKey(day);
      if (ptoWeeks.has(week) || streak === 0) break;
      // Only forgive a gap that the streak continues past.
      if (!activeDays.has(addDays(day, -1))) break;
      ptoWeeks.add(week);
    }
    day = addDays(day, -1);
  }

  return { days: streak, ptoUsedThisWeek: ptoWeeks.has(weekStartKey(today)) };
}
