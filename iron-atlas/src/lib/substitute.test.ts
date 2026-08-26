import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import { exercises } from "@/db/schema";
import {
  canPerform,
  findSubstitutes,
  planSwaps,
  type ExerciseForSwap,
  type GymProfile,
} from "@/lib/substitute";
import { parseGymProfile, serializeGymProfile } from "@/lib/gymProfile";
import { hasEmbeddings } from "@/lib/testEnv";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * These pin the *safety* properties of substitution, not just that it returns
 * something. A wrong swap is worse than no swap: it silently changes what a
 * program trains while still carrying the author's name.
 */

afterAll(async () => {
  await client.end();
});

async function load(name: string): Promise<ExerciseForSwap> {
  const [row] = await db
    .select({
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      equipment: exercises.equipment,
      primaryMuscle: exercises.primaryMuscle,
      isCompound: exercises.isCompound,
      isExplosive: exercises.isExplosive,
    })
    .from(exercises)
    .where(eq(exercises.name, name));
  if (!row) throw new Error(`no exercise named "${name}"`);
  return row;
}

const HOME: GymProfile = {
  equipment: ["barbell", "dumbbell", "bodyweight"],
  bannedExerciseIds: [],
};
const DUMBBELLS: GymProfile = {
  equipment: ["dumbbell", "bodyweight"],
  bannedExerciseIds: [],
};

describe("canPerform", () => {
  it("blocks equipment the gym doesn't have", async () => {
    const hackSquat = await load("Hack Squat");
    expect(canPerform(hackSquat, HOME)).toBe(false);
  });

  it("allows everything when no gym is configured", async () => {
    const hackSquat = await load("Hack Squat");
    expect(
      canPerform(hackSquat, { equipment: [], bannedExerciseIds: [] }),
    ).toBe(true);
  });

  it("blocks explicitly banned exercises even with the right equipment", async () => {
    const bench = await load("Barbell Bench Press");
    expect(canPerform(bench, HOME)).toBe(true);
    expect(
      canPerform(bench, { ...HOME, bannedExerciseIds: [bench.exerciseId] }),
    ).toBe(false);
  });
});

describe.skipIf(!hasEmbeddings)("findSubstitutes", () => {
  it("swaps a machine movement for a free-weight one that trains the same thing", async () => {
    const subs = await findSubstitutes(await load("Hack Squat"), HOME);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs[0].primaryMuscle).toBe("quads");
    for (const s of subs) expect(HOME.equipment).toContain(s.equipment);
  });

  it("finds the obvious answer for a barbell press without a barbell", async () => {
    const subs = await findSubstitutes(
      await load("Barbell Bench Press"),
      DUMBBELLS,
    );
    expect(subs[0].name).toBe("Dumbbell Bench Press");
  });

  it("never suggests an explosive movement for a strength movement", async () => {
    // Box Jump and Jump Squat are squat-pattern quad compounds — they pass every
    // other filter and are not substitutes for a loaded squat.
    const subs = await findSubstitutes(await load("Back Squat"), DUMBBELLS, 5);
    const names = subs.map((s) => s.name);
    expect(names).not.toContain("Jump Squat");
    expect(names).not.toContain("Box Jump");
  });

  it("keeps explosive movements among explosive movements", async () => {
    const subs = await findSubstitutes(await load("Box Jump"), DUMBBELLS, 5);
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) {
      const [row] = await db
        .select({ isExplosive: exercises.isExplosive })
        .from(exercises)
        .where(eq(exercises.id, s.id));
      expect(row.isExplosive).toBe(true);
    }
  });

  it("refuses rather than crossing muscle groups on an isolation lift", async () => {
    // "isolation" is a residual bucket, not a movement pattern. Without the
    // guard this returned biceps curls for a leg curl, because "curl" embeds
    // near "curl". No answer is the correct answer here.
    const subs = await findSubstitutes(await load("Lying Leg Curl"), DUMBBELLS);
    expect(subs).toEqual([]);
  });

  it("never returns the exercise it was asked to replace", async () => {
    const bench = await load("Barbell Bench Press");
    const subs = await findSubstitutes(
      bench,
      { equipment: [], bannedExerciseIds: [] },
      10,
    );
    expect(subs.map((s) => s.id)).not.toContain(bench.exerciseId);
  });

  it("never returns a banned exercise", async () => {
    const dbBench = await load("Dumbbell Bench Press");
    const subs = await findSubstitutes(await load("Barbell Bench Press"), {
      ...DUMBBELLS,
      bannedExerciseIds: [dbBench.exerciseId],
    });
    expect(subs.map((s) => s.id)).not.toContain(dbBench.exerciseId);
  });
});

describe.skipIf(!hasEmbeddings)("planSwaps", () => {
  it("plans one swap per distinct exercise, not per prescribed set", async () => {
    const hackSquat = await load("Hack Squat");
    // The same movement appearing on many days must resolve consistently.
    const rows = [hackSquat, hackSquat, hackSquat, await load("Back Squat")];
    const plans = await planSwaps(rows, HOME);

    expect(plans.size).toBe(1);
    expect(plans.has(hackSquat.exerciseId)).toBe(true);
    expect(plans.get(hackSquat.exerciseId)?.to).not.toBeNull();
  });

  it("plans nothing when the gym can do everything", async () => {
    const rows = [await load("Back Squat"), await load("Barbell Bench Press")];
    expect((await planSwaps(rows, HOME)).size).toBe(0);
  });

  it("records a null target when nothing valid exists", async () => {
    const legCurl = await load("Lying Leg Curl");
    const plans = await planSwaps([legCurl], DUMBBELLS);
    expect(plans.get(legCurl.exerciseId)?.to).toBeNull();
  });
});

describe("gym profile cookie", () => {
  it("round-trips", () => {
    const profile: GymProfile = {
      equipment: ["barbell", "dumbbell"],
      bannedExerciseIds: [3, 17],
    };
    expect(parseGymProfile(serializeGymProfile(profile))).toEqual(profile);
  });

  it("falls back to an empty profile on junk rather than throwing", () => {
    // A stale or hand-edited cookie must not take a page down.
    expect(parseGymProfile(undefined)).toEqual({
      equipment: [],
      bannedExerciseIds: [],
    });
    expect(parseGymProfile("not json")).toEqual({
      equipment: [],
      bannedExerciseIds: [],
    });
    expect(parseGymProfile("null")).toEqual({
      equipment: [],
      bannedExerciseIds: [],
    });
  });

  it("drops values that aren't real equipment", () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        equipment: ["barbell", "spaceship"],
        bannedExerciseIds: [1, "x"],
      }),
    );
    expect(parseGymProfile(raw)).toEqual({
      equipment: ["barbell"],
      bannedExerciseIds: [1],
    });
  });
});
