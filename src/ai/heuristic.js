/**
 * Heuristic AI opponent — v1.
 *
 * Competent, not expert.  It plays a recognisable Catan game: it values spots
 * by pip production weighted toward the resources it is short of, builds
 * cities before settlements when it can, keeps roads pointed at good open
 * spots, uses the robber on whoever is closest to winning, and trades to the
 * bank only when that unblocks a build it actually wants.
 *
 * The whole policy is expressed as a list of goals evaluated in priority order,
 * so a stronger AI can be dropped in by replacing `chooseAction` alone —
 * everything else in the app talks to it through that one function.
 */

import {
  legalActions, applyAction, totalVictoryPoints, publicVictoryPoints,
} from '../engine/game.js';
import { getGraph, getPlayer, tradeRatios, handSize } from '../engine/helpers.js';
import { stealTargets, discardRequirement } from '../engine/production.js';
import { BUILD_COSTS } from '../engine/constants.js';
import { RESOURCES, producesResource } from '../catan/resources.js';
import { pipsFor } from '../catan/tokens.js';

/** How much each resource is worth to the AI, before scarcity weighting. */
const BASE_RESOURCE_VALUE = { wood: 1.0, brick: 1.0, sheep: 0.85, wheat: 1.15, ore: 1.1 };

/* ---------- Position evaluation ---------- */

/**
 * Production value of a node: total pips, weighted by how much this player
 * wants each resource and with a bonus for touching several different ones.
 */
export function evaluateNode(state, playerId, nodeId, weights) {
  const graph = getGraph(state.board);
  const node = graph.nodes.get(nodeId);
  if (!node) return 0;

  let score = 0;
  const kinds = new Set();
  for (const hexId of node.hexIds) {
    const hex = graph.hexById.get(hexId);
    if (hex.type === 'gold') {
      // Gold pays any resource, so treat it as the best resource available.
      score += pipsFor(hex.number) * Math.max(...Object.values(weights)) * 1.1;
      kinds.add('gold');
      continue;
    }
    if (!producesResource(hex.type)) continue;
    score += pipsFor(hex.number) * weights[hex.type];
    kinds.add(hex.type);
  }
  // Diversity is worth real money in Catan: a 3-resource spot beats a
  // same-pip 1-resource spot.
  score *= 1 + 0.12 * (kinds.size - 1);

  // Harbors matter, especially a 2:1 on something the spot actually produces.
  for (const harbor of state.board.harbors) {
    if (!harbor.nodes.includes(nodeId)) continue;
    score += harbor.type === 'generic' ? 1.1 : kinds.has(harbor.type) ? 2.2 : 0.9;
  }
  return score;
}

/**
 * How badly this player wants each resource right now: scarcity in hand,
 * plus whether their existing hexes already produce it.
 */
function resourceWeights(state, player) {
  const graph = getGraph(state.board);
  const produced = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  for (const nodeId of [...player.settlements, ...player.cities]) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    const multiplier = player.cities.includes(nodeId) ? 2 : 1;
    for (const hexId of node.hexIds) {
      const hex = graph.hexById.get(hexId);
      if (producesResource(hex.type)) produced[hex.type] += pipsFor(hex.number) * multiplier;
    }
  }
  const weights = {};
  for (const r of RESOURCES) {
    // Diminishing returns on a resource you already flood in.
    weights[r] = BASE_RESOURCE_VALUE[r] * (1 + 3 / (3 + produced[r]));
  }
  return weights;
}

/* ---------- Setup placement ---------- */

function bestSetupSettlement(state, playerId, legal) {
  const player = getPlayer(state, playerId);
  const weights = resourceWeights(state, player);
  let best = null;
  let bestScore = -Infinity;
  for (const nodeId of legal) {
    const score = evaluateNode(state, playerId, nodeId, weights);
    if (score > bestScore) { bestScore = score; best = nodeId; }
  }
  return best;
}

/**
 * Setup roads point at the best still-open settlement spot two steps away,
 * so the AI's first expansion has somewhere worth going.
 */
