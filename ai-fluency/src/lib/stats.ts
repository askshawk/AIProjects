import { gte } from "drizzle-orm";
import { db } from "@/db";
import { xpEvents } from "@/db/schema";
import { topicsOf, type Track } from "./content";
import { getSummary } from "./progress";
import { computeStreak, rankFor, weeklyQuota } from "./rewards";
import { needsExplaining, stageOf } from "./srs";
import { addDays, dayKey, weekStartKey } from "./time";

const HISTORY_WEEKS = 8;

/**
 * Everything the Today page and the Progress dashboard show. One XP query for
 * the last year (a single person's history is small), then the rest is
 * arithmetic in memory.
 */
export async function getDashboard(now = new Date()) {
  const summary = await getSummary(now);
  const today = dayKey(now);
  const thisWeek = weekStartKey(today);

  const since = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
  const events = await db
    .select({ amount: xpEvents.amount, at: xpEvents.at, source: xpEvents.source })
    .from(xpEvents)
    .where(gte(xpEvents.at, since));

  const activeDays = new Set<string>();
  const byWeek = new Map<string, number>();
  const bySource = new Map<string, number>();
  let xpToday = 0;
  for (const e of events) {
    const day = dayKey(e.at);
    activeDays.add(day);
    const week = weekStartKey(day);
    byWeek.set(week, (byWeek.get(week) ?? 0) + e.amount);
    if (week === thisWeek) bySource.set(e.source, (bySource.get(e.source) ?? 0) + e.amount);
    if (day === today) xpToday += e.amount;
  }

  const quota = weeklyQuota();
  const weekXp = byWeek.get(thisWeek) ?? 0;
  const quotaHistory = Array.from({ length: HISTORY_WEEKS }, (_, i) => {
    const week = addDays(thisWeek, -7 * (HISTORY_WEEKS - 1 - i));
    const xp = byWeek.get(week) ?? 0;
    return { week, xp, attainment: Math.round((xp / quota) * 100) };
  });

  const topics = topicsOf(summary.terms).map(({ track, topic }) => {
    const cards = summary.terms.filter((t) => t.topic === topic);
    const counts = { new: 0, learning: 0, mastered: 0 };
    for (const c of cards) counts[stageOf(summary.progress.get(c.id))]++;
    return { track, topic, total: cards.length, ...counts, pct: Math.round((counts.mastered / cards.length) * 100) };
  });

  // Weakest: cards you've forgotten most, then the ones with the lowest ease.
  const weakest = summary.terms
    .map((term) => ({ term, p: summary.progress.get(term.id) }))
    .filter((x) => x.p && (x.p.lapses > 0 || x.p.ease < 2.3))
    .sort((a, b) => b.p!.lapses - a.p!.lapses || a.p!.ease - b.p!.ease)
    .slice(0, 8)
    .map(({ term, p }) => ({ id: term.id, term: term.term, lapses: p!.lapses, ease: p!.ease }));

  const readyToExplain = summary.terms
    .filter((t) => needsExplaining(summary.progress.get(t.id)))
    .map((t) => ({ id: t.id, term: t.term }));

  return {
    summary,
    streak: computeStreak(activeDays, today),
    rank: rankFor(summary.mastered),
    quota: { target: quota, xp: weekXp, attainment: Math.round((weekXp / quota) * 100), bySource: Object.fromEntries(bySource) },
    quotaHistory,
    xpToday,
    topics,
    weakest,
    readyToExplain,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
export type TopicStat = Dashboard["topics"][number] & { track: Track };
