import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { DailyChart } from "@/components/DailyChart";
import { GoalBars } from "@/components/GoalBars";
import { formatHours, formatMinutes } from "@/lib/categories";
import { dailyTotals, getGoals, todayKeyNow } from "@/lib/data";
import { emptyTotals, focusMinutes, focusRatio, focusStreak, goalStatus, STREAK_MINUTES, sumTotals } from "@/lib/stats";
import { addDays, weekStartKey } from "@/lib/time";

export const metadata: Metadata = { title: "Week" };
export const dynamic = "force-dynamic";

const TREND_WEEKS = 8;

const fmtDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export default async function WeekPage({ searchParams }: PageProps<"/week">) {
  const { week } = await searchParams;
  const today = todayKeyNow();
  const thisWeek = weekStartKey(today);
  const requested = typeof week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(week) ? weekStartKey(week) : thisWeek;
  const weekStart = requested > thisWeek ? thisWeek : requested;
  const isCurrent = weekStart === thisWeek;

  // One query covers the streak (up to a year back), the trend and the week.
  const historyStart = addDays(thisWeek, -7 * (TREND_WEEKS - 1));
  const from = [addDays(today, -365), historyStart, weekStart].sort()[0];
  const [days, goals] = await Promise.all([dailyTotals(from, today), getGoals()]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((key) => ({ key, totals: days.get(key) ?? emptyTotals() }));
  const totals = sumTotals(weekDays.map((d) => d.totals));
  const ratio = focusRatio(totals);
  const streak = focusStreak(days, today);

  const trend = Array.from({ length: TREND_WEEKS }, (_, i) => addDays(thisWeek, -7 * i)).map((start) => {
    const t = sumTotals(Array.from({ length: 7 }, (_, d) => days.get(addDays(start, d)) ?? emptyTotals()));
    return { start, focus: focusMinutes(t), gaming: t.gaming, ratio: focusRatio(t) };
  });

  return (
    <>
      <Nav current="/week" />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <div className="flex items-center justify-between">
          <Link href={`/week?week=${addDays(weekStart, -7)}`} className="rounded-full border px-3 py-1.5 text-sm" aria-label="Previous week">
            ←
          </Link>
          <h1 className="font-semibold">{isCurrent ? "This week" : `Week of ${fmtDay(weekStart)}`}</h1>
          {isCurrent ? (
            <span className="w-9" />
          ) : (
            <Link href={`/week?week=${addDays(weekStart, 7)}`} className="rounded-full border px-3 py-1.5 text-sm" aria-label="Next week">
              →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Focus" value={`${formatHours(focusMinutes(totals))}h`} sub="Deep Work, Dev, Learning" />
          <Tile label="Gaming" value={`${formatHours(totals.gaming)}h`} sub={isCurrent ? "so far" : "that week"} />
          <Tile label="Focus to gaming" value={ratio === null ? "No gaming" : `${ratio} : 1`} sub="hours focused per hour played" />
          <Tile label="Focus streak" value={`${streak}`} sub={`days with ${STREAK_MINUTES}m+ focus`} />
        </div>

        <section className="rounded-2xl border bg-surface p-4">
          <h2 className="mb-3 font-medium">Goals</h2>
          <GoalBars statuses={goalStatus(totals, goals)} />
        </section>

        <section className="rounded-2xl border bg-surface p-4">
          <DailyChart days={weekDays} />
        </section>

        <section className="rounded-2xl border bg-surface p-4">
          <h2 className="font-medium">Last {TREND_WEEKS} weeks</h2>
          <table className="mt-3 w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="text-muted">
                <th className="font-normal">Week of</th>
                <th className="font-normal">Focus</th>
                <th className="font-normal">Gaming</th>
                <th className="font-normal">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((w) => (
                <tr key={w.start} className={w.start === weekStart ? "font-semibold" : undefined}>
                  <td className="py-1">
                    <Link href={`/week?week=${w.start}`} className="underline decoration-border underline-offset-2">
                      {fmtDay(w.start)}
                    </Link>
                  </td>
                  <td>{formatMinutes(w.focus)}</td>
                  <td>{formatMinutes(w.gaming)}</td>
                  <td>{w.ratio === null ? "n/a" : `${w.ratio} : 1`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}
