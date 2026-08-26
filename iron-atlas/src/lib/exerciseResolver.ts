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
 *
 * Recalibrated for Voyage. The old 0.72 came from MiniLM and silently rejected
 * *everything* after the provider swap — a constant tuned to one model's
 * distribution means nothing under another. Measured query-to-catalogue scores:
 *
 *   0.684  "barbell back squat"      -> High-Bar Back Squat    (want)
 *   0.565  "seated cable row machine"-> Wide-Grip Seated Row   (want)
 *   0.418  "flat bench"              -> Barbell Bench Press    (want)
 *   0.406  "lat pull down machine"   -> Single-Arm Lat Pulldown(want)
 *   ----------------------------------------------------------- floor
 *   0.306  "interpretive dance for lats"                       (reject)
 *   0.254  "qwertyuiop asdfgh"                                 (reject)
 *
 * The margin is narrower than it was, so this tier stays the last resort:
 * exact and alias matching handle the common cases, and a gap found in
 * generation is better fixed by adding an alias than by lowering this.
 */
const SIMILARITY_FLOOR = 0.38;

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
