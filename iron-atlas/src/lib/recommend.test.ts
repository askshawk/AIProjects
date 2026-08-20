import { afterAll, describe, expect, it } from "vitest";
import { sql as client } from "@/db";
import { profileText, recommendPrograms } from "@/lib/recommend";
import { hasEmbeddings } from "@/lib/testEnv";

/**
 * Runs against the local database — start it with `npm run db`. These assert
 * the retrieval contract, not the model's prose: what comes back must be
 * trainable given what the lifter said, and `matched` must honestly describe
 * which constraints actually held.
 */

afterAll(async () => {
  await client.end();
});

describe("profileText", () => {
  it("folds a profile into text worth embedding", () => {
    const text = profileText({
      goal: "hypertrophy",
      experienceLevel: "intermediate",
      daysPerWeek: 5,
      preferences: "lots of arm work",
    });
    expect(text).toContain("goal: hypertrophy");
    expect(text).toContain("intermediate lifter");
    expect(text).toContain("5 days per week");
    expect(text).toContain("lots of arm work");
  });

  it("skips absent fields rather than emitting empty fragments", () => {
    expect(profileText({ goal: "strength" })).toBe("goal: strength");
    expect(profileText({})).toBe("");
  });
});

describe.skipIf(!hasEmbeddings)("recommendPrograms", () => {
  it("respects every constraint when the library can satisfy them", async () => {
    const recs = await recommendPrograms({
      goal: "hypertrophy",
      experienceLevel: "intermediate",
      daysPerWeek: 6,
      availableEquipment: [
        "barbell",
        "dumbbell",
        "machine",
        "cable",
        "smith",
        "bodyweight",
        "band",
        "kettlebell",
        "other",
      ],
    });

    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.goal).toBe("hypertrophy");
      expect(rec.experienceLevel).toBe("intermediate");
      expect(Math.abs(rec.daysPerWeek - 6)).toBeLessThanOrEqual(1);
    }
  });

  it("sheds equipment first, keeping goal and level intact", async () => {
    // A barbell-only lifter can still be matched on training intent; the
    // accessory-machine mismatch is what the substitution engine will solve.
    const recs = await recommendPrograms({
      goal: "strength",
      experienceLevel: "intermediate",
      daysPerWeek: 4,
      availableEquipment: ["barbell", "bodyweight"],
    });

    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].matched).toContain("goal: strength");
    expect(recs[0].matched).toContain("intermediate level");
    expect(recs[0].matched).not.toContain("fits your equipment");
    expect(recs[0].goal).toBe("strength");
  });

  it("reports only the constraints that actually held", async () => {
    // Nothing in the library is 2-day advanced kettlebell-only work, so most
    // constraints must be dropped — and `matched` has to say so rather than
    // letting the model claim a fit it didn't get.
    const recs = await recommendPrograms({
      goal: "strength",
      experienceLevel: "advanced",
      daysPerWeek: 2,
      availableEquipment: ["kettlebell"],
    });

    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].matched).not.toContain("advanced level");
    expect(recs[0].matched).not.toContain("fits your equipment");
    for (const rec of recs) expect(rec.matched).toEqual(recs[0].matched);
  });

  it("still returns something when given nothing to filter on", async () => {
    const recs = await recommendPrograms({ preferences: "I just want big arms" });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].matched).toEqual([]);
  });

  it("orders by similarity, best first", async () => {
    const recs = await recommendPrograms({ preferences: "powerlifting percentage work" });
    const scores = recs.map((r) => r.similarity);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("returns only fields the UI can render without another query", async () => {
    const [rec] = await recommendPrograms({ goal: "hypertrophy" });
    expect(rec).toMatchObject({
      slug: expect.any(String),
      title: expect.any(String),
      authorName: expect.any(String),
      daysPerWeek: expect.any(Number),
      aiGenerated: expect.any(Boolean),
      verified: expect.any(Boolean),
    });
    // The card links straight to the program and its export.
    expect(rec.slug).toMatch(/^[a-z0-9-]+$/);
  });
});
