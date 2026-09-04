import { describe, expect, it } from "vitest";
import { splitDescription } from "@/lib/exerciseDescription";

/**
 * Pure text parsing, no database. This is the one place both the exercise
 * detail page and the in-gym HowToHint agree on how a generated description
 * is shaped, so a change here changes what every render of that text shows.
 */

describe("splitDescription", () => {
  it("splits the lead paragraph from the bullet cues", () => {
    const { paragraph, cues } = splitDescription(
      "A compound lift that trains the whole posterior chain.\n\n- Keep the bar close to the shins\n- Brace before the pull\n- Drive through the floor",
    );
    expect(paragraph).toBe(
      "A compound lift that trains the whole posterior chain.",
    );
    expect(cues).toEqual([
      "Keep the bar close to the shins",
      "Brace before the pull",
      "Drive through the floor",
    ]);
  });

  it("strips the leading dash and any extra spacing from each cue", () => {
    const { cues } = splitDescription("Paragraph.\n\n-   Cue with extra spaces\n-No space after dash");
    expect(cues).toEqual(["Cue with extra spaces", "No space after dash"]);
  });

  it("returns an empty cue list with just a paragraph", () => {
    const { paragraph, cues } = splitDescription("Just a paragraph, no cues.");
    expect(paragraph).toBe("Just a paragraph, no cues.");
    expect(cues).toEqual([]);
  });

  it("drops blank lines between cues rather than keeping empty entries", () => {
    const { cues } = splitDescription("Paragraph.\n\n- First cue\n\n- Second cue\n");
    expect(cues).toEqual(["First cue", "Second cue"]);
  });
});
