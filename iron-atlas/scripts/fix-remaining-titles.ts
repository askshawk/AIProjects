import "./env";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { programs } from "@/db/schema";

/**
 * Retitles the remaining reconstructions that still used a coach's name as
 * the literal program title. The byline already reads "based on the method
 * popularized by {author}" for every non-firstParty program — the title only
 * needs to describe the training content, not repeat the attribution that's
 * already sitting right below it.
 *
 * Doesn't touch the 19 paid-product entries (already retitled in
 * fix-paid-product-framing.ts) or the 10 firstParty originals (already
 * retitled in fix-first-party.ts).
 */

const RETITLES: Record<string, string> = {
  "platz-legs": "High-Volume Leg Specialization Block",
  "smolov-squat": "13-Week Base Squat Specialization Cycle",
  "hepburn-method": "Low-Volume Full-Body Strength System",
  "gironda-6x6": "Full-Body 6x6 Bodybuilding Method",
  "larry-scott-arms": "Golden-Era Arm Specialization Split",
  "ronnie-coleman": "High-Intensity Off-Season Mass-Building Split",
  "frank-zane": "Classic Three-Way Aesthetic Split",
  "schoenfeld-hypertrophy": "Evidence-Based Upper/Lower Hypertrophy Program",
  "candito-6-week": "Six-Week Periodized Peaking Program",
  "hepburn-b": "Low-Volume Full-Body Strength System — Program B",
  "reg-park-5x5": "Three-Phase 5x5 Strength and Bulk Program",
  "ed-coan-deadlift": "Ten-Week Deadlift Peaking Cycle",
  "yates-blood-and-guts": "High-Intensity One-Set-to-Failure Split",
  "reg-park-phase-2-3": "5x5 Strength and Bulk Program — Phases 2 & 3",
  "gvs-hypertrophy": "RPE-Autoregulated Push/Pull/Legs Hypertrophy Block",
  "charles-glass": "Pre-Exhaust Bro-Split Hypertrophy Program",
  "sergio-oliva": "High-Frequency Old-School Mass Split",
  "franco-columbu": "Six-Day Powerbuilding Split",
  "broz-olympic": "Bulgarian-Style Daily-Max Weightlifting System",
  "sheiko-37": "Wave-Loaded Squat/Bench/Deadlift Prep Cycle",
  "sheiko-powerlifting": "Work-Capacity Powerlifting Prep Block",
  "omar-isuf": "RPE-Based Upper/Lower Powerbuilding Template",
  "coan-philippi-deadlift": "Twelve-Week Deadlift Specialization Program",
  "flex-wheeler": "Aesthetic-Focused Bodybuilding Split",
  "nubret-pump-training": "High-Frequency Pump Training Method",
  "cbum-classic-physique": "Classic Physique Bodybuilding Split",
  "sheiko-30": "Submaximal High-Volume Powerlifting Block",
  "sheiko-32": "High-Frequency Peaking Cycle for Competition-Ready Lifters",
  "gironda-8x8": "8x8 High-Density Four-Day Split",
  "jay-cutler": "Five-Day Mass-Building Body-Part Split",
  "korte-3x3": "Full-Body 3x3 Strength Program",
  "hatch-squat": "Twice-Weekly Squat Specialization Program",
  "arnold-chest-back": "High-Volume Golden-Era Double-Split Program",
  "wenning-conjugate": "Raw Conjugate Max/Dynamic Effort Template",
};

async function main() {
  for (const [slug, title] of Object.entries(RETITLES)) {
    const result = await db
      .update(programs)
      .set({ title })
      .where(eq(programs.slug, slug))
      .returning({ slug: programs.slug });

    if (result.length === 0) console.error(`WARNING: no program matched "${slug}"`);
    else console.log(`${slug} → "${title}"`);
  }

  console.log(`\nretitled ${Object.keys(RETITLES).length} programs`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
