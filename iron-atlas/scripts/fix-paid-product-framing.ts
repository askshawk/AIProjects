import "./env";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { programs } from "@/db/schema";

/**
 * Reframes the nineteen entries that reconstruct a program a coach is actively
 * selling today.
 *
 * The training content is untouched — the method itself (sets, reps, exercise
 * order, percentages) is an unprotectable system, so fidelity costs nothing.
 * What changes is what the page *claims*:
 *
 *   1. Descriptive titles. Using a coach's product name as the name of the
 *      thing we're offering is the actual trademark problem; a factual "based
 *      on the method popularized by X" byline is not.
 *   2. A `purchaseUrl` pointing at where the coach actually sells it, rendered
 *      alongside the program rather than instead of it.
 *   3. Source links that point at legitimate pages. Several previously pointed
 *      at Scribd / pdfcoffee / Course Hero re-uploads of paid PDFs — sending
 *      traffic to pirated copies of the exact product being reconstructed is
 *      far worse than the reconstruction, and is the one thing here that could
 *      fairly be called contributory. Those are replaced with the seller's own
 *      page.
 *   4. Honest summaries. One of these described a paid product as "free".
 */

type Reframe = {
  slug: string;
  title: string;
  /** Where the coach actually sells it. */
  purchaseUrl: string;
  /** Legitimate reference links only — never a re-upload of the paid product. */
  sourceUrls: string[];
  /** Only where the existing text makes a claim that isn't true. */
  summary?: string;
};

