"use client";

import { useActionState } from "react";
import { saveGoalsAction } from "@/app/actions";
import { CATEGORIES, CATEGORY_INFO } from "@/lib/categories";

export function GoalsForm({ initial }: { initial: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveGoalsAction, undefined);
  return (
    <form action={action} className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((c) => (
          <label key={c} className="text-sm font-medium">
            {CATEGORY_INFO[c].label} {CATEGORY_INFO[c].focus ? "target" : "limit"}
            <span className="mt-1 flex items-center gap-2">
              <input
                name={c}
                type="number"
                inputMode="decimal"
                min={0}
                max={168}
                step={0.5}
                defaultValue={initial[c]}
                className="w-full rounded-lg border bg-background px-3 py-2 text-base"
              />
              <span className="text-muted">h</span>
            </span>
          </label>
        ))}
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-good">
          {state.ok}
        </p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-60">
        {pending ? "Saving..." : "Save goals"}
      </button>
    </form>
  );
}
