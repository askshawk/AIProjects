import "./env";
import { isNull, eq, sql as raw } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programs } from "@/db/schema";
import { embed } from "@/lib/embeddings";
import { exerciseEmbeddingText, parseExerciseRows } from "@/data/parseExercises";

/**
 * Fills in embeddings for rows that don't have them.
 *
 * Programs can be generated without an embedding provider configured — the
 * training content is the valuable part and shouldn't be blocked on a vector.
 * This backfills them afterwards. Pass --all to re-embed everything, which is
 * what a model or dimension change requires.
 *
 *   npm run backfill:embeddings
 *   npm run backfill:embeddings -- --all
 */
async function main() {
  const all = process.argv.includes("--all");

  const catalogue = new Map(
    parseExerciseRows().map((e) => [e.slug, exerciseEmbeddingText(e)]),
  );

  const exerciseRows = await db
    .select({ id: exercises.id, slug: exercises.slug, name: exercises.name })
    .from(exercises)
    .where(all ? undefined : isNull(exercises.embedding));

  if (exerciseRows.length > 0) {
    console.log(`embedding ${exerciseRows.length} exercise(s)…`);
    const texts = exerciseRows.map((r) => catalogue.get(r.slug) ?? r.name);
    const vectors = await embed(texts, "document");
    for (const [i, row] of exerciseRows.entries()) {
      await db
        .update(exercises)
        .set({ embedding: vectors[i] })
        .where(eq(exercises.id, row.id));
    }
  }

  const programRows = await db
    .select({
      id: programs.id,
      title: programs.title,
      authorName: programs.authorName,
      summary: programs.summary,
      splitType: programs.splitType,
      goal: programs.goal,
      experienceLevel: programs.experienceLevel,
      daysPerWeek: programs.daysPerWeek,
      tags: programs.tags,
    })
    .from(programs)
    .where(all ? undefined : isNull(programs.embedding));

  if (programRows.length > 0) {
    console.log(`embedding ${programRows.length} program(s)…`);
    // Same shape the generator uses, so backfilled vectors match generated ones.
    const texts = programRows.map((p) =>
      [
        p.title,
        p.authorName,
        p.summary,
        p.splitType,
        `${p.goal} ${p.experienceLevel} ${p.daysPerWeek} days per week`,
        p.tags.join(", "),
      ].join(". "),
    );
    const vectors = await embed(texts, "document");
    for (const [i, row] of programRows.entries()) {
      await db.update(programs).set({ embedding: vectors[i] }).where(eq(programs.id, row.id));
    }
  }

  const [{ ex }] = await db
    .select({ ex: raw<number>`count(*) filter (where embedding is null)::int` })
    .from(exercises);
  const [{ pr }] = await db
    .select({ pr: raw<number>`count(*) filter (where embedding is null)::int` })
    .from(programs);

  console.log(`done — ${ex} exercise(s) and ${pr} program(s) still without embeddings`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
