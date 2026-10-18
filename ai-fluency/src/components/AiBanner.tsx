import { aiStatus } from "@/lib/ai";

/** Explains up front when the Claude-powered features can't run, instead of failing on submit. */
export function AiBanner() {
  const status = aiStatus();
  if (status.available) return null;
  return (
    <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
      {status.reason} The games, flashcards, and glossary still work.
    </p>
  );
}
