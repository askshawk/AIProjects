import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { slugify } from "@/data/parseExercises";

/**
 * Authors are derived from `programs.authorName` rather than stored in their
 * own table. The model supplies the name when it reconstructs a program, so a
 * separate table would need reconciling on every generation.
 *
 * The catch is that the model qualifies names inconsistently — the library
 * really did come back with both "Mark Rippetoe" and "Mark Rippetoe
 * (popularized with Glenn Pendlay)", and both "Sergey Smolov" and "Sergey
 * Smolov (popularized by online strength community)". Left alone that splits
 * one coach across several pages, and it gets worse with every batch. So the
 * trailing parenthetical is treated as an annotation, not part of the name.
 */

export type AuthorSummary = {
  slug: string;
  name: string;
  programCount: number;
  verifiedCount: number;
};

/**
 * "Bill Starr (adapted by 'Madcow')" -> "Bill Starr".
 * The qualifier is real information, but it belongs to the *program*, not to
 * the person, and the program's own title and notes already carry it.
 */
export const canonicalAuthor = (name: string) =>
  name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name.trim();

export const authorSlug = (name: string) => slugify(canonicalAuthor(name));

/** Every stored spelling, so a lookup can match all of a coach's programs. */
async function distinctNames(): Promise<string[]> {
  const rows = await db.selectDistinct({ name: programs.authorName }).from(programs);
  return rows.map((r) => r.name);
}

export async function listAuthors(): Promise<AuthorSummary[]> {
  const rows = await db
    .select({
      name: programs.authorName,
      verified: programs.verified,
    })
    .from(programs);

  const grouped = new Map<string, AuthorSummary>();
  for (const row of rows) {
    const name = canonicalAuthor(row.name);
    const slug = authorSlug(row.name);
    const entry = grouped.get(slug) ?? { slug, name, programCount: 0, verifiedCount: 0 };
    entry.programCount++;
    if (row.verified) entry.verifiedCount++;
    grouped.set(slug, entry);
  }

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolves a slug to the canonical display name, or null if no such author. */
export async function findAuthorName(slug: string): Promise<string | null> {
  const names = await distinctNames();
  const match = names.find((n) => authorSlug(n) === slug);
  return match ? canonicalAuthor(match) : null;
}

/**
 * All programs by a coach, across every spelling of their name — matching on
 * the canonical form rather than the stored string.
 */
export async function programsByAuthor(canonicalName: string) {
  const names = (await distinctNames()).filter(
    (n) => canonicalAuthor(n) === canonicalName,
  );
  if (names.length === 0) return [];

  return db
    .select({
      id: programs.id,
      slug: programs.slug,
      title: programs.title,
      authorName: programs.authorName,
      summary: programs.summary,
      goal: programs.goal,
      experienceLevel: programs.experienceLevel,
      daysPerWeek: programs.daysPerWeek,
      weeks: programs.weeks,
      splitType: programs.splitType,
      aiGenerated: programs.aiGenerated,
      verified: programs.verified,
    })
    .from(programs)
    .where(names.length === 1 ? eq(programs.authorName, names[0]) : inArray(programs.authorName, names))
    .orderBy(asc(programs.title));
}
