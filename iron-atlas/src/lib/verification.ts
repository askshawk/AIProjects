import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { programExercises, programs } from "@/db/schema";

/**
 * Read-only queries backing the review screen. Mutations live in
 * verificationActions.ts.
 *
 * Review of AI-reconstructed programs.
 *
 * Nearly the whole library is generated from a model's knowledge rather than
 * transcribed, so `verified` is the flag that separates "we think this is
 * roughly right" from "a human read it against the source". It's the only
 * quality signal the library has, which makes it worth guarding: flipping it
 * is a claim about accuracy, not a preference.
 */

export type ReviewQueueRow = {
  slug: string;
  title: string;
  authorName: string;
  generatedModel: string | null;
  sourceUrls: string[];
  prescribedSets: number;
  weeks: number;
};

/**
 * Unverified programs, thinnest first — a program with very few prescribed
 * sets is the most likely to be a bad reconstruction, so it should be the
 * first thing a reviewer sees.
 */
export async function reviewQueue(): Promise<ReviewQueueRow[]> {
  const rows = await db
    .select({
      slug: programs.slug,
      title: programs.title,
      authorName: programs.authorName,
      generatedModel: programs.generatedModel,
      sourceUrls: programs.sourceUrls,
      weeks: programs.weeks,
      prescribedSets: sql<number>`(
        select count(*)::int from ${programExercises} pe
        join program_days pd on pd.id = pe.day_id
        join program_weeks pw on pw.id = pd.week_id
        where pw.program_id = ${programs.id}
      )`,
    })
    .from(programs)
    .where(eq(programs.verified, false))
    .orderBy(asc(programs.authorName), asc(programs.title));

  return rows;
}

export async function verificationStats() {
  const [row] = await db
    .select({
      total: count(),
      verified: sql<number>`count(*) filter (where ${programs.verified})::int`,
    })
    .from(programs);
  return row;
}

/** Programs most in need of a look: unverified and unusually thin. */
export async function suspiciouslyThin(limit = 5) {
  return db
    .select({
      slug: programs.slug,
      title: programs.title,
      authorName: programs.authorName,
      weeks: programs.weeks,
      prescribedSets: sql<number>`(
        select count(*)::int from ${programExercises} pe
        join program_days pd on pd.id = pe.day_id
        join program_weeks pw on pw.id = pd.week_id
        where pw.program_id = ${programs.id}
      )`,
    })
    .from(programs)
    .where(and(eq(programs.verified, false), eq(programs.aiGenerated, true)))
    .orderBy(
      asc(sql`(
        select count(*) from ${programExercises} pe
        join program_days pd on pd.id = pe.day_id
        join program_weeks pw on pw.id = pd.week_id
        where pw.program_id = ${programs.id}
      )`),
      desc(programs.weeks),
    )
    .limit(limit);
}
