import { cookies } from "next/headers";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { equipment as equipmentEnum, exercises } from "@/db/schema";
import {
  GYM_COOKIE,
  GYM_COOKIE_OPTIONS,
  readGymProfile,
  serializeGymProfile,
} from "@/lib/gymProfile";
import { FULL_GYM, type Equipment } from "@/lib/substitute";
import { BannedExercisePicker } from "@/components/BannedExercisePicker";

export const metadata = {
  title: "Your gym",
  description:
    "The equipment you have and the exercises to avoid — drives substitutions across every program.",
  robots: { index: false },
};

/**
 * Nobody has more than a handful of movements they can't do. The cap exists
 * because this list is attacker-controllable (it round-trips through a cookie)
 * and every banned exercise costs several similarity queries per program view.
 */
const MAX_BANNED_EXERCISES = 100;

/**
 * Neither action calls `revalidatePath("/", "layout")` any more. It looked
 * necessary — every program page derives its swaps from this profile — but the
 * gym lives in a cookie, so every page that reads it already calls `cookies()`
 * and is dynamic. The purge was therefore redundant, and since both actions are
 * deliberately unauthenticated, it also meant one anonymous request could
 * invalidate the route cache for every visitor on the site.
 */
const LABELS: Record<Equipment, string> = {
  barbell: "Barbell & plates",
  dumbbell: "Dumbbells",
  machine: "Machines",
  cable: "Cable stack",
  smith: "Smith machine",
  bodyweight: "Bodyweight / bars",
  band: "Resistance bands",
  kettlebell: "Kettlebells",
  other: "Odd objects (sleds, sandbags)",
};

async function saveGym(formData: FormData) {
  "use server";

  const equipment = equipmentEnum.enumValues.filter(
    (e) => formData.get(`eq-${e}`) === "on",
  );
  // `Number("")` is 0 and `Number.isInteger(0)` is true, so an empty list used
  // to persist as `[0]` — a phantom id that rendered as a ghost "#0" chip the
  // user never added. Ids are serial from 1, so anything at or below 0 is
  // meaningless, and the length cap keeps a hand-crafted submission from
  // turning one export request into hundreds of similarity queries.
  const banned = String(formData.get("banned") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n < 2_147_483_647)
    .slice(0, MAX_BANNED_EXERCISES);

  const store = await cookies();
  store.set(
    GYM_COOKIE,
    serializeGymProfile({ equipment, bannedExerciseIds: banned }),
    GYM_COOKIE_OPTIONS,
  );
}

async function clearGym() {
  "use server";
  const store = await cookies();
  store.delete(GYM_COOKIE);
}

export default async function GymPage() {
  const gym = await readGymProfile();
  const configured = gym.equipment.length > 0;

  // Small enough (235 rows, name + id only) to send whole and search
  // client-side — no need for a search-as-you-type round trip to the server.
  const allExercises = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .orderBy(asc(exercises.name));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your gym</h1>
        <p className="mt-1 text-sm text-muted">
          Tell me what you have and every program will flag the movements you
          can&apos;t do, with a swap that trains the same thing. Leave it blank
          and nothing is filtered.
        </p>
      </div>

      {/* Keyed on the saved profile so the form genuinely remounts when it
          changes. Without this, "Clear" appeared to do nothing: the cookie was
          deleted, but React reused the same instances, and uncontrolled
          `defaultChecked` boxes plus the picker's mount-time `useState` both
          kept showing the old profile — so pressing Save afterwards rewrote
          the very thing that had just been cleared. */}
      <form
        key={`${gym.equipment.join(",")}|${gym.bannedExerciseIds.join(",")}`}
        action={saveGym}
        className="space-y-6"
      >
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Equipment</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {equipmentEnum.enumValues.map((e) => (
              <label
                key={e}
                className="flex cursor-pointer items-center gap-3 rounded-md border bg-surface px-3 py-2.5 text-sm"
              >
                <input
                  type="checkbox"
                  name={`eq-${e}`}
                  defaultChecked={
                    configured
                      ? gym.equipment.includes(e)
                      : FULL_GYM.includes(e)
                  }
                  className="size-4 accent-[var(--accent)]"
                />
                {LABELS[e]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Exercises to avoid
          </label>
          <p className="text-xs text-muted">
            For a machine your gym lacks or something an injury rules out —
            search by name and add as many as you need.
          </p>
          <BannedExercisePicker
            name="banned"
            options={allExercises}
            initialIds={gym.bannedExerciseIds}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            Save
          </button>
          <button
            type="submit"
            formAction={clearGym}
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Clear
          </button>
        </div>
      </form>

      {configured && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted">
          Saved: {gym.equipment.length} of {equipmentEnum.enumValues.length}{" "}
          equipment types.
        </p>
      )}
    </div>
  );
}
