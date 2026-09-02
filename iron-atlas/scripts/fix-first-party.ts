import "./env";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { programs } from "@/db/schema";

/**
 * Converts the ten entries whose titles turned out not to correspond to any
 * real published program into Iron Atlas originals.
 *
 * Verification earlier in this project established, for each of these, that no
 * program by that name exists — checked against the coach's own catalogue where
 * one was available (Meadows' Mountain Dog program list, Wendler's site), or
 * against a search that returned nothing for the name at all. The training
 * content is fine and stays exactly as it is. What has to go is a real, living
 * person's name on a program they never wrote, which is a worse problem than
 * any copyright question: it puts words in someone's mouth.
 *
 * These carry no reconstruction badge and no confidence rating, because there
 * is nothing being reconstructed. `aiGenerated` stays true — an LLM did write
 * the programming, and the UI says so — but the claim changes from "this is
 * X's program" to "this is ours."
 */

type Rewrite = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  /** Why this entry exists and what it used to claim. */
  provenance: string;
};

const ORIGIN =
  "This is an Iron Atlas original program, not a reconstruction of anyone's published work.";

const REWRITES: Rewrite[] = [
  {
    slug: "531-boring-but-strong",
    title: "Four-Lift Strength Block with Heavy Back-Off Sets",
    summary:
      "A strength-biased block for intermediate and advanced lifters: one main lift per training day, taken through a percentage wave and followed by heavier, lower-rep back-off work than a typical volume template asks for.",
    description:
      "Each of the four training days is built around a single main lift — press, deadlift, bench, squat — run through a percentage wave, then followed by back-off sets at the first working weight. The back-off work is deliberately heavier and lower-rep than the high-volume assistance most strength templates pair with a wave, which keeps total time down while still adding meaningful tonnage to the main lift.\n\nAssistance is kept simple and categorical rather than prescriptive: something to push, something to pull, something for the midsection, in the 50-100 total rep range per category. Run the block, add to your training maxes, and repeat.",
    provenance:
      "This entry was originally titled \"5/3/1: Boring But Strong\" and credited to Jim Wendler. Research found no such template — the real, well-documented Wendler program is Boring But *Big*, which is a different thing (5x10 of a paired lift, not heavy low-rep back-offs), and it already exists separately in this library. Rather than keep a program under a name its supposed author never used, the training content was kept and the attribution dropped.",
  },
  {
    slug: "531-widowmaker",
    title: "20-Rep Widowmaker Strength Challenge",
    summary:
      "One brutal 20-rep set per main lift, bolted onto a standard four-day percentage wave. For lifters who have run ordinary strength cycles and want a punishing conditioning stimulus on top.",
    description:
      "The main lifts run a conventional percentage wave across four training days. The twist is a single all-out 20-rep set — a \"widowmaker\" — performed on each main lift after the top set, at a weight that makes twenty reps genuinely hard but achievable without racking the bar.\n\nThat set is the whole point of the block. It is as much a conditioning and mental exposure as a hypertrophy stimulus, and it is why the assistance work around it is kept deliberately light. Do not add volume elsewhere to compensate; the 20-rep sets are the volume.",
    provenance:
      "This entry was originally titled \"5/3/1 Widowmaker Challenge\" and credited to Jim Wendler. Research found that \"widowmaker\" in his writing refers to a single 20-rep squat set used *inside* another program (Building the Monolith), and that the separately named \"Widowmaker Challenge\" on his site is an unrelated bodyweight and loaded-carry test. Neither is a four-day percentage program. The training content was kept and the attribution dropped. \"Widowmaker\" itself is a generic lifting term for a 20-rep set, not anyone's brand.",
  },
  {
    slug: "bugenhagen-rungnarok",
    title: "Strongman Hybrid: Strength, Carries and Mobility",
    summary:
      "A high-volume hybrid block pairing heavy barbell compounds with strongman-style loaded carries and unusually deep mobility work, for advanced lifters who want all three in the same training week.",
    description:
      "Four training days combine heavy barbell work with implement carries and high-rep, joint-friendly accessory work. The mobility work is programmed into the sessions rather than left as an afterthought, on the theory that an advanced lifter who can't get into position is leaving strength on the table.\n\nThis is a demanding block. The carries in particular accumulate fatigue that doesn't show up in barbell tonnage, so autoregulate the accessory volume before you cut the main work.",
    provenance:
      "This entry was originally titled \"Rungnarok (Ragnarok)\" and credited to Eric Bugenhagen. Repeated searches found no program of that name by him, or by anyone — the name appears to have been invented. The training content was kept and the attribution dropped.",
  },
  {
    slug: "ivysaur-448",
    title: "4-4-8 Novice Linear Progression",
    summary:
      "A minimalist full-body linear progression for beginners, built on a 4-4-8 rep scheme: two heavy sets of four followed by a back-off set of eight on each main barbell lift.",
    description:
      "Three full-body sessions a week alternating an A and a B day. Each main lift is run for two heavy sets of four, then a single back-off set of eight at a reduced weight — enough heavy exposure to drive a novice linear progression, plus one higher-rep set to add work without a second heavy session.\n\nAdd weight every session you complete all prescribed reps. When you miss the same lift twice in a row, drop it ten percent and build back up. Run it until the linear progression genuinely stops working, which for most beginners is a matter of months, not weeks.",
    provenance:
      "This entry was originally credited to \"Ivysaur\". Research found no canonical published source for a program under that name — unlike genuinely documented novice programs such as Starting Strength or GreySkull LP, which are archived and attributable. The 4-4-8 rep scheme itself is a sound and descriptive idea, so the training content was kept and the attribution dropped.",
  },
  {
    slug: "mag-ort-deadlift",
    title: "Deadlift Specialization: Heavy and Speed",
    summary:
      "A two-day-a-week deadlift specialization block pairing one heavy, escalating-intensity pulling day with a lighter speed and volume day, run alongside your own squat and press training.",
    description:
      "One heavy day per week builds from moderate multi-rep work toward near-maximal singles across the block; a second, lighter day keeps bar speed and pulling frequency high without adding much recovery cost. Posterior chain, grip and midsection accessories support both days.\n\nThis is a specialization block, not a full program — it assumes you are training squat and pressing separately and want the deadlift to be the thing that moves. Test a new max at the end before starting another cycle.",
    provenance:
      "This entry was originally titled the \"Magnusson/Ortmayer Deadlift Routine\" and credited to \"Magnus Magnusson & Ortmayer\". A direct search found no connection between those two names and no canonical source for a routine of that name — it circulates as forum lore with no traceable origin. The training content was kept and the attribution dropped.",
  },
  {
    slug: "meadows-creeping-death-3",
    title: "Six-Day Push/Pull/Legs with Pump Days",
    summary:
      "A six-day bodybuilding block alternating heavier base sessions with higher-rep pump sessions across push, pull and legs — high frequency, high volume, and a lot of blood in the muscle.",
    description:
      "Each movement pattern is trained twice a week: once in a heavier \"base\" session built on compound work in moderate rep ranges, and once in a \"pump\" session built on machines, cables and isolation work at higher reps with short rests.\n\nThe pairing is the point. The base day supplies the mechanical tension, the pump day supplies metabolic stress and blood flow without adding much joint cost, and the six-day frequency means every muscle group gets both stimuli every week. Accessory selection leans toward joint-friendly variations rather than maximal loading.",
    provenance:
      "This entry was originally titled \"Creeping Death III\" and credited to John Meadows. His actual Mountain Dog program catalogue lists \"Creeping Death\" and \"Creeping Death 2\" — there is no third. The title appears to have been invented by extrapolating a sequel that was never released. The training content was kept and the attribution dropped. The genuine Creeping Death II reconstruction exists separately in this library.",
  },
  {
    slug: "meadows-hypertrophy-mayhem",
    title: "High-Frequency Hypertrophy Block",
    summary:
      "An advanced six-day hypertrophy block using drop sets, rest-pause finishers and joint-friendly exercise variations, splitting back into separate width and thickness days and legs into quad- and posterior-chain-dominant days.",
    description:
      "Six training days split the body finely enough that each session can be genuinely hard without wrecking the next one: chest and triceps, back width and biceps, quad-dominant legs, shoulders and traps, back thickness and rear delts, posterior-chain legs and arms.\n\nIntensity techniques are used deliberately rather than everywhere — a drop set or rest-pause finisher on the last exercise for a body part, not on everything. Exercise selection favours variations that load the target muscle without punishing the joint, which is what makes six days a week survivable.",
    provenance:
      "This entry was originally titled \"Hypertrophy Mayhem\" and credited to John Meadows. His actual Mountain Dog program catalogue was checked directly and contains no program by that name. The training content was kept and the attribution dropped.",
  },
  {
    slug: "poliquin-gbc-2",
    title: "Body Composition Supersets (Upper/Lower)",
    summary:
      "A four-day upper/lower block pairing opposing muscle groups in supersets with controlled tempo and short rest periods, aimed at body recomposition rather than maximal strength.",
    description:
      "Every exercise is paired with an antagonist — push with pull, quad with hamstring — and the pair is run back to back with minimal rest before a longer break. Tempo is prescribed and slow enough to matter, particularly on the eccentric, and rest between pairs stays short enough to keep the session metabolically demanding.\n\nThe combination of antagonist pairing and short rest lets you accumulate a lot of quality work in limited time, which is the trade this block is making: it is not the fastest way to add a maximal single, but it holds muscle well in a deficit and the sessions stay short.",
    provenance:
      "This entry was originally titled \"German Body Comp (GBC) Training\" and credited to Charles Poliquin as a distinct second program. Poliquin's real, well-documented GBC is the three-day full-body antagonist-superset version, which exists separately in this library. No separately published four-day upper/lower \"GBC 2\" by Poliquin could be found. The training content was kept and the attribution dropped.",
  },
  {
    slug: "meadows-chest-shoulders",
    title: "Chest and Shoulder Specialization Block",
    summary:
      "A two-day-a-week specialization block for bringing up a lagging chest and delts, meant to be layered into an existing split rather than run on its own.",
    description:
      "Two dedicated sessions a week combine heavy compound pressing with high-volume isolation work and intensity techniques — drop sets, rest-pause, giant sets — concentrated on chest and shoulders.\n\nThis is a specialization block, which means something else has to give. Run it alongside maintenance-level work for everything else; do not stack it on top of a full high-volume split and expect to recover. Six weeks is about as long as it is worth running before returning to balanced training.",
    provenance:
      "This entry was originally titled \"Mountain Dog Training: Chest & Shoulder Specialization\" and credited to John Meadows. His actual program catalogue was checked directly: it contains a standalone chest training manual, but no combined chest-and-shoulder specialization program under this title. The training content was kept and the attribution dropped.",
  },
  {
    slug: "bromley-peak-strength",
    title: "Nine-Week Meet Peaking Block",
    summary:
      "An RPE-autoregulated peaking block for intermediate-to-advanced powerlifters: two intensifying waves on the competition lifts, then a true peak and a taper into meet day.",
    description:
      "Nine weeks in three phases. The first two waves build intensity on squat, bench and deadlift while gradually stripping out secondary variations and accessory volume; the final phase peaks the competition lifts and tapers everything else to arrive fresh.\n\nLoad is autoregulated by RPE rather than fixed percentages, which is what makes a peaking block survivable — on a bad day you hit the same RPE at a lower weight rather than grinding a number that was chosen weeks ago. Openers should feel easy in the last week. If they don't, the taper wasn't long enough.",
    provenance:
      "This entry was originally titled \"Peak Strength Peaking Block\" and credited to Alexander Bromley. Bromley has a real book called Peak Strength, but no separately published program document by this name could be verified, and the book's own example programs are thin on the specifics this entry prescribes. The training content was kept and the attribution dropped.",
  },
];

async function main() {
  for (const r of REWRITES) {
    const result = await db
      .update(programs)
      .set({
        title: r.title,
        authorName: "Iron Atlas",
        firstParty: true,
        summary: r.summary,
        description: r.description,
        confidence: null,
        confidenceNotes: `${ORIGIN}\n\n${r.provenance}`,
        sourceUrls: [],
        purchaseUrl: null,
        verified: false,
      })
      .where(eq(programs.slug, r.slug))
      .returning({ slug: programs.slug });

    if (result.length === 0) console.error(`WARNING: no program matched "${r.slug}"`);
    else console.log(`${r.slug} → "${r.title}" (Iron Atlas original)`);
  }

  console.log(`\nconverted ${REWRITES.length} programs to first-party`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
