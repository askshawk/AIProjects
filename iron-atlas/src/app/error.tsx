"use client";

import Link from "next/link";

/**
 * Catches an error thrown inside any route segment, keeping the root
 * layout (nav, footer) on screen. `global-error.tsx` is the last-resort net
 * for an error that escapes the layout itself — this is the one that
 * actually fires for an ordinary DB hiccup on a normal page.
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-sm space-y-3 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-sm text-muted">
        This page hit an error before it could load. It&apos;s worth trying
        again.
      </p>
      <div className="flex justify-center gap-3 pt-1">
        <button
          onClick={() => reset()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
