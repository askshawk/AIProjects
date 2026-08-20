import { cosineDistance, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { slugify } from "@/data/parseExercises";
import { tryEmbedOne } from "@/lib/embeddings";

export type ResolvedExercise = {
  id: number;
  name: string;
  /** How the match was made — surfaced so a fuzzy match can be reviewed. */
  via: "exact" | "alias" | "similarity";
  similarity?: number;
};

/**
 * Anything below this is treated as "no match" rather than a bad guess.
 * Calibrated against the catalogue: genuine synonyms land around 0.75+, while
 * unrelated movements sit near 0.4-0.5 (see the resolver tests).
 */
const SIMILARITY_FLOOR = 0.72;

type CatalogueRow = {
  id: number;
  name: string;
  slug: string;
  aliases: string[];
};

let cache: CatalogueRow[] | undefined;

async function catalogue(): Promise<CatalogueRow[]> {
  cache ??= await db
    .select({
      id: exercises.id,
      name: exercises.name,
      slug: exercises.slug,
      aliases: exercises.aliases,
    })
    .from(exercises);
  return cache;
}

/**
 * Maps a free-text exercise name onto a catalogue row: exact slug, then alias,
 * then nearest neighbour by embedding. Returns null rather than guessing, so
 * the caller can stop and ask instead of writing a wrong exercise to the
 * database.
 */
export async function resolveExerciseName(
  raw: string,
): Promise<ResolvedExercise | null> {
  const rows = await catalogue();
  const slug = slugify(raw);

  const exact = rows.find((r) => r.slug === slug);
  if (exact) return { id: exact.id, name: exact.name, via: "exact" };

  const aliased = rows.find((r) => r.aliases.some((a) => slugify(a) === slug));
  if (aliased) return { id: aliased.id, name: aliased.name, via: "alias" };

  // Without a provider we simply have no similarity tier — exact and alias
  // matching still work, and an unmatched name fails loudly rather than
  // resolving to something arbitrary.
  const vector = await tryEmbedOne(raw, "query");
  if (!vector) return null;

  const similarity = sql<number>`1 - (${cosineDistance(exercises.embedding, vector)})`;
  const [nearest] = await db
    .select({ id: exercises.id, name: exercises.name, similarity })
    .from(exercises)
    .orderBy(desc(similarity))
    .limit(1);

  if (!nearest || nearest.similarity < SIMILARITY_FLOOR) return null;
  return {
    id: nearest.id,
    name: nearest.name,
    via: "similarity",
    similarity: nearest.similarity,
  };
}

/** Only used by tests, which seed and reset the catalogue between cases. */
export function clearExerciseCache() {
  cache = undefined;
}
