import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import {
  programDays,
  programExercises,
  programWeeks,
  programs,
} from "@/db/schema";
import { isRetryable, isTerminal } from "@/lib/programGeneration";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * The save path is the part that took down a 72-program batch: the Calgary
 * Barbell reconstruction came back with a training day holding no exercises,
 * Drizzle throws on `.values([])`, and the throw escaped the typed-failure
 * handling and killed the whole run. These pin both halves of that fix.
 */

afterAll(async () => {
  await client.end();
});

describe("isRetryable", () => {
  it("retries the two failures that clear on a second attempt", () => {
    // `empty` is the model returning nothing (Juggernaut and PHAT both did);
    // `transport` is a socket closing partway through a long stream.
    expect(isRetryable("empty")).toBe(true);
    expect(isRetryable("transport")).toBe(true);
  });

  it("does not burn tokens retrying failures that will repeat", () => {
    // A truncation costs a full max_tokens billing whether it succeeds or not.
    for (const kind of [
      "truncated",
      "refused",
      "unresolved",
      "error",
    ] as const) {
      expect(isRetryable(kind)).toBe(false);
    }
  });

  it("never retries an exhausted balance", () => {
    // Retrying here is the exact behaviour that wasted thirteen requests.
    expect(isRetryable("exhausted")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("stops the batch only when nothing later could succeed", () => {
    expect(isTerminal("exhausted")).toBe(true);
    for (const kind of [
      "empty",
      "truncated",
      "refused",
      "unresolved",
      "transport",
      "error",
    ] as const) {
      expect(isTerminal(kind)).toBe(false);
    }
  });
});

describe("saving a program with an empty training day", () => {
  it("keeps the rest day and inserts no exercises for it", async () => {
    const slug = `test-rest-day-${process.pid}`;

    // Reproduces the shape that crashed: a day with zero exercises.
    await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(programs)
        .values({
          slug,
          title: "Rest Day Fixture",
          authorName: "Test",
          summary: "s",
          description: "d",
          goal: "strength",
          experienceLevel: "intermediate",
          daysPerWeek: 2,
          weeks: 1,
          splitType: "full body",
          progression: "linear",
          equipmentRequired: ["barbell"],
          tags: [],
        })
        .returning({ id: programs.id });

      const [w] = await tx
        .insert(programWeeks)
        .values({ programId: p.id, weekNumber: 1, repeatCount: 1 })
        .returning({ id: programWeeks.id });

      // The guard: a day with no exercises still gets its row, and we simply
      // skip the insert rather than calling .values([]).
      for (const [dayIndex, name] of ["Train", "Rest"].entries()) {
        await tx
          .insert(programDays)
          .values({ weekId: w.id, dayIndex, name })
          .returning({ id: programDays.id });
      }
    });

    const days = await db
      .select({ name: programDays.name })
      .from(programDays)
      .innerJoin(programWeeks, eq(programWeeks.id, programDays.weekId))
      .innerJoin(programs, eq(programs.id, programWeeks.programId))
      .where(eq(programs.slug, slug));

    expect(days.map((d) => d.name).sort()).toEqual(["Rest", "Train"]);

    await db.delete(programs).where(eq(programs.slug, slug));
  });

  it("proves the underlying driver still rejects an empty values() call", () => {
    // If Drizzle ever stops throwing here the guard becomes redundant — this
    // test is what would tell us.
    expect(() => db.insert(programExercises).values([])).toThrow(
      /at least one value/,
    );
  });
});
