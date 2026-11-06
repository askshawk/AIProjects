"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSignedIn, signIn, signOut } from "@/lib/auth";
import { CATEGORIES, isCategory } from "@/lib/categories";
import {
  MAX_MINUTES,
  deleteSession,
  discardActiveSession,
  finishSession,
  logPastSession,
  saveGoals,
  startSession,
} from "@/lib/data";
import { appTimeZone, startOfDay } from "@/lib/time";

/*
 * Server actions take untrusted input: every one re-checks the sign-in and
 * validates its arguments instead of trusting the TypeScript types.
 */

export type FormState = { error?: string; ok?: string } | undefined;

const NOTE_MAX = 500;

function wholeMinutes(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_MINUTES ? n : null;
}

const cleanNote = (value: unknown) => String(value ?? "").trim().slice(0, NOTE_MAX);

function refresh() {
  revalidatePath("/", "layout");
}

export async function startAction(category: string, plannedMinutes: number | null) {
  await requireSignedIn();
  if (!isCategory(category)) throw new Error("Unknown category");
  const planned = plannedMinutes === null ? null : wholeMinutes(plannedMinutes);
  if (plannedMinutes !== null && planned === null) throw new Error("Pick a length between 1 minute and 24 hours");
  try {
    await startSession(category, planned);
  } catch {
    // Most likely a session is already running (another tab or device).
    // Reloading shows it, which is the right outcome either way.
  }
  refresh();
}

export async function finishAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireSignedIn();
  const id = Number(form.get("id"));
  const minutes = wholeMinutes(form.get("minutes"));
  if (!Number.isInteger(id)) return { error: "Missing session." };
  if (minutes === null) return { error: "Enter a length between 1 and 1440 minutes." };
  try {
    await finishSession(id, minutes, cleanNote(form.get("note")));
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  return { ok: "Saved." };
}

export async function discardAction(id: number) {
  await requireSignedIn();
  if (!Number.isInteger(id)) throw new Error("Invalid session");
  await discardActiveSession(id);
  refresh();
}

export async function logPastAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireSignedIn();
  const category = form.get("category");
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  const minutes = wholeMinutes(form.get("minutes"));

  if (!isCategory(category)) return { error: "Pick a type." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Enter a date and start time." };
  if (minutes === null) return { error: "Enter a length between 1 and 1440 minutes." };

  const [hh, mm] = time.split(":").map(Number);
  if (hh > 23 || mm > 59) return { error: "That start time isn't valid." };
  const startedAt = new Date(startOfDay(date, appTimeZone()).getTime() + (hh * 60 + mm) * 60000);

  try {
    await logPastSession({ category, startedAt, minutes, note: cleanNote(form.get("note")) });
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  return { ok: "Logged." };
}

export async function deleteAction(id: number) {
  await requireSignedIn();
  if (!Number.isInteger(id)) throw new Error("Invalid session");
  await deleteSession(id);
  refresh();
}

export async function saveGoalsAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireSignedIn();
  const values: Record<string, number> = {};
  for (const c of CATEGORIES) {
    const raw = String(form.get(c) ?? "").trim();
    const hours = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) return { error: "Goals must be between 0 and 168 hours." };
    values[c] = Math.round(hours * 60);
  }
  await saveGoals(values);
  refresh();
  return { ok: "Goals saved." };
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
