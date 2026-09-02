CREATE TABLE "chat_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "chat_usage_user_day_unique" UNIQUE("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "chat_usage" ADD CONSTRAINT "chat_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;