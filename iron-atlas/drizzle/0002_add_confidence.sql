CREATE TYPE "public"."reconstruction_confidence" AS ENUM('documented', 'partial', 'stylistic');--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "confidence" "reconstruction_confidence";--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "confidence_notes" text;