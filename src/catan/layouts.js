/**
 * Board layouts.
 *
 * A layout describes the *shape* of a board (which axial coordinates exist and
 * whether each is land or sea) plus the bag of terrain, tokens and harbors that
 * has to be distributed over it.  The generator (generator.js) does the actual
 * randomised placement.
 */

import { hexSpiral, hexId } from '../lib/hex.js';
import { BASE_TOKEN_SPEC, EXTENSION_TOKEN_SPEC } from './tokens.js';
import { SCENARIOS, DEFAULT_SCENARIO_ID } from './scenarios.js';

/**
 * Mode A -- Original 3-4 player board.
 * The classic hexagon: rows of 3-4-5-4-3, i.e. every hex within distance 2 of
 * the centre.
 */
function originalHexes() {
  return hexSpiral(2).map((h) => ({ ...h, id: hexId(h.q, h.r), slot: 'land', region: 'main' }));
}

/**
 * Mode B -- Original + 5-6 player extension, 30 hexes.
 *
 * The official extension board is an elongated hexagon of seven rows:
 * 3-4-5-6-5-4-3 = 30 land hexes.  The `q` start of each row below is chosen so
 * that consecutive rows nest correctly (each wider row overhangs the row above
 * it by half a hex on each side) and the whole shape is left/right symmetric.
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

function extensionHexes() {
  const out = [];
  for (const row of EXTENSION_ROWS) {
    for (let q = row.from; q <= row.to; q++) {
      out.push({ q, r: row.r, id: hexId(q, row.r), slot: 'land', region: 'main' });
    }
  }
  return out;
}

export const BOARD_MODES = {
  original: {
    id: 'original',
    name: 'Original (3–4 players)',
    blurb: '19 hexes, 18 number tokens, 9 harbors. The classic 3-4-5-4-3 island.',
    players: '3–4',
    buildHexes: originalHexes,
    /** 4 forest, 3 hills, 4 pasture, 4 fields, 3 mountains, 1 desert = 19 */
    terrainSpec: { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1 },
    tokenSpec: BASE_TOKEN_SPEC,
    /** 4 generic (3:1) + one 2:1 per resource = 9 */
    harborSpec: { generic: 4, wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 },
    supportsPlay: true,
  },

  extension: {
    id: 'extension',
    name: 'Original + 5–6 player extension',
    blurb: '30 hexes in rows of 3-4-5-6-5-4-3, 28 number tokens, 11 harbors.',
    players: '5–6',
    buildHexes: extensionHexes,
    /** 6 forest, 5 hills, 6 pasture, 6 fields, 5 mountains, 2 desert = 30 */
    terrainSpec: { wood: 6, brick: 5, sheep: 6, wheat: 6, ore: 5, desert: 2 },
    tokenSpec: EXTENSION_TOKEN_SPEC,
    /**
     * 11 harbors.  The extension box adds one 3:1 frame piece and one 2:1 wool
     * frame piece to the base game's 4x 3:1 + 5x 2:1, giving 5 generic and 6
     * resource harbors (wool appearing twice).
     */
    harborSpec: { generic: 5, wood: 1, brick: 1, sheep: 2, wheat: 1, ore: 1 },
    supportsPlay: true,
  },

  seafarers: {
    id: 'seafarers',
    name: 'Seafarers (scenario)',
    blurb: 'Sea hexes, gold fields and discovery islands. Scenario-driven.',
    players: '3–4',
    scenarioDriven: true,
    scenarios: SCENARIOS,
    defaultScenarioId: DEFAULT_SCENARIO_ID,
    supportsPlay: false,
  },
};

export const MODE_LIST = Object.values(BOARD_MODES);

/**
 * Resolve a mode id (+ optional scenario id) to a concrete "recipe": the hex
 * shape and the bags of terrain / tokens / harbors to distribute.
 */
export function resolveRecipe(modeId, scenarioId) {
  const mode = BOARD_MODES[modeId];
  if (!mode) throw new Error(`Unknown board mode: ${modeId}`);
  if (!mode.scenarioDriven) {
    return {
      mode,
      scenario: null,
      hexes: mode.buildHexes(),
      terrainSpec: mode.terrainSpec,
      tokenSpec: mode.tokenSpec,
      harborSpec: mode.harborSpec,
      regions: { main: { terrainSpec: mode.terrainSpec, tokenSpec: mode.tokenSpec } },
    };
  }
  const scenario = mode.scenarios[scenarioId] || mode.scenarios[mode.defaultScenarioId];
  return { mode, scenario, ...scenario.build() };
}
