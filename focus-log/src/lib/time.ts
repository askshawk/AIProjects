/**
 * Calendar days and weeks in your own time zone.
 *
 * Servers run in UTC, so "today" on Vercel flips at 4 or 5pm Pacific. Streaks
 * and the weekly quota would feel broken if they did that, so every day and
 * week boundary goes through APP_TIMEZONE instead.
 */

export const DEFAULT_TIMEZONE = "America/Los_Angeles";

export function appTimeZone(): string {
  const tz = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** "YYYY-MM-DD" for the calendar day `date` falls on in `tz`. */
export function dayKey(date: Date, tz = appTimeZone()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
}

/** Minutes the zone is ahead of UTC at `date` (negative for the Americas). */
function offsetMinutes(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** The instant local midnight begins for a "YYYY-MM-DD" day in `tz`. */
export function startOfDay(key: string, tz = appTimeZone()): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Correct by the offset at the guess, then once more in case midnight sits
  // on the other side of a daylight-saving change.
  let instant = guess - offsetMinutes(new Date(guess), tz) * 60000;
  instant = guess - offsetMinutes(new Date(instant), tz) * 60000;
  return new Date(instant);
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week containing the day (weeks run Monday to Sunday, like a sales week). */
export function weekStartKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((weekday + 6) % 7));
}
