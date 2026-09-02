import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises, programs } from "@/db/schema";

// The counts come from the database, so this must not be frozen into the
// build — a prerendered homepage would show whatever the library held the day
// it was deployed.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [[{ exerciseCount }], [{ programCount }]] = await Promise.all([
    db.select({ exerciseCount: sql<number>`count(*)::int` }).from(exercises),
    db.select({ programCount: sql<number>`count(*)::int` }).from(programs),
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Reconstructed training programs.
          <br />
          <span className="text-accent">Built for your gym.</span>
        </h1>
        <p className="max-w-2xl text-muted">
          Iron Atlas reconstructs published training methods from the coaches
          worth reading, then swaps in the movements your gym actually has.
          These are AI-built reconstructions, not the coaches&apos; own
          documents — not affiliated with or endorsed by them. Take a program
          with you as a spreadsheet or a logbook.
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
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-surface p-5">
          <div className="text-3xl font-semibold">{programCount}</div>
          <div className="text-sm text-muted">programs in the library</div>
        </div>
        <div className="rounded-lg border bg-surface p-5">
          <div className="text-3xl font-semibold">{exerciseCount}</div>
          <div className="text-sm text-muted">movements catalogued</div>
        </div>
      </section>
    </div>
  );
}
