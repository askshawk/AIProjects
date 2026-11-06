import { sql } from "drizzle-orm";
import { index, integer, pgTable, serial, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Three tables. There's no users table: this is a single-user app behind one
 * passcode, same as AI Fluency.
 */

/**
 * One row per tracked block of time. A row with no ended_at is the session
 * running right now. Storing the start time on the server (not a ticking
 * counter in the browser) means closing the app or switching phones never
 * loses a running timer.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    /** One of CATEGORIES in src/lib/categories.ts. */
    category: text("category").notNull(),
    /** Countdown length in minutes; null for an open-ended stopwatch. */
    plannedMinutes: integer("planned_minutes"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sessions_started_at_idx").on(t.startedAt),
    // At most one running session. Starting a second one from another tab or
    // device fails in the database instead of quietly double-counting time.
    uniqueIndex("sessions_one_active").on(sql`(${t.endedAt} IS NULL)`).where(sql`${t.endedAt} IS NULL`),
  ],
);

/** Weekly target per category, in minutes. A missing row or 0 means no goal. */
export const goals = pgTable("goals", {
  category: text("category").primaryKey(),
  weeklyMinutes: integer("weekly_minutes").notNull(),
});

/** Sign-in rate limiting (copied from AI Fluency). */
export const signInAttempts = pgTable(
  "sign_in_attempts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    window: timestamp("window", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [unique("sign_in_attempts_key_window_unique").on(t.key, t.window)],
);

export type Session = typeof sessions.$inferSelect;
