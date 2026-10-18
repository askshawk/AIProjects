import type { Dashboard } from "@/lib/stats";

/** The headline numbers: streak, weekly quota, and rank. */
export function StatTiles({ d }: { d: Dashboard }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-2xl border bg-surface p-3">
        <p className="text-xs text-muted">Streak</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{d.streak.days}</p>
        <p className="text-xs text-muted">
          {d.streak.days === 1 ? "day" : "days"}
          {d.streak.ptoUsedThisWeek ? " · PTO used" : ""}
        </p>
      </div>
      <div className="rounded-2xl border bg-surface p-3">
        <p className="text-xs text-muted">Quota</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{d.quota.attainment}%</p>
        <p className="text-xs text-muted tabular-nums">
          {d.quota.xp}/{d.quota.target} XP
        </p>
      </div>
      <div className="rounded-2xl border bg-surface p-3">
        <p className="text-xs text-muted">Rank</p>
        <p className="mt-1 text-base font-semibold leading-tight">{d.rank.title}</p>
        <p className="text-xs text-muted">
          {d.rank.next ? `${d.rank.next.needed} to ${d.rank.next.title}` : "Top of the ladder"}
        </p>
      </div>
    </div>
  );
}
