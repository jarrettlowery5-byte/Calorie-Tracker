/** Number token definitions and probability ("pip") maths. */

/**
 * Pips = the number of dot markings under a token = the number of ways two
 * dice can make that value.  6 and 8 have five pips each (the "red numbers").
 */
export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const pipsFor = (n) => (n == null ? 0 : PIPS[n] ?? 0);

/** 6 and 8 are printed in red and are subject to the "no red touching" rule. */
export const isRedNumber = (n) => n === 6 || n === 8;

/** Probability of a number coming up on 2d6. */
export const probabilityOf = (n) => pipsFor(n) / 36;

/**
 * Build a flat list of tokens from a `{ number: count }` spec.
 * Base game: 2x1, 3x2, 4x2, 5x2, 6x2, 8x2, 9x2, 10x2, 11x2, 12x1  => 18 tokens.
 */
export function expandTokenSpec(spec) {
  const out = [];
  for (const [num, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) out.push(Number(num));
  }
  return out.sort((a, b) => a - b);
}

export const BASE_TOKEN_SPEC = { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1 };
export const EXTENSION_TOKEN_SPEC = { 2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 8: 3, 9: 3, 10: 3, 11: 3, 12: 2 };

/**
 * Seafarers "Heading for New Shores" uses the base set plus one extra
 * 2, 3, 4, 5, 8, 9, 10 and 11 (26 tokens for 18 main-island + 8 island hexes).
 */
export const NEW_SHORES_TOKEN_SPEC = { 2: 2, 3: 3, 4: 3, 5: 3, 6: 2, 8: 3, 9: 3, 10: 3, 11: 3, 12: 1 };
