import "./env";
import { inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { programs } from "@/db/schema";
import { MANIFEST, type ProgramSpec } from "./programs.manifest";
import {
  DEFAULT_MODEL,
  generateAndSave,
  isRetryable,
  isTerminal,
  type GenerationResult,
} from "@/lib/programGeneration";

/**
 * Fills the library from programs.manifest.ts.
 *
 *   npm run generate:batch -- --dry-run --limit 3
 *   npm run generate:batch -- --only meadows
 *   npm run generate:batch                        # everything not already saved
 *
 * Resumable by design: anything already in `programs` is skipped, so an
 * interrupted run — or one that exhausts an API credit balance halfway, which
 * is what prompted this script — costs nothing to restart.
 *
 * Runs sequentially. Generation is API-latency-bound, and the local PGlite
 * socket corrupts frames under concurrent queries anyway.
 */

/** `empty` is nondeterministic and usually clears on a second attempt. */
const MAX_ATTEMPTS = 2;

function flag(args: string[], name: string): string | undefined {
  const value = args[args.indexOf(name) + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

async function attempt(
  spec: ProgramSpec,
  model: string,
  dryRun: boolean,
): Promise<GenerationResult> {
  let last: GenerationResult | undefined;

  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    last = await generateAndSave(spec.request, {
      slug: spec.slug,
      model,
      dryRun,
      onProgress: (line) => console.log(`    ${line}`),
    });
    if (last.ok || !isRetryable(last.kind)) return last;
    if (n < MAX_ATTEMPTS) console.log(`    ${last.kind} — retrying (${n}/${MAX_ATTEMPTS})`);
  }

  return last!;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const model = flag(args, "--model") ?? DEFAULT_MODEL;
  const only = flag(args, "--only");
  const limit = Number(flag(args, "--limit") ?? Number.POSITIVE_INFINITY);

  let queue = only ? MANIFEST.filter((s) => s.author === only) : MANIFEST;
  if (only && queue.length === 0) {
    console.error(
      `no manifest entries for --only ${only}. Authors: ${[...new Set(MANIFEST.map((s) => s.author))].join(", ")}`,
    );
    await sql.end();
    process.exit(1);
  }

  // Resumability: one query, not one per program.
  if (!force && !dryRun) {
    const existing = await db
      .select({ slug: programs.slug })
      .from(programs)
      .where(inArray(programs.slug, queue.map((s) => s.slug)));
    const have = new Set(existing.map((r) => r.slug));
    const before = queue.length;
    queue = queue.filter((s) => !have.has(s.slug));
    if (before !== queue.length) {
      console.log(`skipping ${before - queue.length} already in the library (--force to redo)`);
    }
  }

  if (queue.length > limit) {
    console.log(`limiting to ${limit} of ${queue.length} queued`);
    queue = queue.slice(0, limit);
  }

  console.log(`generating ${queue.length} program(s) with ${model}${dryRun ? " (dry run)" : ""}\n`);

  const saved: string[] = [];
  const failed: { spec: ProgramSpec; result: GenerationResult }[] = [];
  // Catalogue gaps are collected across the whole batch rather than aborting
  // it — one list to fix beats seventy separate failures.
  const missing = new Map<string, string[]>();
  let totalSets = 0;

  for (const [i, spec] of queue.entries()) {
    console.log(`[${i + 1}/${queue.length}] ${spec.request}`);
    const result = await attempt(spec, model, dryRun);

    if (result.ok) {
      saved.push(result.slug);
      totalSets += result.prescribedSets;
      console.log(`    ✓ ${result.slug} — ${result.weeks} week(s), ${result.prescribedSets} sets\n`);
      continue;
    }

    failed.push({ spec, result });
    for (const name of result.missing ?? []) {
      missing.set(name, [...(missing.get(name) ?? []), spec.slug]);
    }
    console.log(`    ✗ ${result.kind}: ${result.message}\n`);

    // Out of credit or bad key: everything after this fails the same way.
    // Stop instead of walking the rest of the manifest — the previous run
    // spent thirteen requests discovering the balance was empty.
    if (isTerminal(result.kind)) {
      console.log(`stopping: ${result.kind} — the remaining ${queue.length - i - 1} would fail identically.\n`);
      break;
    }
  }

  console.log("─".repeat(60));
  console.log(
    `${saved.length} saved (${totalSets} prescribed sets), ${failed.length} failed, ${queue.length} attempted`,
  );

  if (failed.length > 0) {
    console.log("\nfailed:");
    for (const { spec, result } of failed) {
      console.log(`  ${spec.slug} — ${(result as { kind: string }).kind}`);
    }
  }

  if (missing.size > 0) {
    console.log(`\n${missing.size} exercise(s) missing from the catalogue:`);
    for (const [name, slugs] of [...missing].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  "${name}" — wanted by ${slugs.length}: ${slugs.join(", ")}`);
    }
    console.log("\nAdd these to src/data/exercises.ts, run seed:exercises, then re-run.");
  }

  await sql.end();
  // A batch that saved nothing is a failure worth a non-zero exit.
  if (saved.length === 0 && queue.length > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
