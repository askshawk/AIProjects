import { describe, expect, it } from "vitest";
import { formatSeconds, warmupSets } from "@/lib/warmup";

describe("warmupSets", () => {
  it("ramps up to the working weight without ever reaching it", () => {
    const sets = warmupSets(100);
    expect(sets.length).toBeGreaterThan(2);
    for (const s of sets) expect(s.weightKg).toBeLessThan(100);
  });

  it("gets heavier while the reps get fewer", () => {
    const sets = warmupSets(140);
    for (let i = 1; i < sets.length; i++) {
      expect(sets[i].weightKg).toBeGreaterThan(sets[i - 1].weightKg);
      expect(sets[i].reps).toBeLessThanOrEqual(sets[i - 1].reps);
    }
  });

  it("starts with the empty bar for barbell work", () => {
    expect(warmupSets(100)[0]).toEqual({ weightKg: 20, reps: 10, isBar: true });
  });

  it("skips the bar for dumbbell and machine work", () => {
    expect(warmupSets(60, false).every((s) => !s.isBar)).toBe(true);
  });

  it("returns nothing for a weight not worth warming up to", () => {
    // Four ramp sets to reach 25 kg is noise, not preparation.
    expect(warmupSets(25)).toEqual([]);
    expect(warmupSets(0)).toEqual([]);
    expect(warmupSets(-50)).toEqual([]);
  });

  it("never repeats a weight after rounding", () => {
    // Light working weights round several rungs onto the same plate jump.
    for (const w of [42.5, 45, 50, 55]) {
      const weights = warmupSets(w).map((s) => s.weightKg);
      expect(new Set(weights).size).toBe(weights.length);
    }
  });

  it("handles a weight below the bar without producing nonsense", () => {
    expect(warmupSets(15)).toEqual([]);
  });
});

describe("formatSeconds", () => {
  it("formats mm:ss", () => {
    expect(formatSeconds(120)).toBe("2:00");
    expect(formatSeconds(90)).toBe("1:30");
    expect(formatSeconds(5)).toBe("0:05");
  });

  it("floors at zero rather than showing negative time", () => {
    expect(formatSeconds(-10)).toBe("0:00");
  });
});
