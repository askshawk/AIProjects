import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import { exercises, setLogs, users, workoutSessions } from "@/db/schema";
import { recentPerformances } from "@/lib/logbook";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * This exists because of a shipped bug: the window was computed with
 * `row_number()` over set-log *rows*, so a single session of three sets
 * occupied ranks 1-3 by itself. `progression.ts` reads this window to decide
 * whether a lifter has stalled, so one missed session looked like three
 * consecutive ones and triggered a 10% deload with the message "Missed the
 * target three sessions running" — telling the lifter something untrue and
 * putting a lighter weight on the bar than the session called for.
 *
 * The invariant that matters: **one session is one window, regardless of how
 * many sets it contains.**
 */

afterAll(async () => {
  await client.end();
});

async function makeUser() {
  const email = `test-recentperf-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "x" })
    .returning({ id: users.id });
  return user.id;
}

/** One session with `reps` logged as N sets of the same weight. */
async function logSession(
  userId: number,
  exerciseId: number,
  performedAt: Date,
  sets: { weightKg: number; reps: number }[],
) {
  const [session] = await db
    .insert(workoutSessions)
    .values({ userId, performedAt })
    .returning({ id: workoutSessions.id });

  await db.insert(setLogs).values(
    sets.map((s, i) => ({
      sessionId: session.id,
      exerciseId,
      setIndex: i,
      weightKg: String(s.weightKg),
      reps: s.reps,
    })),
  );
  return session.id;
}

async function anExerciseId() {
  const [row] = await db.select({ id: exercises.id }).from(exercises).limit(1);
  if (!row) throw new Error("seed the exercise catalogue first: npm run seed:exercises");
  return row.id;
}

describe("recentPerformances", () => {
  it("treats one multi-set session as ONE window, not one per set", async () => {
    const userId = await makeUser();
    const exerciseId = await anExerciseId();
    try {
      await logSession(userId, exerciseId, new Date("2026-01-01T10:00:00Z"), [
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 4 },
      ]);

      const windows = (await recentPerformances(userId, [exerciseId], 3)).get(
        exerciseId,
      );

      // The regression: this used to be 3.
      expect(windows).toHaveLength(1);
      // And that single window holds all three sets.
      expect(windows![0].sets).toHaveLength(3);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("returns one window per distinct session, newest first", async () => {
    const userId = await makeUser();
    const exerciseId = await anExerciseId();
    try {
      await logSession(userId, exerciseId, new Date("2026-01-01T10:00:00Z"), [
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
      ]);
      await logSession(userId, exerciseId, new Date("2026-01-08T10:00:00Z"), [
        { weightKg: 105, reps: 5 },
        { weightKg: 105, reps: 5 },
      ]);
      await logSession(userId, exerciseId, new Date("2026-01-15T10:00:00Z"), [
        { weightKg: 110, reps: 5 },
      ]);

      const windows =
        (await recentPerformances(userId, [exerciseId], 3)).get(exerciseId) ??
        [];

      expect(windows).toHaveLength(3);
      // Newest first — progression.ts treats history[0] as "last time".
      expect(windows.map((w) => w.sets[0].weightKg)).toEqual([110, 105, 100]);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("honours sessionLimit in sessions, not in set rows", async () => {
    const userId = await makeUser();
    const exerciseId = await anExerciseId();
    try {
      // Four sessions of three sets each: twelve rows, but only the two most
      // recent sessions may come back.
      for (const day of ["01", "08", "15", "22"]) {
        await logSession(
          userId,
          exerciseId,
          new Date(`2026-02-${day}T10:00:00Z`),
          [
            { weightKg: 90, reps: 5 },
            { weightKg: 90, reps: 5 },
            { weightKg: 90, reps: 5 },
          ],
        );
      }

      const windows =
        (await recentPerformances(userId, [exerciseId], 2)).get(exerciseId) ??
        [];

      expect(windows).toHaveLength(2);
      expect(windows.every((w) => w.sets.length === 3)).toBe(true);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("returns nothing for a lifter with no logged sets", async () => {
    const userId = await makeUser();
    const exerciseId = await anExerciseId();
    try {
      const windows = await recentPerformances(userId, [exerciseId], 3);
      expect(windows.get(exerciseId)).toBeUndefined();
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
