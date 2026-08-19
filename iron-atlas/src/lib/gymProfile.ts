import { cookies } from "next/headers";
import { equipment as equipmentEnum } from "@/db/schema";
import { EMPTY_GYM, type Equipment, type GymProfile } from "@/lib/substitute";

/**
 * The gym profile lives in a cookie rather than a user row.
 *
 * Everything that needs it — server components, the export route — runs on the
 * server, so a cookie is readable everywhere without a session, and someone can
 * adapt a program to their gym before ever making an account. When accounts
 * arrive this moves to `gym_profiles` and the cookie becomes the anonymous
 * fallback; nothing downstream of `GymProfile` has to change.
 */

export const GYM_COOKIE = "iron-atlas-gym";

const isEquipment = (v: string): v is Equipment =>
  (equipmentEnum.enumValues as readonly string[]).includes(v);

/** Parses defensively — a hand-edited or stale cookie must not break a page. */
export function parseGymProfile(raw: string | undefined): GymProfile {
  if (!raw) return EMPTY_GYM;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (typeof parsed !== "object" || parsed === null) return EMPTY_GYM;

    const { equipment, bannedExerciseIds } = parsed as Record<string, unknown>;
    return {
      equipment: Array.isArray(equipment)
        ? equipment.filter((e): e is Equipment => typeof e === "string" && isEquipment(e))
        : [],
      bannedExerciseIds: Array.isArray(bannedExerciseIds)
        ? bannedExerciseIds.filter((n): n is number => Number.isInteger(n))
        : [],
    };
  } catch {
    return EMPTY_GYM;
  }
}

export function serializeGymProfile(profile: GymProfile): string {
  return encodeURIComponent(JSON.stringify(profile));
}

/** Reads the caller's gym profile. Returns EMPTY_GYM when unset — see canPerform. */
export async function readGymProfile(): Promise<GymProfile> {
  const store = await cookies();
  return parseGymProfile(store.get(GYM_COOKIE)?.value);
}

export const GYM_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
} as const;
