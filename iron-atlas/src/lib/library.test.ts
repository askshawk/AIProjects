import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, sql as client } from "@/db";
import { exercises, programExercises, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";
import { generatedProgramJsonSchema } from "@/lib/programSchema";
import { hasEmbeddings } from "@/lib/testEnv";

/**
 * These run against the local database — start it with `npm run db` first.
 * They're the guard rails for the library: nothing prescribed may point at a
 * missing exercise, and the resolver must refuse rather than guess.
 */

afterAll(async () => {
  await client.end();
});

/**
 * Anything that misses both the exact-name and alias paths embeds the query
 * through Voyage, so those tests are a live network call and their runtime is
 * the provider's latency, not ours. The global 60s covers a normal response
 * and a cold start; this raises it further for the two that always go out to
 * the network, which occasionally take longer than that and failed the suite
 * for reasons that had nothing to do with the code.
 */
const EMBEDDING_CALL_TIMEOUT_MS = 180_000;

describe.skipIf(!hasEmbeddings)("exercise resolver", () => {
  it("matches an exact catalogue name", async () => {
    const match = await resolveExerciseName("Barbell Bench Press");
    expect(match?.via).toBe("exact");
    expect(match?.name).toBe("Barbell Bench Press");
  });

  it("matches through an alias", async () => {
    const match = await resolveExerciseName("db bench");
    expect(match?.via).toBe("alias");
    expect(match?.name).toBe("Dumbbell Bench Press");
  });

  it("ignores case and punctuation", async () => {
    const match = await resolveExerciseName("farmers walk");
    expect(match?.name).toBe("Farmer's Walk");
  });

  it("falls back to similarity for an unlisted phrasing", async () => {
    // Similarity picks the closest *variation*, not necessarily the plainest
    // one — "barbell back squat" lands on High-Bar Back Squat as readily as on
    // Back Squat. Either is a correct movement to prescribe, so the contract is
    // the family, not the exact row. Exact naming is the caller's job, and the
    // generator logs every similarity match so a bad one is visible.
    const match = await resolveExerciseName("barbell back squat");
    expect(match?.via).toBe("similarity");
    expect(match?.name).toMatch(/Back Squat/);
  }, EMBEDDING_CALL_TIMEOUT_MS);

  it("returns null instead of guessing at nonsense", async () => {
    expect(await resolveExerciseName("interpretive dance for lats")).toBeNull();
    expect(await resolveExerciseName("qwertyuiop asdfgh")).toBeNull();
  }, EMBEDDING_CALL_TIMEOUT_MS);
});

describe("library integrity", () => {
  it("every prescribed set points at a real exercise", async () => {
    // The guard against generated garbage: a program row whose exercise_id has
    // no matching catalogue row would break every downstream feature.
    const [{ orphans }] = await db
      .select({ orphans: sql<number>`count(*)::int` })
      .from(programExercises)
      .leftJoin(exercises, eq(exercises.id, programExercises.exerciseId))
      .where(sql`${exercises.id} is null`);
    expect(orphans).toBe(0);
  });

  it("every program declares only equipment its exercises actually use", async () => {
    const rows = await db
      .select({
        slug: programs.slug,
        declared: programs.equipmentRequired,
        actual: sql<string[]>`array_agg(distinct ${exercises.equipment})`,
      })
      .from(programs)
      .innerJoin(
        sql`program_weeks`,
        sql`program_weeks.program_id = ${programs.id}`,
      )
      .innerJoin(
        sql`program_days`,
        sql`program_days.week_id = program_weeks.id`,
      )
      .innerJoin(
        programExercises,
        sql`${programExercises.dayId} = program_days.id`,
      )
      .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
      .groupBy(programs.slug, programs.equipmentRequired);

    for (const row of rows) {
      expect(
        [...row.declared].sort(),
        `${row.slug} declares equipment it doesn't use`,
      ).toEqual([...new Set(row.actual)].sort());
    }
  });
});

describe("generated program schema", () => {
  it("emits a schema the structured-outputs subset accepts", () => {
    const json = JSON.stringify(generatedProgramJsonSchema());
    expect(json).not.toContain("$ref");
    expect(json).not.toContain("minLength");
    expect(json).not.toContain('"minimum"');
    expect(json).not.toContain("$schema");
    expect(json).toContain('"additionalProperties":false');
  });
});
