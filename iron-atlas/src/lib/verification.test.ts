import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import { programs } from "@/db/schema";
import { reviewQueue, verificationStats } from "@/lib/verification";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * The confidence-ordering added this session is the whole point of the
 * review queue: a program the model itself doubted needs a human look before
 * one it was confident about, regardless of which happens to be thinner.
 */

afterAll(async () => {
  await client.end();
});

async function withTempPrograms<T>(
  specs: { slug: string; confidence: "documented" | "partial" | "stylistic" | null }[],
  fn: () => Promise<T>,
): Promise<T> {
  for (const spec of specs) {
    await db.insert(programs).values({
      slug: spec.slug,
      title: spec.slug,
      authorName: "Test Author",
      summary: "s",
      goal: "strength",
      experienceLevel: "intermediate",
      daysPerWeek: 3,
      weeks: 4,
      splitType: "full body",
      equipmentRequired: [],
      tags: [],
      aiGenerated: true,
      verified: false,
      confidence: spec.confidence,
    });
  }
  try {
    return await fn();
  } finally {
    for (const spec of specs) {
      await db.delete(programs).where(eq(programs.slug, spec.slug));
    }
  }
}

describe("reviewQueue", () => {
  it("orders stylistic before partial before documented before unclassified", async () => {
    const stamp = `${process.pid}-${Math.round(performance.now())}`;
    const slugs = {
      documented: `test-doc-${stamp}`,
      partial: `test-partial-${stamp}`,
      stylistic: `test-stylistic-${stamp}`,
      unclassified: `test-unclassified-${stamp}`,
    };

    await withTempPrograms(
      [
        { slug: slugs.documented, confidence: "documented" },
        { slug: slugs.partial, confidence: "partial" },
        { slug: slugs.stylistic, confidence: "stylistic" },
        { slug: slugs.unclassified, confidence: null },
      ],
      async () => {
        const queue = await reviewQueue();
        const positions = Object.fromEntries(
          Object.entries(slugs).map(([k, slug]) => [
            k,
            queue.findIndex((p) => p.slug === slug),
          ]),
        );

        expect(positions.stylistic).toBeLessThan(positions.partial);
        expect(positions.partial).toBeLessThan(positions.documented);
        expect(positions.documented).toBeLessThan(positions.unclassified);
      },
    );
  });

  it("never includes a verified program, however low its confidence", async () => {
    // Verified outranks the model's own self-doubt — a human already checked
    // it, so it has no business in a queue meant to find what hasn't been.
    const slug = `test-verified-stylistic-${process.pid}-${Math.round(performance.now())}`;
    await db.insert(programs).values({
      slug,
      title: slug,
      authorName: "Test Author",
      summary: "s",
      goal: "strength",
      experienceLevel: "intermediate",
      daysPerWeek: 3,
      weeks: 4,
      splitType: "full body",
      equipmentRequired: [],
      tags: [],
      aiGenerated: true,
      verified: true,
      confidence: "stylistic",
    });

    try {
      const queue = await reviewQueue();
      expect(queue.some((p) => p.slug === slug)).toBe(false);
    } finally {
      await db.delete(programs).where(eq(programs.slug, slug));
    }
  });
});

describe("verificationStats", () => {
  it("total is at least as large as verified", async () => {
    const stats = await verificationStats();
    expect(stats.total).toBeGreaterThanOrEqual(stats.verified);
    expect(stats.verified).toBeGreaterThanOrEqual(0);
  });
});
