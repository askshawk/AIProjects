import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  programDays,
  programExercises,
  programWeeks,
  programs,
} from "@/db/schema";
import { Pill, ProvenanceBadge } from "@/components/ProgramBadges";

const label = (v: string) => v.replace(/_/g, " ");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [program] = await db
    .select({ title: programs.title, summary: programs.summary })
    .from(programs)
    .where(eq(programs.slug, slug));
  if (!program) return { title: "Not found · Iron Atlas" };
  return { title: `${program.title} · Iron Atlas`, description: program.summary };
}

/** "3 sets × 8-12 @ RPE 8" — how a prescription reads on paper. */
function prescription(row: {
  sets: number;
  reps: string;
  intensityType: string;
  intensityValue: string | null;
}) {
  const base = `${row.sets} × ${row.reps}`;
  if (!row.intensityValue || row.intensityType === "none") return base;
  const suffix =
    row.intensityType === "percent_1rm"
      ? `${row.intensityValue}% 1RM`
      : row.intensityType === "weight"
        ? `${row.intensityValue} kg`
        : `${row.intensityType.toUpperCase()} ${row.intensityValue}`;
  return `${base} @ ${suffix}`;
}

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Explicit columns: `select *` would drag the 384-float embedding into the
  // render payload, and nothing on this page uses it.
  const [program] = await db
    .select({
      id: programs.id,
      title: programs.title,
      authorName: programs.authorName,
      summary: programs.summary,
      description: programs.description,
      goal: programs.goal,
      experienceLevel: programs.experienceLevel,
      daysPerWeek: programs.daysPerWeek,
      weeks: programs.weeks,
      splitType: programs.splitType,
      progression: programs.progression,
      equipmentRequired: programs.equipmentRequired,
      sourceUrls: programs.sourceUrls,
      aiGenerated: programs.aiGenerated,
      verified: programs.verified,
    })
    .from(programs)
    .where(eq(programs.slug, slug));
  if (!program) notFound();

  // One query for the whole block; grouped in memory rather than N+1 per day.
  const rows = await db
    .select({
      weekId: programWeeks.id,
      weekNumber: programWeeks.weekNumber,
      weekLabel: programWeeks.label,
      weekNotes: programWeeks.notes,
      repeatCount: programWeeks.repeatCount,
      dayId: programDays.id,
      dayIndex: programDays.dayIndex,
      dayName: programDays.name,
      dayNotes: programDays.notes,
      order: programExercises.order,
      sets: programExercises.sets,
      reps: programExercises.reps,
      intensityType: programExercises.intensityType,
      intensityValue: programExercises.intensityValue,
      restSeconds: programExercises.restSeconds,
      tempo: programExercises.tempo,
      exNotes: programExercises.notes,
      supersetGroup: programExercises.supersetGroup,
      exerciseName: exercises.name,
      primaryMuscle: exercises.primaryMuscle,
    })
    .from(programWeeks)
    .innerJoin(programDays, eq(programDays.weekId, programWeeks.id))
    .innerJoin(programExercises, eq(programExercises.dayId, programDays.id))
    .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
    .where(eq(programWeeks.programId, program.id))
    .orderBy(
      asc(programWeeks.weekNumber),
      asc(programDays.dayIndex),
      asc(programExercises.order),
    );

  type Row = (typeof rows)[number];
  const weeks = new Map<number, { meta: Row; days: Map<number, { meta: Row; items: Row[] }> }>();
  for (const row of rows) {
    const week = weeks.get(row.weekId) ?? { meta: row, days: new Map() };
    const day = week.days.get(row.dayId) ?? { meta: row, items: [] };
    day.items.push(row);
    week.days.set(row.dayId, day);
    weeks.set(row.weekId, week);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/programs" className="text-sm text-muted hover:text-foreground">
          ← All programs
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{program.title}</h1>
            <p className="text-muted">{program.authorName}</p>
          </div>
          <ProvenanceBadge aiGenerated={program.aiGenerated} verified={program.verified} />
        </div>
        <p className="max-w-2xl text-muted">{program.summary}</p>
        <div className="flex flex-wrap gap-1">
          <Pill>{label(program.goal)}</Pill>
          <Pill>{program.experienceLevel}</Pill>
          <Pill>{program.daysPerWeek} days/week</Pill>
          <Pill>{program.weeks} weeks</Pill>
          <Pill>{program.splitType}</Pill>
          <Pill>{label(program.progression)}</Pill>
          {program.equipmentRequired.map((e) => (
            <Pill key={e}>{label(e)}</Pill>
          ))}
        </div>
      </div>

      {program.aiGenerated && !program.verified && (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-sm">
          <p className="font-medium text-amber-300">Reconstructed, not transcribed</p>
          <p className="mt-1 text-muted">
            This program was rebuilt by an AI from its knowledge of {program.authorName}&apos;s
            work. The structure and intent should be right; specific set and rep numbers may
            not match the published original. Check it against the source before running it.
          </p>
          {program.sourceUrls.length > 0 && (
            <ul className="mt-2 space-y-1">
              {program.sourceUrls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {program.description && (
        <div className="max-w-2xl space-y-3 text-sm leading-relaxed text-muted">
          {program.description.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {[...weeks.values()].map((week) => (
          <section key={week.meta.weekId} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-semibold">
                {week.meta.weekLabel ?? `Week ${week.meta.weekNumber}`}
              </h2>
              {week.meta.repeatCount > 1 && (
                <span className="text-xs text-muted">
                  repeats for {week.meta.repeatCount} weeks
                </span>
              )}
            </div>
            {week.meta.weekNotes && (
              <p className="text-sm text-muted">{week.meta.weekNotes}</p>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              {[...week.days.values()].map((day) => (
                <div key={day.meta.dayId} className="overflow-hidden rounded-lg border bg-surface">
                  <div className="border-b bg-surface-raised px-4 py-2">
                    <h3 className="font-medium">{day.meta.dayName}</h3>
                    {day.meta.dayNotes && (
                      <p className="text-xs text-muted">{day.meta.dayNotes}</p>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {day.items.map((item, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-4 py-2.5 align-top">
                              <div className="flex items-baseline gap-2">
                                {item.supersetGroup && (
                                  <span className="text-[11px] font-semibold text-accent">
                                    {item.supersetGroup}
                                  </span>
                                )}
                                <span>{item.exerciseName}</span>
                              </div>
                              {item.exNotes && (
                                <p className="mt-0.5 text-xs text-muted">{item.exNotes}</p>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right align-top font-mono text-xs">
                              <div>{prescription(item)}</div>
                              {item.restSeconds && (
                                <div className="text-muted">{item.restSeconds}s rest</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
