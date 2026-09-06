import { describe, expect, it } from "vitest";
import { gymFit } from "@/lib/gymFit";
import type { Equipment } from "@/lib/substitute";

/**
 * Pure comparison, no database. This drives a badge on every program card, so
 * the failure mode that matters is claiming a program "fits your gym" when it
 * doesn't — someone starts a block and finds out at the rack.
 */

const gym = (...e: string[]) => e as Equipment[];

describe("gymFit", () => {
  it("says nothing at all when no gym is saved", () => {
    // Rather than claiming everything fits, or flagging everything as needing
    // swaps, on a profile the lifter never filled in.
    expect(gymFit(["barbell"], gym())).toEqual({ kind: "unknown" });
  });

  it("fits when the gym has everything the program asks for", () => {
    expect(gymFit(["barbell", "bodyweight"], gym("barbell", "bodyweight"))).toEqual(
      { kind: "fits" },
    );
  });

  it("fits when the gym has more than the program needs", () => {
    expect(gymFit(["barbell"], gym("barbell", "cable", "machine"))).toEqual({
      kind: "fits",
    });
  });

  it("reports exactly what's missing, not just that something is", () => {
    expect(
      gymFit(["barbell", "cable", "machine"], gym("barbell", "dumbbell")),
    ).toEqual({ kind: "adapts", missing: ["cable", "machine"] });
  });

  it("treats a program with no listed equipment as fitting anywhere", () => {
    expect(gymFit([], gym("dumbbell"))).toEqual({ kind: "fits" });
    expect(gymFit(null, gym("dumbbell"))).toEqual({ kind: "fits" });
  });

  it("never reports a fit for equipment the gym lacks", () => {
    // The one claim that must never be wrong.
    const result = gymFit(["machine"], gym("bodyweight"));
    expect(result.kind).toBe("adapts");
  });
});
