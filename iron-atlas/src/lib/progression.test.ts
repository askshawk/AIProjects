import { describe, expect, it } from "vitest";
import {
  estimatedMax,
  isLowerBodyMuscle,
  parseRepTarget,
  roundToPlate,
  suggestNext,
  type LoggedSet,
  type Prescription,
} from "@/lib/progression";

/**
 * Pure logic, no database. Every rule here is a claim about how a program is
 * meant to be run, and someone will put the resulting number on a bar — so the
 * cases that matter most are the ones where the honest answer is "no idea".
 */

const upperCompound: Prescription = {
  sets: 3,
  reps: "5",
  intensityType: "none",
  intensityValue: null,
  isCompound: true,
  isLowerBody: false,
};

const lowerCompound: Prescription = { ...upperCompound, isLowerBody: true };

const hypertrophy: Prescription = {
  ...upperCompound,
  sets: 3,
  reps: "8-12",
  isCompound: false,
};

const set = (
  weightKg: number | null,
  reps: number | null,
  rpe: number | null = null,
): LoggedSet => ({
  weightKg,
  reps,
  rpe,
});

describe("parseRepTarget", () => {
  it("reads a fixed target", () => {
    expect(parseRepTarget("5")).toEqual({ min: 5, max: 5, isAmrap: false });
  });

  it("reads a range", () => {
    expect(parseRepTarget("8-12")).toEqual({ min: 8, max: 12, isAmrap: false });
  });

  it("treats a trailing + as open-ended, keeping the floor", () => {
    // 5/3/1's "5+" means at least five, as many as you can.
    const target = parseRepTarget("5+")!;
    expect(target.min).toBe(5);
    expect(target.isAmrap).toBe(true);
    expect(target.max).toBe(Infinity);
  });

  it("handles bare AMRAP with no number", () => {
    const target = parseRepTarget("AMRAP")!;
    expect(target.isAmrap).toBe(true);
    expect(target.min).toBe(1);
  });

  it("returns null for something it can't read", () => {
    expect(parseRepTarget("")).toBeNull();
    expect(parseRepTarget("to failure")).toBeNull();
  });
});

describe("roundToPlate", () => {
  it("snaps to loadable weights", () => {
    expect(roundToPlate(61.2)).toBe(60);
    expect(roundToPlate(63.9)).toBe(65);
    expect(roundToPlate(62.5)).toBe(62.5);
  });
});

describe("suggestNext — no history", () => {
  it("returns null rather than inventing a starting weight", () => {
    expect(suggestNext("linear", upperCompound, undefined)).toBeNull();
    expect(suggestNext("linear", upperCompound, [])).toBeNull();
  });

  it("ignores rows that were never filled in", () => {
    expect(
      suggestNext("linear", upperCompound, [
        [set(null, null), set(null, null)],
      ]),
    ).toBeNull();
  });

  it("returns null for a program with no progression scheme", () => {
    expect(suggestNext("none", upperCompound, [[set(60, 5)]])).toBeNull();
  });
});

