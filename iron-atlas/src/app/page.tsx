import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises, programs } from "@/db/schema";

export default async function Home() {
  const [[{ exerciseCount }], [{ programCount }]] = await Promise.all([
    db.select({ exerciseCount: sql<number>`count(*)::int` }).from(exercises),
    db.select({ programCount: sql<number>`count(*)::int` }).from(programs),
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Train someone else&apos;s program.<br />
          <span className="text-accent">In your gym.</span>
        </h1>
        <p className="max-w-2xl text-muted">
          A library of programs from the coaches worth reading — pick one, swap the movements
          your gym can&apos;t do, and take it with you as a spreadsheet or a logbook.
        </p>
        <div className="flex gap-3">
          <Link
            href="/programs"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            Browse programs
          </Link>
          <Link href="/exercises" className="rounded-md border px-4 py-2 text-sm font-medium">
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
