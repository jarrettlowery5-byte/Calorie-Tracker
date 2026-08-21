/** Shared fixtures for the engine tests. */

import { generateBoard } from '../catan/generator.js';
import { createGame } from '../engine/game.js';
import { vertexId, hexEdgeId, edgeId } from '../lib/hex.js';

export const CONSTRAINTS = {
  noRedTouching: true,
  noDuplicateTouching: true,
  noResourceClustering: true,
  pipBalancing: true,
  desertInCenter: false,
  randomizeHarbors: true,
};

export function makeBoard(seed = 42, modeId = 'original') {
  return generateBoard({ modeId, seed, constraints: CONSTRAINTS });
}

/** A game with players but no pieces on the board, ready to be posed by hand. */
export function makeGame({ seed = 42, modeId = 'original', players = 3 } = {}) {
  const board = makeBoard(seed, modeId);
  const specs = ['You', 'Bot A', 'Bot B', 'Bot C'].slice(0, players).map((name, i) => ({
    name, isAI: i > 0,
  }));
  return createGame({ board, playerSpecs: specs, seed: 7 });
}

/** Run the setup phase by always taking the first legal option. */
export function autoSetup(state, applyAction, legalActions) {
  let s = state;
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 500) {
    const pid = s.players[s.currentPlayerIndex].id;
    const legal = legalActions(s, pid);
    s = s.setup.awaiting === 'settlement'
      ? applyAction(s, { type: 'setupSettlement', nodeId: legal.settlements[0] })
      : applyAction(s, { type: 'setupRoad', edgeId: legal.roads[0] });
  }
  return s;
}

/** The six corner node ids of a hex, in corner order. */
export const cornersOf = (q, r) => [0, 1, 2, 3, 4, 5].map((i) => vertexId(q, r, i));

/** The six edge ids around a hex, forming a closed ring of roads. */
export const ringOf = (q, r) => [0, 1, 2, 3, 4, 5].map((d) => hexEdgeId(q, r, d));

/** Give a player pieces directly, bypassing the placement rules. */
export function pose(state, playerIndex, { roads = [], settlements = [], cities = [] }) {
  const p = state.players[playerIndex];
  p.roads.push(...roads);
  p.settlements.push(...settlements);
  p.cities.push(...cities);
  return state;
}

export { vertexId, hexEdgeId, edgeId };
