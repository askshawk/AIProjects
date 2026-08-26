/**
 * The library, declared. `generate-batch.ts` walks this list and skips anything
 * already saved, so it's safe to append and re-run.
 *
 * `request` is what the model is asked to reconstruct — be specific enough to
 * pin the exact block, since several of these authors have many programs and a
 * vague name gets a vague reconstruction. `slug` is the URL and the identity
 * key: changing it creates a second copy rather than replacing the first.
 */

export type ProgramSpec = {
  request: string;
  slug: string;
  /** Grouping label for --only. Not written to the database — the model
   *  supplies the authoritative author name. */
  author: string;
};

export const MANIFEST: ProgramSpec[] = [
  // ── Backlog: these three ran out of credit mid-batch ────────────────────
  { author: "smolov", request: "Smolov squat cycle, the full 13-week Russian squat specialization program", slug: "smolov-squat" },
  { author: "smolov", request: "Smolov Jr, the 3-week bench press variant of the Smolov cycle", slug: "smolov-jr" },
  { author: "nippard", request: "Jeff Nippard's Push Pull Legs hypertrophy program, science-based 6-day split", slug: "nippard-ppl" },
  { author: "platz", request: "Tom Platz's high-volume leg training and squat specialization routine", slug: "platz-legs" },

  // ── John Meadows (Mountain Dog) ─────────────────────────────────────────
  // Meadows has 20+ named programs; these are the best known.
  { author: "meadows", request: "The Gamma Bomb program by John Meadows", slug: "meadows-gamma-bomb" },
  { author: "meadows", request: "Creeping Death II by John Meadows", slug: "meadows-creeping-death-2" },
  { author: "meadows", request: "Project Colossus by John Meadows", slug: "meadows-project-colossus" },
  { author: "meadows", request: "Odin Force by John Meadows", slug: "meadows-odin-force" },
  { author: "meadows", request: "The Grandmaster by John Meadows", slug: "meadows-grandmaster" },
  { author: "meadows", request: "Hypertrophy Mayhem by John Meadows", slug: "meadows-hypertrophy-mayhem" },
  { author: "meadows", request: "Doomsday by John Meadows", slug: "meadows-doomsday" },
  { author: "meadows", request: "John Meadows Mountain Dog chest and shoulder specialization training", slug: "meadows-chest-shoulders" },

  // ── Jim Wendler (5/3/1) ─────────────────────────────────────────────────
  // 5/3/1 Forever contains 50+ templates; these are the canonical ones.
  { author: "wendler", request: "5/3/1 Boring But Strong template by Jim Wendler", slug: "531-boring-but-strong" },
  { author: "wendler", request: "5/3/1 First Set Last (FSL) template by Jim Wendler", slug: "531-first-set-last" },
  { author: "wendler", request: "5/3/1 5's PRO with Joker sets and First Set Last, by Jim Wendler", slug: "531-5s-pro" },
  { author: "wendler", request: "5/3/1 God is a Beast template by Jim Wendler", slug: "531-god-is-a-beast" },
  { author: "wendler", request: "5/3/1 Krypteia by Jim Wendler", slug: "531-krypteia" },
  { author: "wendler", request: "5/3/1 for Beginners by Jim Wendler", slug: "531-for-beginners" },
  { author: "wendler", request: "5/3/1 Widowmaker challenge template by Jim Wendler", slug: "531-widowmaker" },

  // ── GZCL (Cody Lefever) ─────────────────────────────────────────────────
  { author: "gzcl", request: "The Rippler by Cody Lefever (GZCL method)", slug: "gzcl-rippler" },
  { author: "gzcl", request: "Jacked and Tan 2.0 by Cody Lefever (GZCL method)", slug: "gzcl-jacked-and-tan" },
  { author: "gzcl", request: "UHF (Ultra High Frequency) 9-week by Cody Lefever (GZCL method)", slug: "gzcl-uhf" },

  // ── Jeff Nippard ────────────────────────────────────────────────────────
  { author: "nippard", request: "Jeff Nippard's Upper Lower 4-day hypertrophy program", slug: "nippard-upper-lower" },
  { author: "nippard", request: "Jeff Nippard's Fundamentals Hypertrophy Program for beginners", slug: "nippard-fundamentals" },
  { author: "nippard", request: "Jeff Nippard's Powerbuilding System", slug: "nippard-powerbuilding" },

  // ── Greg Nuckols (Stronger By Science) ──────────────────────────────────
  { author: "nuckols", request: "Greg Nuckols 28 Free Programs — beginner 3x/week squat program", slug: "nuckols-beginner-3x" },
  { author: "nuckols", request: "Greg Nuckols 28 Free Programs — intermediate bench 3x/week", slug: "nuckols-intermediate-bench" },
  { author: "nuckols", request: "Stronger By Science Hypertrophy template by Greg Nuckols and Eric Trexler", slug: "sbs-hypertrophy" },

  // ── Alex Bromley ────────────────────────────────────────────────────────
  { author: "bromley", request: "Base Strength: linear block template by Alexander Bromley", slug: "bromley-base-linear" },
  { author: "bromley", request: "Base Strength: undulating block template by Alexander Bromley", slug: "bromley-base-undulating" },
  { author: "bromley", request: "Peak Strength peaking block by Alexander Bromley", slug: "bromley-peak-strength" },

  // ── Brian Alsruhe ───────────────────────────────────────────────────────
  { author: "alsruhe", request: "Brian Alsruhe's Linear Progression strength program with giant sets", slug: "alsruhe-linear" },
  { author: "alsruhe", request: "Brian Alsruhe's Conjugate program for strongman and powerlifting", slug: "alsruhe-conjugate" },

  // ── Christian Thibaudeau ────────────────────────────────────────────────
  { author: "thibaudeau", request: "The Best Damn Workout Plan For Natural Lifters by Christian Thibaudeau", slug: "thib-best-damn" },
  { author: "thibaudeau", request: "Christian Thibaudeau's Layer System", slug: "thib-layer-system" },
  { author: "thibaudeau", request: "High-Performance Mass (HP Mass) by Christian Thibaudeau", slug: "thib-hp-mass" },

  // ── Boris Sheiko ────────────────────────────────────────────────────────
  { author: "sheiko", request: "Sheiko routine #30 for intermediate powerlifters", slug: "sheiko-30" },
  { author: "sheiko", request: "Sheiko routine #37 competition preparation cycle", slug: "sheiko-37" },

  // ── Renaissance Periodization / Mike Israetel ───────────────────────────
  { author: "rp", request: "Renaissance Periodization male physique template — 5-day upper/lower hypertrophy", slug: "rp-male-physique" },
  { author: "rp", request: "Mike Israetel's chest and back specialization mesocycle", slug: "rp-chest-back-spec" },

  // ── Dan John ────────────────────────────────────────────────────────────
  { author: "danjohn", request: "Easy Strength (the 40-day workout) by Dan John and Pavel Tsatsouline", slug: "easy-strength" },
  { author: "danjohn", request: "Mass Made Simple by Dan John", slug: "mass-made-simple" },
  { author: "danjohn", request: "Dan John's Even Easier Strength 40-day program", slug: "danjohn-40-day" },

  // ── Classic and internet canon ──────────────────────────────────────────
  { author: "misc", request: "The Cube Method by Brandon Lilly", slug: "cube-method" },
  { author: "misc", request: "Korte's 3x3 powerlifting program", slug: "korte-3x3" },
  { author: "misc", request: "StrongLifts 5x5 novice program", slug: "stronglifts-5x5" },
  { author: "misc", request: "Ivysaur 4-4-8 novice linear progression program", slug: "ivysaur-448" },
  { author: "misc", request: "PH3 by Layne Norton", slug: "layne-norton-ph3" },
  { author: "misc", request: "Deep Water Advanced phase by Jon Andersen", slug: "deep-water-advanced" },
  { author: "misc", request: "Ed Coan's classic 10-week deadlift routine", slug: "ed-coan-deadlift" },
  { author: "misc", request: "Base Building by Paul Carter", slug: "paul-carter-base-building" },
  { author: "misc", request: "Strong Curves glute-focused program by Bret Contreras", slug: "strong-curves" },
  { author: "misc", request: "Charles Poliquin's German Body Composition (GBC) program", slug: "poliquin-gbc" },
  { author: "misc", request: "Vince Gironda's 6x6 'Perfect Solution' mass routine", slug: "gironda-6x6" },
  { author: "misc", request: "Reg Park 5x5 phase two and three intermediate program", slug: "reg-park-phase-2-3" },
  { author: "misc", request: "The Bulgarian Method for powerlifting, daily max training", slug: "bulgarian-method" },
  { author: "misc", request: "Hepburn Method strength program by Doug Hepburn", slug: "hepburn-method" },
  { author: "misc", request: "Bill Starr's Heavy Light Medium 5x5 program", slug: "bill-starr-hlm" },
  { author: "misc", request: "Push Pull Legs 6-day Metallicadpa Reddit PPL program", slug: "reddit-ppl" },
  { author: "misc", request: "The Juggernaut Method 2.0 Base Template by Chad Wesley Smith", slug: "juggernaut-2-base" },
  { author: "misc", request: "Eric Helms' 3DMJ intermediate hypertrophy template", slug: "helms-3dmj" },
  { author: "misc", request: "Kizen 12-week powerlifting peaking program", slug: "kizen-peaking" },
  { author: "misc", request: "John Broz's Bulgarian-style Olympic weightlifting program", slug: "broz-olympic" },
];
