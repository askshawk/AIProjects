import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { Pill, ProvenanceBadge } from "@/components/ProgramBadges";
import { applySwaps, groupByWeek, loadProgram } from "@/lib/programQuery";
import { readGymProfile } from "@/lib/gymProfile";
import { planSwaps } from "@/lib/substitute";
import { SwapNotice } from "@/components/SwapNotice";
import { StartProgram } from "@/components/StartProgram";
import { VerifyToggle } from "@/components/VerifyToggle";
import { authorSlug } from "@/lib/authors";
import { getCurrentUser } from "@/lib/auth";

const label = (v: string) => v.replace(/_/g, " ");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [program] = await db
    .select({ title: programs.title, summary: programs.summary })
    .from(programs)
    .where(eq(programs.slug, slug));
  if (!program) return { title: "Not found · Iron Atlas" };
  return {
    title: `${program.title} · Iron Atlas`,
    description: program.summary,
  };
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

  const loaded = await loadProgram(slug);
  if (!loaded) notFound();

  const { program } = loaded;

  // Adapt to the gym before rendering, and show what changed rather than
  // quietly presenting a different program under the author's name.
  const gym = await readGymProfile();
  const swaps = await planSwaps(loaded.rows, gym);
  const rows = applySwaps(loaded.rows, swaps);
  const weeks = groupByWeek(rows);

  // Only signed-in users can vouch for a reconstruction.
  const user = await getCurrentUser();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href="/programs"
          className="text-sm text-muted hover:text-foreground"
        >
          ← All programs
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {program.title}
            </h1>
            <Link
              href={`/programs/authors/${authorSlug(program.authorName)}`}
              className="text-muted transition-colors hover:text-accent"
            >
              {program.authorName}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ProvenanceBadge
              aiGenerated={program.aiGenerated}
              verified={program.verified}
              confidence={program.confidence}
            />
            {user && (
              <VerifyToggle slug={program.slug} verified={program.verified} />
            )}
          </div>
        </div>
        <p className="max-w-2xl text-muted">{program.summary}</p>

        <div className="flex flex-wrap gap-2">
          <StartProgram slug={program.slug} />
          <a
            href={`/api/programs/${program.slug}/export`}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            Download spreadsheet
          </a>
          <a
            href={`/api/programs/${program.slug}/export?f=csv`}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/60"
          >
            CSV
          </a>
        </div>

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
        <div
          className={`rounded-lg border p-4 text-sm ${
            program.confidence === "stylistic"
              ? "border-orange-900/60 bg-orange-950/20"
              : "border-amber-900/60 bg-amber-950/20"
          }`}
        >
          <p
            className={`font-medium ${
              program.confidence === "stylistic"
                ? "text-orange-300"
                : "text-amber-300"
            }`}
          >
            {program.confidence === "stylistic"
              ? `Written in ${program.authorName}'s style — not their program`
              : program.confidence === "partial"
                ? "Partly inferred"
                : "Reconstructed, not transcribed"}
          </p>
          <p className="mt-1 text-muted">
            {program.confidence === "stylistic"
              ? `The AI knows this program exists and knows ${program.authorName}'s methods, but not this program's actual contents. What follows is a faithful imitation of how they train — treat it as inspired-by, and buy the real thing if you want theirs.`
              : program.confidence === "partial"
                ? `The overall structure is ${program.authorName}'s; some specifics were inferred rather than recalled. Check the details against the source before running it.`
                : program.confidence === "documented"
                  ? `Rebuilt by an AI that reported specific recall of this program's published numbers. The structure and prescriptions should be close to ${program.authorName}'s original, but check them against the source before running it.`
                  : `This program was rebuilt by an AI from its knowledge of ${program.authorName}'s work, and hasn't been graded for how closely it matches the original. The structure and intent should be right; specific set and rep numbers may not. Check it against the source before running it.`}
          </p>
          {program.confidenceNotes && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                What the AI said about its own reconstruction
              </summary>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {program.confidenceNotes}
              </p>
            </details>
          )}
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

      <SwapNotice swaps={[...swaps.values()]} />

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
                <div
                  key={day.meta.dayId}
                  className="overflow-hidden rounded-lg border bg-surface"
                >
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
                                <p className="mt-0.5 text-xs text-muted">
                                  {item.exNotes}
                                </p>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right align-top font-mono text-xs">
                              <div>{prescription(item)}</div>
                              {item.restSeconds && (
                                <div className="text-muted">
                                  {item.restSeconds}s rest
                                </div>
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