describe("suggestNext — linear", () => {
  it("adds weight when every set hit the target", () => {
    const result = suggestNext("linear", upperCompound, [
      [set(60, 5), set(60, 5), set(60, 5)],
    ])!;
    expect(result.weightKg).toBe(62.5);
    expect(result.reason).toContain("add 2.5 kg");
  });

  it("uses a bigger jump for lower-body lifts", () => {
    const result = suggestNext("linear", lowerCompound, [
      [set(100, 5), set(100, 5), set(100, 5)],
    ])!;
    expect(result.weightKg).toBe(105);
  });

  it("holds the weight when a set was missed", () => {
    const result = suggestNext("linear", upperCompound, [
      [set(60, 5), set(60, 5), set(60, 3)],
    ])!;
    expect(result.weightKg).toBe(60);
    expect(result.reason).toContain("missed");
  });

  it("holds when fewer sets were completed than prescribed", () => {
    // Two of three sets, both at target, is still not a completed session.
    const result = suggestNext("linear", upperCompound, [
      [set(60, 5), set(60, 5)],
    ])!;
    expect(result.weightKg).toBe(60);
    expect(result.reason).toContain("missed");
  });

  it("does not let ramp-up sets count toward the working-weight set total", () => {
    // One real top set plus two lighter ramp sets logged in the same rows.
    // Only one set was actually done at the prescribed working weight, not
    // the three upperCompound calls for — the ramp sets shouldn't be able to
    // pad that count just because they also hit their (easier) rep count.
    const result = suggestNext("linear", upperCompound, [
      [set(40, 10), set(50, 8), set(60, 5)],
    ])!;
    expect(result.weightKg).toBe(60);
    expect(result.reason).toContain("missed");
  });

  it("does not advance on an AMRAP prescription that only ever meets the floor", () => {
    // "5+" is unfalsifiable if reps >= min alone counts as a hit — every set
    // of exactly 5 would "succeed" forever with no evidence of getting harder.
    const amrap = { ...upperCompound, reps: "5+" };
    const result = suggestNext("linear", amrap, [
      [set(60, 5), set(60, 5), set(60, 5)],
    ])!;
    expect(result.weightKg).toBe(60);
  });

  it("advances an AMRAP prescription once a set genuinely beats the floor", () => {
    const amrap = { ...upperCompound, reps: "5+" };
    const result = suggestNext("linear", amrap, [
      [set(60, 5), set(60, 5), set(60, 8)],
    ])!;
    expect(result.weightKg).toBe(62.5);
  });

  it("deloads after three consecutive misses at the same weight", () => {
    const missed = set(60, 3);
    const result = suggestNext("linear", upperCompound, [
      [missed, missed, missed],
      [missed, missed, missed],
      [missed, missed, missed],
    ])!;
    // roundToPlate(60 * 0.9) = roundToPlate(54) = 55
    expect(result.weightKg).toBe(55);
    expect(result.reason).toContain("deload");
  });

  it("does not deload across misses at different weights", () => {
    const result = suggestNext("linear", upperCompound, [
      [set(60, 3)],
      [set(57.5, 3)],
      [set(60, 3)],
    ])!;
    expect(result.weightKg).toBe(60);
    expect(result.reason).toContain("missed");
    expect(result.reason).not.toContain("deload");
  });

  it("does not deload with fewer than three sessions of history", () => {
    const result = suggestNext("linear", upperCompound, [
      [set(60, 3)],
      [set(60, 3)],
    ])!;
    expect(result.weightKg).toBe(60);
    expect(result.reason).not.toContain("deload");
  });
});

describe("suggestNext — double progression", () => {
  it("adds reps while below the top of the range", () => {
    const result = suggestNext("double_progression", hypertrophy, [
      [set(40, 9), set(40, 8), set(40, 8)],
    ])!;
    expect(result.weightKg).toBe(40);
    expect(result.reason).toContain("add reps");
    expect(result.reason).toContain("9 of 12");
  });

  it("adds weight once the top of the range is hit on every set", () => {
    const result = suggestNext("double_progression", hypertrophy, [
      [set(40, 12), set(40, 12), set(40, 12)],
    ])!;
    expect(result.weightKg).toBe(42.5);
    expect(result.reason).toContain("drop back to 8");
  });

  it("does not advance when only some sets topped out", () => {
    const result = suggestNext("double_progression", hypertrophy, [
      [set(40, 12), set(40, 12), set(40, 10)],
    ])!;
    expect(result.weightKg).toBe(40);
  });

  it("falls back to linear when the prescription isn't really a range", () => {
    const fixed = { ...hypertrophy, reps: "5" };
    const result = suggestNext("double_progression", fixed, [
      [set(60, 5), set(60, 5), set(60, 5)],
    ])!;
    expect(result.weightKg).toBe(62.5);
  });
});

