-- Switching embedding provider (local MiniLM 384d -> Voyage voyage-4-lite 512d).
--
-- Existing vectors are cleared rather than converted: Postgres cannot widen a
-- vector in place, and vectors from a different model aren't comparable to new
-- ones even if it could. Similarity search returns nothing until the catalogue
-- is re-embedded.
--
-- After applying this, run:  npm run seed:exercises && npm run seed:demo
-- and regenerate any programs (their embeddings are written at generation time).
UPDATE "exercises" SET "embedding" = NULL;--> statement-breakpoint
UPDATE "programs" SET "embedding" = NULL;--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "embedding" SET DATA TYPE vector(512);--> statement-breakpoint
ALTER TABLE "programs" ALTER COLUMN "embedding" SET DATA TYPE vector(512);