"use client";

import { useTransition } from "react";

/** Two taps to delete: the first asks, the second confirms. */
export function DeleteButton({ action, label }: { action: () => Promise<void>; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      aria-label={label}
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this? It can't be undone.")) return;
        startTransition(() => action());
      }}
      className="shrink-0 rounded-lg border px-2.5 py-1 text-xs text-muted hover:text-bad disabled:opacity-50"
    >
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}
