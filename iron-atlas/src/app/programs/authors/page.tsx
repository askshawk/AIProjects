import Link from "next/link";
import { listAuthors } from "@/lib/authors";

export const metadata = { title: "Coaches · Iron Atlas" };

/**
 * The library is organised by who wrote the program as much as by what it
 * trains — several of these coaches have a dozen published blocks each, and
 * "show me everything Meadows wrote" is a real way to browse.
 */
export default async function AuthorsPage() {
  const authors = await listAuthors();
  const total = authors.reduce((n, a) => n + a.programCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coaches</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {total} programs from {authors.length} coaches.{" "}
          <Link href="/programs" className="text-accent hover:underline">
            Browse everything instead
          </Link>
          .
        </p>
        <p className="mt-2 max-w-2xl text-xs text-muted">
          Iron Atlas isn&apos;t affiliated with, endorsed by, or sponsored by
          any coach listed here. Programs are AI reconstructions of published
          training methods, credited by name for reference.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {authors.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/programs/authors/${a.slug}`}
              className="flex h-full items-baseline justify-between gap-3 rounded-lg border bg-surface p-4 transition-colors hover:border-accent/60"
            >
              <span className="font-medium leading-tight">{a.name}</span>
              <span className="shrink-0 font-mono text-xs text-muted">
                {a.programCount}
                {a.verifiedCount > 0 && ` · ${a.verifiedCount}✓`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
