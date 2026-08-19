import "./env";
import { sql as raw } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises } from "@/db/schema";
import { exerciseEmbeddingText, parseExerciseRows } from "@/data/parseExercises";
import { embed } from "@/lib/embeddings";

/**
 * Idempotent: upserts on slug, so re-running after editing the catalogue
 * updates rows in place and leaves foreign keys from programs intact.
 */
async function main() {
  const parsed = parseExerciseRows();
  console.log(`parsed ${parsed.length} exercises`);

  console.log("embedding (first run downloads the model)…");
  const vectors = await embed(parsed.map(exerciseEmbeddingText));

  const rows = parsed.map((e, i) => ({ ...e, embedding: vectors[i] }));

  // Chunked because a single statement with 200+ 384-dim vectors is a big packet.
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(exercises)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: exercises.slug,
        set: {
          name: raw`excluded.name`,
          aliases: raw`excluded.aliases`,
          movementPattern: raw`excluded.movement_pattern`,
          primaryMuscle: raw`excluded.primary_muscle`,
          secondaryMuscles: raw`excluded.secondary_muscles`,
          equipment: raw`excluded.equipment`,
          isUnilateral: raw`excluded.is_unilateral`,
          isCompound: raw`excluded.is_compound`,
          isExplosive: raw`excluded.is_explosive`,
          embedding: raw`excluded.embedding`,
        },
      });
    console.log(`  upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  const [{ count }] = await db
    .select({ count: raw<number>`count(*)::int` })
    .from(exercises);
  console.log(`done — ${count} exercises in the catalogue`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
