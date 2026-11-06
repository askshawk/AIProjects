import { describe, expect, it } from "vitest";
import { finishBounds, focusRatio, focusStreak, goalStatus, minutesByDay, suggestedMinutes, emptyTotals } from "./stats";
import { startOfDay } from "./time";

const TZ = "America/Los_Angeles";
const at = (day: string, hh: number, mm = 0) => new Date(startOfDay(day, TZ).getTime() + (hh * 60 + mm) * 60000);

describe("minutesByDay", () => {
  it("splits a session that runs past local midnight", () => {
    const days = minutesByDay([{ category: "gaming", startedAt: at("2026-11-02", 23), endedAt: at("2026-11-03", 1, 30) }], TZ);
    expect(days.get("2026-11-02")?.gaming).toBe(60);
    expect(days.get("2026-11-03")?.gaming).toBe(90);
  });

  it("uses local days, not UTC days", () => {
    // 6pm Pacific is already the next day in UTC.
    const days = minutesByDay([{ category: "dev", startedAt: at("2026-11-02", 18), endedAt: at("2026-11-02", 19) }], TZ);
    expect([...days.keys()]).toEqual(["2026-11-02"]);
  });
});

describe("focusStreak", () => {
  const day = (deep: number) => ({ ...emptyTotals(), deep_work: deep });

  it("counts back from today, and from yesterday if today is empty so far", () => {
    const days = new Map([
      ["2026-11-03", day(60)],
      ["2026-11-04", day(45)],
    ]);
    expect(focusStreak(days, "2026-11-04")).toBe(2);
    expect(focusStreak(days, "2026-11-05")).toBe(2);
    expect(focusStreak(days, "2026-11-06")).toBe(0);
  });

  it("ignores gaming and days under the threshold", () => {
    const days = new Map([
      ["2026-11-03", { ...emptyTotals(), gaming: 300 }],
      ["2026-11-04", day(10)],
    ]);
    expect(focusStreak(days, "2026-11-04")).toBe(0);
  });
});

describe("focusRatio", () => {
  it("compares all focus time with gaming time", () => {
    expect(focusRatio({ deep_work: 120, dev: 60, learning: 60, gaming: 120 })).toBe(2);
  });
  it("is null with no gaming", () => {
    expect(focusRatio(emptyTotals())).toBeNull();
  });
});

describe("goalStatus", () => {
  it("treats gaming as a cap and the rest as targets", () => {
    const statuses = goalStatus({ deep_work: 300, dev: 0, learning: 0, gaming: 700 }, { deep_work: 240, gaming: 600 });
    expect(statuses.map((s) => [s.category, s.onTrack])).toEqual([
      ["deep_work", true],
      ["gaming", false],
    ]);
  });
});

describe("stopping a timer", () => {
  const start = new Date("2026-11-06T16:00:00Z");
  const now = new Date("2026-11-06T18:30:00Z"); // 150 minutes later

  it("caps a countdown at its planned length", () => {
    expect(suggestedMinutes(start, 120, now)).toBe(120);
    expect(suggestedMinutes(start, null, now)).toBe(150);
  });

  it("never ends a session in the future; extra minutes move the start earlier", () => {
    const b = finishBounds(start, 180, now);
    expect(b.endedAt).toEqual(now);
    expect(b.startedAt).toEqual(new Date("2026-11-06T15:30:00Z"));
  });

  it("ends early when fewer minutes are saved", () => {
    const b = finishBounds(start, 120, now);
    expect(b.startedAt).toEqual(start);
    expect(b.endedAt).toEqual(new Date("2026-11-06T18:00:00Z"));
  });
});
