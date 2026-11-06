import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { CategoryTag } from "@/components/CategoryDot";
import { formatMinutes, isCategory } from "@/lib/categories";
import { recentSessions, todayKeyNow } from "@/lib/data";
import { appTimeZone, dayKey } from "@/lib/time";
import { DeleteSessionButton, LogPastForm } from "./HistoryForms";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

const DAYS_SHOWN = 60;

export default async function HistoryPage() {
  const tz = appTimeZone();
  const today = todayKeyNow();
  const rows = await recentSessions(DAYS_SHOWN);

  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = dayKey(r.startedAt, tz);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <>
      <Nav current="/history" />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <details className="rounded-2xl border bg-surface p-4">
          <summary className="cursor-pointer font-medium">Log a past session</summary>
          <p className="mt-1 text-sm text-muted">Forgot to start the timer? Add it here.</p>
          <LogPastForm today={today} />
        </details>

        {groups.size === 0 && <p className="text-sm text-muted">Nothing logged in the last {DAYS_SHOWN} days yet.</p>}

        {[...groups.entries()].map(([key, list]) => {
          const [y, m, d] = key.split("-").map(Number);
          const heading = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
          return (
            <section key={key}>
              <h2 className="mb-2 text-sm font-medium text-muted">{key === today ? "Today" : heading}</h2>
              <ul className="divide-y rounded-2xl border bg-surface">
                {list.map((s) => {
                  const minutes = (s.endedAt!.getTime() - s.startedAt.getTime()) / 60000;
                  return (
                    <li key={s.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{isCategory(s.category) ? <CategoryTag category={s.category} /> : s.category}</p>
                        <p className="text-xs text-muted tabular-nums">
                          {time(s.startedAt)} to {time(s.endedAt!)} · {formatMinutes(minutes)}
                        </p>
                        {s.note && <p className="mt-1 text-sm break-words">{s.note}</p>}
                      </div>
                      <DeleteSessionButton id={s.id} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <p className="text-center text-sm">
          <a href="/export" className="text-accent underline">
            Download everything as CSV
          </a>
        </p>
      </main>
    </>
  );
}
