import { describe, expect, it } from "vitest";
import { EMPTY_GYM, type GymProfile } from "@/lib/substitute";
import { parseGymProfile, serializeGymProfile } from "@/lib/gymProfile";

/**
 * Pure parsing/serialization, no DB. The gym profile lives in a cookie a user
 * can hand-edit or that can go stale across a schema change, so parsing has
 * to degrade to EMPTY_GYM rather than break the page it's read on.
 */

describe("parseGymProfile", () => {
  it("round-trips a real profile through serialize/parse", () => {
    const profile: GymProfile = { equipment: ["barbell", "dumbbell"], bannedExerciseIds: [12, 34] };
    const parsed = parseGymProfile(serializeGymProfile(profile));
    expect(parsed).toEqual({ equipment: ["barbell", "dumbbell"], bannedExerciseIds: [12, 34] });
  });

  it("returns EMPTY_GYM for no cookie at all", () => {
    expect(parseGymProfile(undefined)).toEqual(EMPTY_GYM);
  });

  it("returns EMPTY_GYM for garbage that isn't valid URI-encoded JSON", () => {
    expect(parseGymProfile("not json at all")).toEqual(EMPTY_GYM);
    expect(parseGymProfile("%")).toEqual(EMPTY_GYM);
  });

  it("returns EMPTY_GYM for valid JSON that isn't an object", () => {
    expect(parseGymProfile(encodeURIComponent("42"))).toEqual(EMPTY_GYM);
    expect(parseGymProfile(encodeURIComponent("null"))).toEqual(EMPTY_GYM);
    expect(parseGymProfile(encodeURIComponent('"a string"'))).toEqual(EMPTY_GYM);
    expect(parseGymProfile(encodeURIComponent("[1,2,3]"))).toEqual(EMPTY_GYM);
  });

  it("drops equipment values that aren't real enum members", () => {
    // A stale cookie from before an equipment type was renamed or removed.
    const raw = encodeURIComponent(
      JSON.stringify({ equipment: ["barbell", "trampoline", 42, null], bannedExerciseIds: [] }),
    );
    expect(parseGymProfile(raw).equipment).toEqual(["barbell"]);
  });

  it("drops non-integer banned ids rather than passing them through", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ equipment: [], bannedExerciseIds: [1, 2.5, "3", null, 4] }),
    );
    expect(parseGymProfile(raw).bannedExerciseIds).toEqual([1, 4]);
  });

  it("defaults missing fields to empty arrays rather than throwing", () => {
    expect(parseGymProfile(encodeURIComponent("{}"))).toEqual(EMPTY_GYM);
    expect(parseGymProfile(encodeURIComponent(JSON.stringify({ equipment: ["barbell"] })))).toEqual(
      { equipment: ["barbell"], bannedExerciseIds: [] },
    );
  });

  it("tolerates equipment/bannedExerciseIds being the wrong type entirely", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ equipment: "barbell", bannedExerciseIds: "1,2,3" }),
    );
    expect(parseGymProfile(raw)).toEqual(EMPTY_GYM);
  });
});
