#!/usr/bin/env node
/*
 * Kennel Wars - determinism check.
 *
 *   node tools/verify.js [runs]
 *
 * This is the whole argument for keeping the simulation free of UI code. The
 * same four files the browser loads also load in Node, so this script can
 * replay a raid server-side and confirm it produces an identical result.
 *
 * That is exactly the check a real server would run in the multiplayer version:
 * the attacker submits (army, seed, claimed result), the server re-runs it, and
 * a mismatch means the client lied.
 */
'use strict';

const path = require('path');
const load = (f) => require(path.join(__dirname, '..', 'js', f));

load('balance.js');
load('rng.js');
load('baseModel.js');
load('simulate.js');
load('aiBases.js');

const KW = globalThis.KW;
const B = KW.BALANCE;

function fingerprint(replay) {
  const s = JSON.stringify(replay.frames) + JSON.stringify(replay.events) + JSON.stringify(replay.result);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// The army space a player actually has at a given Kennel level.
function spaceFor(level) {
  const M = KW.baseModel;
  return M.at(B.limits.breedingPen, level) * M.at(B.buildings.breedingPen.armySpace, level);
}

// A competently composed army: enough Mastiffs to open the walls, Malinois to
// kill the towers, Jack Russells to finish the soft buildings. If this cannot
// win, the game is not winnable.
function buildArmy(seed, level) {
  const rng = KW.makeRng(seed ^ 0x9e3779b9);
  const budget = spaceFor(level);
  const mix = [['mastiff', 0.30], ['malinois', 0.45], ['jackRussell', 0.25]];
  const army = [];
  const edge = rng.int(0, 3);

  mix.forEach(([breed, share]) => {
    const space = B.breeds[breed].space;
    const n = Math.max(1, Math.floor((budget * share) / space));
    for (let i = 0; i < n; i++) {
      // Spread the pack out along one edge, the way a player would.
      const along = 2 + ((army.length * 1.7) % (B.grid - 4));
      const margin = 0.6 + rng() * (B.deployMargin - 1.2);
      const pos = edge === 0 ? { x: along, y: margin }
        : edge === 1 ? { x: B.grid - margin, y: along }
          : edge === 2 ? { x: along, y: B.grid - margin }
            : { x: margin, y: along };
      army.push({ breed, x: pos.x, y: pos.y });
    }
  });
  return army;
}

const runs = Number(process.argv[2] || 12);
let failures = 0;

console.log('Kennel Wars determinism check');
console.log('-'.repeat(74));
console.log(
  'seed'.padEnd(12) + 'lvl'.padEnd(5) + 'dogs'.padEnd(6) +
  'destroyed'.padEnd(11) + 'stars'.padEnd(7) + 'loot'.padEnd(16) + 'fingerprint'
);
console.log('-'.repeat(74));

for (let i = 0; i < runs; i++) {
  const seed = KW.hashSeed('verify:' + i);
  const level = (i % 5) + 1;
  const base = KW.aiBases.generateBase(seed, level);
  const army = buildArmy(seed, level);

  const a = KW.simulateBattle({ army, base, seed });
  const b = KW.simulateBattle({ army, base, seed });

  const fa = fingerprint(a);
  const fb = fingerprint(b);
  const same = fa === fb;
  if (!same) failures++;

  const r = a.result;
  console.log(
    String(seed).padEnd(12) +
    String(level).padEnd(5) +
    String(army.length).padEnd(6) +
    (Math.round(r.percentDestroyed * 100) + '%').padEnd(11) +
    String(r.stars).padEnd(7) +
    (r.loot.food + 'f / ' + r.loot.gold + 'g').padEnd(16) +
    fa + (same ? '' : '  MISMATCH -> ' + fb)
  );
}

// A different seed must actually change something, otherwise the seed is
// being ignored and "deterministic" would be hiding a bug.
const baseA = KW.aiBases.generateBase(KW.hashSeed('shape:a'), 3);
const baseB = KW.aiBases.generateBase(KW.hashSeed('shape:b'), 3);
const differs = JSON.stringify(baseA.buildings) !== JSON.stringify(baseB.buildings);

console.log('-'.repeat(74));
console.log(differs ? 'PASS  different seeds produce different bases' : 'FAIL  seed has no effect on layout');
console.log(failures === 0 ? `PASS  ${runs}/${runs} replays reproduced exactly` : `FAIL  ${failures} replay mismatch(es)`);

process.exit(failures === 0 && differs ? 0 : 1);
