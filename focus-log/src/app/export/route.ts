import { isSignedIn } from "@/lib/auth";
import { CATEGORY_INFO, isCategory } from "@/lib/categories";
import { allFinishedSessions } from "@/lib/data";
import { appTimeZone, dayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Wrap a value for CSV: quote it and double any quotes inside. A note that
 * starts with = + - or @ gets a leading apostrophe so a spreadsheet shows it
 * as text instead of running it as a formula.
 */
const cell = (value: string | number) => {
  const text = typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

/**
 * Every finished session as a CSV you can open in Numbers, Excel or Sheets,
 * or paste into Claude for a review. Your data, in a format you own.
 */
export async function GET() {
  if (!(await isSignedIn())) return new Response("Sign in first.", { status: 401 });

  const tz = appTimeZone();
  const localTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const rows = await allFinishedSessions();

  const lines = [
    ["date", "category", "start", "end", "minutes", "note", "started_at_utc", "ended_at_utc"].join(","),
    ...rows.map((s) =>
      [
        dayKey(s.startedAt, tz),
        isCategory(s.category) ? CATEGORY_INFO[s.category].label : s.category,
        localTime(s.startedAt),
        localTime(s.endedAt!),
        Math.round((s.endedAt!.getTime() - s.startedAt.getTime()) / 60000),
        s.note,
        s.startedAt.toISOString(),
        s.endedAt!.toISOString(),
      ]
        .map(cell)
        .join(","),
    ),
  ];

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="focus-log-${dayKey(new Date(), tz)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
