/*
 * Broken Collars - balance configuration.
 *
 * Every tunable number lives here. Nothing in this file touches the DOM, so it
 * loads unchanged in Node (see tools/verify.js) as well as in the browser.
 *
 * Arrays indexed by building/upgrade level are 0-based: index 0 is level 1.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BALANCE = {
    version: 1,

    // ---- Battlefield ----
    // Battlefield and base are both this many tiles square. Kept tight so
    // buildings render large enough to read in isometric.
    grid: 22,
    tickRate: 10,         // simulation steps per second (the replay clock)
    battleSeconds: 180,   // hard timer on every raid
    deployMargin: 3,      // dogs must be released within N tiles of the map edge
    attackReach: 0.7,     // how far past a building's edge a dog can bite from
    defenderLeash: 11,    // guard-post dogs stop chasing past this many tiles

    // ---- Scoring ----
    oneStarDestruction: 0.5,          // 1 star at 50% of buildings razed
    bloodlineByStars: [5, 15, 35, 70],
    maxLootFraction: 0.9,             // even a perfect raid leaves a little behind

    // Capacity you have before building any storage at all.
    baseStorage: 600,

    // ---- Buildings ----
    buildings: {
      kennel: {
        label: 'Kennel', icon: '🏰', size: 3, role: 'core',
        blurb: 'Your great hall. Its level gates every other structure.',
        hp: [1400, 1800, 2300, 2900, 3600],
        cost: [0, 1500, 4500, 12000, 30000]
      },
      farm: {
        label: 'Farm', icon: '🌾', size: 2, role: 'production', resource: 'food',
        blurb: 'Produces Food over time. Food breeds and trains dogs.',
        rate: [140, 230, 370, 580, 900],
        hp: [320, 420, 540, 700, 900],
        cost: [120, 400, 1200, 3200, 8000]
      },
      goldMine: {
        label: 'Gold Mine', icon: '⛏️', size: 2, role: 'production', resource: 'gold',
        blurb: 'Produces Gold over time. Gold raises and upgrades buildings.',
        rate: [110, 185, 300, 470, 730],
        hp: [320, 420, 540, 700, 900],
        cost: [160, 500, 1500, 4000, 9500]
      },
      foodStore: {
        label: 'Food Store', icon: '🥩', size: 2, role: 'storage', resource: 'food',
        blurb: 'Holds Food. Raiders steal from here, so bury it behind walls.',
        capacity: [1200, 2600, 5500, 11000, 22000],
        hp: [380, 500, 650, 850, 1100],
        cost: [140, 450, 1300, 3600, 9000]
      },
      goldVault: {
        label: 'Gold Vault', icon: '💰', size: 2, role: 'storage', resource: 'gold',
        blurb: 'Holds Gold. Raiders steal from here too.',
        capacity: [1200, 2600, 5500, 11000, 22000],
        hp: [380, 500, 650, 850, 1100],
        cost: [140, 450, 1300, 3600, 9000]
      },
      breedingPen: {
        label: 'Breeding Pen', icon: '🐾', size: 2, role: 'army',
        blurb: 'Kennel space. Bigger pens mean a bigger war pack.',
        armySpace: [16, 28, 30, 40, 52],
        hp: [400, 520, 680, 880, 1150],
        cost: [250, 800, 2400, 6000, 14000]
      },
      trainingYard: {
        label: 'Training Yard', icon: '🦴', size: 3, role: 'army',
        blurb: 'Trains dogs. Higher levels train the whole pack faster.',
        trainSpeed: [1, 1.3, 1.65, 2.05, 2.5],
        hp: [520, 680, 880, 1150, 1500],
        cost: [350, 1100, 3000, 7500, 17000]
      },
      watchtower: {
        label: 'Watchtower', icon: '🗼', size: 2, role: 'defense',
        blurb: 'Archers. Fires on the nearest attacking dog in range.',
        range: [6, 6.5, 7, 7.5, 8],
        dps: [26, 34, 45, 58, 74],
        hp: [460, 600, 780, 1020, 1350],
        cost: [220, 700, 2100, 5500, 13000]
      },
      guardPost: {
        label: 'Guard Post', icon: '🛡️', size: 2, role: 'defense',
        blurb: 'Releases your own defending hounds when raiders come close.',
        packSize: [2, 2, 3, 3, 4],
        dogHp: [220, 290, 380, 490, 620],
        dogDps: [34, 44, 56, 70, 88],
        triggerRange: 7,
        hp: [520, 680, 880, 1150, 1500],
        cost: [320, 950, 2700, 6800, 15500]
      },
      // Enemy-only. Captors keep stolen hounds here; breaking a cage row frees
      // them and they join your pack. The player can never build one (their
      // limit is 0 at every Kennel level), but it lives in the same building
      // table because enemy and player bases are the same data shape.
      cage: {
        label: 'Cage Row', icon: '⛓️', size: 2, role: 'cage',
        blurb: 'Stolen hounds are kept here. Break it and they run to you.',
        captives: [2, 3, 4, 5, 6],
        hp: [340, 450, 590, 770, 1000],
        cost: [0, 0, 0, 0, 0]
      },
      wall: {
        label: 'Wall', icon: '🧱', size: 1, role: 'wall',
        blurb: 'Slows anything that cannot slip through a gap.',
        hp: [160, 240, 360, 520, 760],
        cost: [15, 45, 140, 420, 1200]
      }
    },

    // How many of each building a given Kennel level permits (index = kennel level - 1).
    // A building can also never be upgraded above your Kennel level.
    limits: {
      kennel: [1, 1, 1, 1, 1],
      farm: [2, 3, 4, 5, 6],
      goldMine: [2, 3, 4, 5, 6],
      foodStore: [1, 2, 2, 3, 3],
      goldVault: [1, 2, 2, 3, 3],
      breedingPen: [1, 1, 2, 2, 2],
      trainingYard: [1, 1, 1, 2, 2],
      watchtower: [1, 2, 3, 4, 5],
      guardPost: [0, 1, 1, 2, 3],
      cage: [0, 0, 0, 0, 0],       // enemy-only: you free hounds, you do not cage them
      // Enough stone at every level to actually close a ring around the core,
      // otherwise walls render as a dashed line and stop nothing.
      wall: [24, 36, 46, 58, 72]
    },

    // Order the build palette is shown in.
    buildOrder: ['farm', 'goldMine', 'foodStore', 'goldVault', 'breedingPen',
      'trainingYard', 'watchtower', 'guardPost', 'wall'],

    // ---- Breeds ----
    // targeting: 'nearest'  -> closest building of any kind
    //            'defense'  -> hunts watchtowers and guard posts first
    //            'storage'  -> runs for food stores, vaults, farms and mines
    // ignoresWalls: slips through gaps instead of chewing through stone.
    // wallDamage:   multiplier applied only when biting stone. This is the
    //               dial that decides whether walls are a speed bump or a wall.
    breeds: {
      mastiff: {
        label: 'Mastiff', icon: '🐕‍🦺', color: '#8d6748',
        blurb: 'Slow armoured wall-breaker. Chews stone 8x faster than the pack.',
        space: 5, food: 220, trainSeconds: 45,
        hp: 1100, dps: 46, speed: 0.55, wallDamage: 8,
        targeting: 'nearest', ignoresWalls: false, unlock: 0
      },
      malinois: {
        label: 'Belgian Malinois', icon: '🐕', color: '#c98f36',
        blurb: 'Balanced hunter. Goes straight for towers and guard posts.',
        space: 3, food: 140, trainSeconds: 28,
        hp: 460, dps: 96, speed: 1.0, wallDamage: 2,
        targeting: 'defense', ignoresWalls: false, unlock: 0
      },
      jackRussell: {
        label: 'Jack Russell', icon: '🐶', color: '#e4dbc6',
        blurb: 'Cheap and fearless. Swarms anything that fires one shot at a time.',
        space: 1, food: 35, trainSeconds: 8,
        hp: 90, dps: 33, speed: 1.35, wallDamage: 1,
        targeting: 'nearest', ignoresWalls: false, unlock: 0
      },
      bloodhound: {
        label: 'Bloodhound', icon: '🦮', color: '#a0522d',
        blurb: 'Scout. Bring one and you see the enemy layout before you commit.',
        space: 2, food: 90, trainSeconds: 20,
        hp: 180, dps: 26, speed: 1.6, wallDamage: 1.5,
        targeting: 'nearest', ignoresWalls: false, scout: true, unlock: 250
      },
      greyhound: {
        label: 'Greyhound', icon: '🐩', color: '#9fb4c7',
        blurb: 'Blistering and fragile. Slips through gaps and raids the stores.',
        space: 3, food: 165, trainSeconds: 30,
        hp: 190, dps: 52, speed: 2.1, wallDamage: 0.5,
        targeting: 'storage', ignoresWalls: true, unlock: 450
      },
      husky: {
        label: 'Husky', icon: '🐺', color: '#cfd8e3',
        blurb: 'Hauler. Weak in a fight, but every husky brings more loot home.',
        space: 4, food: 185, trainSeconds: 35,
        hp: 380, dps: 24, speed: 1.0, wallDamage: 1,
        targeting: 'storage', ignoresWalls: false, lootBonus: 0.12, unlock: 700
      }
    },

    breedOrder: ['jackRussell', 'malinois', 'mastiff', 'bloodhound', 'greyhound', 'husky'],

    // ---- Permanent bloodline upgrades ----
    upgrades: {
      ironJaws: {
        label: 'Iron Jaws', icon: '🦷', stat: 'dps', per: 0.08,
        blurb: '+8% damage for every dog you own, permanently.',
        cost: [200, 500, 1100]
      },
      thickCoats: {
        label: 'Thick Coats', icon: '🧥', stat: 'hp', per: 0.08,
        blurb: '+8% health for every dog you own, permanently.',
        cost: [200, 500, 1100]
      },
      packRunners: {
        label: 'Pack Runners', icon: '💨', stat: 'speed', per: 0.07,
        blurb: '+7% movement speed for every dog you own, permanently.',
        cost: [150, 400, 900]
      }
    },

    upgradeOrder: ['ironJaws', 'thickCoats', 'packRunners'],

    // ---- Liberation ----
    // How many cage rows a captor keeps, by their Kennel level.
    cagesByLevel: [1, 1, 2, 2, 2],

    // What turns up inside them, as [breed, weight]. Freed hounds ignore the
    // unlock gate on purpose: rescuing a Husky before you can breed one is the
    // reward, and it teases the breed you have not paid for yet.
    freedBreeds: [
      ['jackRussell', 40], ['malinois', 25], ['mastiff', 15],
      ['bloodhound', 10], ['greyhound', 7], ['husky', 3]
    ],

    // ---- Starting conditions ----
    start: {
      food: 700,
      gold: 700,
      bloodline: 0,
      // Leaves headroom in the level-1 pen, so a new lord can train something
      // immediately instead of landing on a full pack with every button dead.
      roster: { jackRussell: 5, malinois: 1 }
    }
  };

  return { BALANCE: BALANCE };
});