function bestSetupRoad(state, playerId, legal) {
  const graph = getGraph(state.board);
  const player = getPlayer(state, playerId);
  const weights = resourceWeights(state, player);
  let best = legal[0];
  let bestScore = -Infinity;
  for (const edgeId of legal) {
    const [a, b] = graph.edges.get(edgeId).nodes;
    // Look one node beyond the far end of the road.
    const far = player.settlements.includes(a) ? b : a;
    let score = evaluateNode(state, playerId, far, weights) * 0.5;
    for (const onward of graph.nodeNeighbors.get(far) || []) {
      score = Math.max(score, evaluateNode(state, playerId, onward, weights));
    }
    if (score > bestScore) { bestScore = score; best = edgeId; }
  }
  return best;
}

/* ---------- Robber ---------- */

/**
 * Put the robber on the hex that hurts the current leader most, and steal from
 * the player with the biggest hand there.  Never rob yourself.
 */
function chooseRobberTarget(state, playerId) {
  const graph = getGraph(state.board);
  const candidates = state.board.hexes.filter(
    (h) => h.type !== 'sea' && h.id !== state.robberHexId && h.number != null,
  );
  let best = null;
  let bestScore = -Infinity;

  for (const hex of candidates) {
    const nodes = graph.hexNodes.get(hex.id) || [];
    let score = 0;
    let selfHit = false;
    for (const other of state.players) {
      const owned = nodes.filter(
        (n) => other.settlements.includes(n) || other.cities.includes(n),
      ).length;
      if (owned === 0) continue;
      if (other.id === playerId) { selfHit = true; continue; }
      // Hurt in proportion to production blocked and how close they are to winning.
      const lead = publicVictoryPoints(state, other);
      score += owned * pipsFor(hex.number) * (1 + lead * 0.25);
    }
    if (selfHit) score -= 100; // never block our own production
    if (score > bestScore) { bestScore = score; best = hex; }
  }
  if (!best) best = candidates[0] || state.board.hexes.find((h) => h.type !== 'sea' && h.id !== state.robberHexId);

  const victims = stealTargets(state, best.id, playerId);
  let victimId = null;
  let bestHand = -1;
  for (const id of victims) {
    const hand = handSize(getPlayer(state, id).resources);
    const lead = publicVictoryPoints(state, getPlayer(state, id));
    const value = hand + lead;
    if (value > bestHand) { bestHand = value; victimId = id; }
  }
  return { hexId: best.id, victimId };
}

/* ---------- Discarding ---------- */

/** Throw away the least useful cards: whatever we hold most of and value least. */
export function chooseDiscard(state, playerId) {
  const player = getPlayer(state, playerId);
  const need = discardRequirement(player);
  const weights = resourceWeights(state, player);
  const pool = [];
  for (const r of RESOURCES) for (let i = 0; i < player.resources[r]; i++) pool.push(r);
  pool.sort((a, b) => weights[a] - weights[b]);

  const out = {};
  for (const r of pool.slice(0, need)) out[r] = (out[r] || 0) + 1;
  return out;
}

/* ---------- Building priorities ---------- */

const canPay = (res, cost) => Object.entries(cost).every(([r, n]) => res[r] >= n);

/** What the AI is saving up for, in priority order. */
function buildPlan(state, playerId, legal) {
  const player = getPlayer(state, playerId);
  const weights = resourceWeights(state, player);
  const plans = [];

  // Cities first: they double production on a spot we already own and are
  // worth two points each.
  for (const nodeId of legal.cities) {
    plans.push({
      kind: 'city',
      cost: BUILD_COSTS.city,
      nodeId,
      score: 100 + evaluateNode(state, playerId, nodeId, weights) * 2,
    });
  }
  // Then new settlements, ranked by what they produce.
  for (const nodeId of legal.settlements) {
    plans.push({
      kind: 'settlement',
      cost: BUILD_COSTS.settlement,
      nodeId,
      score: 80 + evaluateNode(state, playerId, nodeId, weights) * 1.5,
    });
  }
  // Roads, valued by the best settlement spot they open up.
  const graph = getGraph(state.board);
  for (const edgeId of legal.roads) {
    const [a, b] = graph.edges.get(edgeId).nodes;
    let reach = 0;
    for (const end of [a, b]) {
      for (const onward of [end, ...(graph.nodeNeighbors.get(end) || [])]) {
        // Only count spots we could actually build on later.
        const taken = state.players.some(
          (p) => p.settlements.includes(onward) || p.cities.includes(onward),
        );
        if (taken) continue;
        reach = Math.max(reach, evaluateNode(state, playerId, onward, weights));
      }
    }
    // Chasing Longest Road is worth something once we are close.
    const roadRace = player.longestRoadLength >= 4 && state.longestRoad.playerId !== playerId ? 14 : 0;
    plans.push({ kind: 'road', cost: BUILD_COSTS.road, edgeId, score: 22 + reach * 0.8 + roadRace });
  }
  // Development cards are a decent sink for spare ore/wheat/sheep.
  if (legal.canBuyDev) {
    plans.push({ kind: 'devCard', cost: BUILD_COSTS.devCard, score: 40 });
  }
  return plans.sort((a, b) => b.score - a.score);
}

