"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { DealHealth } from "@/components/DealHealth";
import { DEAL_START_HEALTH, nextHealth, shuffle, type DealDeskCall as Call } from "@/lib/games";
import { finishDealDesk } from "../../actions";

type Result = Awaited<ReturnType<typeof finishDealDesk>>;

const QUALITY_LABEL = { strong: "Strong answer", okay: "Okay answer", weak: "Weak answer" } as const;
const QUALITY_TONE = { strong: "text-good", okay: "text-warn", weak: "text-bad" } as const;

export function DealDeskCall({ call }: { call: Call }) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<number[]>([]);
  const [health, setHealth] = useState(DEAL_START_HEALTH);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Options shown in a shuffled order, but remembered by their original index.
  const orders = useMemo(() => call.steps.map((s) => shuffle(s.options.map((_, i) => i))), [call]);

  function restart() {
    setStarted(true);
    setStep(0);
    setChoices([]);
    setHealth(DEAL_START_HEALTH);
    setResult(null);
    setError(null);
  }

  if (!started) {
    return (
      <div className="rounded-2xl border bg-surface p-6">
        <p className="text-sm text-muted">Deal Desk</p>
        <h1 className="mt-1 text-2xl font-semibold">{call.title}</h1>
        <p className="mt-3">
          <span className="font-medium">
            {call.buyer.name}, {call.buyer.role}.
          </span>{" "}
          {call.setup}
        </p>
        <p className="mt-3 text-sm text-muted">
          {call.steps.length} questions. Pick the answer you&apos;d actually give. Strong answers raise deal health; finish
          above the line to close.
        </p>
        <button onClick={restart} className="mt-6 rounded-lg bg-accent px-6 py-3 font-medium text-white">
          Start the call
        </button>
      </div>
    );
  }

  const current = call.steps[step];
  const chosen = choices[step];

  function choose(optionIndex: number) {
    if (chosen !== undefined) return;
    setChoices((c) => [...c, optionIndex]);
    setHealth((h) => nextHealth(h, current.options[optionIndex].quality));
  }

  function next() {
    if (step + 1 < call.steps.length) {
      setStep(step + 1);
      return;
    }
    setStep(call.steps.length);
    startTransition(async () => {
      try {
        setResult(await finishDealDesk(call.id, choices));
      } catch {
        setError("Couldn't save this call. Check your connection.");
      }
    });
  }

  if (step >= call.steps.length) {
    return (
      <div className="rounded-2xl border bg-surface p-6 text-center">
        <DealHealth health={health} />
        {pending || !result ? (
          <p className="mt-6 text-muted">{error ?? "Scoring the call..."}</p>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-semibold">{result.won ? "Deal closed" : "Deal stalled"}</h1>
            <p className="mt-1 text-sm text-muted">
              Final health {result.health} · +{result.xp} XP
              {result.isBest && result.previousBest !== null ? " · New best for this call" : ""}
            </p>
          </>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={restart} className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white">
            Run it again
          </button>
          <Link href="/play" className="rounded-lg border px-5 py-2.5 font-medium">
            All games
          </Link>
        </div>
      </div>
    );
  }

  const picked = chosen !== undefined ? current.options[chosen] : null;

  return (
    <div className="space-y-4">
      <DealHealth health={health} />
      <p className="text-sm text-muted">
        Question {step + 1} of {call.steps.length}
      </p>
      <div className="rounded-2xl rounded-tl-sm bg-surface-raised p-4">
        <p className="text-xs font-medium text-muted">
          {call.buyer.name}, {call.buyer.role}
        </p>
        <p className="mt-1 text-lg leading-snug">&ldquo;{current.question}&rdquo;</p>
      </div>
      <div className="space-y-2">
        {orders[step].map((i) => {
          const option = current.options[i];
          const isChosen = chosen === i;
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={chosen !== undefined}
              className={`block w-full rounded-xl border p-3 text-left text-sm transition ${
                isChosen ? "border-accent bg-accent-soft" : chosen !== undefined && option.quality === "strong" ? "border-good" : "bg-surface"
              } ${chosen !== undefined && !isChosen && option.quality !== "strong" ? "opacity-70" : ""}`}
            >
              {chosen !== undefined && !isChosen && option.quality === "strong" && (
                <span className="mb-1 block text-xs font-semibold text-good">Strong answer</span>
              )}
              {option.text}
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="rounded-2xl border bg-surface p-4" role="status">
          <p className={`font-semibold ${QUALITY_TONE[picked.quality]}`}>{QUALITY_LABEL[picked.quality]}</p>
          <p className="mt-1 text-sm">{picked.feedback}</p>
          {picked.quality !== "strong" && (
            <p className="mt-2 text-sm text-muted">The strong answer is marked above.</p>
          )}
          <button onClick={next} className="mt-4 w-full rounded-lg bg-accent px-4 py-3 font-medium text-white">
            {step + 1 < call.steps.length ? "Next question" : "End the call"}
          </button>
        </div>
      )}
    </div>
  );
}
