import { describe, expect, it, vi } from "vitest";

/**
 * The travel override decides what equipment every program is planned
 * against, so the rules about when it applies are worth pinning down. The
 * dangerous outcomes are it applying when it shouldn't (prescriptions
 * silently change) and the saved gym being lost behind it.
 */

const store = new Map<string, { value: string }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => store.get(name),
    set: (name: string, value: string) => store.set(name, { value }),
    delete: (name: string) => store.delete(name),
  }),
}));

const {
  GYM_COOKIE,
  TRAVEL_GYM_COOKIE,
  readActiveGym,
  serializeGymProfile,
} = await import("@/lib/gymProfile");

const setGym = (equipment: string[], bannedExerciseIds: number[] = []) =>
  store.set(GYM_COOKIE, {
    value: serializeGymProfile({
      equipment: equipment as never,
      bannedExerciseIds,
    }),
  });

const setTravel = (equipment: string[]) =>
  store.set(TRAVEL_GYM_COOKIE, {
    value: serializeGymProfile({
      equipment: equipment as never,
      bannedExerciseIds: [],
    }),
  });

describe("readActiveGym", () => {
  it("uses the saved gym when no override is set", async () => {
    store.clear();
    setGym(["barbell", "machine"]);
    const gym = await readActiveGym();
    expect(gym.equipment).toEqual(["barbell", "machine"]);
    expect(gym.isTravel).toBe(false);
  });

  it("uses the override, and says that it is", async () => {
    store.clear();
    setGym(["barbell", "machine", "cable"]);
    setTravel(["dumbbell"]);
    const gym = await readActiveGym();
    expect(gym.equipment).toEqual(["dumbbell"]);
    // The flag is what drives the banner. Without it the override would be
    // silently changing what every program prescribes.
    expect(gym.isTravel).toBe(true);
  });

  it("keeps the saved gym intact underneath the override", async () => {
    store.clear();
    setGym(["barbell", "machine"]);
    setTravel(["dumbbell"]);
    await readActiveGym();
    // Reading must never rewrite the real profile — losing it is the failure
    // this feature exists to avoid.
    expect(store.get(GYM_COOKIE)).toBeDefined();
    store.delete(TRAVEL_GYM_COOKIE);
    expect((await readActiveGym()).equipment).toEqual(["barbell", "machine"]);
  });

  it("carries injuries across, because those travel with you", async () => {
    store.clear();
    setGym(["barbell"], [12, 34]);
    setTravel(["dumbbell"]);
    const gym = await readActiveGym();
    expect(gym.bannedExerciseIds).toEqual([12, 34]);
  });

  it("ignores an empty override rather than leaving someone with no equipment", async () => {
    store.clear();
    setGym(["barbell"]);
    setTravel([]);
    const gym = await readActiveGym();
    expect(gym.equipment).toEqual(["barbell"]);
    expect(gym.isTravel).toBe(false);
  });

  it("ignores a corrupt override cookie", async () => {
    store.clear();
    setGym(["barbell"]);
    store.set(TRAVEL_GYM_COOKIE, { value: "not-json" });
    const gym = await readActiveGym();
    expect(gym.equipment).toEqual(["barbell"]);
    expect(gym.isTravel).toBe(false);
  });
});
