import Link from "next/link";
import { and, asc, count, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  equipment as equipmentEnum,
  experienceLevel as levelEnum,
  goal as goalEnum,
  programs,
} from "@/db/schema";
import { ProgramCard } from "@/components/ProgramCard";

export const metadata = { title: "Programs · Iron Atlas" };

const label = (v: string) => v.replace(/_/g, " ");

/** Enough to browse, small enough to send over a phone connection. */
const PER_PAGE = 24;

/** Keeps the active filters when moving between pages. */
function pageHref(
  params: Record<string, string | string[] | undefined>,
  page: number,
) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page") continue;
    const value = Array.isArray(v) ? v[0] : v;
    if (value) next.set(k, value);
  }
  if (page > 1) next.set("page", String(page));
  const qs = next.toString();
  return qs ? `/programs?${qs}` : "/programs";
}

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) =>
    (Array.isArray(params[k]) ? params[k][0] : params[k]) || undefined;

  const q = one("q");
  const page = Math.max(1, Number(one("page") ?? 1) || 1);
  const goal = one("goal");
  const level = one("level");
  const days = one("days");
  const equipment = one("equipment");
  const confidence = one("confidence");

  const filters: SQL[] = [];
  if (q) {
    filters.push(
      or(
        ilike(programs.title, `%${q}%`),
        ilike(programs.authorName, `%${q}%`),
      )!,
    );
  }
  if (goal && goalEnum.enumValues.includes(goal as never)) {
    filters.push(sql`${programs.goal} = ${goal}`);
  }
  if (level && levelEnum.enumValues.includes(level as never)) {
    filters.push(sql`${programs.experienceLevel} = ${level}`);
  }
  if (days && /^\d+$/.test(days)) {
    filters.push(sql`${programs.daysPerWeek} = ${Number(days)}`);
  }
  if (
    confidence &&
    ["documented", "partial", "stylistic"].includes(confidence)
  ) {
    // "Only show me programs the model actually recalled" is a real way to
    // browse a library this size.
    filters.push(sql`${programs.confidence} = ${confidence}`);
  }
  if (equipment && equipmentEnum.enumValues.includes(equipment as never)) {
    // "I only have dumbbells" means: the program must not need anything else.
    filters.push(
      sql`${programs.equipmentRequired} <@ array[${equipment}]::equipment[]`,
    );
  }

  // Paginated: the full library is now large enough that rendering every card
  // was a ~half-megabyte response, which is the wrong thing to send a phone on
  // gym wifi.
  const [{ matching }] = await db
    .select({ matching: count() })
    .from(programs)
    .where(filters.length ? and(...filters) : undefined);

  const lastPage = Math.max(1, Math.ceil(matching / PER_PAGE));
  const current = Math.min(page, lastPage);

  const rows = await db
    .select({
      id: programs.id,
      slug: programs.slug,
      title: programs.title,
      authorName: programs.authorName,
      summary: programs.summary,
      goal: programs.goal,
      experienceLevel: programs.experienceLevel,
      daysPerWeek: programs.daysPerWeek,
      weeks: programs.weeks,
      splitType: programs.splitType,
      tags: programs.tags,
      aiGenerated: programs.aiGenerated,
      verified: programs.verified,
      confidence: programs.confidence,
      firstParty: programs.firstParty,
    })
    .from(programs)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(programs.authorName), asc(programs.title))
    .limit(PER_PAGE)
    .offset((current - 1) * PER_PAGE);

  // Unfiltered count, so the header describes the library rather than the
  // current search.
  const [{ total }] = await db.select({ total: count() }).from(programs);

  const select = "rounded-md border bg-surface px-3 py-2 text-sm capitalize";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Programs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {total} training blocks from named lifters and coaches. Pick one,
          adapt it to your gym, and take it with you — or{" "}
          <Link
            href="/programs/authors"
            className="text-accent hover:underline"
          >
            browse by coach
          </Link>
          .
        </p>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Program or author…"
          aria-label="Search programs by name or author"
          className="min-w-56 flex-1 rounded-md border bg-surface px-3 py-2 text-sm"
        />
        <select name="goal" defaultValue={goal ?? ""} aria-label="Filter by goal" className={select}>
          <option value="">Any goal</option>
          {goalEnum.enumValues.map((g) => (
            <option key={g} value={g}>
              {label(g)}
            </option>
          ))}
        </select>
        <select name="level" defaultValue={level ?? ""} aria-label="Filter by experience level" className={select}>
          <option value="">Any level</option>
          {levelEnum.enumValues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          name="confidence"
          defaultValue={confidence ?? ""}
          aria-label="Filter by reconstruction fidelity"
          className={select}
        >
          <option value="">Any fidelity</option>
          <option value="documented">Reconstructed</option>
          <option value="partial">Partly inferred</option>
          <option value="stylistic">In this style</option>
        </select>
        <select name="days" defaultValue={days ?? ""} aria-label="Filter by days per week" className={select}>
          <option value="">Any schedule</option>
          {[2, 3, 4, 5, 6].map((d) => (
            <option key={d} value={d}>
              {d} days/week
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted">
          No programs match. The library is still being filled — run{" "}
          <code className="text-foreground">npm run generate:program</code> to
          add one.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p) => (
            <li key={p.id}>
              <ProgramCard program={p} />
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm">
          {current > 1 ? (
            <Link
              href={pageHref(params, current - 1)}
              className="rounded-md border px-3 py-2 hover:border-accent/60"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {current} of {lastPage} · {matching} match
            {matching === 1 ? "" : "es"}
          </span>
          {current < lastPage ? (
            <Link
              href={pageHref(params, current + 1)}
              className="rounded-md border px-3 py-2 hover:border-accent/60"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
