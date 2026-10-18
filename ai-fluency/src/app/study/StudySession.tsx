"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { TermBody } from "@/components/TermBody";
import { TRACK_LABELS, type Term } from "@/lib/content";
import { describeInterval, schedule, type CardState, type Rating } from "@/lib/srs";
import { rateCard } from "../actions";

export type SessionCard = {
  term: Term;
  isNew: boolean;
  state: Omit<CardState, "dueAt"> & { dueAt: string };
};

const BUTTONS: { rating: Rating; label: string; className: string }[] = [
  { rating: "again", label: "Again", className: "border-bad/40 text-bad" },
  { rating: "hard", label: "Hard", className: "border-warn/40 text-warn" },
  { rating: "good", label: "Good", className: "border-good/40 text-good" },
  { rating: "easy", label: "Easy", className: "border-accent/40 text-accent" },
];

function toState(card: SessionCard): CardState {
  return { ...card.state, dueAt: new Date(card.state.dueAt) };
}

export function StudySession({ initial }: { initial: SessionCard[] }) {
  const [queue, setQueue] = useState(initial);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const card = queue[0];

  if (!card) {
    return (
      <div className="rounded-2xl border bg-surface p-6 text-center">
        <h1 className="text-xl font-semibold">{done > 0 ? "Session complete" : "Nothing to study right now"}</h1>
        <p className="mt-2 text-sm text-muted">
          {done > 0
            ? `${done} review${done === 1 ? "" : "s"} done. The schedule will bring cards back right before you'd forget them.`
            : "No cards are due. Check back tomorrow, or browse the glossary."}
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/" className="rounded-lg bg-accent px-4 py-2 font-medium text-white">
            Back to today
          </Link>
          <Link href="/terms" className="rounded-lg border px-4 py-2 font-medium">
            Glossary
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();
  const current = toState(card);

  function rate(rating: Rating) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await rateCard(card.term.id, rating);
        setDone((n) => n + 1);
        setRevealed(false);
        setQueue((q) => {
          const rest = q.slice(1);
          // "Again" means it comes back within minutes, so see it again this session.
          if (rating !== "again") return rest;
          return [...rest, { ...card, isNew: false, state: result }];
        });
      } catch {
        setError("Couldn't save that rating. Check your connection and try again.");
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>{queue.length} left</span>
        <span>{done} done</span>
      </div>

      <article className="rounded-2xl border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{TRACK_LABELS[card.term.track]}</span>
          <span aria-hidden>·</span>
          <span>{card.term.topic}</span>
          {card.isNew && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">New</span>}
          {card.term.status === "draft" && (
            <span className="rounded-full bg-surface-raised px-2 py-0.5">Draft card</span>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{card.term.term}</h1>
        {card.term.aka && <p className="mt-1 text-sm text-muted">Also: {card.term.aka.join(", ")}</p>}

        {!revealed ? (
          <>
            <p className="mt-6 text-muted">
              Before you flip it: how would you explain this to a customer in one or two sentences? Say it out loud.
            </p>
            <button
              onClick={() => setRevealed(true)}
              className="mt-6 w-full rounded-lg bg-accent px-4 py-3 font-medium text-white"
            >
              Show answer
            </button>
          </>
        ) : (
          <div className="mt-5">
            <TermBody term={card.term} />
            <p className="mt-6 text-sm font-medium">How well did you know it?</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {BUTTONS.map((b) => (
                <button
                  key={b.rating}
                  onClick={() => rate(b.rating)}
                  disabled={pending}
                  className={`rounded-lg border px-2 py-2.5 text-sm font-medium disabled:opacity-50 ${b.className}`}
                >
                  {b.label}
                  <span className="block text-xs font-normal text-muted">
                    {describeInterval(schedule(current, b.rating, now), now)}
                  </span>
                </button>
              ))}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-bad">
                {error}
              </p>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
