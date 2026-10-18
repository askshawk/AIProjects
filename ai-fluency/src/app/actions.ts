"use server";

import { redirect } from "next/navigation";
import { requireSignedIn, signIn, signOut } from "@/lib/auth";
import { recordRating } from "@/lib/progress";
import { RATINGS, type Rating } from "@/lib/srs";

export async function rateCard(termId: string, rating: Rating) {
  await requireSignedIn();
  // Server actions take untrusted input; don't rely on the TypeScript type.
  if (!RATINGS.includes(rating)) throw new Error("Invalid rating");
  const next = await recordRating(termId, rating);
  return { ...next, dueAt: next.dueAt.toISOString() };
}

/** Only same-site paths, so the `next` parameter can't bounce you to another site. */
function safeNext(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

export async function signInAction(_prev: { error: string } | undefined, form: FormData) {
  const result = await signIn(String(form.get("passcode") ?? ""));
  if (result) return result;
  redirect(safeNext(form.get("next")));
}

export async function signOutAction() {
  await signOut();
  redirect("/sign-in");
}
