"use client";

import { useState } from "react";
import type { LastPerformance } from "@/lib/logbook";
import type { Suggestion } from "@/lib/progression";
import { RestTimer } from "@/components/RestTimer";
import { WarmupHint } from "@/components/WarmupHint";
import { HowToHint } from "@/components/HowToHint";
import { formatPlates, platesPerSide } from "@/lib/plates";
import { BAR_KG } from "@/lib/warmup";

export type PrescribedExercise = {
  id: number;
  exerciseId: number;
  exerciseName: string;
  exerciseSlug: string;
  exerciseDescription: string | null;
  sets: number;
  reps: string;
  intensityType: string;
  intensityValue: string | null;
  restSeconds: number | null;
  equipment: string;
  notes: string | null;
  supersetGroup: string | null;
  substitutedFrom: number | null;
};

type Props = {
  dayId: number;
  dayName: string;
  exercises: PrescribedExercise[];
  lastPerformances: Record<number, LastPerformance | undefined>;
  personalBests: Record<
    number,
    { weightKg: number; reps: number; e1rm: number } | undefined
  >;
  /** Keyed by prescription id — what to lift next, and why. */
  suggestions: Record<number, Suggestion | undefined>;
  action: (formData: FormData) => void;
};

// Sanity cap on rows rendered per exercise. Nothing legitimate prescribes
// more than this in one session — adjustVolume itself caps at 20 sets — but
// bad data (a stale fork, a hand-edited program) shouldn't be able to make
// this component try to render thousands of inputs and lock up the page.
const MAX_RENDERED_SETS = 20;

/** A plate list only makes sense for something you load a bar for. */
const isBarbell = (equipment: string) =>
  equipment === "barbell" || equipment === "smith";

/**
 * What to put on each side of the bar for the suggested weight.
 *
 * Silent when the weight can't be made from standard plates rather than
 * showing an approximation — a lifter would load what this says over what the
 * prescription says, so a "close enough" list would quietly change the weight.
 */
function PlateHint({ totalKg }: { totalKg: number }) {
  const load = platesPerSide(totalKg, BAR_KG);
  if (!load || !load.exact) return null;
  return (
    <p className="mt-1 font-mono text-xs text-muted">
      {formatPlates(load.perSide)}
      {load.perSide.length > 0 && " per side"}
    </p>
  );
}

/**
 * These inputs sit in the same form as "Finish session", so a browser's
 * implicit submission would end the whole workout when someone presses Enter
 * (or the mobile keypad's "return", which is the usual way to dismiss a
 * numeric keyboard) after typing a single set.
 */
function swallowEnter(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.preventDefault();
}

function prescriptionText(e: PrescribedExercise) {
  const base = `${e.sets} × ${e.reps}`;
  if (!e.intensityValue || e.intensityType === "none") return base;
  const suffix =
    e.intensityType === "percent_1rm"
      ? `${e.intensityValue}% 1RM`
      : e.intensityType === "weight"
        ? `${e.intensityValue} kg`
        : `${e.intensityType.toUpperCase()} ${e.intensityValue}`;
  return `${base} @ ${suffix}`;
}

/**
 * The in-gym view. Optimised for one thumb on a phone between sets: last
 * session's numbers are visible next to the inputs, because "what did I do
 * last time" is the question every working set starts with.
 */
