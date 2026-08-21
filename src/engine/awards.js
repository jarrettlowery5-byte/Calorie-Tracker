/**
 * Longest Road and Largest Army.
 *
 * Longest Road is the fiddly one.  It is the longest *trail* through a player's
 * road network -- edges may not repeat, but nodes may be revisited -- and it is
 * cut wherever an opponent has built: you may end a road at an opponent's
 * settlement but you may not run through it.  Five roads are needed to claim
 * the card, and a tie leaves it with whoever already holds it.
 */

import { getGraph, getPlayer, log } from './helpers.js';
import { LONGEST_ROAD_MIN, LARGEST_ARMY_MIN } from './constants.js';
import { buildingAt } from './build.js';

/**
 * Longest trail through one player's road network.
 * Networks top out at 15 roads, so exhaustive DFS from every endpoint is cheap.
 */
export function longestRoadLength(state, playerId) {
  const graph = getGraph(state.board);
  const player = getPlayer(state, playerId);
  const roads = new Set(player.roads);
  if (roads.size === 0) return 0;

  // Which of this player's roads touch each node.
  const roadsAtNode = new Map();
  for (const edgeId of roads) {
    for (const nodeId of graph.edges.get(edgeId).nodes) {
      if (!roadsAtNode.has(nodeId)) roadsAtNode.set(nodeId, []);
      roadsAtNode.get(nodeId).push(edgeId);
    }
  }

  /** A node is a dead end for this player if an opponent has built on it. */
  const blocked = (nodeId) => {
    const b = buildingAt(state, nodeId);
    return !!b && b.playerId !== playerId;
  };

  const used = new Set();
  let best = 0;

  /**
   * `isStart` matters: an opponent's building blocks you from running *through*
   * a node, but a road may still begin or end there.  A closed loop of six
   * roads with an enemy settlement on it is therefore still six long -- the
   * trail starts and ends at that node without ever passing through it.
   */
  function walk(nodeId, length, isStart = false) {
    if (length > best) best = length;
    if (!isStart && blocked(nodeId)) return;
    for (const edgeId of roadsAtNode.get(nodeId) || []) {
      if (used.has(edgeId)) continue;
      const [a, b] = graph.edges.get(edgeId).nodes;
      const next = a === nodeId ? b : a;
      used.add(edgeId);
      walk(next, length + 1);
      used.delete(edgeId);
    }
  }

  for (const nodeId of roadsAtNode.keys()) walk(nodeId, 0, true);
  return best;
}

/**
 * Recompute who holds Longest Road.
 * Called after any road is built and after any settlement that might cut one.
 */
export function updateLongestRoad(state) {
  const lengths = state.players.map((p) => ({ id: p.id, length: longestRoadLength(state, p.id) }));
  for (const { id, length } of lengths) getPlayer(state, id).longestRoadLength = length;

  const holder = state.longestRoad.playerId;
  const holderLength = holder ? lengths.find((l) => l.id === holder).length : 0;
  const best = Math.max(...lengths.map((l) => l.length));

  if (best < LONGEST_ROAD_MIN) {
    // Nobody qualifies any more -- the card goes back in the box.
    if (holder) {
      log(state, 'award', 'Longest Road is no longer held by anyone.');
      state.longestRoad = { playerId: null, length: 0 };
    }
    return state;
  }

  const leaders = lengths.filter((l) => l.length === best);

  // The current holder keeps the card whenever they are among the leaders.
  if (holder && holderLength === best) {
    state.longestRoad = { playerId: holder, length: best };
    return state;
  }

  // Otherwise a single clear leader takes it; if several challengers tie past
  // the holder, the card is set aside until one of them pulls ahead.
  if (leaders.length > 1) {
    if (holder) {
      state.longestRoad = { playerId: null, length: best };
      log(state, 'award', `Longest Road is set aside — ${leaders.length} players are tied on ${best}.`);
    }
    return state;
  }

  const winner = leaders[0];
  if (winner.id !== holder) {
    state.longestRoad = { playerId: winner.id, length: best };
    log(state, 'award', `${getPlayer(state, winner.id).name} takes Longest Road (${best}).`, winner.id);
  }
  return state;
}

/** Largest Army: three or more knights, most played, ties keep the holder. */
export function updateLargestArmy(state) {
  const holder = state.largestArmy.playerId;
  const holderSize = holder ? getPlayer(state, holder).knightsPlayed : 0;
  let leader = null;
  for (const p of state.players) {
    if (p.knightsPlayed < LARGEST_ARMY_MIN) continue;
    if (p.knightsPlayed > (leader?.knightsPlayed ?? 0)) leader = p;
  }
  if (!leader) return state;
  if (leader.knightsPlayed > holderSize) {
    state.largestArmy = { playerId: leader.id, size: leader.knightsPlayed };
    log(state, 'award', `${leader.name} takes Largest Army (${leader.knightsPlayed} knights).`, leader.id);
  }
  return state;
}
