import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Movement pattern is the axis substitutions pivot on: a swap is only safe if it
 * trains the same pattern. Kept deliberately coarse — finer buckets make the
 * substitution engine too strict to find candidates in a small gym.
 */
export const movementPattern = pgEnum("movement_pattern", [
  "horizontal_push",
  "vertical_push",
  "squat",
  "hinge",
  "lunge",
  "horizontal_pull",
  "vertical_pull",
  "carry",
  "core",
  "isolation",
]);

export const equipment = pgEnum("equipment", [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "smith",
  "bodyweight",
  "band",
  "kettlebell",
  "other",
]);

export const muscle = pgEnum("muscle", [
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "lats",
  "upper_back",
  "lower_back",
  "traps",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "obliques",
  "adductors",
  "abductors",
  "neck",
  "full_body",
]);

export const goal = pgEnum("goal", [
  "hypertrophy",
  "strength",
  "powerbuilding",
  "fat_loss",
  "athletic",
  "general_fitness",
]);

export const experienceLevel = pgEnum("experience_level", [
  "beginner",
  "intermediate",
  "advanced",
]);

/** How the program prescribes load for a given exercise. */
export const intensityType = pgEnum("intensity_type", [
  "rpe",
  "rir",
  "percent_1rm",
  "weight",
  "bodyweight",
  "none",
]);

/** Drives the "what should I lift next session?" suggestion in the logbook. */
export const progressionScheme = pgEnum("progression_scheme", [
  "linear",
  "double_progression",
  "wave_531",
  "rpe_autoregulated",
  "percentage_block",
  "none",
]);
