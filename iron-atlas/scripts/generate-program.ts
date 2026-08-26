import "./env";
import { sql } from "@/db";
import { DEFAULT_MODEL, generateAndSave } from "@/lib/programGeneration";

/**
 * Generates one program. For many at once, see generate-batch.ts.
 *
 *   npm run generate:program -- "Arnold's Golden Six"
 *   npm run generate:program -- "5/3/1 Boring But Big" --slug 531-bbb
 *   npm run generate:program -- "DoggCrapp" --model claude-opus-5 --dry-run
 */

function usage(): never {
  console.error(
    'usage: npm run generate:program -- "<program or lifter name>" [--slug <slug>] [--model <id>] [--dry-run]',
  );
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const value = args[args.indexOf(name) + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const request = args.find((a) => !a.startsWith("--"));
  if (!request) usage();

  const model = flag(args, "--model") ?? DEFAULT_MODEL;
  console.log(`generating: ${request}  [${model}]`);

  const result = await generateAndSave(request, {
    slug: flag(args, "--slug"),
    model,
    dryRun: args.includes("--dry-run"),
    onProgress: (line) => console.log(`  ${line}`),
  });

  if (!result.ok) {
    console.error(`\n${result.kind}: ${result.message}`);
    if (result.missing) {
      console.error(
        `\n${result.missing.map((m) => `  "${m}"`).join("\n")}\n\nAdd them to src/data/exercises.ts and re-run the seed, or regenerate.`,
      );
    }
    await sql.end();
    process.exit(1);
  }

  if (result.dryRun) {
    console.log(
      `\n--dry-run: nothing written — ${result.weeks} week(s), ${result.prescribedSets} prescribed sets`,
    );
  } else {
    console.log(
      `\nsaved /programs/${result.slug} — ${result.weeks} template week(s), ${result.prescribedSets} prescribed sets`,
    );
    console.log("marked ai_generated, unverified. Review it before flipping verified.");
  }
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
