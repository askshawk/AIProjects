import { Nav } from "@/components/Nav";
import { GoalBars } from "@/components/GoalBars";
import { TimerPanel, type ActiveSession } from "@/components/TimerPanel";
import { CATEGORIES, CATEGORY_INFO, formatMinutes, isCategory } from "@/lib/categories";
import { dailyTotals, getActiveSession, getGoals, todayKeyNow } from "@/lib/data";
import { emptyTotals, focusMinutes, goalStatus, sumTotals } from "@/lib/stats";
import { weekStartKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const today = todayKeyNow();
  const weekStart = weekStartKey(today);

  const [activeRow, days, goals] = await Promise.all([getActiveSession(), dailyTotals(weekStart, today), getGoals()]);

  const active: ActiveSession | null =
    activeRow && isCategory(activeRow.category)
      ? { id: activeRow.id, category: activeRow.category, plannedMinutes: activeRow.plannedMinutes, startedAt: activeRow.startedAt.toISOString() }
      : null;

  // iOS Shortcut entry point: /?start=deep_work&minutes=120 (minutes optional).
  const startParam = params.start;
  const minutesParam = Number(params.minutes);
  const autoStart = isCategory(startParam)
    ? { category: startParam, minutes: Number.isInteger(minutesParam) && minutesParam > 0 && minutesParam <= 1440 ? minutesParam : null }
    : null;

  const todayTotals = days.get(today) ?? emptyTotals();
  const weekTotals = sumTotals([...days.values()]);

  return (
    <>
      <Nav current="/" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-5">
        <TimerPanel active={active} autoStart={autoStart} />

        <section className="rounded-2xl border bg-surface p-4">
          <h2 className="flex items-baseline justify-between font-medium">
            Today
            <span className="text-sm font-normal text-muted">{formatMinutes(focusMinutes(todayTotals))} focused</span>
          </h2>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            {CATEGORIES.map((c) => (
              <div key={c}>
                <dt className="text-xs text-muted">{CATEGORY_INFO[c].label}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{formatMinutes(todayTotals[c])}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border bg-surface p-4">
          <h2 className="mb-3 font-medium">This week</h2>
          <GoalBars statuses={goalStatus(weekTotals, goals)} />
        </section>
      </main>
    </>
  );
}
