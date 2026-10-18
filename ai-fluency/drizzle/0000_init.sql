CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"day" date PRIMARY KEY NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_progress" (
	"term_id" text PRIMARY KEY NOT NULL,
	"repetitions" integer NOT NULL,
	"interval_days" integer NOT NULL,
	"ease" real NOT NULL,
	"lapses" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"explained_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(512) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "explain_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"answer" text NOT NULL,
	"passed" integer NOT NULL,
	"grade" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"variant" text,
	"score" integer NOT NULL,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"course" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"rating" text NOT NULL,
	"mode" text DEFAULT 'flashcards' NOT NULL,
	"interval_days" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roleplay_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"persona" text NOT NULL,
	"topic" text,
	"score" integer NOT NULL,
	"won" integer NOT NULL,
	"scorecard" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"window" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sign_in_attempts_key_window_unique" UNIQUE("key","window")
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"term_id" text,
	"amount" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "xp_events_at_idx" ON "xp_events" USING btree ("at");