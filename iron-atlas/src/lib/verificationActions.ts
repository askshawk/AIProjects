"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programExercises, programs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

/**
 * Mutations only. Everything exported from a "use server" module becomes a
 * callable POST endpoint, so the read-only review queries deliberately live in
 * verification.ts instead — there is no reason to expose them as actions.
 */

/**
 * Only an admin can verify or correct library data. This gates the library's
 * strongest trust claim — the "source-checked" badge — and edits shared data
 * every user's forks descend from, so "signed in" isn't enough: anyone could
 * create an account and flip it. `isAdmin` already exists on `CurrentUser`
 * and is used the same way by the coach chat's budget exemption.
 */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("sign in to review programs");
  if (!user.isAdmin) throw new Error("admin access required");
  return user;
}

/**
 * Flips the badge. `verified` and `aiGenerated` are independent: a program can
 * be both AI-reconstructed and human-checked, which is exactly the state we
 * want most of the library to reach.
 */
export async function setVerified(slug: string, verified: boolean) {
  await requireUser();
  await db.update(programs).set({ verified }).where(eq(programs.slug, slug));
  revalidatePath(`/programs/${slug}`);
  revalidatePath("/programs/review");
  revalidatePath("/programs");
}

/**
 * Corrects one prescription in place. This edits *library* data, which the
 * rest of the app treats as immutable — that's deliberate here, since fixing a
 * wrong reconstruction is the whole point. Existing user forks keep their own
 * copies and are untouched, so nobody's in-progress block shifts under them.
 */
export async function correctPrescription(
  prescriptionId: number,
  patch: { sets?: number; reps?: string; notes?: string | null },
) {
  await requireUser();

  const clean: Record<string, unknown> = {};
  if (patch.sets != null && Number.isFinite(patch.sets) && patch.sets > 0) {
    clean.sets = Math.floor(patch.sets);
  }
  if (patch.reps?.trim()) clean.reps = patch.reps.trim();
  if (patch.notes !== undefined) clean.notes = patch.notes?.trim() || null;
  if (Object.keys(clean).length === 0) return;

  await db
    .update(programExercises)
    .set(clean)
    .where(eq(programExercises.id, prescriptionId));
}
