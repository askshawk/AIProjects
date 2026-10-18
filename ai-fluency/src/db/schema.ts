import { date, index, integer, jsonb, pgTable, real, serial, text, timestamp, unique, vector } from "drizzle-orm/pg-core";
import type { Term } from "@/lib/content";

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
  /**
   * When you last passed Explain It Back for this card. A card only counts as
   * mastered once it has a long interval AND you've explained it in your own
   * words: recognizing an answer isn't the same as being able to say it.
   */
  explainedAt: timestamp("explained_at", { withTimezone: true }),
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

/** Every XP award. Weekly quota, streaks, and history are all sums over this. */
export const xpEvents = pgTable(
  "xp_events",
  {
    id: serial("id").primaryKey(),
    /** review | jargon | myth | deal-desk | explain | roleplay | boss */
    source: text("source").notNull(),
    termId: text("term_id"),
    amount: integer("amount").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("xp_events_at_idx").on(t.at)],
);

/** One row per finished game round, for personal bests and history. */
export const gameScores = pgTable("game_scores", {
  id: serial("id").primaryKey(),
  game: text("game").notNull(),
  /** Which scripted call, persona, or topic the round was about, if any. */
  variant: text("variant"),
  score: integer("score").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** Explain It Back attempts and Claude's grade, so feedback can be revisited. */
export const explainAttempts = pgTable("explain_attempts", {
  id: serial("id").primaryKey(),
  termId: text("term_id").notNull(),
  answer: text("answer").notNull(),
  passed: integer("passed").notNull(),
  grade: jsonb("grade").$type<Record<string, unknown>>().notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** Finished live roleplays (Deal Desk live and boss battles) with their scorecards. */
export const roleplaySessions = pgTable("roleplay_sessions", {
  id: serial("id").primaryKey(),
  /** live | boss */
  mode: text("mode").notNull(),
  persona: text("persona").notNull(),
  /** The boss battle's topic unit, when mode is boss. */
  topic: text("topic"),
  score: integer("score").notNull(),
  won: integer("won").notNull(),
  scorecard: jsonb("scorecard").$type<Record<string, unknown>>().notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Cards you approved from your own course notes. Stored whole as JSON in the
 * same shape as content/terms, so the rest of the app can't tell them apart.
 */
export const customTerms = pgTable("custom_terms", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Term>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Course notes you pasted in. Kept so "Ask my glossary" can search them too. */
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  course: text("course").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Claude usage per day, for the spend caps. Incremented before each call so a
 * request that fails halfway still counts against the cap.
 */
export const aiUsage = pgTable("ai_usage", {
  day: date("day").primaryKey(),
  calls: integer("calls").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
});

export const EMBEDDING_DIM = 512;

/**
 * Search index for "Ask my glossary": one vector per card and per note chunk.
 * content_hash lets the sync skip anything that hasn't changed.
 */
export const embeddings = pgTable("embeddings", {
  /** "term:<id>" or "note:<id>:<chunk>" */
  key: text("key").primaryKey(),
  kind: text("kind").notNull(),
  refId: text("ref_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIM }).notNull(),
});
