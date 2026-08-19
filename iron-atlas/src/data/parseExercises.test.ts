import { describe, expect, it } from "vitest";
import {
  exerciseEmbeddingText,
  parseExerciseRows,
  slugify,
} from "./parseExercises";

describe("slugify", () => {
  it("strips punctuation and apostrophes", () => {
    expect(slugify("Farmer's Walk")).toBe("farmers-walk");
    expect(slugify("45-Degree Back Extension")).toBe("45-degree-back-extension");
    expect(slugify("EZ-Bar Curl")).toBe("ez-bar-curl");
  });
});

describe("parseExerciseRows", () => {
  const all = parseExerciseRows();

  it("parses the whole catalogue", () => {
    expect(all.length).toBeGreaterThan(200);
  });

  it("gives every exercise a unique slug", () => {
    const slugs = new Set(all.map((e) => e.slug));
    expect(slugs.size).toBe(all.length);
  });

  it("reads flags and lists", () => {
    const bulgarian = all.find((e) => e.slug === "bulgarian-split-squat")!;
    expect(bulgarian.isUnilateral).toBe(true);
    expect(bulgarian.isCompound).toBe(true);
    expect(bulgarian.movementPattern).toBe("lunge");
    expect(bulgarian.aliases).toContain("rfess");
  });

  it("rejects an unknown muscle rather than importing it", () => {
    expect(() => parseExerciseRows("Fake Lift | squat | eyebrows | barbell | | |")).toThrow(
      /eyebrows/,
    );
  });

  it("rejects an unknown movement pattern", () => {
    expect(() => parseExerciseRows("Fake Lift | wiggle | quads | barbell | | |")).toThrow(
      /wiggle/,
    );
  });

  it("rejects an unknown flag", () => {
    expect(() => parseExerciseRows("Fake Lift | squat | quads | barbell | | z |")).toThrow(
      /unknown flag/,
    );
  });

  it("rejects a duplicate slug", () => {
    const source = "Back Squat | squat | quads | barbell | | c |\nBack squat | squat | quads | barbell | | c |";
    expect(() => parseExerciseRows(source)).toThrow(/duplicate slug/);
  });

  it("skips comments and blank lines", () => {
    const source = "\n# a comment\nBack Squat | squat | quads | barbell | | c |\n\n";
    expect(parseExerciseRows(source)).toHaveLength(1);
  });
});

describe("exerciseEmbeddingText", () => {
  it("includes attributes, not just the name", () => {
    const [row] = parseExerciseRows(
      "Meadows Row | horizontal_pull | lats | barbell | upper_back | c,u | landmine one-arm row",
    );
    const text = exerciseEmbeddingText(row);
    expect(text).toContain("Meadows Row");
    expect(text).toContain("landmine one-arm row");
    expect(text).toContain("horizontal pull");
    expect(text).toContain("targets lats");
    expect(text).toContain("barbell exercise");
    expect(text).toContain("compound");
    expect(text).toContain("unilateral");
  });
});
