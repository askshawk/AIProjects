CREATE TABLE "chat_budget" (
	"month" text PRIMARY KEY NOT NULL,
	"spent_usd" numeric(12, 4) DEFAULT '0' NOT NULL
);
