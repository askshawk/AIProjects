"use server";

import { and, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { gameScores } from "@/db/schema";
import { requireSignedIn } from "@/lib/auth";
import { DEAL_DESK, scoreDealDesk, scoreJargon } from "@/lib/games";
import { awardXp, recordGameAnswer } from "@/lib/progress";
import { XP } from "@/lib/rewards";
import { findTerm } from "@/lib/terms";

async function personalBest(game: string, variant: string | null) {
  const [row] = await db
    .select({ best: max(gameScores.score) })
    .from(gameScores)
    .where(variant ? and(eq(gameScores.game, game), eq(gameScores.variant, variant)) : eq(gameScores.game, game));
  return row?.best ?? null;
}

async function saveScore(game: string, variant: string | null, score: number, detail: Record<string, unknown>) {
  const previousBest = await personalBest(game, variant);
  await db.insert(gameScores).values({ game, variant, score, detail });
  return { previousBest, isBest: previousBest === null || score > previousBest };
}

/**
 * Jargon Buster: each attempt pairs a buzzword with the definition the player
 * tapped. The server checks the pairs itself, scores them, and feeds each
 * card's result into the study schedule.
 */
export async function finishJargonRound(attempts: { termId: string; chosenId: string }[]) {
  await requireSignedIn();
  const checked = attempts.slice(0, 200).map((a) => ({ termId: String(a.termId), correct: a.termId === a.chosenId }));
  const score = scoreJargon(checked.map((c) => c.correct));
  const matches = checked.filter((c) => c.correct).length;

  // A card counts as right only if every attempt at it this round was right.
  const perTerm = new Map<string, boolean>();
  for (const c of checked) perTerm.set(c.termId, (perTerm.get(c.termId) ?? true) && c.correct);
  for (const [termId, correct] of perTerm) await recordGameAnswer(termId, correct, "jargon");

  await awardXp("jargon", matches * XP.jargonMatch);
  const best = await saveScore("jargon", null, score, { matches, misses: checked.length - matches });
  return { score, matches, misses: checked.length - matches, xp: matches * XP.jargonMatch, ...best };
}

/**
 * Myth or Fact: the browser sends back the statement it showed, and the
 * server works out whether that statement was the card's myth or its fact,
 * so the marking can't be fudged from the browser.
 */
export async function finishMythRound(answers: { termId: string; statement: string; answer: "myth" | "fact" }[]) {
  await requireSignedIn();
  let correct = 0;
  let total = 0;
  for (const a of answers.slice(0, 100)) {
    const term = await findTerm(a.termId);
    if (!term) continue;
    const shown =
      a.statement === term.misconception.claim ? "myth" : a.statement === term.misconception.truth ? "fact" : null;
    if (!shown) continue;
    total++;
    const right = a.answer === shown;
    if (right) correct++;
    await recordGameAnswer(a.termId, right, "myth");
  }
  await awardXp("myth", correct * XP.mythCorrect);
  const best = await saveScore("myth", null, correct, { total });
  return { correct, total, xp: correct * XP.mythCorrect, ...best };
}

/** Deal Desk (scripted): replays the chosen options to score the call. */
export async function finishDealDesk(callId: string, choices: number[]) {
  await requireSignedIn();
  const call = DEAL_DESK.find((c) => c.id === callId);
  if (!call || choices.length !== call.steps.length) throw new Error("Invalid call");

  const { health, won, results } = scoreDealDesk(call, choices);
  for (const { step, option } of results) {
    for (const termId of step.termIds) await recordGameAnswer(termId, option.quality === "strong", "deal-desk");
  }
  const strong = results.filter((r) => r.option.quality === "strong").length;
  const xp = strong * XP.dealDeskGoodAnswer + (won ? XP.dealDeskWin : 0);
  await awardXp("deal-desk", xp);
  const best = await saveScore("deal-desk", callId, health, { won, strong });
  return { health, won, xp, ...best };
}
