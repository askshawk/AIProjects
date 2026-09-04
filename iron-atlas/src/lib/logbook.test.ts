import { describe, expect, it } from "vitest";
import {
  countsTowardE1rm,
  countsTowardTrainingMax,
  epley,
  E1RM_REP_CEILING,
  TRAINING_MAX_REP_CEILING,
} from "@/lib/e1rm";

/**
 * Pure maths only — no database. The estimator is what every trend line and PR
 * claim rests on, so its edges matter more than its happy path.
 */

describe("epley", () => {
  it("returns the weight itself for a true single", () => {
    expect(epley(100, 1)).toBe(100);
  });

  it("estimates above the working weight for multi-rep sets", () => {
    // 100 × 5 → 100 × (1 + 5/30) ≈ 116.7
    expect(epley(100, 5)).toBeCloseTo(116.67, 1);
    expect(epley(100, 10)).toBeCloseTo(133.33, 1);
  });

  it("rises monotonically with reps at a fixed weight", () => {
    const estimates = [1, 2, 3, 5, 8, 10].map((r) => epley(100, r));
    expect([...estimates].sort((a, b) => a - b)).toEqual(estimates);
  });

  it("rises monotonically with weight at fixed reps", () => {
    expect(epley(120, 5)).toBeGreaterThan(epley(100, 5));
  });

  it("returns zero for nonsense rather than NaN or a negative", () => {
    // A bodyweight set logged with no load must not poison a trend line.
    expect(epley(0, 5)).toBe(0);
    expect(epley(100, 0)).toBe(0);
    expect(epley(-50, 5)).toBe(0);
    expect(epley(100, -3)).toBe(0);
  });
});

describe("countsTowardE1rm", () => {
  it("accepts ordinary working sets", () => {
    expect(countsTowardE1rm(100, 5)).toBe(true);
    expect(countsTowardE1rm(60, 1)).toBe(true);
    expect(countsTowardE1rm(80, E1RM_REP_CEILING)).toBe(true);
  });

  it("excludes high-rep sets, where the formula stops being meaningful", () => {
    // A 20-rep squat set would otherwise claim an absurd 1RM.
    expect(countsTowardE1rm(60, E1RM_REP_CEILING + 1)).toBe(false);
    expect(countsTowardE1rm(60, 20)).toBe(false);
  });

  it("excludes unloaded or blank sets", () => {
    expect(countsTowardE1rm(null, 8)).toBe(false);
    expect(countsTowardE1rm(100, null)).toBe(false);
    expect(countsTowardE1rm(0, 8)).toBe(false);
    expect(countsTowardE1rm(100, 0)).toBe(false);
  });

  it("agrees with epley on what produces a usable number", () => {
    // Anything the filter accepts must give a positive estimate.
    const cases: [number, number][] = [
      [100, 1],
      [100, 5],
      [42.5, 10],
    ];
    for (const [w, r] of cases) {
      expect(countsTowardE1rm(w, r)).toBe(true);
      expect(epley(w, r)).toBeGreaterThan(0);
    }
  });
});

describe("countsTowardTrainingMax", () => {
  it("is stricter than countsTowardE1rm — it excludes what that allows above 5 reps", () => {
    // A 10-rep set is a fair PR-display basis but too high-rep to move a
    // training max, which feeds directly into the next cycle's prescription.
    expect(countsTowardE1rm(100, 8)).toBe(true);
    expect(countsTowardTrainingMax(100, 8)).toBe(false);
  });

  it("accepts sets at or under the tighter ceiling", () => {
    expect(countsTowardTrainingMax(100, 1)).toBe(true);
    expect(countsTowardTrainingMax(100, TRAINING_MAX_REP_CEILING)).toBe(true);
  });

  it("excludes unloaded, blank, or over-ceiling sets, same as countsTowardE1rm", () => {
    expect(countsTowardTrainingMax(null, 5)).toBe(false);
    expect(countsTowardTrainingMax(100, null)).toBe(false);
    expect(countsTowardTrainingMax(0, 5)).toBe(false);
    expect(countsTowardTrainingMax(100, TRAINING_MAX_REP_CEILING + 1)).toBe(
      false,
    );
  });

  it("is tighter than the general e1RM ceiling", () => {
    expect(TRAINING_MAX_REP_CEILING).toBeLessThan(E1RM_REP_CEILING);
  });
});