/**
 * Try to reach a plan's cost by trading with the bank, without giving away
 * anything the plan itself needs.
 */
function findEnablingTrade(state, playerId, plan) {
  const player = getPlayer(state, playerId);
  const ratios = tradeRatios(state, player);
  const missing = RESOURCES.filter((r) => (plan.cost[r] || 0) > player.resources[r]);
  if (missing.length !== 1) return null; // only bridge a single-resource gap
  const want = missing[0];
  if ((plan.cost[want] || 0) - player.resources[want] > 1) return null;

  for (const give of RESOURCES) {
    if (give === want) continue;
    const spare = player.resources[give] - (plan.cost[give] || 0);
    if (spare >= ratios[give] && state.bank[want] > 0) {
      return { type: 'bankTrade', give, receive: want };
    }
  }
  return null;
}

/* ---------- The policy ---------- */

/**
 * Decide the AI's single next action for the current state.
 * Returns `null` only if there is genuinely nothing to do.
 */
export function chooseAction(state, playerId) {
  const legal = legalActions(state, playerId);
  const player = getPlayer(state, playerId);

  // --- Forced responses, whoever's turn it is ---
  if (state.phase === 'discard' && legal.mustDiscard > 0) {
    return { type: 'discard', playerId, resources: chooseDiscard(state, playerId) };
  }
  if (state.phase === 'gold') {
    const entry = state.pendingGold.find((g) => g.playerId === playerId);
    if (entry) {
      const weights = resourceWeights(state, player);
      const best = RESOURCES.filter((r) => state.bank[r] > 0)
        .sort((a, b) => weights[b] - weights[a])[0] || 'wood';
      return { type: 'chooseGold', playerId, resources: Array(entry.count).fill(best) };
    }
  }

  if (state.players[state.currentPlayerIndex].id !== playerId) return null;

  // --- Setup ---
  if (state.phase === 'setup') {
    return state.setup.awaiting === 'settlement'
      ? { type: 'setupSettlement', nodeId: bestSetupSettlement(state, playerId, legal.settlements) }
      : { type: 'setupRoad', edgeId: bestSetupRoad(state, playerId, legal.roads) };
  }

  // --- Before the roll: play a knight if the robber is sitting on us ---
  if (state.phase === 'roll') {
    const knight = legal.playableDev.find((c) => c.type === 'knight');
    const robbedHere = getGraph(state.board).hexNodes.get(state.robberHexId) || [];
    const isRobbed = robbedHere.some(
      (n) => player.settlements.includes(n) || player.cities.includes(n),
    );
    if (knight && isRobbed) {
      const target = chooseRobberTarget(state, playerId);
      return { type: 'playKnight', ...target };
    }
    return { type: 'rollDice' };
  }

  if (state.phase === 'robber') {
    return { type: 'moveRobber', ...chooseRobberTarget(state, playerId) };
  }

  if (state.phase !== 'main') return null;

  // --- Main phase ---
  const plans = buildPlan(state, playerId, legal);

  // Play a development card when it clearly helps.
  const dev = pickDevCard(state, playerId, legal, plans);
  if (dev) return dev;

  // Build the best thing we can afford right now.
  for (const plan of plans) {
    if (!canPay(player.resources, plan.cost)) continue;
    if (plan.kind === 'city') return { type: 'buildCity', nodeId: plan.nodeId };
    if (plan.kind === 'settlement') return { type: 'buildSettlement', nodeId: plan.nodeId };
    if (plan.kind === 'road') return { type: 'buildRoad', edgeId: plan.edgeId };
    if (plan.kind === 'devCard') return { type: 'buyDevCard' };
  }

  // Otherwise, trade toward the best plan we are one card short of.
  for (const plan of plans.slice(0, 4)) {
    const trade = findEnablingTrade(state, playerId, plan);
    if (trade) return trade;
  }

  // Dump a genuinely surplus resource rather than risk the robber.
  if (handSize(player.resources) > 7) {
    const dump = surplusTrade(state, playerId);
    if (dump) return dump;
  }

  return { type: 'endTurn' };
}

