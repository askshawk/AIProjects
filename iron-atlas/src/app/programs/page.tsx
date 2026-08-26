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

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => (Array.isArray(params[k]) ? params[k][0] : params[k]) || undefined;

  const q = one("q");
  const goal = one("goal");
  const level = one("level");
  const days = one("days");
  const equipment = one("equipment");

  const filters: SQL[] = [];
  if (q) {
    filters.push(
      or(ilike(programs.title, `%${q}%`), ilike(programs.authorName, `%${q}%`))!,
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
  if (equipment && equipmentEnum.enumValues.includes(equipment as never)) {
    // "I only have dumbbells" means: the program must not need anything else.
    filters.push(sql`${programs.equipmentRequired} <@ array[${equipment}]::equipment[]`);
  }

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
    })
    .from(programs)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(programs.authorName), asc(programs.title));

  // Unfiltered count, so the header describes the library rather than the
  // current search.
  const [{ total }] = await db.select({ total: count() }).from(programs);

  const select =
    "rounded-md border bg-surface px-3 py-2 text-sm capitalize";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Programs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {total} training blocks from named lifters and coaches. Pick one, adapt it to your
          gym, and take it with you — or{" "}
          <Link href="/programs/authors" className="text-accent hover:underline">
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
          className="min-w-56 flex-1 rounded-md border bg-surface px-3 py-2 text-sm"
        />
        <select name="goal" defaultValue={goal ?? ""} className={select}>
          <option value="">Any goal</option>
          {goalEnum.enumValues.map((g) => (
            <option key={g} value={g}>
              {label(g)}
            </option>
          ))}
        </select>
        <select name="level" defaultValue={level ?? ""} className={select}>
          <option value="">Any level</option>
          {levelEnum.enumValues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select name="days" defaultValue={days ?? ""} className={select}>
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
          <code className="text-foreground">npm run generate:program</code> to add one.
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
    </div>
  );
}
