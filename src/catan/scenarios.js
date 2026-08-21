/**
 * Seafarers scenarios.
 *
 * Seafarers is not one fixed map -- it is a set of scenarios, each with its own
 * frame, island shapes and terrain bags.  This module is a registry so more
 * scenarios can be dropped in later: a scenario only has to expose `build()`
 * returning `{ hexes, regions, harborSpec }`, where
 *
 *   hexes   -- [{ q, r, id, slot: 'land' | 'sea', region: <regionKey> }]
 *   regions -- { [regionKey]: { terrainSpec, tokenSpec, label } }
 *   harborSpec -- { generic: n, wood: n, ... } placed along the main coastline
 *
 * The generator fills each region independently from that region's own terrain
 * and token bags, which is exactly how the physical scenarios are set up.
 */

import { hexSpiral, hexRing, hexId } from '../lib/hex.js';
import { BASE_TOKEN_SPEC } from './tokens.js';

/**
 * Scenario 1 -- "Heading for New Shores" (3-4 players).
 *
 * Official setup, per the Seafarers rulebook:
 *   - The main island is built exactly like the base-game board (19 hexes:
 *     4 forest, 3 hills, 4 pasture, 4 fields, 3 mountains, 1 desert) and takes
 *     the base game's 18 number tokens.
 *   - The extra Seafarers terrain -- 2 gold fields, 2 mountains, 1 field,
 *     1 hill, 1 pasture, 1 forest (8 hexes) -- forms four small "discovery"
 *     islands of two hexes each, every one separated from the mainland by a
 *     single sea hex.
 *   - Those eight island hexes take the eight extra number tokens the box adds:
 *     one each of 2, 3, 4, 5, 8, 9, 10 and 11.
 *   - First settlement on each small island is worth 2 extra victory points;
 *     the game is played to 14 points with four players (13 with three).
 *
 * Adaptation note: the physical scenario's frame trims the ocean to 15 sea
 * tiles.  We lay a complete one-hex sea ring (18 tiles) around the mainland
 * instead, which keeps the map symmetric on screen and preserves the rule that
 * matters -- every discovery island sits exactly one sea hex off the coast.
 */
function buildNewShores() {
  const hexes = [];

  // Main island: the classic 19-hex hexagon.
  for (const h of hexSpiral(2)) {
    hexes.push({ ...h, id: hexId(h.q, h.r), slot: 'land', region: 'main' });
  }

  // A full one-hex ring of ocean separating the mainland from the islands.
  for (const h of hexRing(3)) {
    hexes.push({ ...h, id: hexId(h.q, h.r), slot: 'sea', region: 'sea' });
  }

  // Four two-hex discovery islands, evenly spaced around the radius-4 ring.
  // Every radius-4 hex touches only radius-3 (all ocean) and radius-5, so each
  // island is exactly one sea hex away from the mainland.
  const ring4 = hexRing(4);
  const ISLAND_STARTS = [1, 7, 13, 19]; // evenly spaced around the 24-hex ring
  ISLAND_STARTS.forEach((start, idx) => {
    for (let k = 0; k < 2; k++) {
      const h = ring4[(start + k) % ring4.length];
      hexes.push({ ...h, id: hexId(h.q, h.r), slot: 'land', region: 'islands', island: `island-${idx + 1}` });
    }
  });

  return {
    hexes,
    regions: {
      main: {
        label: 'Main island',
        // Identical to the base game board.
        terrainSpec: { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1 },
        tokenSpec: BASE_TOKEN_SPEC,
      },
      islands: {
        label: 'Discovery islands',
        // The Seafarers box's extra terrain, gold fields included.
        terrainSpec: { gold: 2, ore: 2, wheat: 1, brick: 1, sheep: 1, wood: 1 },
        // The eight extra number tokens the box adds.
        tokenSpec: { 2: 1, 3: 1, 4: 1, 5: 1, 8: 1, 9: 1, 10: 1, 11: 1 },
      },
      sea: { label: 'Ocean', terrainSpec: null, tokenSpec: null },
    },
    // Harbors line the mainland coast, as in the base game.
    harborSpec: { generic: 4, wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 },
    coastRegion: 'main',
  };
}

export const SCENARIOS = {
  'new-shores': {
    id: 'new-shores',
    name: 'Heading for New Shores',
    summary:
      'The intro Seafarers scenario. A base-game mainland ringed by ocean, with four two-hex discovery islands one sea hex offshore.',
    victoryPoints: { 3: 13, 4: 14 },
    specialRules: [
      'Ships are built on sea edges (1 wood + 1 sheep) and connect coastlines.',
      'Gold fields pay their owner any one resource of their choice per matching roll.',
      'The first settlement you found on each discovery island scores 2 extra victory points.',
      'Play to 14 points with 4 players (13 with 3).',
    ],
    build: buildNewShores,
  },
};

export const DEFAULT_SCENARIO_ID = 'new-shores';
export const SCENARIO_LIST = Object.values(SCENARIOS);
