import { describe, expect, it } from "vitest";
import { countsTowardE1rm, E1RM_REP_CEILING, epley } from "@/lib/e1rm";

describe("epley", () => {
  it("returns the weight itself for a 1-rep set", () => {
    expect(epley(100, 1)).toBe(100);
  });

  it("estimates a higher max as reps increase", () => {
    expect(epley(100, 5)).toBeCloseTo(100 * (1 + 5 / 30));
    expect(epley(100, 10)).toBeCloseTo(100 * (1 + 10 / 30));
  });

  it("returns 0 for non-positive reps or weight", () => {
    expect(epley(100, 0)).toBe(0);
    expect(epley(100, -1)).toBe(0);
    expect(epley(0, 5)).toBe(0);
    expect(epley(-10, 5)).toBe(0);
  });
});

describe("countsTowardE1rm", () => {
  it("accepts a normal working set", () => {
    expect(countsTowardE1rm(100, 5)).toBe(true);
  });

  it("accepts a set right at the rep ceiling", () => {
    expect(countsTowardE1rm(100, E1RM_REP_CEILING)).toBe(true);
  });

  it("rejects a set past the rep ceiling — high-rep sets diverge too much to compare", () => {
    expect(countsTowardE1rm(100, E1RM_REP_CEILING + 1)).toBe(false);
  });

  it("rejects null weight or reps", () => {
    expect(countsTowardE1rm(null, 5)).toBe(false);
    expect(countsTowardE1rm(100, null)).toBe(false);
    expect(countsTowardE1rm(null, null)).toBe(false);
  });

  it("rejects zero or negative weight or reps", () => {
    expect(countsTowardE1rm(0, 5)).toBe(false);
    expect(countsTowardE1rm(100, 0)).toBe(false);
    expect(countsTowardE1rm(-5, 5)).toBe(false);
    expect(countsTowardE1rm(100, -1)).toBe(false);
  });
});
