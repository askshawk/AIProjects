"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { shuffle } from "@/lib/games";
import { finishMythRound } from "../actions";

type Entry = { id: string; term: string; myth: string; fact: string };
type Statement = { termId: string; term: string; text: string; isMyth: boolean; fact: string };
type Answer = { termId: string; statement: string; answer: "myth" | "fact" };
type Result = Awaited<ReturnType<typeof finishMythRound>>;

const ROUND = 10;

function buildDeck(pool: Entry[]): Statement[] {
  // Each card contributes its myth or its fact, roughly half and half.
  return shuffle(pool)
    .slice(0, ROUND)
    .map((e) => {
      const isMyth = Math.random() < 0.5;
      return { termId: e.id, term: e.term, text: isMyth ? e.myth : e.fact, isMyth, fact: e.fact };
    });
}

export function MythOrFact({ pool }: { pool: Entry[] }) {
  const [deck, setDeck] = useState<Statement[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setDeck(buildDeck(pool));
    setIndex(0);
    setAnswers([]);
    setResult(null);
    setError(null);
  }

  if (!deck) {
    return (
      <div className="rounded-2xl border bg-surface p-6 text-center">
        <h1 className="text-2xl font-semibold">Myth or Fact</h1>
        <p className="mt-2 text-muted">
          Ten statements people commonly believe, or get right, about AI. Decide which is which. Each answer explains
          itself.
        </p>
        <button onClick={start} className="mt-6 rounded-lg bg-accent px-6 py-3 font-medium text-white">
          Start
        </button>
      </div>
    );
  }

  const card = deck[index];
  const answered = answers[index];

  function answer(choice: "myth" | "fact") {
    if (answered) return;
    setAnswers((a) => [...a, { termId: card.termId, statement: card.text, answer: choice }]);
  }

  function next() {
    if (index + 1 < deck!.length) {
      setIndex(index + 1);
      return;
    }
    setIndex(deck!.length);
    startTransition(async () => {
      try {
        setResult(await finishMythRound(answers));
      } catch {
        setError("Couldn't save this round. Check your connection.");
      }
    });
  }

  if (index >= deck.length) {
    const misses = deck.filter((s, i) => (answers[i]?.answer === "myth") !== s.isMyth);
    return (
      <div className="rounded-2xl border bg-surface p-6 text-center">
        <p className="text-sm text-muted">Round complete</p>
        {pending || !result ? (
          <p className="mt-4 text-muted">{error ?? "Scoring..."}</p>
        ) : (
          <>
            <p className="mt-1 text-4xl font-semibold tabular-nums">
              {result.correct}/{result.total}
            </p>
            <p className="mt-1 text-sm text-muted">
              +{result.xp} XP{result.isBest && result.previousBest !== null ? " · New personal best!" : ""}
            </p>
          </>
        )}
        {misses.length > 0 && (
          <div className="mt-5 text-left">
            <p className="text-sm font-medium">Worth another look</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {misses.map((m) => (
                <Link key={m.termId} href={`/terms/${m.termId}`} className="rounded-full border px-3 py-1 text-sm">
                  {m.term}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={start} className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white">
            Play again
          </button>
          <Link href="/play" className="rounded-lg border px-5 py-2.5 font-medium">
            All games
          </Link>
        </div>
      </div>
    );
  }

  const right = answered && (answered.answer === "myth") === card.isMyth;

  return (
    <div>
      <div className="flex justify-between text-sm text-muted">
        <span>
          {index + 1} of {deck.length}
        </span>
        <span>{answers.filter((a, i) => (a.answer === "myth") === deck[i].isMyth).length} right</span>
      </div>
      <article className="mt-3 rounded-2xl border bg-surface p-6">
        <p className="text-xs text-muted">About: {card.term}</p>
        <p className="mt-2 text-xl leading-snug">&ldquo;{card.text}&rdquo;</p>

        {!answered ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button onClick={() => answer("myth")} className="rounded-xl border border-bad/40 py-3 font-medium text-bad">
              Myth
            </button>
            <button onClick={() => answer("fact")} className="rounded-xl border border-good/40 py-3 font-medium text-good">
              Fact
            </button>
          </div>
        ) : (
          <div className="mt-5" role="status">
            <p className={`font-semibold ${right ? "text-good" : "text-bad"}`}>
              {right ? "Right." : "Not quite."} It&apos;s a {card.isMyth ? "myth" : "fact"}.
            </p>
            {card.isMyth && <p className="mt-1">{card.fact}</p>}
            <button onClick={next} className="mt-5 w-full rounded-lg bg-accent px-4 py-3 font-medium text-white">
              {index + 1 < deck.length ? "Next" : "See results"}
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