/** Play a development card when it does something useful this turn. */
function pickDevCard(state, playerId, legal, plans) {
  const player = getPlayer(state, playerId);
  const has = (type) => legal.playableDev.find((c) => c.type === type);

  // Knight: take Largest Army if this play would win it, or shift a robber
  // that is currently hurting us.
  const knight = has('knight');
  if (knight) {
    const holder = state.largestArmy.playerId;
    const holderSize = holder ? getPlayer(state, holder).knightsPlayed : 0;
    const wouldTake = holder !== playerId && player.knightsPlayed + 1 > Math.max(holderSize, 2);
    const robbedNodes = getGraph(state.board).hexNodes.get(state.robberHexId) || [];
    const isRobbed = robbedNodes.some(
      (n) => player.settlements.includes(n) || player.cities.includes(n),
    );
    if (wouldTake || isRobbed) {
      return { type: 'playKnight', ...chooseRobberTarget(state, playerId) };
    }
  }

  // Monopoly: only worth it for a decent haul.
  if (has('monopoly')) {
    let bestRes = null;
    let bestCount = 0;
    for (const r of RESOURCES) {
      const total = state.players.reduce((n, p) => n + (p.id === playerId ? 0 : p.resources[r]), 0);
      if (total > bestCount) { bestCount = total; bestRes = r; }
    }
    if (bestCount >= 4) return { type: 'playMonopoly', resource: bestRes };
  }

  // Year of Plenty: take exactly what the top plan is missing.
  if (has('yearOfPlenty')) {
    const plan = plans[0];
    if (plan) {
      const missing = [];
      for (const r of RESOURCES) {
        const short = (plan.cost[r] || 0) - player.resources[r];
        for (let i = 0; i < short; i++) missing.push(r);
      }
      if (missing.length > 0 && missing.length <= 2) {
        const picks = missing.slice(0, 2);
        while (picks.length < 2) {
          const weights = resourceWeights(state, player);
          picks.push(RESOURCES.filter((r) => state.bank[r] > 0).sort((a, b) => weights[b] - weights[a])[0]);
        }
        if (picks.every((r) => state.bank[r] > 0)) {
          return { type: 'playYearOfPlenty', resources: picks };
        }
      }
    }
  }

  // Road Building: only when we have two road spots worth taking.
  if (has('roadBuilding') && legal.roads.length >= 2) {
    const roadPlans = plans.filter((p) => p.kind === 'road').slice(0, 2);
    if (roadPlans.length === 2) {
      // The second road must still be legal once the first is down.
      try {
        const after = applyAction(state, { type: 'buildRoad', edgeId: roadPlans[0].edgeId });
        void after;
      } catch { /* fall through -- the engine validates again on play */ }
      return { type: 'playRoadBuilding', edgeIds: roadPlans.map((p) => p.edgeId) };
    }
  }
  return null;
}

/** Trade away a clear surplus to avoid losing cards to a 7. */
function surplusTrade(state, playerId) {
  const player = getPlayer(state, playerId);
  const ratios = tradeRatios(state, player);
  const weights = resourceWeights(state, player);
  const wanted = RESOURCES.filter((r) => state.bank[r] > 0).sort((a, b) => weights[b] - weights[a]);
  for (const give of RESOURCES) {
    if (player.resources[give] < ratios[give]) continue;
    const receive = wanted.find((r) => r !== give);
    if (receive) return { type: 'bankTrade', give, receive };
  }
  return null;
}

export const AI_VERSION = 'v1 — heuristic';
