import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import {
  programDays,
  programExercises,
  programs,
  programWeeks,
  users,
} from "@/db/schema";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * `verified` is the only accuracy signal the library carries, and
 * `correctPrescription` edits data every fork was copied from — so who's
 * allowed to call these, and exactly what they change, matters more than the
 * happy path.
 *
 * `next/headers` and `next/cache` need a request scope this file never has;
 * both are mocked with the minimum shape verificationActions.ts actually
 * calls, same approach as auth.test.ts.
 */

const cookieStore = new Map<string, { value: string }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieStore.get(name),
    set: (name: string, value: string) => cookieStore.set(name, { value }),
    delete: (name: string) => cookieStore.delete(name),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createSession } = await import("@/lib/auth");
const { correctPrescription, setVerified } = await import(
  "@/lib/verificationActions"
);

afterAll(async () => {
  await client.end();
});

beforeEach(() => {
  cookieStore.clear();
});

async function signedInUser() {
  const email = `verify-test-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "x" })
    .returning({ id: users.id });
  await createSession(user.id);
}

describe("setVerified", () => {
  it("refuses when nobody is signed in", async () => {
    await expect(setVerified("arnold-golden-six", true)).rejects.toThrow(
      /sign in/i,
    );
  });

  it("flips the flag once signed in, and flips it back", async () => {
    await signedInUser();
    const [before] = await db
      .select({ verified: programs.verified })
      .from(programs)
      .where(eq(programs.slug, "arnold-golden-six"));

    await setVerified("arnold-golden-six", !before.verified);
    const [after] = await db
      .select({ verified: programs.verified })
      .from(programs)
      .where(eq(programs.slug, "arnold-golden-six"));
    expect(after.verified).toBe(!before.verified);

    // Leave it as it was found.
    await setVerified("arnold-golden-six", before.verified);
  });
});

describe("correctPrescription", () => {
  async function firstPrescriptionId() {
    const [row] = await db
      .select({
        id: programExercises.id,
        sets: programExercises.sets,
        reps: programExercises.reps,
      })
      .from(programExercises)
      .innerJoin(programDays, eq(programDays.id, programExercises.dayId))
      .innerJoin(programWeeks, eq(programWeeks.id, programDays.weekId))
      .innerJoin(programs, eq(programs.id, programWeeks.programId))
      .where(eq(programs.slug, "arnold-golden-six"))
      .limit(1);
    return row;
  }

  it("refuses when nobody is signed in", async () => {
    const row = await firstPrescriptionId();
    await expect(
      correctPrescription(row.id, { sets: 4 }),
    ).rejects.toThrow(/sign in/i);
  });

  it("updates sets and restores the original value afterward", async () => {
    await signedInUser();
    const row = await firstPrescriptionId();

    await correctPrescription(row.id, { sets: row.sets + 1 });
    const [updated] = await db
      .select({ sets: programExercises.sets })
      .from(programExercises)
      .where(eq(programExercises.id, row.id));
    expect(updated.sets).toBe(row.sets + 1);

    await correctPrescription(row.id, { sets: row.sets });
  });

  it("ignores a non-positive or non-finite sets value rather than writing garbage", async () => {
    await signedInUser();
    const row = await firstPrescriptionId();

    for (const bad of [0, -5, NaN, Infinity]) {
      await correctPrescription(row.id, { sets: bad });
      const [after] = await db
        .select({ sets: programExercises.sets })
        .from(programExercises)
        .where(eq(programExercises.id, row.id));
      expect(after.sets).toBe(row.sets);
    }
  });

  it("clears notes to null when given an empty string", async () => {
    await signedInUser();
    const row = await firstPrescriptionId();

    await correctPrescription(row.id, { notes: "temporary test note" });
    await correctPrescription(row.id, { notes: "" });

    const [after] = await db
      .select({ notes: programExercises.notes })
      .from(programExercises)
      .where(eq(programExercises.id, row.id));
    expect(after.notes).toBeNull();
  });

  it("does nothing when the patch has no usable fields", async () => {
    await signedInUser();
    const row = await firstPrescriptionId();
    await expect(correctPrescription(row.id, {})).resolves.toBeUndefined();
  });
});
