CREATE TABLE "goals" (
	"category" text PRIMARY KEY NOT NULL,
	"weekly_minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"planned_minutes" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE INDEX "sessions_started_at_idx" ON "sessions" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_one_active" ON "sessions" USING btree (("ended_at" IS NULL)) WHERE "sessions"."ended_at" IS NULL;