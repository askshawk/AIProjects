import dealDesk from "../../content/games/deal-desk.json";
import jargon from "../../content/games/jargon.json";

/**
 * Game content and the scoring rules, shared by the game pages (to render)
 * and the server actions (to score). Scores are always recomputed on the
 * server from the raw answers, never taken from the browser.
 */

export type JargonSentence = { id: string; sentence: string; termIds: string[] };
export const JARGON: JargonSentence[] = jargon;

export const JARGON_SECONDS = 60;
export const JARGON_POINTS_PER_MATCH = 10;
/** Extra points for each match in an unbroken run after the first. */
export const JARGON_COMBO_BONUS = 5;

export type Quality = "strong" | "okay" | "weak";
export type DealDeskOption = { text: string; quality: Quality; feedback: string };
export type DealDeskStep = { question: string; termIds: string[]; options: DealDeskOption[] };
export type DealDeskCall = {
  id: string;
  title: string;
  buyer: { name: string; role: string };
  setup: string;
  steps: DealDeskStep[];
};
export const DEAL_DESK: DealDeskCall[] = dealDesk as DealDeskCall[];

export const DEAL_START_HEALTH = 50;
export const DEAL_WIN_HEALTH = 70;
export const DEAL_DELTA: Record<Quality, number> = { strong: 12, okay: 3, weak: -12 };

export function nextHealth(health: number, quality: Quality): number {
  return Math.max(0, Math.min(100, health + DEAL_DELTA[quality]));
}

/** Replays a finished call from the chosen option indexes. */
export function scoreDealDesk(call: DealDeskCall, choices: number[]) {
  let health = DEAL_START_HEALTH;
  const results = call.steps.map((step, i) => {
    const option = step.options[choices[i]];
    if (!option) throw new Error("Invalid choice");
    health = nextHealth(health, option.quality);
    return { step, option };
  });
  return { health, won: health >= DEAL_WIN_HEALTH, results };
}

/** Jargon Buster points for a sequence of match attempts (true = right). */
export function scoreJargon(attempts: boolean[]): number {
  let score = 0;
  let run = 0;
  for (const correct of attempts) {
    if (correct) {
      score += JARGON_POINTS_PER_MATCH + (run > 0 ? JARGON_COMBO_BONUS : 0);
      run++;
    } else {
      run = 0;
    }
  }
  return score;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
