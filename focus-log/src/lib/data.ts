import "server-only";
import { and, asc, desc, eq, gt, isNull, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { goals, sessions, type Session } from "@/db/schema";
import { CATEGORIES, isCategory, type Category } from "./categories";
import { finishBounds, minutesByDay, type Span, type Totals } from "./stats";
import { addDays, appTimeZone, dayKey, startOfDay } from "./time";

/** Every database read and write the pages and actions use. */

export const MAX_MINUTES = 24 * 60;

export async function getActiveSession(): Promise<Session | null> {
  const [row] = await db.select().from(sessions).where(isNull(sessions.endedAt)).limit(1);
  return row ?? null;
}

export async function startSession(category: Category, plannedMinutes: number | null): Promise<void> {
  if (await getActiveSession()) throw new Error("A session is already running. Stop it first.");
  await db.insert(sessions).values({ category, plannedMinutes, startedAt: new Date() });
}

export async function finishSession(id: number, minutes: number, note: string): Promise<void> {
  const [row] = await db.select().from(sessions).where(and(eq(sessions.id, id), isNull(sessions.endedAt)));
  if (!row) throw new Error("That session isn't running any more.");
  const bounds = finishBounds(row.startedAt, minutes, new Date());
  await db
    .update(sessions)
    .set({ ...bounds, note })
    .where(eq(sessions.id, id));
}

/** Throw away a running session you started by mistake. */
export async function discardActiveSession(id: number): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.id, id), isNull(sessions.endedAt)));
}

export async function logPastSession(input: { category: Category; startedAt: Date; minutes: number; note: string }) {
  const endedAt = new Date(input.startedAt.getTime() + input.minutes * 60000);
  if (endedAt.getTime() > Date.now() + 60000) throw new Error("That session would end in the future.");
  await db.insert(sessions).values({ category: input.category, startedAt: input.startedAt, endedAt, note: input.note });
}

export async function deleteSession(id: number): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.id, id), isNotNull(sessions.endedAt)));
}

/** Finished sessions overlapping [from, to), oldest first. */
export async function finishedSessionsBetween(from: Date, to: Date): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(and(isNotNull(sessions.endedAt), lt(sessions.startedAt, to), gt(sessions.endedAt, from)))
    .orderBy(asc(sessions.startedAt));
}

export async function recentSessions(days: number): Promise<Session[]> {
  const from = startOfDay(addDays(todayKeyNow(), -days));
  return db
    .select()
    .from(sessions)
    .where(and(isNotNull(sessions.endedAt), gt(sessions.endedAt, from)))
    .orderBy(desc(sessions.startedAt));
}

export async function allFinishedSessions(): Promise<Session[]> {
  return db.select().from(sessions).where(isNotNull(sessions.endedAt)).orderBy(asc(sessions.startedAt));
}

const toSpans = (rows: Session[]): Span[] =>
  rows.filter((r) => r.endedAt && isCategory(r.category)).map((r) => ({ category: r.category as Category, startedAt: r.startedAt, endedAt: r.endedAt! }));

/**
 * Per-day minutes for the days [fromKey, toKey] inclusive. Sessions are
 * clipped to the range, so one that started the night before only counts
 * its share.
 */
export async function dailyTotals(fromKey: string, toKey: string): Promise<Map<string, Totals>> {
  const tz = appTimeZone();
  const from = startOfDay(fromKey, tz);
  const to = startOfDay(addDays(toKey, 1), tz);
  const rows = await finishedSessionsBetween(from, to);
  const clipped = toSpans(rows).map((s) => ({
    ...s,
    startedAt: new Date(Math.max(s.startedAt.getTime(), from.getTime())),
    endedAt: new Date(Math.min(s.endedAt.getTime(), to.getTime())),
  }));
  return minutesByDay(clipped, tz);
}

export async function getGoals(): Promise<Partial<Record<Category, number>>> {
  const rows = await db.select().from(goals);
  return Object.fromEntries(rows.filter((r) => isCategory(r.category)).map((r) => [r.category, r.weeklyMinutes]));
}

export async function saveGoals(values: Partial<Record<Category, number>>): Promise<void> {
  for (const category of CATEGORIES) {
    const weeklyMinutes = values[category] ?? 0;
    await db
      .insert(goals)
      .values({ category, weeklyMinutes })
      .onConflictDoUpdate({ target: goals.category, set: { weeklyMinutes } });
  }
}

export const todayKeyNow = () => dayKey(new Date());
