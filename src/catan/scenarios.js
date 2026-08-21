/**
 * Seafarers scenarios.
 *
 * Seafarers is not one fixed map -- it is a set of scenarios, each with its own
 * frame, island shapes and terrain bags.  This module is a registry so more
 * scenarios can be dropped in later: a scenario only has to expose `build()`
 * returning `{ hexes, regions, harborSpec, coastRegion }`, where
 *
 *   hexes   -- [{ q, r, id, slot: 'land' | 'sea', region: <regionKey> }]
 *   regions -- { [regionKey]: { terrainSpec, tokenSpec, label } }
 *   harborSpec -- { generic: n, wood: n, ... } placed along the main coastline
 *
 * The generator fills each region independently from that region's own terrain
 * and token bags, which is exactly how the physical scenarios are set up.
 */

import { hexSpiral, hexId, hexToPixel, neighborIds, parseHexId } from '../lib/hex.js';
import { BASE_TOKEN_SPEC, EXTENSION_TOKEN_SPEC } from './tokens.js';

/* ---------- Shared island-scenario geometry ---------- */

/** Every hex touching the given set but not inside it -- a one-hex shell. */
function shellAround(coreIds) {
  const shell = new Set();
  for (const id of coreIds) {
    const { q, r } = parseHexId(id);
    for (const n of neighborIds(q, r)) if (!coreIds.has(n)) shell.add(n);
  }
  return shell;
}

/**
 * Order a ring of hexes into a loop by angle about the origin.
 * A one-hex shell around a convex-ish landmass is a simple closed ring, so
 * sorting by bearing walks it in order; the caller asserts adjacency.
 */
function orderRingByAngle(ids) {
  return [...ids]
    .map((id) => {
      const { q, r } = parseHexId(id);
      const p = hexToPixel(q, r, 1);
      return { id, q, r, angle: Math.atan2(p.y, p.x) };
    })
    .sort((a, b) => a.angle - b.angle);
}

/**
 * Build the shared "mainland ringed by ocean, discovery islands offshore"
 * structure that the New Shores scenarios use at both player counts.
 *
 * The ocean is a complete one-hex ring, so every island -- which sits in the
 * next shell out -- is separated from the mainland by exactly one sea hex,
 * which is the rule the scenario actually turns on.
 */
function buildIslandScenario({ mainland, islandCount, islandSize }) {
  const hexes = [];
  const mainIds = new Set(mainland.map((h) => hexId(h.q, h.r)));

  for (const h of mainland) {
    hexes.push({ q: h.q, r: h.r, id: hexId(h.q, h.r), slot: 'land', region: 'main' });
  }

  // The ocean ring separating mainland from islands.
  const seaIds = shellAround(mainIds);
  for (const id of seaIds) {
    const { q, r } = parseHexId(id);
    hexes.push({ q, r, id, slot: 'sea', region: 'sea' });
  }

  // Islands live in the next shell out, evenly spaced around it.
  const outer = orderRingByAngle(shellAround(new Set([...mainIds, ...seaIds])));
  const step = outer.length / islandCount;
  for (let i = 0; i < islandCount; i++) {
    const start = Math.round(i * step);
    for (let k = 0; k < islandSize; k++) {
      const cell = outer[(start + k) % outer.length];
      hexes.push({
        q: cell.q, r: cell.r, id: cell.id,
        slot: 'land', region: 'islands', island: `island-${i + 1}`,
      });
    }
  }
  return hexes;
}

/* ---------- Scenario 1: Heading for New Shores (3-4 players) ---------- */

/**
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
function buildNewShores34() {
  return {
    hexes: buildIslandScenario({
      mainland: hexSpiral(2), // the classic 19-hex island
      islandCount: 4,
      islandSize: 2,
    }),
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

/* ---------- Scenario 2: Heading for New Shores (5-6 players) ---------- */

/**
 * The same scenario scaled up for five and six players, which on the table
 * needs the base game, the Catan 5-6 player extension, Seafarers, and the
 * Seafarers 5-6 player extension.
 *
 * Derived from the confirmed component pools of those four boxes:
 *
 *   Base + Catan 5-6 extension land  = 6 forest, 5 hills, 6 pasture, 6 fields,
 *                                      5 mountains, 2 desert = 30 hexes, which
 *                                      is exactly the 5-6 player board, with
 *                                      exactly its 28 number tokens.
 *   Seafarers + Seafarers 5-6 sea    = 15 + 7 = 22 sea tiles, which is exactly
 *                                      the size of a complete one-hex ocean
 *                                      ring around that 30-hex mainland. That
 *                                      exact match is the main reason to
 *                                      believe this is the intended shape.
 *   Seafarers + Seafarers 5-6 land   = 4 gold, 2 mountains, and one each of
 *                                      fields, hills, pasture, forest, plus a
 *                                      third desert. Dropping the desert (a
 *                                      dead two-hex island is not worth
 *                                      sailing to) leaves 10 hexes: five
 *                                      two-hex discovery islands.
 *
 * DERIVED, NOT TRANSCRIBED: every authoritative rulebook for this extension
 * was unreachable while this was written, so the island *arrangement*, the two
 * extra island number tokens, and the victory point targets below are
 * inference from the component pools rather than a copy of the printed
 * scenario. The mainland, its tokens and the ocean ring are exact. Correct the
 * three inferred values here if you have the box.
 */
