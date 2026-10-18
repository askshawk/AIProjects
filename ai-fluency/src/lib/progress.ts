import { and, asc, count, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { cardProgress, reviewLog } from "@/db/schema";
import { TERMS, getTerm, type Term, type Track } from "./content";
import { newCardState, schedule, stageOf, type CardState, type Rating, type Stage } from "./srs";

/** How many never-seen cards to introduce per day, so reviews don't pile up. */
export const NEW_CARDS_PER_DAY = 10;

function toState(row: typeof cardProgress.$inferSelect): CardState {
  return {
    repetitions: row.repetitions,
    intervalDays: row.intervalDays,
    ease: row.ease,
    lapses: row.lapses,
    dueAt: row.dueAt,
  };
}

function startOfToday(now: Date): Date {
  // Server-local midnight. Close enough for a daily new-card budget; a
  // timezone setting can come with the streaks feature.
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getAllProgress(): Promise<Map<string, CardState>> {
  const rows = await db.select().from(cardProgress);
  return new Map(rows.map((r) => [r.termId, toState(r)]));
}

export type QueueItem = { term: Term; state: CardState; isNew: boolean };

/**
 * Today's study queue: every card that's due, oldest first, then new cards up
 * to what's left of today's budget. Cards are introduced in file order, which
 * runs roughly from basics to advanced within each track.
 */
export async function getStudyQueue(now = new Date()): Promise<QueueItem[]> {
  const progress = await getAllProgress();

  const due = (
    await db.select().from(cardProgress).where(lte(cardProgress.dueAt, now)).orderBy(asc(cardProgress.dueAt))
  )
    .map((row) => ({ term: getTerm(row.termId), state: toState(row) }))
    // A card deleted from the JSON leaves an orphaned progress row; skip it.
    .filter((item): item is { term: Term; state: CardState } => Boolean(item.term))
    .map((item) => ({ ...item, isNew: false }));

  const [{ value: introducedToday }] = await db
    .select({ value: count() })
    .from(cardProgress)
    .where(gte(cardProgress.firstSeenAt, startOfToday(now)));

  const budget = Math.max(0, NEW_CARDS_PER_DAY - introducedToday);
  const fresh = TERMS.filter((t) => !progress.has(t.id))
    .slice(0, budget)
    .map((term) => ({ term, state: newCardState(now), isNew: true }));

  return [...due, ...fresh];
}

/** Applies a rating and returns the card's new schedule. */
export async function recordRating(termId: string, rating: Rating, now = new Date()): Promise<CardState> {
  if (!getTerm(termId)) throw new Error(`Unknown term: ${termId}`);

  const [existing] = await db.select().from(cardProgress).where(eq(cardProgress.termId, termId));
  const next = schedule(existing ? toState(existing) : newCardState(now), rating, now);

  await db
    .insert(cardProgress)
    .values({ termId, ...next, firstSeenAt: now, lastReviewedAt: now })
    .onConflictDoUpdate({
      target: cardProgress.termId,
      set: { ...next, lastReviewedAt: now },
    });
  await db.insert(reviewLog).values({ termId, rating, intervalDays: next.intervalDays, reviewedAt: now });

  return next;
}

export type TrackSummary = Record<Stage, number> & { total: number };

export async function getSummary(now = new Date()) {
  const progress = await getAllProgress();

  const tracks = {} as Record<Track, TrackSummary>;
  for (const term of TERMS) {
    const t = (tracks[term.track] ??= { new: 0, learning: 0, mastered: 0, total: 0 });
    t[stageOf(progress.get(term.id))]++;
    t.total++;
  }

  const [{ value: reviewedToday }] = await db
    .select({ value: count() })
    .from(reviewLog)
    .where(and(gte(reviewLog.reviewedAt, startOfToday(now)), lte(reviewLog.reviewedAt, now)));

  return { tracks, reviewedToday, progress };
}
