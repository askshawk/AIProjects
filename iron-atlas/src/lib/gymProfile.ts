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

/** Mirrors the cap in the gym form — see the filter in parseGymProfile. */
const MAX_BANNED_EXERCISE_IDS = 100;

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
        ? equipment.filter(
            (e): e is Equipment => typeof e === "string" && isEquipment(e),
          )
        : [],
      // Bounded on both count and magnitude, because this comes straight off a
      // user-settable cookie rather than the form. Every banned exercise costs
      // several vector-similarity queries per program render, so an unbounded
      // list turns one unauthenticated export request into hundreds of
      // queries; and `Number.isInteger(1e20)` is true, which would reach an
      // `integer` column and fail the query outright.
      bannedExerciseIds: Array.isArray(bannedExerciseIds)
        ? bannedExerciseIds
            .filter(
              (n): n is number =>
                Number.isInteger(n) && n > 0 && n < 2_147_483_647,
            )
            .slice(0, MAX_BANNED_EXERCISE_IDS)
        : [],
    };
  } catch {
    return EMPTY_GYM;
  }
}

export function serializeGymProfile(profile: GymProfile): string {
  return encodeURIComponent(JSON.stringify(profile));
}

/**
 * A short-lived equipment override for training somewhere that isn't your
 * gym — a hotel, a friend's garage, a commercial gym while travelling.
 *
 * Deliberately a separate cookie rather than an edit to the saved profile.
 * The alternative is what people actually do today: overwrite their real gym,
 * train the week, and then either forget to change it back or lose the
 * original list entirely. This expires on its own, and the saved gym is
 * untouched underneath it.
 */
export const TRAVEL_GYM_COOKIE = "iron-atlas-gym-travel";

/** Long enough for a trip, short enough that a forgotten one lapses. */
export const TRAVEL_GYM_MAX_AGE_SECONDS = 60 * 60 * 24 * 3;

export const TRAVEL_GYM_COOKIE_OPTIONS = {
  path: "/",
  maxAge: TRAVEL_GYM_MAX_AGE_SECONDS,
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;

export type ActiveGym = GymProfile & {
  /** True while a travel override is standing in for the saved gym. */
  isTravel: boolean;
};

/**
 * The gym to actually plan against, and whether it's the temporary one.
 *
 * Callers that only need equipment can keep using `readGymProfile`; anything
 * that shows the lifter what it decided should surface `isTravel`, because an
 * override silently changing prescriptions is exactly the failure this feature
 * is supposed to prevent.
 */
export async function readActiveGym(): Promise<ActiveGym> {
  const store = await cookies();

  const travelRaw = store.get(TRAVEL_GYM_COOKIE)?.value;
  if (travelRaw) {
    const travel = parseGymProfile(travelRaw);
    // An override with no equipment in it isn't an override — fall through
    // rather than pretending the lifter has nothing to train with.
    if (travel.equipment.length > 0) {
      const saved = parseGymProfile(store.get(GYM_COOKIE)?.value);
      return {
        equipment: travel.equipment,
        // Injuries and movements to avoid travel with you; the equipment
        // doesn't.
        bannedExerciseIds: saved.bannedExerciseIds,
        isTravel: true,
      };
    }
  }

  return {
    ...parseGymProfile(store.get(GYM_COOKIE)?.value),
    isTravel: false,
  };
}

/** Reads the caller's gym profile. Returns EMPTY_GYM when unset — see canPerform. */
export async function readGymProfile(): Promise<GymProfile> {
  const { equipment, bannedExerciseIds } = await readActiveGym();
  return { equipment, bannedExerciseIds };
}

export const GYM_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  // Only ever written and read on the server, so there's no reason for page
  // scripts to be able to read or forge it.
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;