const REFRAMES: Reframe[] = [
  // --- Jeff Nippard (STRCNG Inc.) — all five previously linked to re-uploads.
  {
    slug: "nippard-ppl",
    title: "Six-Day Push/Pull/Legs, High Frequency",
    purchaseUrl: "https://jeffnippard.com/",
    sourceUrls: ["https://jeffnippard.com/"],
    summary:
      "A six-day Push/Pull/Legs hypertrophy block for intermediate lifters who can train six days a week and want evidence-based exercise selection, volume, and progression.",
  },
  {
    slug: "nippard-powerbuilding",
    title: "Four-Day Upper/Lower Powerbuilding",
    purchaseUrl: "https://jeffnippard.com/",
    sourceUrls: ["https://jeffnippard.com/"],
  },
  {
    slug: "nippard-fundamentals",
    title: "Three-Day Full-Body Hypertrophy (Beginner)",
    purchaseUrl: "https://jeffnippard.com/",
    sourceUrls: ["https://jeffnippard.com/"],
  },
  {
    slug: "nippard-upper-lower",
    title: "Four-Day Upper/Lower Size and Strength",
    purchaseUrl: "https://jeffnippard.com/",
    sourceUrls: ["https://jeffnippard.com/"],
  },
  {
    slug: "nippard-pure-bodybuilding",
    title: "Six-Day Push/Pull/Legs Hypertrophy Block",
    purchaseUrl: "https://jeffnippard.com/",
    sourceUrls: ["https://jeffnippard.com/"],
  },

  // --- John Meadows (Mountain Dog). Two already pointed at his own catalogue;
  // the Grandmaster pointed at a pdfcoffee re-upload.
  {
    slug: "meadows-project-colossus",
    title: "Six-Day Push/Pull/Legs Mass Block",
    purchaseUrl: "https://mountaindogdiet.com/programs/project-colossus/",
    sourceUrls: ["https://mountaindogdiet.com/programs/project-colossus/"],
  },
  {
    slug: "meadows-grandmaster",
    title: "Six-Day Body-Part Split with Intensity Techniques",
    purchaseUrl: "https://mountaindogdiet.com/category/programs/",
    sourceUrls: ["https://mountaindogdiet.com/category/programs/"],
  },
  {
    slug: "meadows-gamma-bomb",
    title: "Six-Week Shoulder Specialization Block",
    purchaseUrl: "https://mountaindogdiet.com/programs/gamma-bomb/",
    sourceUrls: ["https://mountaindogdiet.com/programs/gamma-bomb/"],
  },

  // --- Greg Nuckols / Stronger By Science.
  {
    slug: "sbs-hypertrophy",
    title: "Four-Day Upper/Lower Hypertrophy (RIR-Based)",
    purchaseUrl: "https://www.strongerbyscience.com/program-bundle/",
    sourceUrls: ["https://www.strongerbyscience.com/program-bundle/"],
  },
  {
    slug: "nuckols-average-to-savage",
    title: "Sixteen-Week Upper/Lower Strength Block",
    purchaseUrl: "https://www.strongerbyscience.com/store/",
    sourceUrls: ["https://www.strongerbyscience.com/store/"],
  },
  {
    slug: "nuckols-intermediate-bench",
    title: "Bench Specialization, 3x/Week (Intermediate)",
    purchaseUrl: "https://www.strongerbyscience.com/newsletter/",
    sourceUrls: ["https://www.strongerbyscience.com/newsletter/"],
  },
  {
    slug: "nuckols-beginner-3x",
    title: "Beginner Linear Progression, Squat 3x/Week",
    purchaseUrl: "https://www.strongerbyscience.com/newsletter/",
    sourceUrls: ["https://www.strongerbyscience.com/newsletter/"],
  },

  // --- The rest, most of which already pointed somewhere legitimate.
  {
    slug: "helms-3dmj",
    title: "Six-Day Push/Pull/Legs with RPE Autoregulation",
    purchaseUrl: "https://3dmusclejourney.com/",
    sourceUrls: ["https://3dmusclejourney.com/"],
  },
  {
    slug: "lyle-ud2",
    title: "Glycogen-Depletion Training for Cyclical Dieting",
    purchaseUrl: "https://store.bodyrecomposition.com/shop/ultimate-diet/",
    sourceUrls: ["https://store.bodyrecomposition.com/shop/ultimate-diet/"],
  },
  {
    slug: "bromley-bullmastiff",
    title: "Eighteen-Week Four-Lift Base-Building Block",
    purchaseUrl: "https://www.amazon.com/Base-Strength-Program-Design-Blueprint/dp/B08RT7FM36",
    sourceUrls: [
      "https://empire-barbell.com/2022/08/09/complete-breakdown-of-bullmastiff-plus-free-pdf-of-the-program/",
    ],
  },
  {
    slug: "ben-pollack-think-strong",
    title: "Fifteen-Week RPE Meet Prep",
    purchaseUrl: "https://phdeadlift.gumroad.com/l/thinkstrong",
    sourceUrls: ["https://phdeadlift.gumroad.com/l/thinkstrong"],
  },
  {
    slug: "justin-harris",
    title: "Six-Day High-Volume Powerbuilding",
    purchaseUrl: "https://www.troponinnutrition.com/products/power-bodybuilding",
    sourceUrls: ["https://www.troponinnutrition.com/products/power-bodybuilding"],
  },
  {
    slug: "fst-7",
    title: "Seven-Set Pump Finisher Split",
    purchaseUrl: "https://www.hanyrambod.com/fst7/",
    sourceUrls: ["https://www.hanyrambod.com/fst7/"],
  },
  {
    slug: "thib-layer-system",
    title: "One-Lift-Per-Day Layered Intensity Block",
    purchaseUrl: "https://t-nation.com/t/the-layer-system/285564",
    sourceUrls: ["https://t-nation.com/t/the-layer-system/285564"],
  },
];

async function main() {
  for (const r of REFRAMES) {
    const result = await db
      .update(programs)
      .set({
        title: r.title,
        purchaseUrl: r.purchaseUrl,
        sourceUrls: r.sourceUrls,
        ...(r.summary ? { summary: r.summary } : {}),
      })
      .where(eq(programs.slug, r.slug))
      .returning({ slug: programs.slug });

    if (result.length === 0) console.error(`WARNING: no program matched "${r.slug}"`);
    else console.log(`${r.slug} → "${r.title}"`);
  }

  console.log(`\nreframed ${REFRAMES.length} paid-product reconstructions`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
