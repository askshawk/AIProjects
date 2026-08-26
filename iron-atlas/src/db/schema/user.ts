import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import {
  equipment,
  experienceLevel,
  goal,
  intensityType,
  progressionScheme,
} from "./enums";
import { exercises, programDays, programExercises, programs } from "./library";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  /** Everything in the app is stored in kg; this only changes what's displayed. */
  unitPreference: text("unit_preference").notNull().default("kg"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
});

/**
 * What the user's gym actually has. Drives both the recommendation filter and
 * the substitution engine — "no hack squat machine" lives in `missingEquipment`.
 */
export const gymProfiles = pgTable("gym_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  availableEquipment: equipment("available_equipment")
    .array()
    .notNull()
    .default([]),
  /** Named machines the gym lacks, e.g. "hack squat", "pec deck". */
  missingMachines: text("missing_machines").array().notNull().default([]),
  /** Exercises to never prescribe (injuries, dislikes). */
  bannedExerciseIds: integer("banned_exercise_ids")
    .array()
    .notNull()
    .default([]),
  injuryNotes: text("injury_notes"),
  goal: goal("goal"),
  experienceLevel: experienceLevel("experience_level"),
  daysPerWeek: integer("days_per_week"),
  sessionMinutes: integer("session_minutes"),
  /** Free-text preferences fed to the recommender's semantic half. */
  preferences: text("preferences"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* --------------------------------------------------------------------------
 * The fork. Templates are immutable; this is the copy the user actually trains
 * on and edits. `sourceProgramId` keeps the ancestry so the UI can show diffs.
 * ----------------------------------------------------------------------- */

export const userPrograms = pgTable("user_programs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceProgramId: integer("source_program_id").references(() => programs.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  authorName: text("author_name"),
  notes: text("notes"),
  progression: progressionScheme("progression").notNull().default("none"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  /** active | paused | completed */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userProgramWeeks = pgTable(
  "user_program_weeks",
  {
    id: serial("id").primaryKey(),
    userProgramId: integer("user_program_id")
      .notNull()
      .references(() => userPrograms.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    label: text("label"),
    notes: text("notes"),
    repeatCount: integer("repeat_count").notNull().default(1),
  },
  (t) => [
    unique("user_program_weeks_unique").on(t.userProgramId, t.weekNumber),
  ],
);

export const userProgramDays = pgTable(
  "user_program_days",
  {
    id: serial("id").primaryKey(),
    weekId: integer("week_id")
      .notNull()
      .references(() => userProgramWeeks.id, { onDelete: "cascade" }),
    sourceDayId: integer("source_day_id").references(() => programDays.id, {
      onDelete: "set null",
    }),
    dayIndex: integer("day_index").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
  },
  (t) => [unique("user_program_days_unique").on(t.weekId, t.dayIndex)],
);

export const userProgramExercises = pgTable(
  "user_program_exercises",
  {
    id: serial("id").primaryKey(),
    dayId: integer("day_id")
      .notNull()
      .references(() => userProgramDays.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    /** The template row this came from — null once the user adds something new. */
    sourceProgramExerciseId: integer("source_program_exercise_id").references(
      () => programExercises.id,
      { onDelete: "set null" },
    ),
    /** The exercise originally prescribed, if this row was substituted. */
    substitutedFromExerciseId: integer(
      "substituted_from_exercise_id",
    ).references(() => exercises.id),
    order: integer("order").notNull(),
    sets: integer("sets").notNull(),
    reps: text("reps").notNull(),
    intensityType: intensityType("intensity_type").notNull().default("none"),
    intensityValue: text("intensity_value"),
    tempo: text("tempo"),
    restSeconds: integer("rest_seconds"),
    notes: text("notes"),
    supersetGroup: text("superset_group"),
  },
  (t) => [index("user_program_exercises_day_idx").on(t.dayId)],
);

/* --------------------------------------------------------------------------
 * Logbook
 * ----------------------------------------------------------------------- */

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userProgramDayId: integer("user_program_day_id").references(
      () => userProgramDays.id,
      { onDelete: "set null" },
    ),
    /** Which calendar week of the block this was, for progression maths. */
    calendarWeek: integer("calendar_week"),
    performedAt: timestamp("performed_at").notNull().defaultNow(),
    durationMinutes: integer("duration_minutes"),
    bodyweightKg: numeric("bodyweight_kg", { precision: 6, scale: 2 }),
    notes: text("notes"),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("workout_sessions_user_idx").on(t.userId, t.performedAt)],
);

export const setLogs = pgTable(
  "set_logs",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    setIndex: integer("set_index").notNull(),
    /** Always kg in the database — converted at the UI boundary. */
    weightKg: numeric("weight_kg", { precision: 7, scale: 2 }),
    reps: integer("reps"),
    rpe: numeric("rpe", { precision: 3, scale: 1 }),
    isWarmup: boolean("is_warmup").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [index("set_logs_exercise_idx").on(t.exerciseId, t.sessionId)],
);

/* --------------------------------------------------------------------------
 * Chat
 * ----------------------------------------------------------------------- */

export const chatThreads = pgTable("chat_threads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    /** AI SDK UIMessage parts, stored verbatim so tool calls survive a reload. */
    parts: text("parts").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("chat_messages_thread_idx").on(t.threadId, t.createdAt)],
);
