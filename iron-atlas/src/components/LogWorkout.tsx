"use client";

import { useState } from "react";
import type { LastPerformance } from "@/lib/logbook";
import type { Suggestion } from "@/lib/progression";

export type PrescribedExercise = {
  id: number;
  exerciseId: number;
  exerciseName: string;
  sets: number;
  reps: string;
  intensityType: string;
  intensityValue: string | null;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  substitutedFrom: number | null;
};

type Props = {
  dayId: number;
  dayName: string;
  exercises: PrescribedExercise[];
  lastPerformances: Record<number, LastPerformance | undefined>;
  personalBests: Record<number, { weightKg: number; reps: number; e1rm: number } | undefined>;
  /** Keyed by prescription id — what to lift next, and why. */
  suggestions: Record<number, Suggestion | undefined>;
  action: (formData: FormData) => void;
};

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
      for (let i = 0; i < e.sets; i++) {
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

  const set = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

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
                  <span className="font-medium">
                    {e.supersetGroup && (
                      <span className="mr-2 text-xs font-semibold text-accent">
                        {e.supersetGroup}
                      </span>
                    )}
                    {e.exerciseName}
                  </span>
                  <span className="font-mono text-xs text-muted">{prescriptionText(e)}</span>
                </div>
                {e.notes && <p className="mt-1 text-xs text-muted">{e.notes}</p>}
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
                      <span className="font-medium">{suggestion.weightKg} kg · </span>
                    )}
                    {suggestion.reason}
                  </p>
                )}
              </div>

              <div className="divide-y">
                {Array.from({ length: e.sets }, (_, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2">
                    <span className="w-8 shrink-0 text-xs text-muted">#{i + 1}</span>
                    <input
                      name={`w-${e.id}-${i}`}
                      value={values[`w-${e.id}-${i}`] ?? ""}
                      onChange={(ev) => set(`w-${e.id}-${i}`, ev.target.value)}
                      inputMode="decimal"
                      placeholder="kg"
                      className="w-24 rounded-md border bg-background px-2 py-2 text-sm"
                    />
                    <span className="text-xs text-muted">×</span>
                    <input
                      name={`r-${e.id}-${i}`}
                      value={values[`r-${e.id}-${i}`] ?? ""}
                      onChange={(ev) => set(`r-${e.id}-${i}`, ev.target.value)}
                      inputMode="numeric"
                      placeholder="reps"
                      className="w-20 rounded-md border bg-background px-2 py-2 text-sm"
                    />
                    <input
                      name={`e-${e.id}-${i}`}
                      value={values[`e-${e.id}-${i}`] ?? ""}
                      onChange={(ev) => set(`e-${e.id}-${i}`, ev.target.value)}
                      inputMode="decimal"
                      placeholder="RPE"
                      className="w-20 rounded-md border bg-background px-2 py-2 text-sm"
                    />
                    <input type="hidden" name={`x-${e.id}-${i}`} value={e.exerciseId} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
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
          className="flex-1 rounded-md border bg-surface px-3 py-2.5 text-sm"
        />
      </div>
    </form>
  );
}
