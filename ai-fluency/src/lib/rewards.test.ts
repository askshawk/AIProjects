import { describe, expect, it } from "vitest";
import { RANKS, computeStreak, rankFor } from "./rewards";
import { addDays, dayKey, startOfDay, weekStartKey } from "./time";

describe("time helpers", () => {
  it("uses the local calendar day, not UTC", () => {
    // 2026-10-19 02:00 UTC is still the evening of the 18th in Los Angeles.
    expect(dayKey(new Date("2026-10-19T02:00:00Z"), "America/Los_Angeles")).toBe("2026-10-18");
    expect(dayKey(new Date("2026-10-19T02:00:00Z"), "Europe/London")).toBe("2026-10-19");
  });

  it("finds local midnight, including across daylight saving", () => {
    expect(startOfDay("2026-10-18", "America/Los_Angeles").toISOString()).toBe("2026-10-18T07:00:00.000Z");
    // US clocks fall back on 2026-11-01, so midnight that day is still PDT.
    expect(startOfDay("2026-11-01", "America/Los_Angeles").toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(startOfDay("2026-11-02", "America/Los_Angeles").toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("starts weeks on Monday", () => {
    expect(weekStartKey("2026-10-18")).toBe("2026-10-12"); // a Sunday
    expect(weekStartKey("2026-10-19")).toBe("2026-10-19"); // a Monday
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("computeStreak", () => {
  const days = (...keys: string[]) => new Set(keys);

  it("counts consecutive days ending today", () => {
    expect(computeStreak(days("2026-10-16", "2026-10-17", "2026-10-18"), "2026-10-18").days).toBe(3);
  });

  it("doesn't break just because today has no activity yet", () => {
    expect(computeStreak(days("2026-10-16", "2026-10-17"), "2026-10-18").days).toBe(2);
  });

  it("forgives one missed day per week", () => {
    // Wed 14, (miss Thu 15), Fri 16, Sat 17, Sun 18
    const result = computeStreak(days("2026-10-14", "2026-10-16", "2026-10-17", "2026-10-18"), "2026-10-18");
    expect(result.days).toBe(4);
    expect(result.ptoUsedThisWeek).toBe(true);
  });

  it("ends the streak on a second miss in the same week", () => {
    // Mon 12, (miss Tue 13), Wed 14, (miss Thu 15), Fri 16 .. Sun 18
    expect(
      computeStreak(days("2026-10-12", "2026-10-14", "2026-10-16", "2026-10-17", "2026-10-18"), "2026-10-18").days,
    ).toBe(3 + 1);
  });

  it("doesn't use a PTO day to bridge two missed days in a row", () => {
    expect(computeStreak(days("2026-10-14", "2026-10-17", "2026-10-18"), "2026-10-18").days).toBe(2);
  });

  it("is zero with no activity", () => {
    expect(computeStreak(days(), "2026-10-18").days).toBe(0);
  });
});

describe("rankFor", () => {
  it("climbs by mastered cards and reports the next rank", () => {
    expect(rankFor(0)).toMatchObject({ title: "BDR", next: { title: "Account Manager", needed: 10 } });
    expect(rankFor(30).title).toBe("Senior AM");
    expect(rankFor(500)).toMatchObject({ title: RANKS[RANKS.length - 1].title, next: null });
  });
});
