import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import {
  exercises,
  userProgramDays,
  userProgramExercises,
  userProgramWeeks,
  userPrograms,
  users,
} from "@/db/schema";
import {
  addExercise,
  adjustVolume,
  removeExercise,
  swapExercise,
} from "@/lib/tweak";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * These pin ownership and bounds. Chat-driven edits are the one place where a
 * model's output reaches straight into someone's training data, so "can this
 * touch a fork it doesn't own" and "can this write an absurd number of sets"
 * matter more than the happy path.
 */

afterAll(async () => {
  await client.end();
});

let ownerId: number;
let strangerId: number;
let forkId: number;
let squatId: number;

async function seedFork() {
  const stamp = `${process.pid}-${Math.round(performance.now() * 1000)}`;

  const [owner] = await db
    .insert(users)
    .values({ email: `owner-${stamp}@test.local`, passwordHash: "x" })
    .returning({ id: users.id });
  const [stranger] = await db
    .insert(users)
    .values({ email: `stranger-${stamp}@test.local`, passwordHash: "x" })
    .returning({ id: users.id });

  const [squat] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.name, "Back Squat"));
  const [press] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.name, "Overhead Press"));

  const [fork] = await db
    .insert(userPrograms)
    .values({
      userId: owner.id,
      title: "Test Block",
      authorName: "Test",
      progression: "linear",
      status: "active",
    })
    .returning({ id: userPrograms.id });

  const [week] = await db
    .insert(userProgramWeeks)
    .values({ userProgramId: fork.id, weekNumber: 1, repeatCount: 1 })
    .returning({ id: userProgramWeeks.id });

  // Two days, both squatting — a swap must reach every occurrence.
  for (const [dayIndex, name] of ["Day A", "Day B"].entries()) {
    const [day] = await db
      .insert(userProgramDays)
      .values({ weekId: week.id, dayIndex, name })
      .returning({ id: userProgramDays.id });

    await db.insert(userProgramExercises).values([
      {
        dayId: day.id,
        exerciseId: squat.id,
        order: 0,
        sets: 3,
        reps: "5",
        intensityType: "none",
      },
      {
        dayId: day.id,
        exerciseId: press.id,
        order: 1,
        sets: 3,
        reps: "8",
        intensityType: "none",
      },
    ]);
  }

  return {
    ownerId: owner.id,
    strangerId: stranger.id,
    forkId: fork.id,
    squatId: squat.id,
  };
}

async function setsFor(name: string) {
  const rows = await db
    .select({ sets: userProgramExercises.sets, exerciseName: exercises.name })
    .from(userProgramExercises)
    .innerJoin(exercises, eq(exercises.id, userProgramExercises.exerciseId))
    .innerJoin(
      userProgramDays,
      eq(userProgramDays.id, userProgramExercises.dayId),
    )
    .innerJoin(
      userProgramWeeks,
      eq(userProgramWeeks.id, userProgramDays.weekId),
    )
    .where(
      and(eq(userProgramWeeks.userProgramId, forkId), eq(exercises.name, name)),
    );
  return rows.map((r) => r.sets);
}

beforeEach(async () => {
  ({ ownerId, strangerId, forkId, squatId } = await seedFork());
});

describe("ownership", () => {
  it("refuses every mutation from someone who doesn't own the fork", async () => {
    const attempts = await Promise.all([
      swapExercise(forkId, strangerId, "Back Squat", "Front Squat"),
      adjustVolume(forkId, strangerId, { deltaSets: 5 }),
      removeExercise(forkId, strangerId, "Back Squat"),
      addExercise(forkId, strangerId, {
        dayName: "Day A",
        exerciseName: "Barbell Curl",
        sets: 3,
        reps: "10",
      }),
    ]);

    for (const result of attempts) {
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ reason: "not your program" });
    }
    // And nothing actually changed.
    expect(await setsFor("Back Squat")).toEqual([3, 3]);
  });
});

