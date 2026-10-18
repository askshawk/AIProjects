/**
 * Spaced repetition: decides when each card should come back.
 *
 * A simplified SM-2 (the algorithm behind Anki). Each card carries an ease
 * factor and an interval. Rating a card "good" multiplies the interval by the
 * ease, so cards you know drift further apart; "again" resets it so the card
 * returns within minutes. Kept as pure functions so the schedule is easy to
 * test and to reuse from the games later: a game round is just another rating.
 */

export type Rating = "again" | "hard" | "good" | "easy";

export const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

export type CardState = {
  repetitions: number;
  intervalDays: number;
  ease: number;
  lapses: number;
  dueAt: Date;
};

export const STARTING_EASE = 2.5;
const MIN_EASE = 1.3;
const RELEARN_MINUTES = 10;
/** "Hard" on a first look: see it again later today rather than tomorrow. */
const FIRST_HARD_HOURS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A card counts as mastered once it has survived a three-week gap. */
export const MASTERED_INTERVAL_DAYS = 21;

export function newCardState(now: Date): CardState {
  return { repetitions: 0, intervalDays: 0, ease: STARTING_EASE, lapses: 0, dueAt: now };
}

export function schedule(state: CardState, rating: Rating, now: Date): CardState {
  const { repetitions, intervalDays, ease, lapses } = state;

  if (rating === "again") {
    return {
      repetitions: 0,
      intervalDays: 0,
      ease: Math.max(MIN_EASE, ease - 0.2),
      lapses: lapses + 1,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60 * 1000),
    };
  }

  if (rating === "hard" && repetitions === 0) {
    return {
      repetitions: 1,
      intervalDays: 0,
      ease: Math.max(MIN_EASE, ease - 0.15),
      lapses,
      dueAt: new Date(now.getTime() + FIRST_HARD_HOURS * 60 * 60 * 1000),
    };
  }

  let nextInterval: number;
  let nextEase = ease;
  if (rating === "hard") {
    nextInterval = Math.max(intervalDays + 1, Math.round(intervalDays * 1.2));
    nextEase = Math.max(MIN_EASE, ease - 0.15);
  } else if (rating === "good") {
    if (repetitions === 0) nextInterval = 1;
    else if (repetitions === 1) nextInterval = 3;
    else nextInterval = Math.round(intervalDays * ease);
  } else {
    nextInterval = repetitions === 0 ? 4 : Math.round(intervalDays * ease * 1.3);
    nextEase = ease + 0.15;
  }

  return {
    repetitions: repetitions + 1,
    intervalDays: nextInterval,
    ease: nextEase,
    lapses,
    dueAt: new Date(now.getTime() + nextInterval * DAY_MS),
  };
}

export type Stage = "new" | "learning" | "mastered";

export function stageOf(state: CardState | undefined): Stage {
  if (!state) return "new";
  return state.intervalDays >= MASTERED_INTERVAL_DAYS ? "mastered" : "learning";
}

/** Short human label for when a rating would bring the card back. */
export function describeInterval(state: CardState, now: Date): string {
  const minutes = Math.round((state.dueAt.getTime() - now.getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  if (minutes < 60 * 20) return `${Math.round(minutes / 60)}h`;
  const days = Math.max(1, Math.round(minutes / (60 * 24)));
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}
