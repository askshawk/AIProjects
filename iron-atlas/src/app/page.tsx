import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises, programs } from "@/db/schema";
import { notAffiliatedWith } from "@/lib/disclosure";

// The counts come from the database, so this must not be frozen into the
// build — a prerendered homepage would show whatever the library held the day
// it was deployed.
export const dynamic = "force-dynamic";

export const metadata = {
  description:
    "A library of lifting programs built on published training methods, fitted to your equipment and logged as you lift.",
};

export default async function Home() {
  const [[{ exerciseCount }], [{ programCount }]] = await Promise.all([
    db.select({ exerciseCount: sql<number>`count(*)::int` }).from(exercises),
    db.select({ programCount: sql<number>`count(*)::int` }).from(programs),
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          The <span className="text-accent">atlas</span> of strength
          training.
        </h1>
        <p className="max-w-2xl text-muted">
          A library of programs built on published training methods, fitted
          to your equipment and logged as you lift.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/coach"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            Find me a program
          </Link>
          <Link
            href="/programs"
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Browse the library
          </Link>
          <Link
            href="/exercises"
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Exercise catalogue
          </Link>
        </div>
        {/* The legal disclosure doesn't need to lead the page — the app
            explains itself first, and this stays true wherever it sits. */}
        <p className="text-xs text-muted">
          These are AI-built reconstructions, not the coaches&apos; own
          documents. {notAffiliatedWith("them")}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-surface p-5">
          <div className="text-3xl font-semibold">{programCount}</div>
          <div className="text-sm text-muted">programs in the library</div>
        </div>
        <div className="rounded-lg border bg-surface p-5">
          <div className="text-3xl font-semibold">{exerciseCount}</div>
          <div className="text-sm text-muted">exercises catalogued</div>
        </div>
      </section>
    </div>
  );
}
