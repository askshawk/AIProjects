/*
 * Kennel Wars - seeded random numbers.
 *
 * The battle simulation must never call Math.random(). Every random decision
 * comes from one of these generators, seeded by a number that is stored with
 * the battle. Same seed in, same battle out, which is what lets a server
 * re-run a submitted raid later and check the attacker did not lie about it.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // mulberry32: small, fast, and identical across JS engines for a given seed.
  function makeRng(seed) {
    var a = seed >>> 0;
    function rng() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    rng.int = function (min, max) {          // inclusive both ends
      return min + Math.floor(rng() * (max - min + 1));
    };
    rng.pick = function (list) {
      return list[Math.floor(rng() * list.length)];
    };
    rng.shuffle = function (list) {          // returns a new array
      var out = list.slice();
      for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
      }
      return out;
    };
    return rng;
  }

  // Turn any string (a base id, a player name) into a stable 32-bit seed.
  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  return { makeRng: makeRng, hashSeed: hashSeed };
});
