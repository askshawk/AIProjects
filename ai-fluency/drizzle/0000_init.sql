CREATE TABLE "card_progress" (
	"term_id" text PRIMARY KEY NOT NULL,
	"repetitions" integer NOT NULL,
	"interval_days" integer NOT NULL,
	"ease" real NOT NULL,
	"lapses" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "sign_in_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"window" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sign_in_attempts_key_window_unique" UNIQUE("key","window")
);
