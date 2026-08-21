/**
 * Placement and building rules for settlements, cities and roads.
 *
 * The two rules that do the heavy lifting:
 *   - Distance rule: no settlement may be adjacent to another building.
 *   - Connection rule: outside setup, a new settlement must touch one of your
 *     own roads, and a new road must touch one of your own roads or buildings
 *     (and may not run *through* an opponent's building).
 */

import { getGraph, getPlayer, playerNodes, canAfford, payFrom, log } from './helpers.js';
import { BUILD_COSTS, PIECE_LIMITS } from './constants.js';
import { isLand } from '../catan/resources.js';

/** Who, if anyone, has a building on this node. */
export function buildingAt(state, nodeId) {
  for (const p of state.players) {
    if (p.settlements.includes(nodeId)) return { playerId: p.id, kind: 'settlement' };
    if (p.cities.includes(nodeId)) return { playerId: p.id, kind: 'city' };
  }
  return null;
}

/** Who, if anyone, owns the road on this edge. */
export function roadAt(state, edgeId) {
  for (const p of state.players) if (p.roads.includes(edgeId)) return p.id;
  return null;
}

/** A node is buildable terrain if it touches at least one land hex. */
function isLandNode(state, nodeId) {
  const graph = getGraph(state.board);
  const node = graph.nodes.get(nodeId);
  if (!node) return false;
  return node.hexIds.some((id) => isLand(graph.hexById.get(id).type));
}

/**
 * The distance rule: a settlement needs every directly adjacent node to be empty.
 */
export function satisfiesDistanceRule(state, nodeId) {
  const graph = getGraph(state.board);
  if (buildingAt(state, nodeId)) return false;
  for (const neighbour of graph.nodeNeighbors.get(nodeId) || []) {
    if (buildingAt(state, neighbour)) return false;
  }
  return true;
}

/** Does this player have a road touching the node? */
function hasRoadAt(state, player, nodeId) {
  const graph = getGraph(state.board);
  return (graph.nodeEdges.get(nodeId) || []).some((e) => player.roads.includes(e));
}

/**
 * Settlement placement.
 * During setup the connection rule is waived -- you place anywhere legal.
 */
export function canPlaceSettlement(state, playerId, nodeId, { setup = false } = {}) {
  const player = getPlayer(state, playerId);
  if (!player) return { ok: false, reason: 'Unknown player' };
  if (!isLandNode(state, nodeId)) return { ok: false, reason: 'Settlements must touch land' };
  if (player.settlements.length + player.cities.length >= PIECE_LIMITS.settlement && !setup) {
    return { ok: false, reason: 'No settlements left' };
  }
  if (!satisfiesDistanceRule(state, nodeId)) {
    return { ok: false, reason: 'Too close to another building' };
  }
  if (!setup) {
    if (!hasRoadAt(state, player, nodeId)) return { ok: false, reason: 'Must connect to one of your roads' };
    if (!canAfford(player.resources, BUILD_COSTS.settlement)) {
      return { ok: false, reason: 'Cannot afford a settlement' };
    }
  }
  return { ok: true };
}

export function legalSettlementNodes(state, playerId, opts = {}) {
  const graph = getGraph(state.board);
  const out = [];
  for (const nodeId of graph.nodes.keys()) {
    if (canPlaceSettlement(state, playerId, nodeId, opts).ok) out.push(nodeId);
  }
  return out;
}

export function placeSettlement(state, playerId, nodeId, { setup = false, free = false } = {}) {
  const check = canPlaceSettlement(state, playerId, nodeId, { setup });
  if (!check.ok) throw new Error(check.reason);
  const player = getPlayer(state, playerId);
  if (!setup && !free) payFrom(player.resources, BUILD_COSTS.settlement);
  player.settlements.push(nodeId);
  log(state, 'build', `${player.name} built a settlement.`, playerId);
  return state;
}

/** Cities upgrade one of your own settlements. */
export function canBuildCity(state, playerId, nodeId) {
  const player = getPlayer(state, playerId);
  if (!player.settlements.includes(nodeId)) return { ok: false, reason: 'Not one of your settlements' };
  if (player.cities.length >= PIECE_LIMITS.city) return { ok: false, reason: 'No cities left' };
  if (!canAfford(player.resources, BUILD_COSTS.city)) return { ok: false, reason: 'Cannot afford a city' };
  return { ok: true };
}

export function legalCityNodes(state, playerId) {
  const player = getPlayer(state, playerId);
  return player.settlements.filter((n) => canBuildCity(state, playerId, n).ok);
}

export function buildCity(state, playerId, nodeId) {
  const check = canBuildCity(state, playerId, nodeId);
  if (!check.ok) throw new Error(check.reason);
  const player = getPlayer(state, playerId);
  payFrom(player.resources, BUILD_COSTS.city);
  player.settlements = player.settlements.filter((n) => n !== nodeId);
  player.cities.push(nodeId);
  log(state, 'build', `${player.name} upgraded a settlement to a city.`, playerId);
  return state;
}

/**
 * Road placement.
 *
 * A road must start from one of your buildings or one of your existing roads.
 * When extending from a road, the shared node must not carry an *opponent's*
 * building -- their settlement cuts your network there.
 */
export function canPlaceRoad(state, playerId, edgeId, { setup = false, free = false, fromNode = null } = {}) {
  const graph = getGraph(state.board);
  const player = getPlayer(state, playerId);
  const edge = graph.edges.get(edgeId);
  if (!edge) return { ok: false, reason: 'No such edge' };
  if (roadAt(state, edgeId)) return { ok: false, reason: 'Already occupied' };
  if (player.roads.length >= PIECE_LIMITS.road) return { ok: false, reason: 'No roads left' };
  // Roads run along land: at least one of the two hexes must be land.
  if (!edge.hexIds.some((id) => isLand(graph.hexById.get(id).type))) {
    return { ok: false, reason: 'Roads must run along land' };
  }
  if (!setup && !free && !canAfford(player.resources, BUILD_COSTS.road)) {
    return { ok: false, reason: 'Cannot afford a road' };
  }

  // During setup the road must attach to the settlement just placed.
  const anchors = fromNode ? [fromNode] : edge.nodes;
  const connected = anchors.some((nodeId) => {
    if (!edge.nodes.includes(nodeId)) return false;
    const building = buildingAt(state, nodeId);
    if (building && building.playerId === playerId) return true;
    // Extending from an existing road, but not through an opponent's building.
    if (building && building.playerId !== playerId) return false;
    return (graph.nodeEdges.get(nodeId) || []).some((e) => player.roads.includes(e));
  });
  if (!connected) return { ok: false, reason: 'Must connect to your own road or building' };
  return { ok: true };
}

export function legalRoadEdges(state, playerId, opts = {}) {
  const graph = getGraph(state.board);
  const out = [];
  for (const edgeId of graph.edges.keys()) {
    if (canPlaceRoad(state, playerId, edgeId, opts).ok) out.push(edgeId);
  }
  return out;
}

export function placeRoad(state, playerId, edgeId, opts = {}) {
  const check = canPlaceRoad(state, playerId, edgeId, opts);
  if (!check.ok) throw new Error(check.reason);
  const player = getPlayer(state, playerId);
  if (!opts.setup && !opts.free) payFrom(player.resources, BUILD_COSTS.road);
  player.roads.push(edgeId);
  log(state, 'build', `${player.name} built a road.`, playerId);
  return state;
}
