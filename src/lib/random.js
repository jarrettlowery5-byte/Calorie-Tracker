/** Small deterministic PRNG utilities so any board can be reproduced from a seed. */

/** mulberry32 — fast, decent-quality 32-bit PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn an arbitrary string into a 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** A tiny RNG object with the helpers the generator needs. */
export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    seed,
    next,
    /** Integer in [0, n). */
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Fisher-Yates, returns a new array. */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

/** Encode a numeric seed as a short, human-friendly code. */
export const seedToCode = (seed) => (seed >>> 0).toString(36).toUpperCase().padStart(6, '0');

/** Decode a seed code (accepts raw numbers too). */
export function codeToSeed(code) {
  const trimmed = String(code).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  const n = parseInt(trimmed, 36);
  return Number.isNaN(n) ? hashSeed(trimmed) : n >>> 0;
}
