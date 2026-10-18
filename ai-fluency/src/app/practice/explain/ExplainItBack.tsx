"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Grade } from "@/lib/coach";
import { MAX_EXPLAIN_CHARS } from "@/lib/limits";
import { submitExplanation } from "../actions";

export type ExplainCard = {
  id: string;
  term: string;
  topic: string;
  readyToMaster: boolean;
  explained: boolean;
  lastPassed: boolean | null;
};

type Outcome = { grade: Grade; passed: boolean; xp: number };

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-raised p-3 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums">
        {value}
        <span className="text-sm text-muted">/5</span>
      </p>
    </div>
  );
}

export function ExplainItBack({ cards, initial }: { cards: ExplainCard[]; initial: string | null }) {
  const [selected, setSelected] = useState<string | null>(initial);
  const [answer, setAnswer] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");

  const card = cards.find((c) => c.id === selected);

  function submit() {
    if (!card) return;
    setError(null);
    startTransition(async () => {
      const result = await submitExplanation(card.id, answer);
      if (result.ok) setOutcome({ grade: result.grade, passed: result.passed, xp: result.xp });
      else setError(result.error);
    });
  }

  function pick(id: string | null) {
    setSelected(id);
    setAnswer("");
    setOutcome(null);
    setError(null);
  }

  if (!card) {
    const q = filter.trim().toLowerCase();
    const shown = cards.filter((c) => !q || c.term.toLowerCase().includes(q));
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Explain It Back</h1>
        <p className="mt-1 text-sm text-muted">Pick a term and explain it like you would to a customer.</p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a term"
          aria-label="Find a term"
          className="mt-4 w-full rounded-lg border bg-surface px-3 py-2.5 text-base"
        />
        <ul className="mt-3 divide-y rounded-2xl border bg-surface">
          {shown.map((c) => (
            <li key={c.id}>
              <button onClick={() => pick(c.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface-raised">
                <span>
                  <span className="font-medium">{c.term}</span>
                  <span className="block text-xs text-muted">{c.topic}</span>
                </span>
                <span className="shrink-0 text-xs">
                  {c.readyToMaster ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-white">Ready to master</span>
                  ) : c.explained ? (
                    <span className="text-good">Explained</span>
                  ) : c.lastPassed === false ? (
                    <span className="text-muted">Try again</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={() => pick(null)} className="text-sm text-muted hover:text-foreground">
        &larr; All terms
      </button>
      <section className="rounded-2xl border bg-surface p-5">
        <p className="text-xs text-muted">{card.topic}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{card.term}</h1>
        <p className="mt-3 text-sm text-muted">
          A customer just asked what this is. Explain it in two to four sentences, in your own words. On iPhone, tap the
          microphone on the keyboard to say it out loud.
        </p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={pending || Boolean(outcome)}
          maxLength={MAX_EXPLAIN_CHARS}
          rows={6}
          aria-label={`Your explanation of ${card.term}`}
          className="mt-3 w-full rounded-xl border bg-background p-3 text-base"
          placeholder="So basically..."
        />
        {!outcome && (
          <button
            onClick={submit}
            disabled={pending || answer.trim().length < 15}
            className="mt-3 w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {pending ? "Grading..." : "Grade my explanation"}
          </button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
      </section>

      {outcome && (
        <section className="space-y-4 rounded-2xl border bg-surface p-5" role="status">
          <div className="flex items-baseline justify-between">
            <p className={`text-lg font-semibold ${outcome.passed ? "text-good" : "text-warn"}`}>
              {outcome.passed ? (card.readyToMaster ? "Passed. Card mastered!" : "Passed") : "Not yet"}
            </p>
            <p className="text-sm text-muted">+{outcome.xp} XP</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Score label="Accuracy" value={outcome.grade.accuracy} />
            <Score label="Clarity" value={outcome.grade.clarity} />
            <Score label="Jargon-free" value={outcome.grade.jargonFree} />
          </div>
          {outcome.grade.incorrectClaims.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-bad">Not quite right</h2>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {outcome.grade.incorrectClaims.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h2 className="text-sm font-semibold">What worked</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {outcome.grade.whatWorked.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold">To improve</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {outcome.grade.toImprove.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-accent-soft p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">A stronger version</h2>
            <p className="mt-1">&ldquo;{outcome.grade.betterVersion}&rdquo;</p>
          </div>
          <p className="text-xs text-muted">
            Passing needs accuracy 4+, clarity and jargon 3+, and nothing factually wrong. AI grading can be wrong too;
            check the card if a grade seems off.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setAnswer(""); setOutcome(null); }} className="rounded-lg bg-accent px-4 py-2 font-medium text-white">
              Try again
            </button>
            <button onClick={() => pick(null)} className="rounded-lg border px-4 py-2 font-medium">
              Another term
            </button>
            <Link href={`/terms/${card.id}`} className="rounded-lg border px-4 py-2 font-medium">
              See the card
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
