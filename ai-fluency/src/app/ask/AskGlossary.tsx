"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MAX_QUESTION_CHARS } from "@/lib/limits";
import { askGlossary, buildIndex } from "./actions";

type Result = Extract<Awaited<ReturnType<typeof askGlossary>>, { ok: true }>;

const EXAMPLES = [
  "How is RAG different from fine-tuning?",
  "What should I say if a customer asks whether we train on their data?",
  "Explain tokens like I'm a CFO.",
];

export function AskGlossary({ indexed }: { indexed: number }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [asked, setAsked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ask(q = question) {
    if (!q.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await askGlossary(q);
      if (r.ok) {
        setResult(r);
        setAsked(q);
      } else setError(r.error);
    });
  }

  function rebuild() {
    setNotice(null);
    startTransition(async () => {
      const r = await buildIndex();
      setNotice(r.ok ? `Indexed ${r.embedded} item${r.embedded === 1 ? "" : "s"}.` : r.error);
    });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="Ask about any AI term or concept"
          aria-label="Your question"
          className="min-w-0 flex-1 rounded-lg border bg-surface px-3 py-2.5 text-base"
        />
        <button type="submit" disabled={pending || !question.trim()} className="rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-50">
          Ask
        </button>
      </form>

      {!result && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setQuestion(ex);
                ask(ex);
              }}
              className="rounded-full border px-3 py-1 text-left text-sm text-muted hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {pending && <p className="text-sm text-muted">Searching your cards and notes...</p>}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      {result && !pending && (
        <section className="space-y-3 rounded-2xl border bg-surface p-5" aria-live="polite">
          <p className="text-sm text-muted">{asked}</p>
          <p className="whitespace-pre-wrap leading-relaxed">{result.answer.answer}</p>
          {!result.answer.grounded && (
            <p className="text-sm text-warn">Your cards and notes don&apos;t fully cover this. Consider adding notes on it.</p>
          )}
          {result.sources.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold">Sources</h2>
              <ol className="mt-1 space-y-1 text-sm">
                {result.sources
                  .filter((s) => result.answer.citations.includes(s.n))
                  .map((s) => (
                    <li key={s.n}>
                      [{s.n}]{" "}
                      <Link href={s.href} className="text-accent underline-offset-4 hover:underline">
                        {s.title}
                      </Link>
                      <span className="text-muted"> · {s.kind === "term" ? "card" : "your notes"}</span>
                    </li>
                  ))}
              </ol>
            </div>
          )}
          {result.answer.followUps.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {result.answer.followUps.map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setQuestion(f);
                    ask(f);
                  }}
                  className="rounded-full border px-3 py-1 text-left text-sm hover:bg-surface-raised"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <details className="text-sm text-muted">
        <summary className="cursor-pointer">Search index: {indexed} items</summary>
        <p className="mt-2">
          The index updates automatically when you save cards or notes, and fully on each deploy. If it looks out of date,
          rebuild it here.
        </p>
        <button onClick={rebuild} disabled={pending} className="mt-2 rounded-lg border px-3 py-1.5 font-medium text-foreground disabled:opacity-50">
          Rebuild index
        </button>
        {notice && <p className="mt-2">{notice}</p>}
      </details>
    </div>
  );
}
