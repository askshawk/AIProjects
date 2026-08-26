import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  setLogs,
  userProgramDays,
  workoutSessions,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { countsTowardE1rm, epley } from "@/lib/e1rm";
import { E1rmTrend } from "@/components/E1rmTrend";

export const metadata = { title: "History · Iron Atlas" };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted">
          Sign in to see your logged sessions.
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

  const rows = await db
    .select({
      sessionId: workoutSessions.id,
      performedAt: workoutSessions.performedAt,
      notes: workoutSessions.notes,
      dayName: userProgramDays.name,
      exerciseId: setLogs.exerciseId,
      exerciseName: exercises.name,
      setIndex: setLogs.setIndex,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rpe: setLogs.rpe,
    })
    .from(workoutSessions)
    .innerJoin(setLogs, eq(setLogs.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
    .leftJoin(
      userProgramDays,
      eq(userProgramDays.id, workoutSessions.userProgramDayId),
    )
    .where(eq(workoutSessions.userId, user.id))
    .orderBy(desc(workoutSessions.performedAt), sql`${setLogs.setIndex} asc`);

  if (rows.length === 0) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted">
          Nothing logged yet. Finish a session on the{" "}
          <Link
            href="/train"
            className="text-accent underline underline-offset-2"
          >
            train
          </Link>{" "}
          page and it&apos;ll show up here.
        </p>
      </div>
    );
  }

  // Group into sessions, preserving query order (newest first).
  type Row = (typeof rows)[number];
  const sessions = new Map<number, { meta: Row; sets: Row[] }>();
  for (const row of rows) {
    const s = sessions.get(row.sessionId) ?? { meta: row, sets: [] };
    s.sets.push(row);
    sessions.set(row.sessionId, s);
  }

  // e1RM series per exercise, oldest first, for the trend sparklines.
  const series = new Map<string, { at: Date; e1rm: number }[]>();
  for (const row of [...rows].reverse()) {
    const weight = row.weightKg === null ? null : Number(row.weightKg);
    if (!countsTowardE1rm(weight, row.reps)) continue;

    const list = series.get(row.exerciseName) ?? [];
    const e1rm = epley(weight!, row.reps!);
    // One point per session per exercise — the best set of that session.
    const existing = list.find(
      (p) => p.at.getTime() === row.performedAt.getTime(),
    );
    if (existing) existing.e1rm = Math.max(existing.e1rm, e1rm);
    else list.push({ at: row.performedAt, e1rm });
    series.set(row.exerciseName, list);
  }

  const tracked = [...series.entries()]
    .filter(([, points]) => points.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">
          {sessions.size} session{sessions.size === 1 ? "" : "s"} logged.
        </p>
      </div>

      {params.logged && (
        <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm text-emerald-300">
          Session saved.
        </p>
      )}

      {tracked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Estimated 1RM trend</h2>
          <p className="text-sm text-muted">
            Epley estimate from your best working set each session. Sets above{" "}
            {10} reps are excluded — the formula stops being meaningful there.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tracked.map(([name, points]) => (
              <E1rmTrend
                key={name}
                name={name}
                points={points.map((p) => p.e1rm)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sessions</h2>
        <div className="space-y-3">
          {[...sessions.values()].map(({ meta, sets }) => {
            const byExercise = new Map<string, Row[]>();
            for (const s of sets) {
              byExercise.set(s.exerciseName, [
                ...(byExercise.get(s.exerciseName) ?? []),
                s,
              ]);
            }

            return (
              <div
                key={meta.sessionId}
                className="rounded-lg border bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium">{meta.dayName ?? "Session"}</h3>
                  <time className="text-xs text-muted">
                    {meta.performedAt.toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </div>
                {meta.notes && (
                  <p className="mt-1 text-sm text-muted">{meta.notes}</p>
                )}

                <ul className="mt-2 space-y-1 text-sm">
                  {[...byExercise.entries()].map(([name, list]) => (
                    <li key={name} className="flex flex-wrap gap-x-2">
                      <span>{name}</span>
                      <span className="font-mono text-xs text-muted">
                        {list
                          .map(
                            (s) =>
                              `${s.weightKg ?? "—"}×${s.reps ?? "—"}${
                                s.rpe ? `@${s.rpe}` : ""
                              }`,
                          )
                          .join("  ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