describe("swapExercise", () => {
  it("replaces the movement everywhere it appears, not just the first", async () => {
    const result = await swapExercise(
      forkId,
      ownerId,
      "Back Squat",
      "Front Squat",
    );
    expect(result.ok).toBe(true);
    expect(await setsFor("Back Squat")).toEqual([]);
    expect(await setsFor("Front Squat")).toEqual([3, 3]);
  });

  it("records what it replaced, so the fork can show the change", async () => {
    await swapExercise(forkId, ownerId, "Back Squat", "Front Squat");
    const [row] = await db
      .select({ from: userProgramExercises.substitutedFromExerciseId })
      .from(userProgramExercises)
      .innerJoin(
        userProgramDays,
        eq(userProgramDays.id, userProgramExercises.dayId),
      )
      .innerJoin(
        userProgramWeeks,
        eq(userProgramWeeks.id, userProgramDays.weekId),
      )
      .where(eq(userProgramWeeks.userProgramId, forkId))
      .limit(1);
    expect(row.from).toBe(squatId);
  });

  it("refuses an exercise the program doesn't contain", async () => {
    const result = await swapExercise(
      forkId,
      ownerId,
      "Leg Press",
      "Hack Squat",
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses a name that isn't in the catalogue rather than inventing one", async () => {
    const result = await swapExercise(
      forkId,
      ownerId,
      "Back Squat",
      "Nonexistent Machine XYZ",
    );
    expect(result.ok).toBe(false);
  });

  it("refuses swapping something for itself", async () => {
    const result = await swapExercise(
      forkId,
      ownerId,
      "Back Squat",
      "Back Squat",
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "those are the same exercise",
    });
  });
});

describe("adjustVolume", () => {
  it("scopes to one exercise when named", async () => {
    await adjustVolume(forkId, ownerId, {
      exerciseName: "Back Squat",
      deltaSets: 2,
    });
    expect(await setsFor("Back Squat")).toEqual([5, 5]);
    expect(await setsFor("Overhead Press")).toEqual([3, 3]);
  });

  it("applies to the whole program when no exercise is named", async () => {
    await adjustVolume(forkId, ownerId, { deltaSets: 1 });
    expect(await setsFor("Back Squat")).toEqual([4, 4]);
    expect(await setsFor("Overhead Press")).toEqual([4, 4]);
  });

  it("caps at 20 sets — an enthusiastic multiplier is an injury, not a program", async () => {
    await adjustVolume(forkId, ownerId, { multiplier: 100 });
    expect(await setsFor("Back Squat")).toEqual([20, 20]);
  });

  it("never drops below one set", async () => {
    await adjustVolume(forkId, ownerId, { deltaSets: -99 });
    expect(await setsFor("Back Squat")).toEqual([1, 1]);
  });

  it("reports rather than silently doing nothing when the change is a no-op", async () => {
    const result = await adjustVolume(forkId, ownerId, { deltaSets: 0 });
    expect(result.ok).toBe(false);
  });
});

describe("addExercise and removeExercise", () => {
  it("adds to the matched day only", async () => {
    const result = await addExercise(forkId, ownerId, {
      dayName: "Day A",
      exerciseName: "Barbell Curl",
      sets: 3,
      reps: "10",
    });
    expect(result.ok).toBe(true);
    expect(await setsFor("Barbell Curl")).toEqual([3]);
  });

  it("clamps an absurd set count on the way in", async () => {
    await addExercise(forkId, ownerId, {
      dayName: "Day A",
      exerciseName: "Barbell Curl",
      sets: 500,
      reps: "10",
    });
    expect(await setsFor("Barbell Curl")).toEqual([20]);
  });

  it("explains which days exist when the day doesn't match", async () => {
    const result = await addExercise(forkId, ownerId, {
      dayName: "Leg Day",
      exerciseName: "Barbell Curl",
      sets: 3,
      reps: "10",
    });
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("Day A");
  });

  it("removes every occurrence", async () => {
    const result = await removeExercise(forkId, ownerId, "Back Squat");
    expect(result.ok).toBe(true);
    expect(await setsFor("Back Squat")).toEqual([]);
    expect(await setsFor("Overhead Press")).toEqual([3, 3]);
  });
});
