"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { JARGON_SECONDS, shuffle } from "@/lib/games";
import { finishJargonRound } from "../actions";

type Card = { id: string; term: string; short: string };
type Sentence = { id: string; sentence: string; terms: Card[] };
type Attempt = { termId: string; chosenId: string };
type Result = Awaited<ReturnType<typeof finishJargonRound>>;

export function JargonBuster({ sentences }: { sentences: Sentence[] }) {
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [order, setOrder] = useState<Sentence[]>([]);
  const [index, setIndex] = useState(0);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [combo, setCombo] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(JARGON_SECONDS);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const attemptsRef = useRef<Attempt[]>([]);

  const current = order[index % Math.max(order.length, 1)];
  const definitions = useMemo(() => (current ? shuffle(current.terms) : []), [current]);

  function start() {
    setOrder(shuffle(sentences));
    setIndex(0);
    setMatched(new Set());
    setPicked(null);
    setAttempts([]);
    attemptsRef.current = [];
    setCombo(0);
    setSecondsLeft(JARGON_SECONDS);
    setResult(null);
    setError(null);
    setPhase("playing");
  }

  function submit() {
    startTransition(async () => {
      try {
        setResult(await finishJargonRound(attemptsRef.current));
      } catch {
        setError("Couldn't save this round. Check your connection.");
      }
    });
  }

  useEffect(() => {
    if (phase !== "playing") return;
    // Counting from a deadline (not decrementing) keeps the clock honest if
    // the tab is backgrounded and timers get throttled.
    const deadline = Date.now() + JARGON_SECONDS * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        setPhase("done");
        submit();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  function choose(definitionId: string) {
    // Ignore taps that land before the screen catches up with a previous match.
    if (!picked || matched.has(picked) || matched.has(definitionId)) return;
    const attempt = { termId: picked, chosenId: definitionId };
    attemptsRef.current = [...attemptsRef.current, attempt];
    setAttempts(attemptsRef.current);
    if (definitionId === picked) {
      const next = new Set(matched).add(picked);
      setCombo((c) => c + 1);
      setPicked(null);
      if (next.size === current.terms.length) {
        // Sentence cleared: on to the next one.
        setIndex((i) => i + 1);
        setMatched(new Set());
      } else {
        setMatched(next);
      }
    } else {
      setCombo(0);
      setWrong(definitionId);
      setTimeout(() => setWrong(null), 400);
    }
  }

  if (phase === "ready") {
    return (
      <div className="rounded-2xl border bg-surface p-6 text-center">
        <h1 className="text-2xl font-semibold">Jargon Buster</h1>
        <p className="mt-2 text-muted">
          A customer says something full of buzzwords. Tap a buzzword, then tap what it means. Clear the sentence to get
          the next one. You have {JARGON_SECONDS} seconds.
        </p>
        <button onClick={start} className="mt-6 rounded-lg bg-accent px-6 py-3 font-medium text-white">
          Start
        </button>
      </div>
    );
  }

  if (phase === "done") {
    const missed = [...new Set(attempts.filter((a) => a.termId !== a.chosenId).map((a) => a.termId))];
    const names = new Map(sentences.flatMap((s) => s.terms).map((t) => [t.id, t.term]));
    return (
      <div className="rounded-2xl border bg-surface p-6 text-center">
        <p className="text-sm text-muted">Time&apos;s up</p>
        {pending || !result ? (
          <p className="mt-4 text-muted">{error ?? "Scoring..."}</p>
        ) : (
          <>
            <p className="mt-1 text-4xl font-semibold tabular-nums">{result.score}</p>
            <p className="mt-1 text-sm text-muted">
              {result.matches} matched, {result.misses} missed · +{result.xp} XP
              {result.isBest && result.previousBest !== null ? " · New personal best!" : ""}
            </p>
            {missed.length > 0 && (
              <div className="mt-5 text-left">
                <p className="text-sm font-medium">Worth another look</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {missed.map((id) => (
                    <Link key={id} href={`/terms/${id}`} className="rounded-full border px-3 py-1 text-sm">
                      {names.get(id)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
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

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums text-muted">{secondsLeft}s</span>
        <span className="font-medium">{combo > 1 ? `Combo x${combo}` : " "}</span>
        <span className="tabular-nums text-muted">{attempts.filter((a) => a.termId === a.chosenId).length} matched</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-grid" aria-hidden>
        <div className="h-full bg-accent transition-all" style={{ width: `${(secondsLeft / JARGON_SECONDS) * 100}%` }} />
      </div>

      <blockquote className="mt-4 rounded-2xl border bg-surface p-4 text-lg leading-snug">&ldquo;{current.sentence}&rdquo;</blockquote>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Buzzwords</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {current.terms.map((t) => (
              <button
                key={t.id}
                disabled={matched.has(t.id)}
                onClick={() => setPicked(t.id)}
                aria-pressed={picked === t.id}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  matched.has(t.id)
                    ? "border-transparent bg-good/15 text-good line-through"
                    : picked === t.id
                      ? "border-accent bg-accent text-white"
                      : "bg-surface"
                }`}
              >
                {t.term}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Means</p>
          <div className="mt-2 space-y-2">
            {definitions.map((t) => (
              <button
                key={t.id}
                disabled={!picked || matched.has(t.id)}
                onClick={() => choose(t.id)}
                className={`block w-full rounded-xl border px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
                  matched.has(t.id) ? "opacity-40" : wrong === t.id ? "border-bad bg-bad/10" : "bg-surface"
                }`}
              >
                {t.short}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!picked && <p className="mt-3 text-center text-sm text-muted">Tap a buzzword first.</p>}
    </div>
  );
}
