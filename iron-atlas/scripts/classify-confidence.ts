import "./env";
import Anthropic from "@anthropic-ai/sdk";
import { eq, isNull } from "drizzle-orm";
import { db, sql } from "@/db";
import { programs } from "@/db/schema";

/**
 * Backfills `confidence` for programs generated before the field existed.
 *
 * Their reconstruction notes were already written, already honest, and already
 * stored — they just went into `description` as prose, where nothing could
 * sort or filter on them. Classifying that text is far cheaper than
 * regenerating 157 programs, and the prose is the actual evidence.
 *
 *   npm run classify:confidence
 *   npm run classify:confidence -- --all     # re-classify everything
 */

const MODEL = "claude-sonnet-5";
const MARKER = "**Reconstruction notes:**";

const SYSTEM = `You classify how faithful an AI reconstruction of a published training program is, using the reconstruction notes the generating model wrote about its own work.

Answer with exactly one word:

documented — the notes claim specific recall of this program's published sets, reps, or percentages.
partial    — the notes claim the overall structure is known but some specifics are inferred.
stylistic  — the notes admit the program's actual contents could not be verified or recalled, and it was built from the author's general style.

Read what the notes actually concede. A note that says "I could not verify a publicly documented set/rep breakdown" is stylistic no matter how confident the surrounding prose sounds. A note that cites concrete published numbers ("the three-week wave of 5s/3s/1s off a training max") is documented.`;

type Row = { id: number; slug: string; title: string; notes: string };

function extractNotes(description: string | null, stored: string | null): string | null {
  if (stored?.trim()) return stored;
  if (!description) return null;
  const i = description.indexOf(MARKER);
  return i === -1 ? null : description.slice(i + MARKER.length).trim() || null;
}

async function classify(client: Anthropic, row: Row): Promise<string | null> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Program: ${row.title}\n\nReconstruction notes:\n${row.notes.slice(0, 4000)}`,
      },
    ],
  });
  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  const word = text.text.trim().toLowerCase().replace(/[^a-z]/g, "");
  return ["documented", "partial", "stylistic"].includes(word) ? word : null;
}

async function main() {
  const all = process.argv.includes("--all");
  const client = new Anthropic();

  const rows = await db
    .select({
      id: programs.id,
      slug: programs.slug,
      title: programs.title,
      description: programs.description,
      confidenceNotes: programs.confidenceNotes,
    })
    .from(programs)
    .where(all ? undefined : isNull(programs.confidence));

  const work: Row[] = [];
  const noNotes: string[] = [];
  for (const r of rows) {
    const notes = extractNotes(r.description, r.confidenceNotes);
    if (!notes) {
      noNotes.push(r.slug);
      continue;
    }
    work.push({ id: r.id, slug: r.slug, title: r.title, notes });
  }

  console.log(`classifying ${work.length} program(s)${noNotes.length ? `, ${noNotes.length} without notes` : ""}…`);

  const tally: Record<string, number> = {};
  for (const [i, row] of work.entries()) {
    let level: string | null = null;
    try {
      level = await classify(client, row);
    } catch (err) {
      console.log(`  ! ${row.slug}: ${err instanceof Error ? err.message.slice(0, 90) : err}`);
      // Out of credit means every later call fails the same way.
      if (/credit balance|authentication/i.test(String(err))) {
        console.log("  stopping — the rest would fail identically.");
        break;
      }
      continue;
    }
    if (!level) {
      console.log(`  ? ${row.slug}: unrecognised answer, left unset`);
      continue;
    }

    // Lift the notes out of description into their own column at the same time.
    await db
      .update(programs)
      .set({
        confidence: level as "documented" | "partial" | "stylistic",
        confidenceNotes: row.notes,
      })
      .where(eq(programs.id, row.id));

    tally[level] = (tally[level] ?? 0) + 1;
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${work.length}`);
  }

  console.log("\n" + Object.entries(tally).map(([k, v]) => `  ${k}: ${v}`).join("\n"));
  if (noNotes.length) console.log(`\n  no notes to classify: ${noNotes.join(", ")}`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