const EXTENSION_ROWS = [
  { r: -3, from: 0, to: 2 },   // 3
  { r: -2, from: -1, to: 2 },  // 4
  { r: -1, from: -2, to: 2 },  // 5
  { r: 0, from: -3, to: 2 },   // 6
  { r: 1, from: -3, to: 1 },   // 5
  { r: 2, from: -3, to: 0 },   // 4
  { r: 3, from: -3, to: -1 },  // 3
];

/** The 30-hex 5-6 player mainland: rows of 3-4-5-6-5-4-3. */
function extensionMainland() {
  const out = [];
  for (const row of EXTENSION_ROWS) {
    for (let q = row.from; q <= row.to; q++) out.push({ q, r: row.r });
  }
  return out;
}

function buildNewShores56() {
  return {
    hexes: buildIslandScenario({
      mainland: extensionMainland(),
      islandCount: 5,
      islandSize: 2,
    }),
    regions: {
      main: {
        label: 'Main island',
        // Exactly the 5-6 player board.
        terrainSpec: { wood: 6, brick: 5, sheep: 6, wheat: 6, ore: 5, desert: 2 },
        tokenSpec: EXTENSION_TOKEN_SPEC,
      },
      islands: {
        label: 'Discovery islands',
        // Both Seafarers boxes' extra terrain: four gold fields between them.
        terrainSpec: { gold: 4, ore: 2, wheat: 1, brick: 1, sheep: 1, wood: 1 },
        // The Seafarers box's eight extra tokens, plus two mid-value tokens for
        // the two extra gold fields. Deliberately no 6 or 8: the islands should
        // be worth sailing to without outproducing the mainland.
        tokenSpec: { 2: 1, 3: 1, 4: 2, 5: 1, 8: 1, 9: 1, 10: 2, 11: 1 },
      },
      sea: { label: 'Ocean', terrainSpec: null, tokenSpec: null },
    },
    // The 5-6 player board's own harbor set lines the mainland coast.
    harborSpec: { generic: 5, wood: 1, brick: 1, sheep: 2, wheat: 1, ore: 1 },
    coastRegion: 'main',
  };
}

/* ---------- Registry ---------- */

export const SCENARIOS = {
  'new-shores': {
    id: 'new-shores',
    name: 'Heading for New Shores (3–4 players)',
    players: '3–4',
    summary:
      'The intro Seafarers scenario. A base-game mainland ringed by ocean, with four two-hex discovery islands one sea hex offshore.',
    victoryPoints: { 3: 13, 4: 14 },
    specialRules: [
      'Ships are built on sea edges (1 wood + 1 sheep) and connect coastlines.',
      'Gold fields pay their owner any one resource of their choice per matching roll.',
      'The first settlement you found on each discovery island scores 2 extra victory points.',
      'Play to 14 points with 4 players (13 with 3).',
    ],
    build: buildNewShores34,
  },

  'new-shores-56': {
    id: 'new-shores-56',
    name: 'Heading for New Shores (5–6 players)',
    players: '5–6',
    summary:
      'New Shores scaled for five and six players: the full 30-hex mainland, a complete 22-tile ocean ring, and five two-hex discovery islands carrying four gold fields.',
    victoryPoints: { 5: 15, 6: 16 },
    derived: true,
    specialRules: [
      'Needs the base game, the Catan 5–6 player extension, Seafarers, and the Seafarers 5–6 player extension.',
      'Ships are built on sea edges (1 wood + 1 sheep) and connect coastlines.',
      'Four gold fields — each pays its owner any one resource of their choice per matching roll.',
      'The first settlement you found on each discovery island scores 2 extra victory points.',
      'Play to 15 points with 5 players (16 with 6).',
    ],
    note:
      'Mainland, its 28 tokens and the 22-tile ocean ring follow the component pools exactly. The island arrangement, two of the island number tokens, and the victory targets are derived — no rulebook for this extension was reachable to transcribe from.',
    build: buildNewShores56,
  },
};

export const DEFAULT_SCENARIO_ID = 'new-shores';
export const SCENARIO_LIST = Object.values(SCENARIOS);
