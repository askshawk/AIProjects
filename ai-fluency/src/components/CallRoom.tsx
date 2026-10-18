"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { DealHealth } from "@/components/DealHealth";
import { DEAL_START_HEALTH } from "@/lib/games";
import { MAX_REP_TURNS, MAX_TURN_CHARS } from "@/lib/limits";
import type { Scorecard, Turn } from "@/lib/coach";
import { finishCall, nextBuyerTurn, type CallSetup } from "@/app/practice/actions";

type Finish = { scorecard: Scorecard; won: boolean; winScore: number; xp: number; review: { id: string; term: string }[] };

/**
 * A live call with a Claude-played buyer. The transcript lives in the page;
 * every turn sends it to the server, which rebuilds the buyer from `setup`.
 * Deal health here is a live read of the buyer's mood. The final score comes
 * from a separate review of the whole transcript.
 */
export function CallRoom({ setup, buyer, onExit }: { setup: CallSetup; buyer: { name: string; role: string }; onExit: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [health, setHealth] = useState(DEAL_START_HEALTH);
  const [tip, setTip] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [over, setOver] = useState(false);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const repTurns = turns.filter((t) => t.role === "rep").length;
  const outOfTurns = repTurns >= MAX_REP_TURNS;

  function askBuyer(history: Turn[]) {
    setError(null);
    startTransition(async () => {
      const result = await nextBuyerTurn(setup, history);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTurns([...history, { role: "buyer", text: result.data.reply }]);
      setHealth((h) => Math.max(0, Math.min(100, h + result.data.healthDelta)));
      setTip(result.data.coachNote);
      if (result.data.callOver) setOver(true);
    });
  }

  useEffect(() => {
    // The buyer opens the call once, on mount.
    if (started.current) return;
    started.current = true;
    askBuyer([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, finish]);

  function send() {
    const text = draft.trim();
    if (!text || pending) return;
    const history: Turn[] = [...turns, { role: "rep", text }];
    setTurns(history);
    setDraft("");
    if (history.filter((t) => t.role === "rep").length >= MAX_REP_TURNS) {
      setOver(true);
      return;
    }
    askBuyer(history);
  }

  function end() {
    setError(null);
    startTransition(async () => {
      const result = await finishCall(setup, turns);
      if (result.ok) setFinish(result);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-[88px] z-[5] -mx-4 border-b bg-background/90 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {buyer.name}, {buyer.role}
          </span>
          <span className="text-muted">
            {repTurns}/{MAX_REP_TURNS} answers
          </span>
        </div>
        <div className="mt-2">
          <DealHealth health={health} />
        </div>
      </div>

      <ol className="space-y-3">
        {turns.map((t, i) => (
          <li key={i} className={t.role === "rep" ? "flex justify-end" : "flex"}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl p-3 ${
                t.role === "rep" ? "rounded-tr-sm bg-accent text-white" : "rounded-tl-sm bg-surface-raised"
              }`}
            >
              {t.text}
            </p>
          </li>
        ))}
        {pending && !finish && (
          <li className="text-sm text-muted" aria-live="polite">
            {turns.length === 0 ? `${buyer.name} is joining...` : over || outOfTurns ? "Reviewing the call..." : `${buyer.name} is thinking...`}
          </li>
        )}
      </ol>

      {tip && !finish && (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted">
          <span className="font-medium text-foreground">Coach:</span> {tip}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      {!finish && !over && !outOfTurns && (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_TURN_CHARS}
            rows={3}
            disabled={pending || turns.length === 0}
            aria-label="Your answer"
            placeholder="Your answer (or tap the mic on your keyboard)"
            className="w-full rounded-xl border bg-surface p-3 text-base"
          />
          <div className="flex gap-2">
            <button
              onClick={send}
              disabled={pending || !draft.trim()}
              className="flex-1 rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
            <button onClick={end} disabled={pending || repTurns === 0} className="rounded-lg border px-4 py-3 font-medium disabled:opacity-50">
              End call
            </button>
          </div>
        </div>
      )}

      {!finish && (over || outOfTurns) && (
        <button onClick={end} disabled={pending} className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-50">
          {pending ? "Reviewing the call..." : "Get my scorecard"}
        </button>
      )}

      {finish && (
        <section className="space-y-3 rounded-2xl border bg-surface p-5" role="status">
          <div className="flex items-baseline justify-between">
            <h2 className={`text-xl font-semibold ${finish.won ? "text-good" : "text-warn"}`}>
              {finish.won ? (setup.mode === "boss" ? "Boss defeated" : "Deal closed") : setup.mode === "boss" ? "Not this time" : "Deal stalled"}
            </h2>
            <span className="text-2xl font-semibold tabular-nums">
              {finish.scorecard.score}
              <span className="text-sm text-muted">/100</span>
            </span>
          </div>
          <p className="text-sm text-muted">
            {finish.winScore}+ to win · +{finish.xp} XP
          </p>
          <p>{finish.scorecard.summary}</p>
          {finish.scorecard.bestLine && (
            <blockquote className="rounded-xl bg-accent-soft p-3 text-sm">
              <span className="font-semibold text-accent">Best line:</span> &ldquo;{finish.scorecard.bestLine}&rdquo;
            </blockquote>
          )}
          <div>
            <h3 className="text-sm font-semibold">Strengths</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {finish.scorecard.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">To improve</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {finish.scorecard.improvements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          {finish.review.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Review these (they&apos;ll come back sooner in Study)</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {finish.review.map((r) => (
                  <Link key={r.id} href={`/terms/${r.id}`} className="rounded-full border px-3 py-1 text-sm">
                    {r.term}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <button onClick={onExit} className="w-full rounded-lg border px-4 py-3 font-medium">
            Done
          </button>
        </section>
      )}
      <div ref={bottom} />
    </div>
  );
}
