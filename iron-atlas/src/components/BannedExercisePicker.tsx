"use client";

import { useMemo, useState } from "react";

export type ExerciseOption = { id: number; name: string };

/**
 * Search-and-tag picker for "exercises to avoid". Used to be a raw text input
 * asking for comma-separated numeric IDs, with instructions to "find IDs on
 * the exercise catalogue" — a page that never actually displayed one. This
 * keeps the same wire format (a hidden `name="banned"` of comma-separated
 * ids, read by the existing `saveGym` server action) so nothing downstream
 * changes; only how a lifter picks the exercises does.
 */
export function BannedExercisePicker({
  name,
  options,
  initialIds,
}: {
  name: string;
  options: ExerciseOption[];
  initialIds: number[];
}) {
  const [selected, setSelected] = useState<number[]>(initialIds);
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) => !selected.includes(o.id) && o.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [options, query, selected]);

  const add = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
  };

  const remove = (id: number) => {
    setSelected((prev) => prev.filter((s) => s !== id));
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected.join(",")} />

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => remove(id)}
                className="flex min-h-8 items-center gap-1 rounded-full border bg-surface-raised px-3 py-1 text-xs"
              >
                {byId.get(id)?.name ?? `#${id}`}
                <span aria-hidden="true" className="text-muted">
                  ×
                </span>
                <span className="sr-only">Stop avoiding {byId.get(id)?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an exercise to avoid…"
          aria-label="Search exercises to avoid"
          className="w-full rounded-md border bg-surface px-3 py-2 text-sm"
        />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-surface-raised shadow-lg">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => add(m.id)}
                  className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-accent-soft/20"
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