describe("suggestNext — RPE autoregulated", () => {
  const rpePrescription: Prescription = {
    ...upperCompound,
    intensityType: "rpe",
    intensityValue: "8",
  };

  it("adds weight when the work was easier than the target", () => {
    const result = suggestNext("rpe_autoregulated", rpePrescription, [
      [set(100, 5, 6), set(100, 5, 6), set(100, 5, 6)],
    ])!;
    expect(result.weightKg).toBeGreaterThan(100);
    expect(result.reason).toContain("below");
  });

  it("backs off when the work was harder than the target", () => {
    const result = suggestNext("rpe_autoregulated", rpePrescription, [
      [set(100, 5, 9.5), set(100, 5, 10), set(100, 5, 10)],
    ])!;
    expect(result.weightKg).toBeLessThan(100);
    expect(result.reason).toContain("above");
  });

  it("holds when effort landed on target", () => {
    const result = suggestNext("rpe_autoregulated", rpePrescription, [
      [set(100, 5, 8), set(100, 5, 8)],
    ])!;
    expect(result.weightKg).toBe(100);
    expect(result.reason).toContain("hold");
  });

  it("asks for RPE rather than guessing when none was logged", () => {
    const result = suggestNext("rpe_autoregulated", rpePrescription, [
      [set(100, 5), set(100, 5)],
    ])!;
    expect(result.weightKg).toBe(100);
    expect(result.reason).toContain("No RPE logged");
  });

  it("clamps a mis-logged RPE rather than swinging load by the raw delta", () => {
    // Target 8, logged 1 (meant to be a 9 — a plausible typo). Unclamped,
    // delta=7 would mean +21% load; clamped to +2 it's +6%.
    const result = suggestNext("rpe_autoregulated", rpePrescription, [
      [set(100, 5, 1)],
    ])!;
    // roundToPlate(100 * 1.06) = roundToPlate(106) = 105
    expect(result.weightKg).toBe(105);
  });
});

describe("suggestNext — percentage work", () => {
  const pctPrescription: Prescription = {
    ...lowerCompound,
    reps: "5",
    intensityType: "percent_1rm",
    intensityValue: "85",
  };

  it("computes from a training max at 90% of the low-rep estimated max", () => {
    // 200 kg e1RM -> 180 TM -> 85% = 153 -> rounds to 152.5
    const result = suggestNext("wave_531", pctPrescription, undefined, {
      current: 200,
      previous: null,
    })!;
    expect(result.weightKg).toBe(152.5);
    expect(result.reason).toContain("training max");
  });

  it("caps a big PR at last cycle's max plus the conventional increment", () => {
    // previous 170 -> implied TM 153; a new e1RM of 220 would imply TM 198,
    // but isLowerBody caps the move to 153 + 5 = 158.
    const result = suggestNext("wave_531", pctPrescription, undefined, {
      current: 220,
      previous: 170,
    })!;
    // roundToPlate(158 * 0.85) = roundToPlate(134.3) = 135
    expect(result.weightKg).toBe(135);
    expect(result.reason).toContain("held to");
  });

  it("does not cap when the new max is within one cycle's increment", () => {
    const result = suggestNext("wave_531", pctPrescription, undefined, {
      current: 200,
      previous: 195,
    })!;
    expect(result.reason).not.toContain("held to");
  });

  it("says what's missing rather than guessing without a max", () => {
    const result = suggestNext(
      "wave_531",
      pctPrescription,
      [[set(150, 5)]],
      null,
    )!;
    expect(result.weightKg).toBe(150);
    expect(result.reason).toContain("establish a max");
  });

  it("still needs history when there is no max and no logged work", () => {
    expect(
      suggestNext("wave_531", pctPrescription, undefined, null),
    ).toBeNull();
  });
});

describe("estimatedMax", () => {
  it("takes the best qualifying set", () => {
    // 100x5 -> 116.7, 110x3 -> 121 ; the triple wins.
    expect(estimatedMax([set(100, 5), set(110, 3)])).toBeCloseTo(121, 0);
  });

  it("ignores high-rep sets where the formula breaks down", () => {
    expect(estimatedMax([set(60, 20)])).toBeNull();
  });

  it("returns null with nothing usable", () => {
    expect(estimatedMax([set(null, null)])).toBeNull();
  });
});

describe("isLowerBodyMuscle", () => {
  it("classifies the muscles that take bigger jumps", () => {
    expect(isLowerBodyMuscle("quads")).toBe(true);
    expect(isLowerBodyMuscle("hamstrings")).toBe(true);
    expect(isLowerBodyMuscle("chest")).toBe(false);
    expect(isLowerBodyMuscle("biceps")).toBe(false);
  });
});