export function LogWorkout({
  dayId,
  dayName,
  exercises,
  lastPerformances,
  personalBests,
  suggestions,
  action,
}: Props) {
  // Prefill from last time — most sessions repeat or nudge the previous load.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const e of exercises) {
      const last = lastPerformances[e.exerciseId];
      const suggested = suggestions[e.id]?.weightKg;
      for (let i = 0; i < Math.min(e.sets, MAX_RENDERED_SETS); i++) {
        const prior = last?.sets[i];
        // The suggestion is the point of the feature — prefill it, and fall
        // back to a straight repeat only when there isn't one.
        const weight = suggested ?? prior?.weightKg;
        if (weight != null) initial[`w-${e.id}-${i}`] = String(weight);
        if (prior?.reps != null) initial[`r-${e.id}-${i}`] = String(prior.reps);
      }
    }
    return initial;
  });

  /**
   * Which rows the lifter actually performed.
   *
   * Prefilled numbers are a *suggestion*, not a record. Without this, every
   * prescribed row arrived at the server carrying a weight, so the server's
   * "skip untouched rows" check could never fire and a single tap on Finish
   * logged the whole day's prescription as completed work — including sets
   * nobody did. Those phantom sets then fed the training-max maths.
   */
  const [done, setDone] = useState<Record<string, boolean>>({});

  const markDone = (rowKey: string, isDone: boolean) =>
    setDone((prev) => ({ ...prev, [rowKey]: isDone }));

  const set = (key: string, value: string, rowKey: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Typing into a row is itself a statement that you did it — otherwise
    // every set would cost two interactions instead of one.
    setDone((prev) => (prev[rowKey] ? prev : { ...prev, [rowKey]: true }));
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="dayId" value={dayId} />
      <div className="space-y-4">
        {exercises.map((e) => {
          const last = lastPerformances[e.exerciseId];
          const best = personalBests[e.exerciseId];
          const suggestion = suggestions[e.id];

          return (
            <div key={e.id} className="rounded-lg border bg-surface">
              <div className="border-b bg-surface-raised px-4 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-medium">
                    {e.supersetGroup && (
                      <span className="mr-2 text-xs font-semibold text-accent">
                        {/* A bare "A" next to the name reads as part of it to
                            a screen reader ("A Seated Cable Row"). */}
                        <span className="sr-only">Superset </span>
                        {e.supersetGroup}
                      </span>
                    )}
                    {e.exerciseName}
                  </h2>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">
                      {prescriptionText(e)}
                    </span>
                    {e.restSeconds != null && e.restSeconds > 0 && (
                      <RestTimer seconds={e.restSeconds} />
                    )}
                  </span>
                </div>
                {e.notes && (
                  <p className="mt-1 text-xs text-muted">{e.notes}</p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {last
                    ? `Last time: ${last.sets
                        .map((s) => `${s.weightKg ?? "—"}×${s.reps ?? "—"}`)
                        .join(", ")}`
                    : "First time logging this"}
                  {best && ` · best e1RM ${best.e1rm.toFixed(1)} kg`}
                </p>
                {suggestion && (
                  <p className="mt-1.5 text-xs text-accent">
                    {suggestion.weightKg !== null && (
                      <span className="font-medium">
                        {suggestion.weightKg} kg ·{" "}
                      </span>
                    )}
                    {suggestion.reason}
                  </p>
                )}
                {/* Only for a loaded barbell — a plate list is meaningless for
                    dumbbells, machines or bodyweight work. */}
                {isBarbell(e.equipment) && suggestion?.weightKg != null && (
                  <PlateHint totalKg={suggestion.weightKg} />
                )}
                {/* Ramp to whatever the first working set is actually loaded to. */}
                <WarmupHint
                  workingKg={suggestion?.weightKg ?? last?.sets[0]?.weightKg}
                  barbell={isBarbell(e.equipment)}
                />
                <HowToHint
                  exerciseSlug={e.exerciseSlug}
                  description={e.exerciseDescription}
                />
              </div>

              {e.sets > MAX_RENDERED_SETS && (
                <p className="px-4 pt-2 text-xs text-red-400">
                  This exercise lists {e.sets} sets, more than usual —
                  showing the first {MAX_RENDERED_SETS}.
                </p>
              )}
              <div className="divide-y">
                {Array.from(
                  { length: Math.min(e.sets, MAX_RENDERED_SETS) },
                  (_, i) => {
                  const rowKey = `${e.id}-${i}`;
                  const isDone = done[rowKey] ?? false;
                  return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-4 py-2 ${
                      isDone ? "" : "opacity-60"
                    }`}
                  >
                    <span className="w-8 shrink-0 text-xs text-muted">
                      #{i + 1}
                    </span>
                    <input
                      name={`w-${e.id}-${i}`}
                      value={values[`w-${e.id}-${i}`] ?? ""}
                      onChange={(ev) =>
                        set(`w-${e.id}-${i}`, ev.target.value, rowKey)
                      }
                      onKeyDown={swallowEnter}
                      inputMode="decimal"
                      placeholder="kg"
                      aria-label={`Set ${i + 1} weight in kg for ${e.exerciseName}`}
                      className="w-24 rounded-md border bg-background px-2 py-2 text-sm"
                    />
                    <span className="text-xs text-muted" aria-hidden="true">
                      ×
                    </span>
                    <input
                      name={`r-${e.id}-${i}`}
                      value={values[`r-${e.id}-${i}`] ?? ""}
                      onChange={(ev) =>
                        set(`r-${e.id}-${i}`, ev.target.value, rowKey)
                      }
                      onKeyDown={swallowEnter}
                      inputMode="numeric"
                      placeholder="reps"
                      aria-label={`Set ${i + 1} reps for ${e.exerciseName}`}
                      className="w-20 rounded-md border bg-background px-2 py-2 text-sm"
                    />
                    <input
                      name={`e-${e.id}-${i}`}
                      value={values[`e-${e.id}-${i}`] ?? ""}
                      onChange={(ev) =>
                        set(`e-${e.id}-${i}`, ev.target.value, rowKey)
                      }
                      onKeyDown={swallowEnter}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={10}
                      step={0.5}
                      placeholder="RPE"
                      aria-label={`Set ${i + 1} RPE, 1 to 10, for ${e.exerciseName}`}
                      className="w-20 rounded-md border bg-background px-2 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => markDone(rowKey, !isDone)}
                      aria-pressed={isDone}
                      aria-label={`Mark set ${i + 1} of ${e.exerciseName} as ${
                        isDone ? "not done" : "done"
                      }`}
                      className={`ml-auto flex size-11 shrink-0 items-center justify-center rounded-md border text-sm transition-colors ${
                        isDone
                          ? "border-accent bg-accent-soft/30 text-accent"
                          : "text-muted"
                      }`}
                    >
                      <span aria-hidden="true">✓</span>
                    </button>
                    <input
                      type="hidden"
                      name={`x-${e.id}-${i}`}
                      value={e.exerciseId}
                    />
                    {/* The marker the server keys on. Prefilled weights mean
                        a row always *looks* filled in, so "did this happen?"
                        has to be stated explicitly rather than inferred. */}
                    {isDone && (
                      <input type="hidden" name={`d-${e.id}-${i}`} value="1" />
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="sticky bottom-0 flex gap-2 border-t bg-background py-3"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <button
          type="submit"
          title={`Finish ${dayName}`}
          className="shrink-0 rounded-md bg-accent px-5 py-2.5 text-sm font-medium whitespace-nowrap text-black"
        >
          Finish session
        </button>
        <input
          name="notes"
          placeholder="Session notes (optional)"
          aria-label="Session notes"
          className="flex-1 rounded-md border bg-surface px-3 py-2.5 text-sm"
        />
      </div>
    </form>
  );
}
