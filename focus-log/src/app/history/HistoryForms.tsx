"use client";

import { useActionState, useTransition } from "react";
import { deleteAction, logPastAction } from "@/app/actions";
import { CATEGORIES, CATEGORY_INFO } from "@/lib/categories";

const field = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base";

export function LogPastForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(logPastAction, undefined);
  return (
    <form action={action} className="mt-3 grid grid-cols-2 gap-3">
      <label className="col-span-2 text-sm font-medium">
        Type
        <select name="category" required className={field} defaultValue="deep_work">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_INFO[c].label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Date
        <input name="date" type="date" required defaultValue={today} max={today} className={field} />
      </label>
      <label className="text-sm font-medium">
        Started at
        <input name="time" type="time" required className={field} />
      </label>
      <label className="col-span-2 text-sm font-medium">
        Minutes
        <input name="minutes" type="number" inputMode="numeric" min={1} max={1440} required className={field} />
      </label>
      <label className="col-span-2 text-sm font-medium">
        Note
        <input name="note" maxLength={500} placeholder="Optional" className={field} />
      </label>
      {state?.error && (
        <p role="alert" className="col-span-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="col-span-2 text-sm text-good">
          {state.ok}
        </p>
      )}
      <button type="submit" disabled={pending} className="col-span-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-60">
        {pending ? "Saving..." : "Add session"}
      </button>
    </form>
  );
}

export function DeleteSessionButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this session?")) startTransition(() => deleteAction(id));
      }}
      className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:text-bad disabled:opacity-60"
    >
      Delete
    </button>
  );
}
