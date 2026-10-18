import { integer, pgTable, real, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Only study progress lives in the database. The cards themselves are JSON in
 * content/terms/ and are keyed here by their string id, so editing a card's
 * wording never needs a migration. There's no users table: this is a
 * single-user app behind one passcode.
 */

/** Where each card is in its spaced-repetition schedule. One row per studied card. */
export const cardProgress = pgTable("card_progress", {
  termId: text("term_id").primaryKey(),
  repetitions: integer("repetitions").notNull(),
  intervalDays: integer("interval_days").notNull(),
  ease: real("ease").notNull(),
  lapses: integer("lapses").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every rating ever given. The schedule only needs card_progress, but this
 * history is what the XP, streak, and weak-topics dashboard will be built on.
 */
export const reviewLog = pgTable("review_log", {
  id: serial("id").primaryKey(),
  termId: text("term_id").notNull(),
  rating: text("rating").notNull(),
  /** Which mode produced the rating: flashcards now, games later. */
  mode: text("mode").notNull().default("flashcards"),
  intervalDays: integer("interval_days").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sign-in rate limiting, one row per (client, 15-minute window). Keyed by IP
 * rather than globally, so a stranger hammering the form can't lock the real
 * user out from their own phone (the lesson iron-atlas learned).
 */
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
