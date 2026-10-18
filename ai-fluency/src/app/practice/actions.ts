"use server";

import { db } from "@/db";
import { explainAttempts, roleplaySessions } from "@/db/schema";
import { aiStatus, tryAi } from "@/lib/ai";
import { requireSignedIn } from "@/lib/auth";
import { MAX_EXPLAIN_CHARS, MAX_REP_TURNS, MAX_TURN_CHARS, buyerTurn, gradeExplanation, gradePasses, scoreCall, type Turn } from "@/lib/coach";
import { BOSSES, getPersona, type Persona } from "@/lib/personas";
import { awardXp, markExplained, recordGameAnswer } from "@/lib/progress";
import { XP } from "@/lib/rewards";
import { bossStatus, BOSS_WIN_SCORE, LIVE_WIN_SCORE } from "@/lib/boss";
import { findTerm, getAllTerms } from "@/lib/terms";

export async function submitExplanation(termId: string, answer: string) {
  await requireSignedIn();
  const term = await findTerm(termId);
  const text = String(answer ?? "").trim();
  if (!term) return { ok: false as const, error: "Unknown card." };
  if (text.length < 15) return { ok: false as const, error: "Say a little more: at least a sentence." };
  if (text.length > MAX_EXPLAIN_CHARS) return { ok: false as const, error: "Keep it under 2,000 characters, like you would on a call." };

  const result = await tryAi(() => gradeExplanation(term, text));
  if (!result.ok) return result;

  const passed = gradePasses(result.data);
  await db.insert(explainAttempts).values({ termId, answer: text, passed: passed ? 1 : 0, grade: result.data });
  if (passed) await markExplained(termId);
  await recordGameAnswer(termId, passed, "explain");
  const xp = passed ? XP.explainPass : XP.explainAttempt;
  await awardXp("explain", xp, termId);
  return { ok: true as const, grade: result.data, passed, xp };
}

/**
 * The free version of Explain It Back, used when Claude isn't configured:
 * you write your explanation, compare it with the card, and grade yourself.
 * It counts toward mastery the same way, so ranks and boss battles still work
 * without an API key. Not available while AI grading is on, so the bar
 * doesn't quietly drop.
 */
export async function selfGradeExplanation(termId: string, answer: string, passed: boolean) {
  await requireSignedIn();
  if (aiStatus().available) return { ok: false as const, error: "AI grading is on, so use the graded version." };
  const term = await findTerm(termId);
  const text = String(answer ?? "").trim();
  if (!term) return { ok: false as const, error: "Unknown card." };
  if (text.length < 15) return { ok: false as const, error: "Say a little more: at least a sentence." };

  const pass = passed === true;
  await db.insert(explainAttempts).values({
    termId,
    answer: text.slice(0, MAX_EXPLAIN_CHARS),
    passed: pass ? 1 : 0,
    grade: { selfGraded: true },
  });
  if (pass) await markExplained(termId);
  await recordGameAnswer(termId, pass, "explain");
  const xp = pass ? XP.explainPass : XP.explainAttempt;
  await awardXp("explain", xp, termId);
  return { ok: true as const, passed: pass, xp };
}

// ---------------------------------------------------------------- live calls and boss battles

export type CallSetup = { mode: "live" | "boss"; personaId?: string; topic?: string };

/**
 * Rebuilds who the buyer is and what they'll probe from the setup alone, on
 * the server, so the browser only ever sends the transcript.
 */
async function resolveCall(setup: CallSetup): Promise<{ persona: Persona; focus: Awaited<ReturnType<typeof getAllTerms>>; boss: boolean }> {
  const terms = await getAllTerms();
  if (setup.mode === "boss") {
    const status = await bossStatus();
    const unit = status.find((s) => s.topic === setup.topic);
    if (!unit) throw new Error("Unknown topic");
    if (!unit.unlocked) throw new Error("This boss isn't unlocked yet");
    return { persona: BOSSES[unit.track], focus: terms.filter((t) => t.topic === unit.topic), boss: true };
  }
  const persona = getPersona(setup.personaId ?? "");
  if (!persona) throw new Error("Unknown persona");
  const focus = setup.topic ? terms.filter((t) => t.topic === setup.topic) : [];
  return { persona, focus, boss: false };
}

function cleanTurns(turns: Turn[]): Turn[] {
  return (Array.isArray(turns) ? turns : [])
    .slice(0, MAX_REP_TURNS * 2 + 2)
    .map((t) => ({ role: t.role === "rep" ? ("rep" as const) : ("buyer" as const), text: String(t.text ?? "").slice(0, MAX_TURN_CHARS) }));
}

export async function nextBuyerTurn(setup: CallSetup, turns: Turn[]) {
  await requireSignedIn();
  const history = cleanTurns(turns);
  if (history.filter((t) => t.role === "rep").length > MAX_REP_TURNS) {
    return { ok: false as const, error: "That's the end of the call. Ask for your scorecard." };
  }
  let call;
  try {
    call = await resolveCall(setup);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't set up the call." };
  }
  return tryAi(() => buyerTurn(call.persona, call.focus, history, call.boss));
}

export async function finishCall(setup: CallSetup, turns: Turn[]) {
  await requireSignedIn();
  const history = cleanTurns(turns);
  if (history.filter((t) => t.role === "rep").length === 0) {
    return { ok: false as const, error: "Say something on the call first." };
  }
  let call;
  try {
    call = await resolveCall(setup);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't set up the call." };
  }
  const allTerms = await getAllTerms();
  const result = await tryAi(() => scoreCall(call.persona, call.focus, history, call.boss, allTerms));
  if (!result.ok) return result;

  const card = result.data;
  const winScore = call.boss ? BOSS_WIN_SCORE : LIVE_WIN_SCORE;
  const won = card.score >= winScore;
  const validIds = new Set((call.focus.length ? call.focus : allTerms).map((t) => t.id));
  const review = card.termsToReview.filter((id) => validIds.has(id));
  // Concepts the coach flagged come back sooner in your study queue.
  for (const id of review) await recordGameAnswer(id, false, call.boss ? "boss" : "roleplay");

  await db.insert(roleplaySessions).values({
    mode: setup.mode,
    persona: call.persona.id,
    topic: setup.topic ?? null,
    score: card.score,
    won: won ? 1 : 0,
    scorecard: { ...card, transcript: history },
  });

  const xp = call.boss
    ? won
      ? XP.bossWin
      : Math.round(card.score / XP.roleplayDivisor)
    : Math.round(card.score / XP.roleplayDivisor) + (won ? XP.roleplayWin : 0);
  await awardXp(call.boss ? "boss" : "roleplay", xp);

  const names = new Map(allTerms.map((t) => [t.id, t.term]));
  return {
    ok: true as const,
    scorecard: card,
    won,
    winScore,
    xp,
    review: review.map((id) => ({ id, term: names.get(id) ?? id })),
  };
}
