import { afterAll, describe, expect, it } from "vitest";
import { asc, eq, sql as dsql } from "drizzle-orm";
import { db, sql as client } from "@/db";
import {
  programDays,
  programExercises,
  programWeeks,
  programs,
  userProgramDays,
  userProgramExercises,
  userProgramWeeks,
  userPrograms,
  users,
} from "@/db/schema";
import { activeProgram, forkProgram } from "@/lib/fork";
import { EMPTY_GYM, type GymProfile } from "@/lib/substitute";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * "Templates are immutable; users fork" is the one architectural rule this
 * app has. These pin the two halves of that promise: a fork's content
 * matches the source it copied, and nothing done to a fork afterward can
 * reach back and change the library row.
 */

const SLUG = "arnold-golden-six";

afterAll(async () => {
  await client.end();
});

async function makeUser() {
  const [row] = await db
    .insert(users)
    .values({
      email: `fork-test-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: "x",
    })
    .returning({ id: users.id });
  return row.id;
}

async function libraryRows() {
  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.slug, SLUG));
  return db
    .select({
      exerciseId: programExercises.exerciseId,
      sets: programExercises.sets,
      order: programExercises.order,
      dayIndex: programDays.dayIndex,
      weekNumber: programWeeks.weekNumber,
    })
    .from(programWeeks)
    .innerJoin(programDays, eq(programDays.weekId, programWeeks.id))
    .innerJoin(programExercises, eq(programExercises.dayId, programDays.id))
    .where(eq(programWeeks.programId, program.id))
    .orderBy(
      asc(programWeeks.weekNumber),
      asc(programDays.dayIndex),
      asc(programExercises.order),
    );
}

async function forkRows(userProgramId: number) {
  return db
    .select({
      exerciseId: userProgramExercises.exerciseId,
      substitutedFrom: userProgramExercises.substitutedFromExerciseId,
      sets: userProgramExercises.sets,
      order: userProgramExercises.order,
      dayIndex: userProgramDays.dayIndex,
      weekNumber: userProgramWeeks.weekNumber,
    })
    .from(userProgramWeeks)
    .innerJoin(userProgramDays, eq(userProgramDays.weekId, userProgramWeeks.id))
    .innerJoin(
      userProgramExercises,
      eq(userProgramExercises.dayId, userProgramDays.id),
    )
    .where(eq(userProgramWeeks.userProgramId, userProgramId))
    .orderBy(
      asc(userProgramWeeks.weekNumber),
      asc(userProgramDays.dayIndex),
      asc(userProgramExercises.order),
    );
}

describe("forkProgram", () => {
  it("returns null for a program that doesn't exist", async () => {
    const userId = await makeUser();
    expect(await forkProgram(userId, "not-a-real-slug", EMPTY_GYM)).toBeNull();
  });

  it("copies the source exactly when the gym can perform everything", async () => {
    const userId = await makeUser();
    const forkId = await forkProgram(userId, SLUG, EMPTY_GYM);
    expect(forkId).not.toBeNull();

    const source = await libraryRows();
    const fork = await forkRows(forkId!);

    expect(fork.length).toBe(source.length);
    for (let i = 0; i < source.length; i++) {
      expect(fork[i].exerciseId).toBe(source[i].exerciseId);
      expect(fork[i].sets).toBe(source[i].sets);
      expect(fork[i].dayIndex).toBe(source[i].dayIndex);
      expect(fork[i].weekNumber).toBe(source[i].weekNumber);
      // Nothing swapped — EMPTY_GYM means "assume everything".
      expect(fork[i].substitutedFrom).toBeNull();
    }
  });

  it("never records a substitution as a swap for itself", async () => {
    // A restrictive gym may or may not find a candidate; either way, fork.ts
    // must wire planSwaps' output through faithfully rather than, say,
    // recording the same id on both sides.
    const userId = await makeUser();
    const restrictive: GymProfile = { equipment: ["dumbbell"], bannedExerciseIds: [] };
    const forkId = await forkProgram(userId, SLUG, restrictive);
    const fork = await forkRows(forkId!);

    for (const row of fork) {
      if (row.substitutedFrom !== null) {
        expect(row.substitutedFrom).not.toBe(row.exerciseId);
      }
    }
  });

  it("editing the fork never touches the library program", async () => {
    const userId = await makeUser();
    const forkId = await forkProgram(userId, SLUG, EMPTY_GYM);
    const before = await libraryRows();

    const [firstForkExercise] = await forkRows(forkId!);
    await db
      .update(userProgramExercises)
      .set({ sets: 999 })
      .where(eq(userProgramExercises.exerciseId, firstForkExercise.exerciseId));

    const after = await libraryRows();
    expect(after).toEqual(before);
    expect(after.some((r) => r.sets === 999)).toBe(false);
  });

  it("keeps two lifters' forks of the same program independent", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const forkA = await forkProgram(userA, SLUG, EMPTY_GYM);
    const forkB = await forkProgram(userB, SLUG, EMPTY_GYM);

    // Update by the fork's own row id, not by exerciseId — every lifter's
    // fork of the same program shares the same *library* exercise ids, so
    // filtering on exerciseId would (and, while writing this test, did)
    // silently edit every other lifter's fork of the same movement too.
    const [rowA] = await db
      .select({ id: userProgramExercises.id })
      .from(userProgramExercises)
      .innerJoin(
        userProgramDays,
        eq(userProgramDays.id, userProgramExercises.dayId),
      )
      .innerJoin(
        userProgramWeeks,
        eq(userProgramWeeks.id, userProgramDays.weekId),
      )
      .where(eq(userProgramWeeks.userProgramId, forkA!))
      .orderBy(asc(userProgramExercises.id))
      .limit(1);
    await db
      .update(userProgramExercises)
      .set({ sets: 777 })
      .where(eq(userProgramExercises.id, rowA.id));

    const rowsB = await forkRows(forkB!);
    expect(rowsB.some((r) => r.sets === 777)).toBe(false);
  });
});

describe("activeProgram", () => {
  it("returns null when the lifter has no active program", async () => {
    const userId = await makeUser();
    expect(await activeProgram(userId)).toBeNull();
  });

  it("finds the fork once one is started", async () => {
    const userId = await makeUser();
    const forkId = await forkProgram(userId, SLUG, EMPTY_GYM);
    const active = await activeProgram(userId);
    expect(active?.id).toBe(forkId);
  });

  it("ignores a program that isn't active", async () => {
    const userId = await makeUser();
    const forkId = await forkProgram(userId, SLUG, EMPTY_GYM);
    await db
      .update(userPrograms)
      .set({ status: "completed" })
      .where(eq(userPrograms.id, forkId!));

    expect(await activeProgram(userId)).toBeNull();
  });

  it("returns the earliest-started active program when more than one exists", async () => {
    const userId = await makeUser();
    const first = await forkProgram(userId, SLUG, EMPTY_GYM);
    // Pushed back with a server-side expression, not a JS Date sent as a
    // value: comparing a JS-Date write against `defaultNow()`'s Postgres-side
    // NOW() on a plain `timestamp` (no explicit timezone) column round-trips
    // through two different serialization paths and can silently invert the
    // ordering depending on the machine's local timezone. `now() - interval`
    // stays entirely server-side, so it orders correctly regardless.
    await db
      .update(userPrograms)
      .set({ startedAt: dsql`now() - interval '1 hour'` })
      .where(eq(userPrograms.id, first!));

    const second = await forkProgram(userId, SLUG, EMPTY_GYM);

    const active = await activeProgram(userId);
    expect(active?.id).toBe(first);
    expect(active?.id).not.toBe(second);
  });
});
