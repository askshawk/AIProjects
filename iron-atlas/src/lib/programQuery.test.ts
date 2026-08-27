import { afterAll, describe, expect, it } from "vitest";
import { sql as client } from "@/db";
import {
  applySwaps,
  groupByWeek,
  loadProgram,
  type ProgramRow,
} from "@/lib/programQuery";

/**
 * `groupByWeek` and `applySwaps` back both the program detail page and the
 * spreadsheet export — the whole point of sharing them is that the two can
 * never drift apart, so a bug here is a bug in both places at once.
 */

afterAll(async () => {
  await client.end();
});

function compareTuples(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function row(overrides: Partial<ProgramRow>): ProgramRow {
  return {
    weekId: 1,
    weekNumber: 1,
    weekLabel: null,
    weekNotes: null,
    repeatCount: 1,
    dayId: 1,
    dayIndex: 0,
    dayName: "Day 1",
    dayNotes: null,
    order: 0,
    sets: 3,
    reps: "5",
    intensityType: "none",
    intensityValue: null,
    restSeconds: null,
    tempo: null,
    exNotes: null,
    supersetGroup: null,
    exerciseId: 100,
    exerciseName: "Back Squat",
    primaryMuscle: "quads",
    equipment: "barbell",
    isCompound: true,
    isExplosive: false,
    ...overrides,
  } as ProgramRow;
}

describe("loadProgram", () => {
  it("returns null for a program that doesn't exist", async () => {
    expect(await loadProgram("not-a-real-slug")).toBeNull();
  });

  it("loads a real program with its rows in week/day/order sequence", async () => {
    const loaded = await loadProgram("arnold-golden-six");
    expect(loaded).not.toBeNull();
    expect(loaded!.program.slug).toBe("arnold-golden-six");
    expect(loaded!.rows.length).toBeGreaterThan(0);

    // orderBy(weekNumber, dayIndex, order): the (weekNumber, dayIndex, order)
    // triple must be non-decreasing, lexicographically, across the flat rows.
    const rows = loaded!.rows;
    const key = (r: ProgramRow): [number, number, number] => [
      r.weekNumber,
      r.dayIndex,
      r.order,
    ];
    for (let i = 1; i < rows.length; i++) {
      expect(compareTuples(key(rows[i - 1]), key(rows[i]))).toBeLessThanOrEqual(0);
    }
  });
});

describe("groupByWeek", () => {
  it("groups a flat join into weeks containing days containing items", () => {
    const rows = [
      row({ weekId: 1, dayId: 10, order: 0, exerciseName: "Back Squat" }),
      row({ weekId: 1, dayId: 10, order: 1, exerciseName: "Bench Press" }),
      row({ weekId: 1, dayId: 11, dayIndex: 1, order: 0, exerciseName: "Deadlift" }),
      row({ weekId: 2, weekNumber: 2, dayId: 20, order: 0, exerciseName: "Overhead Press" }),
    ];

    const weeks = groupByWeek(rows);
    expect(weeks.size).toBe(2);

    const week1 = weeks.get(1)!;
    expect(week1.days.size).toBe(2);
    expect(week1.days.get(10)!.items.map((r) => r.exerciseName)).toEqual([
      "Back Squat",
      "Bench Press",
    ]);
    expect(week1.days.get(11)!.items.map((r) => r.exerciseName)).toEqual(["Deadlift"]);

    const week2 = weeks.get(2)!;
    expect(week2.days.get(20)!.items.map((r) => r.exerciseName)).toEqual(["Overhead Press"]);
  });

  it("preserves query order within a day rather than re-sorting", () => {
    // groupByWeek trusts the caller's ORDER BY; if it silently reordered,
    // superset sequencing would break without a loud failure anywhere.
    const rows = [
      row({ dayId: 1, order: 2, exerciseName: "C" }),
      row({ dayId: 1, order: 0, exerciseName: "A" }),
      row({ dayId: 1, order: 1, exerciseName: "B" }),
    ];
    const items = groupByWeek(rows).get(1)!.days.get(1)!.items;
    expect(items.map((r) => r.exerciseName)).toEqual(["C", "A", "B"]);
  });

  it("returns an empty map for no rows", () => {
    expect(groupByWeek([]).size).toBe(0);
  });
});

describe("applySwaps", () => {
  it("rewrites a swapped exercise's id, name, and equipment", () => {
    const rows = [row({ exerciseId: 100, exerciseName: "Back Squat", equipment: "barbell" })];
    const swaps = new Map([[100, { to: { id: 200, name: "Goblet Squat", equipment: "dumbbell" } }]]);

    const swapped = applySwaps(rows, swaps);
    expect(swapped[0].exerciseId).toBe(200);
    expect(swapped[0].exerciseName).toBe("Goblet Squat");
    expect(swapped[0].equipment).toBe("dumbbell");
  });

  it("says what it swapped from, so the export and page can't silently rename a lift", () => {
    const rows = [row({ exerciseId: 100, exerciseName: "Back Squat" })];
    const swaps = new Map([[100, { to: { id: 200, name: "Goblet Squat", equipment: "dumbbell" } }]]);

    const swapped = applySwaps(rows, swaps);
    expect(swapped[0].exNotes).toContain("Swapped from Back Squat");
  });

  it("keeps an existing note alongside the swap note rather than dropping it", () => {
    const rows = [row({ exerciseId: 100, exNotes: "Reset each rep" })];
    const swaps = new Map([[100, { to: { id: 200, name: "Goblet Squat", equipment: "dumbbell" } }]]);

    const swapped = applySwaps(rows, swaps);
    expect(swapped[0].exNotes).toContain("Reset each rep");
    expect(swapped[0].exNotes).toContain("Swapped from");
  });

  it("leaves a row untouched when it has no swap entry", () => {
    const rows = [row({ exerciseId: 999 })];
    const swapped = applySwaps(rows, new Map());
    expect(swapped[0]).toEqual(rows[0]);
  });

  it("leaves a row untouched when the swap's `to` is null (no candidate found)", () => {
    const rows = [row({ exerciseId: 100 })];
    const swaps = new Map([[100, { to: null }]]);
    const swapped = applySwaps(rows, swaps);
    expect(swapped[0]).toEqual(rows[0]);
  });
});
