import { describe, expect, it } from "vitest";
import { formatPlates, platesPerSide } from "@/lib/plates";

/**
 * Pure arithmetic, no database. The failure that matters is telling someone to
 * load plates that don't add up to the weight on screen — they'd trust the
 * plate list over the number, and lift something other than what was
 * prescribed.
 */

const BAR = 20;

describe("platesPerSide", () => {
  it("loads a simple weight largest-plate first", () => {
    // 100 kg = 20 bar + 40 a side = 25 + 15
    const load = platesPerSide(100, BAR)!;
    expect(load.perSide).toEqual([25, 15]);
    expect(load.exact).toBe(true);
    expect(load.achievableKg).toBe(100);
  });

  it("says 'just the bar' rather than nothing at bar weight", () => {
    const load = platesPerSide(BAR, BAR)!;
    expect(load.perSide).toEqual([]);
    expect(load.exact).toBe(true);
    expect(formatPlates(load.perSide)).toBe("just the bar");
  });

  it("uses the small plates for a fractional jump", () => {
    // 62.5 = 20 + 21.25 a side = 20 + 1.25
    const load = platesPerSide(62.5, BAR)!;
    expect(load.perSide).toEqual([20, 1.25]);
    expect(load.exact).toBe(true);
  });

  it("always sums back to the weight it claims", () => {
    // The invariant that matters: plates × 2 + bar === the achievable weight.
    for (const target of [40, 57.5, 82.5, 100, 142.5, 205]) {
      const load = platesPerSide(target, BAR)!;
      const summed = load.perSide.reduce((s, p) => s + p, 0) * 2 + BAR;
      expect(load.achievableKg).toBeCloseTo(summed, 6);
      if (load.exact) expect(load.achievableKg).toBeCloseTo(target, 6);
    }
  });

  it("refuses a weight below the bar rather than inventing a load", () => {
    expect(platesPerSide(15, BAR)).toBeNull();
  });

  it("flags a weight the plates can't hit exactly instead of pretending", () => {
    // 21 kg on a 20 kg bar is 0.5 a side — below the smallest plate.
    const load = platesPerSide(21, BAR)!;
    expect(load.exact).toBe(false);
    expect(load.achievableKg).toBeLessThan(21);
  });

  it("handles a non-standard bar weight", () => {
    // 15 kg women's bar: 60 kg = 15 + 22.5 a side = 20 + 2.5
    const load = platesPerSide(60, 15)!;
    expect(load.perSide).toEqual([20, 2.5]);
    expect(load.exact).toBe(true);
  });

  it("rejects nonsense rather than looping or returning NaN", () => {
    expect(platesPerSide(NaN, BAR)).toBeNull();
    expect(platesPerSide(100, NaN)).toBeNull();
    expect(platesPerSide(Infinity, BAR)).toBeNull();
  });
});

describe("formatPlates", () => {
  it("collapses repeated plates so it reads at a glance", () => {
    expect(formatPlates([25, 25, 10])).toBe("2 × 25 + 10");
  });

  it("leaves single plates alone", () => {
    expect(formatPlates([25, 15])).toBe("25 + 15");
  });
});
