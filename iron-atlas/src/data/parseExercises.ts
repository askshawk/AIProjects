import {
  equipment as equipmentEnum,
  movementPattern as patternEnum,
  muscle as muscleEnum,
} from "@/db/schema/enums";
import { EXERCISE_ROWS } from "./exercises";

export type ParsedExercise = {
  slug: string;
  name: string;
  aliases: string[];
  movementPattern: (typeof patternEnum.enumValues)[number];
  primaryMuscle: (typeof muscleEnum.enumValues)[number];
  secondaryMuscles: (typeof muscleEnum.enumValues)[number][];
  equipment: (typeof equipmentEnum.enumValues)[number];
  isUnilateral: boolean;
  isCompound: boolean;
  isExplosive: boolean;
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const split = (cell: string) =>
  cell
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string,
  where: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${where}: "${value}" is not one of ${allowed.join(", ")}`);
  }
  return value as T;
}

/**
 * Parses the catalogue text block. Throws on the first bad cell — a seed that
 * half-loads is worse than one that refuses to start.
 */
export function parseExerciseRows(source = EXERCISE_ROWS): ParsedExercise[] {
  const out: ParsedExercise[] = [];
  const seen = new Set<string>();

  source.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) {
      throw new Error(
        `line ${i + 1}: expected at least 4 columns, got ${cells.length}`,
      );
    }
    const [
      name,
      pattern,
      primary,
      equip,
      secondary = "",
      flags = "",
      aliases = "",
    ] = cells;
    const where = `line ${i + 1} (${name})`;
    const slug = slugify(name);
    if (seen.has(slug)) throw new Error(`${where}: duplicate slug "${slug}"`);
    seen.add(slug);

    const flagList = split(flags);
    for (const f of flagList) {
      if (f !== "c" && f !== "u" && f !== "x")
        throw new Error(`${where}: unknown flag "${f}"`);
    }

    out.push({
      slug,
      name,
      aliases: split(aliases),
      movementPattern: oneOf(patternEnum.enumValues, pattern, where),
      primaryMuscle: oneOf(muscleEnum.enumValues, primary, where),
      secondaryMuscles: split(secondary).map((m) =>
        oneOf(muscleEnum.enumValues, m, where),
      ),
      equipment: oneOf(equipmentEnum.enumValues, equip, where),
      isCompound: flagList.includes("c"),
      isUnilateral: flagList.includes("u"),
      isExplosive: flagList.includes("x"),
    });
  });

  return out;
}

/**
 * The text an exercise is embedded as. Includes the attributes, not just the
 * name, so "no machine for hamstrings" style queries land near the right rows.
 */
export function exerciseEmbeddingText(e: ParsedExercise): string {
  const parts = [
    e.name,
    e.aliases.join(", "),
    e.movementPattern.replace(/_/g, " "),
    `targets ${e.primaryMuscle.replace(/_/g, " ")}`,
    e.secondaryMuscles.length
      ? `also works ${e.secondaryMuscles.map((m) => m.replace(/_/g, " ")).join(", ")}`
      : "",
    `${e.equipment} exercise`,
    e.isCompound ? "compound multi-joint" : "isolation single-joint",
    e.isUnilateral ? "unilateral single limb" : "",
    e.isExplosive ? "explosive plyometric speed movement" : "",
  ];
  return parts.filter(Boolean).join(". ");
}
