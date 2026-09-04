/**
 * Splits a generated exercise description into its lead paragraph and bullet
 * cues — see scripts/generate-exercise-descriptions.ts for the format it's
 * written in ("paragraph, blank line, then '- ' bullets"). Shared between the
 * exercise detail page and the in-gym how-to hint so both render it the
 * same way.
 */
export function splitDescription(description: string) {
  const [paragraph, ...rest] = description.split("\n\n");
  const cues = rest
    .join("\n")
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
  return { paragraph, cues };
}
