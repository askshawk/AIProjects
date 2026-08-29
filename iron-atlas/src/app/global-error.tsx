"use client";

/**
 * Last-resort net. Next.js replaces the whole root layout with this when an
 * error escapes every other boundary, so it needs its own html/body.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#0b0d10] font-sans text-white">
        <div className="max-w-sm space-y-3 px-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-white/60">
            An unexpected error hit before the page could recover on its own.
          </p>
          <div className="flex justify-center gap-3 pt-1">
            <button
              onClick={() => reset()}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Try again
            </button>
            <a
              href="/train"
              className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium"
            >
              Back to Train
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
