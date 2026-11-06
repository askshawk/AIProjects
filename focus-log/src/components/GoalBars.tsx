import Link from "next/link";
import { CATEGORY_INFO, formatMinutes } from "@/lib/categories";
import type { GoalStatus } from "@/lib/stats";

/**
 * Progress toward each weekly goal. Gaming is a cap, so its bar fills toward
 * the limit and the label says how much room is left (or how far over).
 */
export function GoalBars({ statuses }: { statuses: GoalStatus[] }) {
  if (statuses.length === 0) {
    return (
      <p className="text-sm text-muted">
        No weekly goals yet.{" "}
        <Link href="/settings" className="text-accent underline">
          Set some
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {statuses.map((s) => {
        const info = CATEGORY_INFO[s.category];
        const isCap = !info.focus;
        const left = s.goal - s.minutes;
        const label = isCap
          ? left >= 0
            ? `${formatMinutes(left)} left of ${formatMinutes(s.goal)}`
            : `${formatMinutes(-left)} over ${formatMinutes(s.goal)}`
          : s.onTrack
            ? `Done: ${formatMinutes(s.minutes)} of ${formatMinutes(s.goal)}`
            : `${formatMinutes(s.minutes)} of ${formatMinutes(s.goal)}`;
        return (
          <li key={s.category}>
            <div className="flex justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: info.color }} aria-hidden />
                {info.label} {isCap ? "limit" : "goal"}
              </span>
              <span className={isCap && !s.onTrack ? "text-bad" : s.onTrack && !isCap ? "text-good" : "text-muted"}>{label}</span>
            </div>
            <div
              className="mt-1 h-2.5 overflow-hidden rounded-full bg-grid"
              role="progressbar"
              aria-label={`${info.label} ${isCap ? "limit" : "goal"}`}
              aria-valuemin={0}
              aria-valuemax={s.goal}
              aria-valuenow={Math.round(s.minutes)}
            >
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.progress * 100)}%`, background: info.color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
