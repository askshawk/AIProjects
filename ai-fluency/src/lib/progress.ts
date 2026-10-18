import { and, asc, count, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardProgress, reviewLog, xpEvents } from "@/db/schema";
import type { Term, Track } from "./content";
import { XP } from "./rewards";
import { newCardState, schedule, stageOf, type CardState, type Rating, type Stage } from "./srs";
import { findTerm, getAllTerms } from "./terms";
import { dayKey, startOfDay } from "./time";

/** How many never-seen cards to introduce per day, so reviews don't pile up. */
export const NEW_CARDS_PER_DAY = 10;

export type Progress = CardState & { explainedAt: Date | null };

function toProgress(row: typeof cardProgress.$inferSelect): Progress {
  return {
    repetitions: row.repetitions,
    intervalDays: row.intervalDays,
    ease: row.ease,
    lapses: row.lapses,
    dueAt: row.dueAt,
    explainedAt: row.explainedAt,
  };
}

/** Midnight at the start of today, in your time zone. */
export function startOfToday(now = new Date()): Date {
  return startOfDay(dayKey(now));
}

export async function getAllProgress(): Promise<Map<string, Progress>> {
  const rows = await db.select().from(cardProgress);
  return new Map(rows.map((r) => [r.termId, toProgress(r)]));
}

export async function awardXp(source: string, amount: number, termId: string | null = null, at = new Date()) {
  if (amount <= 0) return;
  await db.insert(xpEvents).values({ source, amount, termId, at });
}

export type QueueItem = { term: Term; state: CardState; isNew: boolean };

/**
 * Today's study queue: every card that's due, oldest first, then new cards up
 * to what's left of today's budget. Cards are introduced in file order, which
 * runs roughly from basics to advanced within each track; your own cards come
 * after the built-in ones.
 */
export async function getStudyQueue(now = new Date()): Promise<QueueItem[]> {
  const [terms, progress] = await Promise.all([getAllTerms(), getAllProgress()]);
  const byId = new Map(terms.map((t) => [t.id, t]));

  const dueRows = await db
    .select()
    .from(cardProgress)
    .where(lte(cardProgress.dueAt, now))
    .orderBy(asc(cardProgress.dueAt));
  const due: QueueItem[] = [];
  for (const row of dueRows) {
    // A card deleted from the JSON leaves an orphaned progress row; skip it.
    const term = byId.get(row.termId);
    if (term) due.push({ term, state: toProgress(row), isNew: false });
  }

  const [{ value: introducedToday }] = await db
    .select({ value: count() })
    .from(cardProgress)
    .where(gte(cardProgress.firstSeenAt, startOfToday(now)));

  const budget = Math.max(0, NEW_CARDS_PER_DAY - introducedToday);
  const fresh = terms
    .filter((t) => !progress.has(t.id))
    .slice(0, budget)
    .map((term) => ({ term, state: newCardState(now), isNew: true }));

  return [...due, ...fresh];
}

async function applyRating(termId: string, rating: Rating, mode: string, now: Date): Promise<CardState> {
  const [existing] = await db.select().from(cardProgress).where(eq(cardProgress.termId, termId));
  const next = schedule(existing ? toProgress(existing) : newCardState(now), rating, now);

  await db
    .insert(cardProgress)
    .values({ termId, ...next, firstSeenAt: now, lastReviewedAt: now })
    .onConflictDoUpdate({ target: cardProgress.termId, set: { ...next, lastReviewedAt: now } });
  await db.insert(reviewLog).values({ termId, rating, mode, intervalDays: next.intervalDays, reviewedAt: now });
  return next;
}

/** A flashcard rating: reschedules the card and awards review XP. */
export async function recordRating(termId: string, rating: Rating, now = new Date()): Promise<CardState> {
  if (!(await findTerm(termId))) throw new Error(`Unknown term: ${termId}`);
  const next = await applyRating(termId, rating, "flashcards", now);
  await awardXp("review", XP.review[rating], termId, now);
  return next;
}

/**
 * A game answer counts toward the schedule, without letting games scramble it:
 * - wrong: the card comes back soon ("again"), whether or not it was due,
 *   because you've just shown you've forgotten it;
 * - right on a card that's due: counts as a "good" review;
 * - right on a card that isn't due: no change, so playing ahead can't push
 *   cards out further than the schedule would.
 */
export async function recordGameAnswer(termId: string, correct: boolean, mode: string, now = new Date()) {
  if (!(await findTerm(termId))) return;
  const [existing] = await db.select().from(cardProgress).where(eq(cardProgress.termId, termId));
  if (!correct) {
    await applyRating(termId, "again", mode, now);
  } else if (existing && existing.dueAt <= now) {
    await applyRating(termId, "good", mode, now);
  }
}

/** Passing Explain It Back is the last step to mastering a card. */
export async function markExplained(termId: string, now = new Date()) {
  const [existing] = await db.select().from(cardProgress).where(eq(cardProgress.termId, termId));
  if (existing) {
    await db.update(cardProgress).set({ explainedAt: now }).where(eq(cardProgress.termId, termId));
  } else {
    // Explaining a card you haven't studied yet still counts; start it on the schedule.
    await db.insert(cardProgress).values({ termId, ...newCardState(now), explainedAt: now, firstSeenAt: now });
  }
}

export type TrackSummary = Record<Stage, number> & { total: number };

export async function getSummary(now = new Date()) {
  const [terms, progress] = await Promise.all([getAllTerms(), getAllProgress()]);

  const tracks = {} as Record<Track, TrackSummary>;
  let mastered = 0;
  for (const term of terms) {
    const t = (tracks[term.track] ??= { new: 0, learning: 0, mastered: 0, total: 0 });
    const stage = stageOf(progress.get(term.id));
    t[stage]++;
    t.total++;
    if (stage === "mastered") mastered++;
  }

  const [{ value: reviewedToday }] = await db
    .select({ value: count() })
    .from(reviewLog)
    .where(and(gte(reviewLog.reviewedAt, startOfToday(now)), lte(reviewLog.reviewedAt, now)));

  return { tracks, reviewedToday, progress, mastered, terms };
}

/** XP earned since an instant. */
export async function xpSince(since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
    .from(xpEvents)
    .where(gte(xpEvents.at, since));
  return row.total;
}
