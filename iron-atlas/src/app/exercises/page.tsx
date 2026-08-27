import { and, asc, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  equipment as equipmentEnum,
  exercises,
  movementPattern as patternEnum,
  muscle as muscleEnum,
} from "@/db/schema";

export const metadata = { title: "Exercises · Iron Atlas" };

const label = (v: string) => v.replace(/_/g, " ");

function Select({
  name,
  value,
  options,
  placeholder,
}: {
  name: string;
  value?: string;
  options: readonly string[];
  placeholder: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      aria-label={placeholder}
      className="rounded-md border bg-surface px-3 py-2 text-sm capitalize"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o} className="capitalize">
          {label(o)}
        </option>
      ))}
    </select>
  );
}

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) =>
    (Array.isArray(params[k]) ? params[k][0] : params[k]) || undefined;

  const q = one("q");
  const pattern = one("pattern");
  const muscle = one("muscle");
  const equip = one("equipment");

  const filters: SQL[] = [];
  if (q) {
    // Aliases are what people actually type ("db bench"), so search them too.
    filters.push(
      or(
        ilike(exercises.name, `%${q}%`),
        sql`exists (select 1 from unnest(${exercises.aliases}) a where a ilike ${`%${q}%`})`,
      )!,
    );
  }
  if (pattern && patternEnum.enumValues.includes(pattern as never)) {
    filters.push(sql`${exercises.movementPattern} = ${pattern}`);
  }
  if (muscle && muscleEnum.enumValues.includes(muscle as never)) {
    // Match either slot — "show me everything that hits triceps".
    filters.push(
      sql`(${exercises.primaryMuscle} = ${muscle} or ${muscle} = any(${exercises.secondaryMuscles}))`,
    );
  }
  if (equip && equipmentEnum.enumValues.includes(equip as never)) {
    filters.push(sql`${exercises.equipment} = ${equip}`);
  }

  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      movementPattern: exercises.movementPattern,
      primaryMuscle: exercises.primaryMuscle,
      secondaryMuscles: exercises.secondaryMuscles,
      equipment: exercises.equipment,
      isCompound: exercises.isCompound,
      isUnilateral: exercises.isUnilateral,
    })
    .from(exercises)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(exercises.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Exercise catalogue
        </h1>
        <p className="mt-1 text-sm text-muted">
          Every set in every program points at a row here — that&apos;s what
          keeps generated programs from inventing movements, and what powers
          equipment substitutions.
        </p>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name or alias…"
          aria-label="Search exercises by name or alias"
          className="min-w-56 flex-1 rounded-md border bg-surface px-3 py-2 text-sm"
        />
        <Select
          name="pattern"
          value={pattern}
          options={patternEnum.enumValues}
          placeholder="Any pattern"
        />
        <Select
          name="muscle"
          value={muscle}
          options={muscleEnum.enumValues}
          placeholder="Any muscle"
        />
        <Select
          name="equipment"
          value={equip}
          options={equipmentEnum.enumValues}
          placeholder="Any equipment"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
        >
          Filter
        </button>
      </form>

      <p className="text-sm text-muted">
        {rows.length} exercise{rows.length === 1 ? "" : "s"}
      </p>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((e) => (
          <li key={e.id} className="rounded-lg border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium leading-tight">{e.name}</span>
              <span className="shrink-0 rounded bg-surface-raised px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted">
                {label(e.equipment)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted">
              <span className="rounded bg-accent-soft/40 px-1.5 py-0.5 capitalize text-foreground/80">
                {label(e.movementPattern)}
              </span>
              <span className="rounded bg-surface-raised px-1.5 py-0.5 capitalize">
                {label(e.primaryMuscle)}
              </span>
              {e.secondaryMuscles.map((m) => (
                <span
                  key={m}
                  className="rounded bg-surface-raised px-1.5 py-0.5 capitalize opacity-70"
                >
                  {label(m)}
                </span>
              ))}
              {e.isUnilateral && (
                <span className="px-1.5 py-0.5">unilateral</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted">
          Nothing matches those filters.
        </p>
      )}
    </div>
  );
}
