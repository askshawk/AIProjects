CREATE TABLE "sign_in_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"window" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sign_in_attempts_email_window_unique" UNIQUE("email","window")
);
