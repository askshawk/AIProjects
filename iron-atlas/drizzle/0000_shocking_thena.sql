-- pgvector must exist before any vector(384) column is created. Neon ships
-- the extension but does not enable it per-database.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."equipment" AS ENUM('barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight', 'band', 'kettlebell', 'other');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."goal" AS ENUM('hypertrophy', 'strength', 'powerbuilding', 'fat_loss', 'athletic', 'general_fitness');--> statement-breakpoint
CREATE TYPE "public"."intensity_type" AS ENUM('rpe', 'rir', 'percent_1rm', 'weight', 'bodyweight', 'none');--> statement-breakpoint
CREATE TYPE "public"."movement_pattern" AS ENUM('horizontal_push', 'vertical_push', 'squat', 'hinge', 'lunge', 'horizontal_pull', 'vertical_pull', 'carry', 'core', 'isolation');--> statement-breakpoint
CREATE TYPE "public"."muscle" AS ENUM('chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'lower_back', 'traps', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'obliques', 'adductors', 'abductors', 'neck', 'full_body');--> statement-breakpoint
CREATE TYPE "public"."progression_scheme" AS ENUM('linear', 'double_progression', 'wave_531', 'rpe_autoregulated', 'percentage_block', 'none');--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"movement_pattern" "movement_pattern" NOT NULL,
	"primary_muscle" "muscle" NOT NULL,
	"secondary_muscles" "muscle"[] DEFAULT '{}' NOT NULL,
	"equipment" "equipment" NOT NULL,
	"is_unilateral" boolean DEFAULT false NOT NULL,
	"is_compound" boolean DEFAULT false NOT NULL,
	"is_explosive" boolean DEFAULT false NOT NULL,
	"notes" text,
	"embedding" vector(384),
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "program_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_id" integer NOT NULL,
	"day_index" integer NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	CONSTRAINT "program_days_unique" UNIQUE("week_id","day_index")
);
--> statement-breakpoint
CREATE TABLE "program_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"order" integer NOT NULL,
	"sets" integer NOT NULL,
	"reps" text NOT NULL,
	"intensity_type" "intensity_type" DEFAULT 'none' NOT NULL,
	"intensity_value" text,
	"tempo" text,
	"rest_seconds" integer,
	"notes" text,
	"superset_group" text
);
--> statement-breakpoint
CREATE TABLE "program_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"label" text,
	"notes" text,
	"repeat_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "program_weeks_unique" UNIQUE("program_id","week_number")
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"author_name" text NOT NULL,
	"source_urls" text[] DEFAULT '{}' NOT NULL,
	"summary" text NOT NULL,
	"description" text,
	"goal" "goal" NOT NULL,
	"experience_level" "experience_level" NOT NULL,
	"days_per_week" integer NOT NULL,
	"weeks" integer NOT NULL,
	"split_type" text NOT NULL,
	"progression" "progression_scheme" DEFAULT 'none' NOT NULL,
	"equipment_required" "equipment"[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"ai_generated" boolean DEFAULT true NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"generated_model" text,
	"generated_at" timestamp,
	"embedding" vector(384),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"role" text NOT NULL,
	"parts" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"available_equipment" "equipment"[] DEFAULT '{}' NOT NULL,
	"missing_machines" text[] DEFAULT '{}' NOT NULL,
	"banned_exercise_ids" integer[] DEFAULT '{}' NOT NULL,
	"injury_notes" text,
	"goal" "goal",
	"experience_level" "experience_level",
	"days_per_week" integer,
	"session_minutes" integer,
	"preferences" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gym_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"set_index" integer NOT NULL,
	"weight_kg" numeric(7, 2),
	"reps" integer,
	"rpe" numeric(3, 1),
	"is_warmup" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "user_program_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_id" integer NOT NULL,
	"source_day_id" integer,
	"day_index" integer NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	CONSTRAINT "user_program_days_unique" UNIQUE("week_id","day_index")
);
--> statement-breakpoint
CREATE TABLE "user_program_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"source_program_exercise_id" integer,
	"substituted_from_exercise_id" integer,
	"order" integer NOT NULL,
	"sets" integer NOT NULL,
	"reps" text NOT NULL,
	"intensity_type" "intensity_type" DEFAULT 'none' NOT NULL,
	"intensity_value" text,
	"tempo" text,
	"rest_seconds" integer,
	"notes" text,
	"superset_group" text
);
--> statement-breakpoint
CREATE TABLE "user_program_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_program_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"label" text,
	"notes" text,
	"repeat_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_program_weeks_unique" UNIQUE("user_program_id","week_number")
);
--> statement-breakpoint
CREATE TABLE "user_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source_program_id" integer,
	"title" text NOT NULL,
	"author_name" text,
	"notes" text,
	"progression" "progression_scheme" DEFAULT 'none' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"unit_preference" text DEFAULT 'kg' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_program_day_id" integer,
	"calendar_week" integer,
	"performed_at" timestamp DEFAULT now() NOT NULL,
	"duration_minutes" integer,
	"bodyweight_kg" numeric(6, 2),
	"notes" text,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_week_id_program_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."program_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_day_id_program_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."program_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_weeks" ADD CONSTRAINT "program_weeks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_profiles" ADD CONSTRAINT "gym_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_days" ADD CONSTRAINT "user_program_days_week_id_user_program_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."user_program_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_days" ADD CONSTRAINT "user_program_days_source_day_id_program_days_id_fk" FOREIGN KEY ("source_day_id") REFERENCES "public"."program_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_exercises" ADD CONSTRAINT "user_program_exercises_day_id_user_program_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."user_program_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_exercises" ADD CONSTRAINT "user_program_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_exercises" ADD CONSTRAINT "user_program_exercises_source_program_exercise_id_program_exercises_id_fk" FOREIGN KEY ("source_program_exercise_id") REFERENCES "public"."program_exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_exercises" ADD CONSTRAINT "user_program_exercises_substituted_from_exercise_id_exercises_id_fk" FOREIGN KEY ("substituted_from_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_weeks" ADD CONSTRAINT "user_program_weeks_user_program_id_user_programs_id_fk" FOREIGN KEY ("user_program_id") REFERENCES "public"."user_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_source_program_id_programs_id_fk" FOREIGN KEY ("source_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_program_day_id_user_program_days_id_fk" FOREIGN KEY ("user_program_day_id") REFERENCES "public"."user_program_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_pattern_idx" ON "exercises" USING btree ("movement_pattern");--> statement-breakpoint
CREATE INDEX "exercises_primary_muscle_idx" ON "exercises" USING btree ("primary_muscle");--> statement-breakpoint
CREATE INDEX "exercises_equipment_idx" ON "exercises" USING btree ("equipment");--> statement-breakpoint
CREATE INDEX "program_exercises_day_idx" ON "program_exercises" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "programs_goal_idx" ON "programs" USING btree ("goal");--> statement-breakpoint
CREATE INDEX "programs_days_idx" ON "programs" USING btree ("days_per_week");--> statement-breakpoint
CREATE INDEX "programs_level_idx" ON "programs" USING btree ("experience_level");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "set_logs_exercise_idx" ON "set_logs" USING btree ("exercise_id","session_id");--> statement-breakpoint
CREATE INDEX "user_program_exercises_day_idx" ON "user_program_exercises" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_idx" ON "workout_sessions" USING btree ("user_id","performed_at");