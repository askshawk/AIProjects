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

  // ══ Second wave ══════════════════════════════════════════════════════
  // Bodybuilding's Olympia lineage, the named coaching systems (FST-7, Y3T,
  // Fortitude), the powerlifting coaches, and the internet-famous programs.
  // The first wave covered the canon; this covers the breadth.
  { author: "olympia", request: "Ronnie Coleman's high-volume Mr. Olympia off-season training split", slug: "ronnie-coleman" },
  { author: "olympia", request: "Jay Cutler's Mr. Olympia mass-building training split", slug: "jay-cutler" },
  { author: "olympia", request: "Frank Zane's three-way split for aesthetics and proportion", slug: "frank-zane" },
  { author: "olympia", request: "Larry Scott's arm specialization and Golden Era routine", slug: "larry-scott-arms" },
  { author: "olympia", request: "Sergio Oliva's classic high-frequency mass routine", slug: "sergio-oliva" },
  { author: "olympia", request: "Franco Columbu's powerbuilding routine", slug: "franco-columbu" },
  { author: "olympia", request: "Lee Haney's 'stimulate don't annihilate' training split", slug: "lee-haney" },
  { author: "olympia", request: "Flex Wheeler's aesthetic bodybuilding split", slug: "flex-wheeler" },
  { author: "olympia", request: "Kevin Levrone's low-volume high-intensity Maryland Muscle Machine routine", slug: "kevin-levrone" },
  { author: "olympia", request: "Phil Heath's FST-7 based Mr. Olympia training split", slug: "phil-heath" },
  { author: "olympia", request: "Chris Bumstead's classic physique training split", slug: "cbum-classic-physique" },
  { author: "olympia", request: "Arnold Schwarzenegger's Encyclopedia double-split advanced routine", slug: "arnold-double-split" },
  { author: "olympia", request: "Arnold Schwarzenegger's classic 6-day volume chest and back routine", slug: "arnold-chest-back" },
  { author: "olympia", request: "Dorian Yates' full Blood and Guts 4-day HIT split with rest-pause", slug: "yates-hit-4day" },
  { author: "coaches", request: "FST-7 (Fascia Stretch Training 7) by Hany Rambod", slug: "fst-7" },
  { author: "coaches", request: "Fortitude Training by Dr. Scott Stevenson", slug: "fortitude-training" },
  { author: "coaches", request: "Milos Sarcev's giant set training for hypertrophy", slug: "milos-giant-sets" },
  { author: "coaches", request: "Charles Glass 'Godfather of Bodybuilding' training principles routine", slug: "charles-glass" },
  { author: "coaches", request: "Y3T (Yoda 3 Training) by Neil Hill", slug: "y3t" },
  { author: "coaches", request: "German Body Composition training by Charles Poliquin", slug: "poliquin-gbc-2" },
  { author: "coaches", request: "Charles Poliquin's 1-6 principle strength and size program", slug: "poliquin-1-6" },
  { author: "coaches", request: "Lyle McDonald's Generic Bulking Routine", slug: "lyle-generic-bulking" },
  { author: "coaches", request: "Lyle McDonald's Ultimate Diet 2.0 training component", slug: "lyle-ud2" },
  { author: "coaches", request: "Brad Schoenfeld's evidence-based hypertrophy program", slug: "schoenfeld-hypertrophy" },
  { author: "coaches", request: "Menno Henselmans' Bayesian Bodybuilding hypertrophy template", slug: "menno-bayesian" },
  { author: "coaches", request: "Justin Harris Troponin high-volume powerbuilding", slug: "justin-harris" },
  { author: "powerlifting", request: "Reactive Training Systems (RTS) by Mike Tuchscherer", slug: "rts-tuchscherer" },
  { author: "powerlifting", request: "Calgary Barbell 16-week powerlifting program by Bryce Krawczyk", slug: "calgary-barbell-16" },
  { author: "powerlifting", request: "The Strength Athlete (TSA) 9-week powerlifting peaking program by Bryce Lewis", slug: "tsa-9-week" },
  { author: "powerlifting", request: "Dave Tate's Periodization Bible template", slug: "dave-tate-periodization" },
  { author: "powerlifting", request: "Matt Wenning's Conjugate template for raw powerlifting", slug: "wenning-conjugate" },
  { author: "powerlifting", request: "Josh Bryant's Tactical Powerlifting program", slug: "josh-bryant-tactical" },
  { author: "powerlifting", request: "Chris Duffin's Kabuki Strength squat and deadlift program", slug: "duffin-kabuki" },
  { author: "powerlifting", request: "Stefi Cohen's Hybrid Performance Method strength template", slug: "stefi-hybrid" },
  { author: "powerlifting", request: "Ben Pollack's Think Strong powerlifting program", slug: "ben-pollack-think-strong" },
  { author: "powerlifting", request: "Kirk Karwoski's squat training program under Marty Gallagher", slug: "karwoski-squat" },
  { author: "powerlifting", request: "Marty Gallagher's Purposeful Primitive strength template", slug: "purposeful-primitive" },
  { author: "powerlifting", request: "Coan-Philippi deadlift routine", slug: "coan-philippi-deadlift" },
  { author: "powerlifting", request: "Magnusson-Ortmayer deadlift program", slug: "mag-ort-deadlift" },
  { author: "powerlifting", request: "Dan Green's Boss Barbell powerlifting template", slug: "dan-green" },
  { author: "powerlifting", request: "Hepburn Method Program B for powerlifting", slug: "hepburn-b" },
  { author: "powerlifting", request: "Prilepin-based Russian powerlifting volume template", slug: "prilepin-template" },
  { author: "powerlifting", request: "Verkhoshansky shock method and depth jump strength program", slug: "verkhoshansky" },
  { author: "powerlifting", request: "Boris Sheiko routine #32 for advanced powerlifters", slug: "sheiko-32" },
  { author: "powerlifting", request: "Westside Barbell for Skinny Bastards by Joe DeFranco", slug: "westside-skinny-bastards" },
  { author: "youtube", request: "Ice Cream Fitness 5x5 by Jason Blaha", slug: "ice-cream-fitness" },
  { author: "youtube", request: "Greyskull LP by John Sheaffer (Johnny Pain)", slug: "greyskull-lp" },
  { author: "youtube", request: "Bigger Leaner Stronger by Mike Matthews", slug: "bigger-leaner-stronger" },
  { author: "youtube", request: "Thinner Leaner Stronger by Mike Matthews", slug: "thinner-leaner-stronger" },
  { author: "youtube", request: "Athlean-X Jeff Cavaliere's Ultimate Arms style program", slug: "athlean-x-arms" },
  { author: "youtube", request: "Alan Thrall's Untamed Strength beginner barbell program", slug: "alan-thrall-beginner" },
  { author: "youtube", request: "Omar Isuf's intermediate powerlifting template", slug: "omar-isuf" },
  { author: "youtube", request: "Fierce 5 novice full body routine", slug: "fierce-5" },
  { author: "youtube", request: "Jeff Nippard's Pure Bodybuilding hypertrophy program", slug: "nippard-pure-bodybuilding" },
  { author: "youtube", request: "Natural Hypertrophy's high-frequency natural lifter program", slug: "natural-hypertrophy" },
  { author: "youtube", request: "Geoffrey Verity Schofield's hypertrophy training template", slug: "gvs-hypertrophy" },
  { author: "youtube", request: "Eric Bugenhagen's Rungnarok strength and mobility program", slug: "bugenhagen-rungnarok" },
  { author: "youtube", request: "Mark Bell's Power Rack Strength template", slug: "mark-bell-prs" },
  { author: "athletic", request: "Triphasic Training by Cal Dietz", slug: "triphasic-training" },
  { author: "athletic", request: "Tier System by Joe Kenn (The Coach's Strength Training Playbook)", slug: "joe-kenn-tier" },
  { author: "athletic", request: "Zach Even-Esh's Underground Strength program", slug: "even-esh-underground" },
  { author: "athletic", request: "Gayle Hatch squat program for Olympic weightlifting", slug: "hatch-squat" },
  { author: "athletic", request: "Catalyst Athletics Olympic weightlifting template by Greg Everett", slug: "catalyst-athletics" },
  { author: "athletic", request: "Pavel Tsatsouline's Power to the People minimalist strength program", slug: "power-to-the-people" },
  { author: "athletic", request: "Dan John's Armor Building Complex", slug: "armor-building-complex" },
  { author: "athletic", request: "Jim Wendler's 5/3/1 for Football and athletes", slug: "531-football" },
  { author: "athletic", request: "Joe DeFranco's Built Like a Badass program", slug: "defranco-badass" },
  { author: "meadows", request: "Creeping Death III by John Meadows", slug: "meadows-creeping-death-3" },
  { author: "meadows", request: "The Taskmaster by John Meadows", slug: "meadows-taskmaster" },
  { author: "meadows", request: "Onslaught by John Meadows", slug: "meadows-onslaught" },
  { author: "meadows", request: "John Meadows' Mountain Dog arm specialization program", slug: "meadows-arms" },
  { author: "wendler", request: "5/3/1 Boring But Big Beefcake challenge by Jim Wendler", slug: "531-bbb-beefcake" },
  { author: "wendler", request: "5/3/1 Full Body Four Days by Jim Wendler", slug: "531-full-body-4day" },
  { author: "wendler", request: "5/3/1 Coffinworm template by Jim Wendler", slug: "531-coffinworm" },
  { author: "wendler", request: "5/3/1 Leviathan template by Jim Wendler", slug: "531-leviathan" },
  { author: "gzcl", request: "GZCL VDIP (Volume Dependent Intensity Progression)", slug: "gzcl-vdip" },
  { author: "gzcl", request: "GZCL General Gainz by Cody Lefever", slug: "gzcl-general-gainz" },
  { author: "rp", request: "Renaissance Periodization female physique hypertrophy template", slug: "rp-female-physique" },
  { author: "rp", request: "Mike Israetel's arm and shoulder specialization mesocycle", slug: "rp-arms-delts-spec" },
  { author: "bromley", request: "Bromley's Base Strength wave-loading block for size", slug: "bromley-wave-size" },
  { author: "nuckols", request: "Greg Nuckols 28 Free Programs — advanced deadlift 2x/week", slug: "nuckols-advanced-deadlift" },
];
