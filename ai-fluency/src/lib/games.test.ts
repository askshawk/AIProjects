import { describe, expect, it } from "vitest";
import { DEAL_DESK, DEAL_START_HEALTH, nextHealth, scoreDealDesk, scoreJargon, shuffle } from "./games";

describe("scoreJargon", () => {
  it("adds a combo bonus for unbroken runs and resets on a miss", () => {
    expect(scoreJargon([true])).toBe(10);
    expect(scoreJargon([true, true, true])).toBe(10 + 15 + 15);
    expect(scoreJargon([true, false, true])).toBe(20);
    expect(scoreJargon([])).toBe(0);
  });
});

describe("Deal Desk", () => {
  const call = DEAL_DESK[0];
  const pick = (quality: string) => call.steps.map((s) => s.options.findIndex((o) => o.quality === quality));

  it("wins a call answered with every strong option", () => {
    const result = scoreDealDesk(call, pick("strong"));
    expect(result.won).toBe(true);
    expect(result.health).toBe(100);
  });

  it("loses a call answered with every weak option", () => {
    const result = scoreDealDesk(call, pick("weak"));
    expect(result.won).toBe(false);
    expect(result.health).toBe(0);
  });

  it("keeps health between 0 and 100", () => {
    expect(nextHealth(95, "strong")).toBe(100);
    expect(nextHealth(5, "weak")).toBe(0);
    expect(nextHealth(DEAL_START_HEALTH, "okay")).toBe(53);
  });

  it("rejects an out-of-range choice", () => {
    expect(() => scoreDealDesk(call, call.steps.map(() => 9))).toThrow();
  });
});

describe("shuffle", () => {
  it("keeps every item", () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(items).sort()).toEqual(items);
  });
});
