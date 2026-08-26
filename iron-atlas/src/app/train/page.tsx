import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { setLogs, workoutSessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { activeProgram } from "@/lib/fork";
import {
  lastPerformances,
  personalBests,
  prescriptionFor,
  programDaysFor,
} from "@/lib/logbook";
import { LogWorkout } from "@/components/LogWorkout";
import {
  isLowerBodyMuscle,
  suggestNext,
  type ProgressionScheme,
  type Suggestion,
} from "@/lib/progression";

export const metadata = { title: "Train · Iron Atlas" };

async function logSession(formData: FormData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) redirect("/account");

  const dayId = Number(formData.get("dayId"));
  if (!Number.isInteger(dayId)) redirect("/train");

  // Parse the flat form into sets. Field names carry their own identity
  // (w-<prescriptionId>-<setIndex>) so the shape survives a form POST.
  type Parsed = {
    exerciseId: number;
    setIndex: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
  };
  const parsed: Parsed[] = [];

  for (const [key, raw] of formData.entries()) {
    const match = /^w-(\d+)-(\d+)$/.exec(key);
    if (!match) continue;

    const [, peId, idx] = match;
    const exerciseId = Number(formData.get(`x-${peId}-${idx}`));
    const num = (v: FormDataEntryValue | null) => {
      const n = Number(String(v ?? "").trim());
      return String(v ?? "").trim() === "" || Number.isNaN(n) ? null : n;
    };

    const weight = num(raw);
    const reps = num(formData.get(`r-${peId}-${idx}`));

    // An untouched row is not a set that happened.
    if (weight === null && reps === null) continue;

    parsed.push({
      exerciseId,
      setIndex: Number(idx),
      weight,
      reps,
      rpe: num(formData.get(`e-${peId}-${idx}`)),
    });
  }

  if (parsed.length === 0) redirect("/train?empty=1");

  await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        userId: user.id,
        userProgramDayId: dayId,
        notes: String(formData.get("notes") ?? "") || null,
        completedAt: new Date(),
      })
      .returning({ id: workoutSessions.id });

    await tx.insert(setLogs).values(
      parsed.map((p) => ({
        sessionId: session.id,
        exerciseId: p.exerciseId,
        setIndex: p.setIndex,
        weightKg: p.weight === null ? null : String(p.weight),
        reps: p.reps,
        rpe: p.rpe === null ? null : String(p.rpe),
      })),
    );
  });

  revalidatePath("/train");
  revalidatePath("/history");
  redirect("/history?logged=1");
}

export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Train</h1>
        <p className="text-sm text-muted">
          You need an account to run a program and log sets.
        </p>
        <Link
          href="/account"
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const program = await activeProgram(user.id);
  if (!program) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Train</h1>
        <p className="text-sm text-muted">
          No active program. Pick one from the library and hit &ldquo;Start this
          program&rdquo; — it gets copied to your account with your gym&apos;s
          swaps baked in.
        </p>
        <Link
          href="/programs"
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          Browse programs
        </Link>
      </div>
    );
  }

  const days = await programDaysFor(program.id);
  if (days.length === 0) {
    return (
      <p className="text-sm text-muted">This program has no training days.</p>
    );
  }

  // Which day to show: the requested one, else the one after whatever was
  // logged last, else the start of the block.
  const requested = Number(
    Array.isArray(params.day) ? params.day[0] : params.day,
  );
  const [lastLogged] = await db
    .select({ dayId: workoutSessions.userProgramDayId })
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, user.id))
    .orderBy(desc(workoutSessions.performedAt))
    .limit(1);

  let index = days.findIndex((d) => d.dayId === requested);
  if (index === -1) {
    const lastIndex = days.findIndex((d) => d.dayId === lastLogged?.dayId);
    index = lastIndex === -1 ? 0 : (lastIndex + 1) % days.length;
  }
  const day = days[index];

  // Only this week's days are shown; the arrows jump to the same slot in the
  // adjacent week so stepping through a block stays one tap.
  const weekDays = days.filter((d) => d.weekNumber === day.weekNumber);
  const slot = weekDays.findIndex((d) => d.dayId === day.dayId);
  const dayInWeek = (weekNumber: number) => {
    const candidates = days.filter((d) => d.weekNumber === weekNumber);
    return candidates[Math.min(slot, candidates.length - 1)] ?? null;
  };
  const prevWeekDay = dayInWeek(day.weekNumber - 1);
  const nextWeekDay = dayInWeek(day.weekNumber + 1);

  const prescription = await prescriptionFor(day.dayId);
  const exerciseIds = [...new Set(prescription.map((p) => p.exerciseId))];
  const [last, bests] = await Promise.all([
    lastPerformances(user.id, exerciseIds),
    personalBests(user.id, exerciseIds),
  ]);

  // What to put on the bar, derived from the program's own scheme plus what
  // was actually logged. Null where the history can't support a number.
  const suggestions: Record<number, Suggestion> = {};
  for (const p of prescription) {
    const suggestion = suggestNext(
      program.progression as ProgressionScheme,
      {
        sets: p.sets,
        reps: p.reps,
        intensityType: p.intensityType,
        intensityValue: p.intensityValue,
        isCompound: p.isCompound,
        isLowerBody: isLowerBodyMuscle(p.primaryMuscle),
      },
      last.get(p.exerciseId)?.sets,
      bests.get(p.exerciseId)?.e1rm ?? null,
    );
    if (suggestion) suggestions[p.id] = suggestion;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">{program.title}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{day.dayName}</h1>
        <p className="mt-1 text-sm text-muted">
          {day.weekLabel ?? `Week ${day.weekNumber}`}
          {day.dayNotes && ` · ${day.dayNotes}`}
        </p>
      </div>

      {/* A 4-week block is 16 days. Listing them flat buried the actual
          workout below a wall of buttons on a phone, so show the current
          week's days and let the lifter step between weeks. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          {prevWeekDay ? (
            <Link
              href={`/train?day=${prevWeekDay.dayId}`}
              className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted hover:text-foreground"
            >
              ← Week {prevWeekDay.weekNumber}
            </Link>
          ) : (
            <span className="shrink-0" />
          )}
          <span className="truncate text-xs text-muted">
            {day.weekLabel ?? `Week ${day.weekNumber}`}
          </span>
          {nextWeekDay ? (
            <Link
              href={`/train?day=${nextWeekDay.dayId}`}
              className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted hover:text-foreground"
            >
              Week {nextWeekDay.weekNumber} →
            </Link>
          ) : (
            <span className="shrink-0" />
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weekDays.map((d) => (
            <Link
              key={d.dayId}
              href={`/train?day=${d.dayId}`}
              className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs ${
                d.dayId === day.dayId
                  ? "border-accent bg-accent-soft/30 text-foreground"
                  : "text-muted"
              }`}
            >
              {d.dayName}
            </Link>
          ))}
        </div>
      </div>

      {params.empty && (
        <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-300">
          Nothing was logged — fill in at least one set before finishing.
        </p>
      )}

      <LogWorkout
        dayId={day.dayId}
        dayName={day.dayName}
        exercises={prescription}
        lastPerformances={Object.fromEntries(last)}
        personalBests={Object.fromEntries(bests)}
        suggestions={suggestions}
        action={logSession}
      />
    </div>
  );
}
