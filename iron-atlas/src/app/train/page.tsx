import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  setLogs,
  userProgramDays,
  userProgramWeeks,
  userPrograms,
  workoutSessions,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { activeProgram } from "@/lib/fork";
import {
  lastPerformances,
  personalBests,
  prescriptionFor,
  programDaysFor,
  recentPerformances,
  trainingMaxBasis,
} from "@/lib/logbook";
import { LogWorkout } from "@/components/LogWorkout";
import {
  isLowerBodyMuscle,
  suggestNext,
  type ProgressionScheme,
  type Suggestion,
} from "@/lib/progression";

/** RPE is a 1-10 scale of perceived effort. The client input already
 * constrains this, but a form POST can carry anything — clamp rather than
 * trust it, since an out-of-range value feeds directly into next session's
 * suggested weight via rpeAutoregulated. */
function clampRpe(rpe: number | null): number | null {
  if (rpe === null) return null;
  return Math.min(10, Math.max(1, rpe));
}

/**
 * Bounds a logged load. Negative weights were being stored and echoed back as
 * "repeat -50 kg", and anything at or above 100000 overflows the column's
 * numeric(7,2) and fails the whole session save.
 *
 * A bad value is dropped rather than rejecting the submission: someone
 * standing in a gym who fat-fingers one number should still get the rest of
 * their session saved, and a dropped weight is visibly blank next session
 * whereas a clamped one silently lies.
 */
function cleanWeight(kg: number | null): number | null {
  if (kg === null) return null;
  if (kg <= 0 || kg > 1000) return null;
  return kg;
}

/** Same reasoning as cleanWeight — reps are whole and can't be negative. */
function cleanReps(reps: number | null): number | null {
  if (reps === null) return null;
  if (reps <= 0 || reps > 1000) return null;
  return Math.round(reps);
}

export const metadata = {
  title: "Train",
  description: "Today's session: prescription, last time's numbers, and set logging.",
  robots: { index: false },
};

async function logSession(formData: FormData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) redirect("/account");

  const dayId = Number(formData.get("dayId"));
  if (!Number.isInteger(dayId)) redirect("/train?badDay=1");

  // `dayId` and the per-row `exerciseId`s all arrive from the client, so both
  // have to be proved to belong to *this* lifter's own fork. Without this a
  // crafted POST could write a session against someone else's training day.
  const prescribed = await prescriptionFor(dayId);
  const [ownsDay] = await db
    .select({ id: userProgramDays.id })
    .from(userProgramDays)
    .innerJoin(
      userProgramWeeks,
      eq(userProgramWeeks.id, userProgramDays.weekId),
    )
    .innerJoin(
      userPrograms,
      eq(userPrograms.id, userProgramWeeks.userProgramId),
    )
    .where(and(eq(userProgramDays.id, dayId), eq(userPrograms.userId, user.id)));
  if (!ownsDay) redirect("/train?badDay=1");

  // Only exercises this day actually prescribes — closes the same hole for
  // the hidden exerciseId field, which would otherwise accept any row in the
  // catalogue (or trip a foreign-key error and fail the whole save).
  const allowedExerciseIds = new Set(prescribed.map((p) => p.exerciseId));

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

    // Only rows the lifter explicitly marked done. This used to infer it from
    // "does the row have any values?", but LogWorkout prefills every row with
    // the suggested weight, so that condition was always true and one tap on
    // Finish logged the entire prescription — including sets never performed,
    // which then fed the training-max maths.
    if (formData.get(`d-${peId}-${idx}`) !== "1") continue;

    const exerciseId = Number(formData.get(`x-${peId}-${idx}`));
    if (!allowedExerciseIds.has(exerciseId)) continue;

    const num = (v: FormDataEntryValue | null) => {
      const n = Number(String(v ?? "").trim());
      return String(v ?? "").trim() === "" || Number.isNaN(n) ? null : n;
    };

    const weight = cleanWeight(num(raw));
    const reps = cleanReps(num(formData.get(`r-${peId}-${idx}`)));

    // A row marked done but left blank still isn't a set that happened.
    if (weight === null && reps === null) continue;

    parsed.push({
      exerciseId,
      setIndex: Number(idx),
      weight,
      reps,
      rpe: clampRpe(num(formData.get(`e-${peId}-${idx}`))),
    });
  }

  if (parsed.length === 0) redirect("/train?empty=1");

  try {
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
  } catch (err) {
    console.error("logSession failed:", err);
    redirect(`/train?day=${dayId}&saveError=1`);
  }

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
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Train</h1>
        <p className="text-sm text-muted">This program has no training days.</p>
      </div>
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
  const [last, bests, history, tmBasis] = await Promise.all([
    lastPerformances(user.id, exerciseIds),
    personalBests(user.id, exerciseIds),
    // A short window of recent sessions, for stall/deload detection — separate
    // from `last` above, which stays single-session and only drives display.
    recentPerformances(user.id, exerciseIds, 3),
    // The stricter, ≤5-rep basis percentage-based schemes prescribe from —
    // deliberately not `bests`, which stays loose (≤10 reps) for PR display.
    trainingMaxBasis(user.id, exerciseIds),
  ]);

  // What to put on the bar, derived from the program's own scheme plus what
  // was actually logged. Null where the history can't support a number.
  const suggestions: Record<number, Suggestion> = {};
  for (const p of prescription) {
    const basis = tmBasis.get(p.exerciseId);
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
      (history.get(p.exerciseId) ?? []).map((h) => h.sets),
      basis
        ? { current: basis.current.e1rm, previous: basis.previous?.e1rm ?? null }
        : null,
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
              aria-current={d.dayId === day.dayId ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 text-xs ${
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

      {params.saveError && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">
          Your sets weren&apos;t saved — something went wrong. Try Finish
          session again.
        </p>
      )}

      {params.badDay && (
        <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-300">
          That session doesn&apos;t exist anymore — showing today&apos;s instead.
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
