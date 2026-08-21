/**
 * Generation constraints.
 *
 * Each constraint exposes up to three hooks so the generator can use it both
 * as a *pruning* test during backtracking search and as a final verification:
 *
 *   checkTerrain(ctx)              -- validates a completed terrain layout
 *   allowNumber(ctx, hex, value)   -- may this token go on this hex right now?
 *   checkNumbers(ctx)              -- validates a completed number layout
 *
 * `ctx` carries the board being built plus the adjacency helpers the checks
 * need.  Constraints are pure functions -- no mutation.
 */

import { pipsFor, isRedNumber } from './tokens.js';
import { producesResource } from './resources.js';

/** Hexes that carry a number token: everything that produces, plus gold fields. */
export const takesNumber = (type) => producesResource(type) || type === 'gold';

export const CONSTRAINTS = {
  noRedTouching: {
    id: 'noRedTouching',
    label: 'No red numbers touching',
    description: 'No 6 or 8 may sit next to another 6 or 8. This is an official setup rule.',
    default: true,
    /** Softest-to-hardest ordering used when constraints have to be relaxed. */
    priority: 10,
    allowNumber(ctx, hex, value) {
      if (!isRedNumber(value)) return true;
      return !ctx.neighborsOf(hex.id).some((n) => isRedNumber(ctx.numberOf(n)));
    },
  },

  noDuplicateTouching: {
    id: 'noDuplicateTouching',
    label: 'No duplicate numbers touching',
    description: 'The same number may not sit next to itself.',
    default: true,
    priority: 8,
    allowNumber(ctx, hex, value) {
      return !ctx.neighborsOf(hex.id).some((n) => ctx.numberOf(n) === value);
    },
  },

  noResourceClustering: {
    id: 'noResourceClustering',
    label: 'No same-resource clustering',
    description: 'Breaks up blobs of three or more connected hexes of the same terrain.',
    default: true,
    priority: 4,
    checkTerrain(ctx) {
      const seen = new Set();
      for (const hex of ctx.landHexes) {
        if (seen.has(hex.id) || !producesResource(hex.type)) continue;
        // Flood-fill the connected blob of identical terrain.
        let size = 0;
        const stack = [hex.id];
        seen.add(hex.id);
        while (stack.length) {
          const id = stack.pop();
          size++;
          if (size >= 3) return false;
          for (const n of ctx.neighborsOf(id)) {
            if (!seen.has(n) && ctx.typeOf(n) === hex.type) {
              seen.add(n);
              stack.push(n);
            }
          }
        }
      }
      return true;
    },
  },

  pipBalancing: {
    id: 'pipBalancing',
    label: 'Pip balancing',
    description:
      'Spreads high-probability tokens so no resource hoards the good numbers. ' +
      'Caps each resource near its fair share of total pips, and limits red numbers per resource.',
    default: true,
    priority: 2,
    /** Prune as soon as a resource blows past its pip ceiling. */
    allowNumber(ctx, hex, value) {
      const res = hex.type;
      if (!producesResource(res)) return true; // gold has no single resource
      const budget = ctx.pipBudget[res];
      if (!budget) return true;
      if (ctx.pipsByResource[res] + pipsFor(value) > budget.maxPips) return false;
      if (isRedNumber(value) && ctx.redsByResource[res] + 1 > budget.maxReds) return false;
      return true;
    },
    /** ...and verify the lower bound once everything is placed. */
    checkNumbers(ctx) {
      for (const [res, budget] of Object.entries(ctx.pipBudget)) {
        if (ctx.pipsByResource[res] < budget.minPips) return false;
      }
      return true;
    },
  },

  desertInCenter: {
    id: 'desertInCenter',
    label: 'Desert in center',
    description: 'Pins a desert to the most central hex instead of letting it fall anywhere.',
    default: false,
    priority: 6,
    terrainOnly: true, // handled directly by the terrain placer
  },

  randomizeHarbors: {
    id: 'randomizeHarbors',
    label: 'Randomize harbors',
    description: 'Shuffles which coastal slot gets which harbor, and rotates the whole ring.',
    default: true,
    priority: 0,
    harborOnly: true, // handled directly by the harbor placer
  },
};

export const CONSTRAINT_LIST = Object.values(CONSTRAINTS);

export const defaultConstraintState = () =>
  Object.fromEntries(CONSTRAINT_LIST.map((c) => [c.id, c.default]));

/**
 * Fair-share pip budget per resource.
 *
 * Every resource should end up near `totalPips * (its hexes / all numbered
 * hexes)`.  The tolerance is deliberately generous -- tight enough to stop one
 * resource owning every 6 and 8, loose enough that the search still succeeds
 * on the great majority of seeds.
 */
export function computePipBudget(numberedHexes, tokens, tolerance = 0.3) {
  const totalPips = tokens.reduce((sum, t) => sum + pipsFor(t), 0);
  const totalReds = tokens.filter(isRedNumber).length;
  const counts = {};
  for (const h of numberedHexes) {
    if (producesResource(h.type)) counts[h.type] = (counts[h.type] || 0) + 1;
  }
  const numberedCount = numberedHexes.length || 1;

  const budget = {};
  for (const [res, count] of Object.entries(counts)) {
    const expected = (totalPips * count) / numberedCount;
    const slack = Math.max(3, expected * tolerance);
    budget[res] = {
      count,
      expected,
      minPips: Math.max(0, Math.floor(expected - slack)),
      maxPips: Math.ceil(expected + slack),
      // Fair share of red numbers, rounded up, plus one for breathing room.
      maxReds: Math.ceil((totalReds * count) / numberedCount) + 1,
    };
  }
  return budget;
}
