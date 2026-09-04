"use client";

import { useState } from "react";
import Link from "next/link";
import { splitDescription } from "@/lib/exerciseDescription";

/**
 * The form-cue collapsible for the in-gym logger, next to WarmupHint. Someone
 * running a substituted exercise for the first time shouldn't have to leave
 * the page mid-session to find out how it's done.
 */
export function HowToHint({
  exerciseSlug,
  description,
}: {
  exerciseSlug: string;
  description: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!description) return null;

  const { paragraph, cues } = splitDescription(description);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center text-xs text-muted transition-colors hover:text-accent"
      >
        {open ? "Hide how-to" : "How to do this"}
      </button>
      {open && (
        <div className="mt-1 text-xs text-muted">
          <p>{paragraph}</p>
          {cues.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {cues.map((cue, i) => (
                <li key={i}>{cue}</li>
              ))}
            </ul>
          )}
          <Link
            href={`/exercises/${exerciseSlug}`}
            className="mt-1.5 inline-block text-accent hover:underline"
          >
            Full guide →
          </Link>
        </div>
      )}
    </div>
  );
}
