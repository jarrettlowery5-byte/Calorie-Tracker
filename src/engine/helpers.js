/** Shared helpers: derived board graph, deterministic dice, resources, ports. */

import { buildGraph } from '../catan/graph.js';
import { mulberry32 } from '../lib/random.js';
import { RESOURCES } from '../catan/resources.js';
import { harborRatio } from '../catan/resources.js';

/**
 * The settlement/road graph is a pure function of the board, so it is cached
 * per board object rather than stored in (and cloned with) the game state.
 */
const graphCache = new WeakMap();
export function getGraph(board) {
  let g = graphCache.get(board);
  if (!g) {
    g = buildGraph(board.hexes);
    graphCache.set(board, g);
  }
  return g;
}

/**
 * Deterministic randomness that survives serialisation: the state carries a
 * seed and a cursor, and every draw advances the cursor.  Replaying the same
 * actions from the same seed always produces the same dice.
 */
export function draw(state) {
  state.rng.cursor += 1;
  return mulberry32((state.rng.seed + state.rng.cursor * 2654435761) >>> 0)();
}

export function rollDie(state) {
  return Math.floor(draw(state) * 6) + 1;
}

export function shuffleInPlace(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(draw(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- Resource bookkeeping ---------- */

export const emptyResources = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

export const handSize = (res) => RESOURCES.reduce((n, r) => n + (res[r] || 0), 0);

export function canAfford(res, cost) {
  return Object.entries(cost).every(([r, n]) => (res[r] || 0) >= n);
}

export function payFrom(res, cost) {
  for (const [r, n] of Object.entries(cost)) res[r] -= n;
}

export function addResources(res, gained) {
  for (const [r, n] of Object.entries(gained)) res[r] = (res[r] || 0) + n;
}

export const getPlayer = (state, id) => state.players.find((p) => p.id === id);
export const currentPlayer = (state) => state.players[state.currentPlayerIndex];

/** Every node this player has a settlement or city on. */
export function playerNodes(player) {
  return [...player.settlements, ...player.cities];
}

/* ---------- Ports ---------- */

/**
 * Best trade ratio this player can get for each resource.
 * 4:1 by default, 3:1 with a generic harbor, 2:1 with the matching harbor --
 * and a harbor only counts if the player has a building on one of its two nodes.
 */
export function tradeRatios(state, player) {
  const ratios = Object.fromEntries(RESOURCES.map((r) => [r, 4]));
  const owned = new Set(playerNodes(player));
  for (const harbor of state.board.harbors) {
    if (!harbor.nodes.some((n) => owned.has(n))) continue;
    const ratio = harborRatio(harbor.type);
    if (harbor.type === 'generic') {
      for (const r of RESOURCES) ratios[r] = Math.min(ratios[r], ratio);
    } else {
      ratios[harbor.type] = Math.min(ratios[harbor.type], ratio);
    }
  }
  return ratios;
}

/** Harbors this player can currently use. */
export function playerHarbors(state, player) {
  const owned = new Set(playerNodes(player));
  return state.board.harbors.filter((h) => h.nodes.some((n) => owned.has(n)));
}

/* ---------- Logging ---------- */

export function log(state, kind, text, playerId = null) {
  state.log.push({ id: state.log.length, turn: state.turn, kind, text, playerId });
  // Keep the log bounded so long games stay light.
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}
