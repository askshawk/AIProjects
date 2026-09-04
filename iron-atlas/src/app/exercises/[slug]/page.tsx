import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { splitDescription } from "@/lib/exerciseDescription";

type Props = { params: Promise<{ slug: string }> };

const label = (v: string) => v.replace(/_/g, " ");

async function loadExercise(slug: string) {
  const [row] = await db
    .select({
      slug: exercises.slug,
      name: exercises.name,
      aliases: exercises.aliases,
      movementPattern: exercises.movementPattern,
      primaryMuscle: exercises.primaryMuscle,
      secondaryMuscles: exercises.secondaryMuscles,
      equipment: exercises.equipment,
      isCompound: exercises.isCompound,
      isUnilateral: exercises.isUnilateral,
      isExplosive: exercises.isExplosive,
      description: exercises.description,
    })
    .from(exercises)
    .where(eq(exercises.slug, slug));
  return row ?? null;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const exercise = await loadExercise(slug);
  if (!exercise) return { title: "Not found" };
  return {
    title: exercise.name,
    description: exercise.description
      ? splitDescription(exercise.description).paragraph
      : `How to perform ${exercise.name} and what good form looks like.`,
  };
}

export default async function ExercisePage({ params }: Props) {
  const { slug } = await params;
  const exercise = await loadExercise(slug);
  if (!exercise) notFound();

  const { paragraph, cues } = exercise.description
    ? splitDescription(exercise.description)
    : { paragraph: null, cues: [] };

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/exercises"
        className="text-sm text-muted hover:text-foreground"
      >
        ← Exercise catalogue
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {exercise.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded bg-accent-soft/40 px-2 py-0.5 capitalize text-foreground/80">
            {label(exercise.movementPattern)}
          </span>
          <span className="rounded bg-surface-raised px-2 py-0.5 uppercase tracking-wide text-muted">
            {label(exercise.equipment)}
          </span>
          <span className="rounded bg-surface-raised px-2 py-0.5 capitalize text-muted">
            {label(exercise.primaryMuscle)}
          </span>
          {exercise.secondaryMuscles.map((m) => (
            <span
              key={m}
              className="rounded bg-surface-raised px-2 py-0.5 capitalize text-muted"
            >
              {label(m)}
            </span>
          ))}
          {exercise.isUnilateral && (
            <span className="rounded bg-surface-raised px-2 py-0.5 text-muted">
              unilateral
            </span>
          )}
          {exercise.isExplosive && (
            <span className="rounded bg-surface-raised px-2 py-0.5 text-muted">
              explosive
            </span>
          )}
        </div>
        {exercise.aliases.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Also known as: {exercise.aliases.join(", ")}
          </p>
        )}
      </div>

      {paragraph ? (
        <div className="rounded-lg border bg-surface p-4 text-sm">
          <p className="text-muted">{paragraph}</p>
          {cues.length > 0 && (
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
              {cues.map((cue, i) => (
                <li key={i}>{cue}</li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted/70">
            General training guidance, not medical advice — check with a
            professional before starting anything new, especially around an
            existing injury.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted">
          No written form guide for this one yet.
        </p>
      )}
    </div>
  );
}
