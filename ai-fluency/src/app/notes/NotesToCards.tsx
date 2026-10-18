"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { DraftCard } from "@/lib/coach";
import { MAX_NOTES_CHARS } from "@/lib/limits";
import { approveCard, extractFromNotes } from "./actions";

type Draft = DraftCard & { key: number; status: "pending" | "saved" | "discarded"; savedId?: string; error?: string };

const FIELDS: { key: keyof DraftCard; label: string; rows: number }[] = [
  { key: "short", label: "In a few words", rows: 1 },
  { key: "plain", label: "Plain English", rows: 3 },
  { key: "customerLine", label: "Customer line", rows: 2 },
  { key: "technical", label: "Under the hood", rows: 3 },
];

/** Just the card fields, without the review bookkeeping. */
function toCard(d: Draft): DraftCard {
  const { term, short, aka, track, topic, plain, technical, customerLine, followUp, misconception, sourceQuote } = d;
  return { term, short, aka, track, topic, plain, technical, customerLine, followUp, misconception, sourceQuote };
}

export function NotesToCards({ courses, topics }: { courses: string[]; topics: string[] }) {
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState(courses[0]);
  const [body, setBody] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function extract() {
    setError(null);
    startTransition(async () => {
      const result = await extractFromNotes({ title, course, body });
      if (result.noteId) setNoteId(result.noteId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDrafts(result.drafts.map((d, i) => ({ ...d, key: i, status: "pending" })));
      setBody("");
      setTitle("");
    });
  }

  function update(key: number, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function save(d: Draft) {
    if (noteId === null) return;
    startTransition(async () => {
      const result = await approveCard(toCard(d), noteId);
      if (result.ok) update(d.key, { status: "saved", savedId: result.id, error: undefined });
      else update(d.key, { error: result.error });
    });
  }

  const open = drafts.filter((d) => d.status === "pending");

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Module 3: Embeddings"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Course</span>
            <select value={course} onChange={(e) => setCourse(e.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base">
              {courses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Notes</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            maxLength={MAX_NOTES_CHARS}
            placeholder="Paste your notes or a transcript excerpt here"
            className="mt-1 w-full rounded-xl border bg-background p-3 text-base"
          />
        </label>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{body.length.toLocaleString()} / {MAX_NOTES_CHARS.toLocaleString()} characters</span>
        </div>
        <button
          onClick={extract}
          disabled={pending || body.trim().length < 200}
          className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {pending && drafts.length === 0 ? "Reading your notes..." : "Draft cards from these notes"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </section>

      {drafts.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">
            Drafts {open.length > 0 ? `(${open.length} to review)` : "(all reviewed)"}
          </h2>
          <p className="text-sm text-muted">
            Check each one against your notes before saving. Claude can get things wrong, and a wrong card teaches you the
            wrong thing.
          </p>
          {drafts.map((d) =>
            d.status === "discarded" ? null : d.status === "saved" ? (
              <p key={d.key} className="rounded-xl border p-3 text-sm">
                Saved <span className="font-medium">{d.term}</span>.{" "}
                <Link href={`/terms/${d.savedId}`} className="text-accent underline-offset-4 hover:underline">
                  View card
                </Link>
              </p>
            ) : (
              <article key={d.key} className="space-y-3 rounded-2xl border bg-surface p-4">
                <label className="block text-sm">
                  <span className="font-medium">Term</span>
                  <input value={d.term} onChange={(e) => update(d.key, { term: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base font-medium" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium">Track</span>
                    <select
                      value={d.track}
                      onChange={(e) => update(d.key, { track: e.target.value as Draft["track"] })}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base"
                    >
                      <option value="fundamentals">AI fundamentals</option>
                      <option value="sales-cs">AI in sales and CS</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Topic</span>
                    <input
                      list={`topics-${d.key}`}
                      value={d.topic}
                      onChange={(e) => update(d.key, { topic: e.target.value })}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base"
                    />
                    <datalist id={`topics-${d.key}`}>
                      {topics.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </label>
                </div>
                {FIELDS.map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="font-medium">{f.label}</span>
                    <textarea
                      value={d[f.key] as string}
                      rows={f.rows}
                      onChange={(e) => update(d.key, { [f.key]: e.target.value } as Partial<Draft>)}
                      className="mt-1 w-full rounded-lg border bg-background p-2 text-base"
                    />
                  </label>
                ))}
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Follow-up and myth</summary>
                  <div className="mt-2 space-y-2">
                    <input value={d.followUp.q} onChange={(e) => update(d.key, { followUp: { ...d.followUp, q: e.target.value } })} aria-label="Follow-up question" className="w-full rounded-lg border bg-background px-3 py-2 text-base" />
                    <textarea value={d.followUp.a} rows={2} onChange={(e) => update(d.key, { followUp: { ...d.followUp, a: e.target.value } })} aria-label="Follow-up answer" className="w-full rounded-lg border bg-background p-2 text-base" />
                    <input value={d.misconception.claim} onChange={(e) => update(d.key, { misconception: { ...d.misconception, claim: e.target.value } })} aria-label="Myth" className="w-full rounded-lg border bg-background px-3 py-2 text-base" />
                    <textarea value={d.misconception.truth} rows={2} onChange={(e) => update(d.key, { misconception: { ...d.misconception, truth: e.target.value } })} aria-label="Fact" className="w-full rounded-lg border bg-background p-2 text-base" />
                  </div>
                </details>
                {d.sourceQuote && (
                  <blockquote className="border-l-2 pl-3 text-sm text-muted">From your notes: &ldquo;{d.sourceQuote}&rdquo;</blockquote>
                )}
                {d.error && <p role="alert" className="text-sm text-bad">{d.error}</p>}
                <div className="flex gap-2">
                  <button onClick={() => save(d)} disabled={pending} className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-50">
                    Save card
                  </button>
                  <button onClick={() => update(d.key, { status: "discarded" })} className="rounded-lg border px-4 py-2.5 font-medium">
                    Discard
                  </button>
                </div>
              </article>
            ),
          )}
        </section>
      )}
    </div>
  );
}
