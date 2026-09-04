import { revalidatePath } from "next/cache";
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
  const banned = String(formData.get("banned") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Number.isInteger);

  const store = await cookies();
  store.set(
    GYM_COOKIE,
    serializeGymProfile({ equipment, bannedExerciseIds: banned }),
    GYM_COOKIE_OPTIONS,
  );

  // Every program page derives its swaps from this, so they all go stale.
  revalidatePath("/", "layout");
}

async function clearGym() {
  "use server";
  const store = await cookies();
  store.delete(GYM_COOKIE);
  revalidatePath("/", "layout");
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

      <form action={saveGym} className="space-y-6">
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
