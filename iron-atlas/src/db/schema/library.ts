import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  vector,
} from "drizzle-orm/pg-core";
import {
  equipment,
  experienceLevel,
  goal,
  intensityType,
  movementPattern,
  muscle,
  progressionScheme,
} from "./enums";

/** all-MiniLM-L6-v2 runs locally via transformers.js — no embedding API key needed. */
export const EMBEDDING_DIM = 384;

/**
 * The canonical movement catalogue. Every prescribed set in the app points at a
 * row here, which is what stops generated programs from inventing exercises.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    /** "db bench", "flat dumbbell press" — how generation resolves loose names. */
    aliases: text("aliases").array().notNull().default([]),
    movementPattern: movementPattern("movement_pattern").notNull(),
    primaryMuscle: muscle("primary_muscle").notNull(),
    secondaryMuscles: muscle("secondary_muscles").array().notNull().default([]),
    equipment: equipment("equipment").notNull(),
    isUnilateral: boolean("is_unilateral").notNull().default(false),
    isCompound: boolean("is_compound").notNull().default(false),
    notes: text("notes"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
  },
  (t) => [
    index("exercises_pattern_idx").on(t.movementPattern),
    index("exercises_primary_muscle_idx").on(t.primaryMuscle),
    index("exercises_equipment_idx").on(t.equipment),
  ],
);

/**
 * A library program. Immutable: users never train on this row, they train on a
 * fork of it (see userPrograms). Regenerating or correcting one is therefore safe.
 */
export const programs = pgTable(
  "programs",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    authorName: text("author_name").notNull(),
    /** Where the real program lives. Shown next to the AI-reconstructed badge. */
    sourceUrls: text("source_urls").array().notNull().default([]),
    summary: text("summary").notNull(),
    /** Longer prose: philosophy, how to run it, who it's for. */
    description: text("description"),
    goal: goal("goal").notNull(),
    experienceLevel: experienceLevel("experience_level").notNull(),
    daysPerWeek: integer("days_per_week").notNull(),
    /** Total length in weeks. `weeks` rows may be fewer if the block repeats. */
    weeks: integer("weeks").notNull(),
    splitType: text("split_type").notNull(),
    progression: progressionScheme("progression").notNull().default("none"),
    equipmentRequired: equipment("equipment_required").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    /** Reconstructed by an LLM rather than transcribed from the source. */
    aiGenerated: boolean("ai_generated").notNull().default(true),
    /** Flipped by hand once the content has been checked against the source. */
    verified: boolean("verified").notNull().default(false),
    generatedModel: text("generated_model"),
    generatedAt: timestamp("generated_at"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("programs_goal_idx").on(t.goal),
    index("programs_days_idx").on(t.daysPerWeek),
    index("programs_level_idx").on(t.experienceLevel),
  ],
);

/**
 * The week layer exists because 5/3/1-style waves genuinely differ week to week.
 * A program whose weeks are identical stores one row with repeatCount = weeks.
 */
export const programWeeks = pgTable(
  "program_weeks",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    label: text("label"),
    notes: text("notes"),
    /** How many calendar weeks this template week covers. */
    repeatCount: integer("repeat_count").notNull().default(1),
  },
  (t) => [unique("program_weeks_unique").on(t.programId, t.weekNumber)],
);

export const programDays = pgTable(
  "program_days",
  {
    id: serial("id").primaryKey(),
    weekId: integer("week_id")
      .notNull()
      .references(() => programWeeks.id, { onDelete: "cascade" }),
    dayIndex: integer("day_index").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
  },
  (t) => [unique("program_days_unique").on(t.weekId, t.dayIndex)],
);

export const programExercises = pgTable(
  "program_exercises",
  {
    id: serial("id").primaryKey(),
    dayId: integer("day_id")
      .notNull()
      .references(() => programDays.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    order: integer("order").notNull(),
    sets: integer("sets").notNull(),
    /** Free text on purpose: "8-12", "AMRAP", "5/3/1+" are all real prescriptions. */
    reps: text("reps").notNull(),
    intensityType: intensityType("intensity_type").notNull().default("none"),
    intensityValue: text("intensity_value"),
    tempo: text("tempo"),
    restSeconds: integer("rest_seconds"),
    notes: text("notes"),
    /** Same letter = same superset/giant set. */
    supersetGroup: text("superset_group"),
  },
  (t) => [index("program_exercises_day_idx").on(t.dayId)],
);
