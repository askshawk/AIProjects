import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { equipment as equipmentEnum, exercises } from "@/db/schema";
import {
  GYM_COOKIE,
  GYM_COOKIE_OPTIONS,
  readGymProfile,
  serializeGymProfile,
} from "@/lib/gymProfile";
import { FULL_GYM, type Equipment } from "@/lib/substitute";

export const metadata = { title: "Your gym · Iron Atlas" };

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

  const banned = gym.bannedExerciseIds.length
    ? await db
        .select({ id: exercises.id, name: exercises.name })
        .from(exercises)
        .where(inArray(exercises.id, gym.bannedExerciseIds))
        .orderBy(asc(exercises.name))
    : [];

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
          <label htmlFor="banned" className="block text-sm font-medium">
            Movements to avoid
          </label>
          <p className="text-xs text-muted">
            Exercise IDs, comma separated — for a machine your gym lacks or
            something an injury rules out. Find IDs on the{" "}
            <a
              href="/exercises"
              className="text-accent underline underline-offset-2"
            >
              exercise catalogue
            </a>
            .
          </p>
          <input
            id="banned"
            name="banned"
            defaultValue={gym.bannedExerciseIds.join(", ")}
            placeholder="e.g. 142, 88"
            className="w-full rounded-md border bg-surface px-3 py-2 text-sm"
          />
          {banned.length > 0 && (
            <p className="text-xs text-muted">
              Currently avoiding: {banned.map((b) => b.name).join(", ")}
            </p>
          )}
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

      <p className="rounded-lg border border-dashed p-3 text-xs text-muted">
        {configured
          ? `Saved: ${gym.equipment.length} of ${equipmentEnum.enumValues.length} equipment types.`
          : "Nothing saved yet — programs are shown exactly as written."}
      </p>
    </div>
  );
}
