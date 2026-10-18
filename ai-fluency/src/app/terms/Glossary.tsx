"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StageBadge } from "@/components/StageBadge";
import { TRACK_LABELS, type Track } from "@/lib/content";
import type { Stage } from "@/lib/srs";

type Entry = {
  id: string;
  term: string;
  aka: string[];
  track: Track;
  topic: string;
  plain: string;
  stage: Stage;
  custom: boolean;
};

const FILTERS: { value: Track | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fundamentals", label: TRACK_LABELS.fundamentals },
  { value: "sales-cs", label: TRACK_LABELS["sales-cs"] },
];

export function Glossary({ entries }: { entries: Entry[] }) {
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState<Track | "all">("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => track === "all" || e.track === track)
      .filter(
        (e) =>
          !q ||
          e.term.toLowerCase().includes(q) ||
          e.aka.some((a) => a.toLowerCase().includes(q)) ||
          e.plain.toLowerCase().includes(q),
      )
      .sort((a, b) => a.term.localeCompare(b.term));
  }, [entries, query, track]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Glossary</h1>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search terms, like RAG or tokens"
        aria-label="Search terms"
        className="mt-4 w-full rounded-lg border bg-surface px-3 py-2.5 text-base"
      />
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by track">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTrack(f.value)}
            aria-pressed={track === f.value}
            className={`rounded-full border px-3 py-1 text-sm ${
              track === f.value ? "border-accent bg-accent-soft text-accent" : "text-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-muted">
        {shown.length} term{shown.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-2 divide-y rounded-2xl border bg-surface">
        {shown.map((e) => (
          <li key={e.id}>
            <Link href={`/terms/${e.id}`} className="flex items-start gap-3 p-4 hover:bg-surface-raised">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {e.term}
                  {e.custom && <span className="ml-2 text-xs font-normal text-muted">your card</span>}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted">{e.plain}</p>
              </div>
              <StageBadge stage={e.stage} />
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="p-4 text-sm text-muted">No terms match that search.</li>}
      </ul>
    </div>
  );
}
