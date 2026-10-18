import { describe, expect, it } from "vitest";
import {
  MASTERED_INTERVAL_DAYS,
  describeInterval,
  newCardState,
  schedule,
  stageOf,
  type CardState,
} from "./srs";

const NOW = new Date("2026-10-18T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function daysUntilDue(state: CardState) {
  return Math.round((state.dueAt.getTime() - NOW.getTime()) / DAY);
}

describe("schedule", () => {
  it("brings a new card back tomorrow, then in three days, on 'good'", () => {
    const first = schedule(newCardState(NOW), "good", NOW);
    expect(first.intervalDays).toBe(1);
    expect(daysUntilDue(first)).toBe(1);

    const second = schedule(first, "good", NOW);
    expect(second.intervalDays).toBe(3);
  });

  it("grows the interval by the ease factor once a card is established", () => {
    const state: CardState = { repetitions: 2, intervalDays: 3, ease: 2.5, lapses: 0, dueAt: NOW };
    expect(schedule(state, "good", NOW).intervalDays).toBe(8);
  });

  it("resets to a ten-minute relearn on 'again' and counts the lapse", () => {
    const state: CardState = { repetitions: 4, intervalDays: 20, ease: 2.5, lapses: 1, dueAt: NOW };
    const next = schedule(state, "again", NOW);
    expect(next.repetitions).toBe(0);
    expect(next.intervalDays).toBe(0);
    expect(next.lapses).toBe(2);
    expect(next.ease).toBeCloseTo(2.3);
    expect(next.dueAt.getTime() - NOW.getTime()).toBe(10 * 60 * 1000);
  });

  it("never lets ease fall below the floor", () => {
    let state: CardState = { repetitions: 0, intervalDays: 0, ease: 1.35, lapses: 0, dueAt: NOW };
    for (let i = 0; i < 5; i++) state = schedule(state, "again", NOW);
    expect(state.ease).toBe(1.3);
  });

  it("shows a new card rated 'hard' again later today, then in three days", () => {
    const first = schedule(newCardState(NOW), "hard", NOW);
    expect(first.dueAt.getTime() - NOW.getTime()).toBe(6 * 60 * 60 * 1000);
    expect(schedule(first, "good", NOW).intervalDays).toBe(3);
  });

  it("always moves 'hard' forward at least a day so a card can't get stuck", () => {
    const state: CardState = { repetitions: 3, intervalDays: 2, ease: 1.3, lapses: 0, dueAt: NOW };
    expect(schedule(state, "hard", NOW).intervalDays).toBe(3);
  });

  it("orders the four ratings from soonest to latest", () => {
    const state: CardState = { repetitions: 3, intervalDays: 10, ease: 2.5, lapses: 0, dueAt: NOW };
    const due = (["again", "hard", "good", "easy"] as const).map(
      (r) => schedule(state, r, NOW).dueAt.getTime(),
    );
    expect([...due].sort((a, b) => a - b)).toEqual(due);
  });
});

describe("stageOf", () => {
  it("treats unseen cards as new and long intervals as mastered", () => {
    expect(stageOf(undefined)).toBe("new");
    const base = { repetitions: 5, ease: 2.5, lapses: 0, dueAt: NOW };
    expect(stageOf({ ...base, intervalDays: MASTERED_INTERVAL_DAYS - 1 })).toBe("learning");
    expect(stageOf({ ...base, intervalDays: MASTERED_INTERVAL_DAYS })).toBe("mastered");
  });
});

describe("describeInterval", () => {
  it("labels minutes, hours, days, and months", () => {
    const at = (ms: number): CardState => ({ ...newCardState(NOW), dueAt: new Date(NOW.getTime() + ms) });
    expect(describeInterval(at(10 * 60 * 1000), NOW)).toBe("10m");
    expect(describeInterval(at(6 * 60 * 60 * 1000), NOW)).toBe("6h");
    expect(describeInterval(at(3 * DAY), NOW)).toBe("3d");
    expect(describeInterval(at(90 * DAY), NOW)).toBe("3mo");
  });
});
