/**
 * Game lifecycle: setup, turn flow, victory, and the single action entry point.
 *
 * Turn structure
 *   setup   -- each player places settlement + road in order, then again in
 *              reverse order; the second settlement pays out its hexes.
 *   roll    -- roll 2d6 (a Knight may also be played before rolling).
 *   discard -- only on a 7, only for players holding more than 7 cards.
 *   robber  -- only on a 7: move the robber and steal.
 *   main    -- build, trade, buy/play development cards, then end the turn.
 */

import {
  getGraph, getPlayer, currentPlayer, emptyResources, handSize, rollDie, log,
} from './helpers.js';
import {
  PLAYER_COLORS, BANK_SIZE, DEFAULT_VICTORY_POINTS, PIECE_LIMITS,
} from './constants.js';
import { RESOURCES, producesResource } from '../catan/resources.js';
import {
  placeSettlement, placeRoad, buildCity, legalSettlementNodes, legalRoadEdges, legalCityNodes,
} from './build.js';
import {
  computeProduction, applyProduction, playersMustDiscard, applyDiscard,
  moveRobber, stealTargets, discardRequirement,
} from './production.js';
import {
  createDevDeck, buyDevCard, playKnight, playRoadBuilding, playYearOfPlenty,
  playMonopoly, playableDevCards, victoryPointCards,
} from './devcards.js';
import { bankTrade, playerTrade } from './trade.js';
import { updateLongestRoad, updateLargestArmy } from './awards.js';

/** Create a fresh game. `playerSpecs` is `[{ name, isAI }]`, 2-6 entries. */
export function createGame({ board, playerSpecs, victoryPointGoal = DEFAULT_VICTORY_POINTS, seed = 1 }) {
  const bankPer = board.modeId === 'extension' ? BANK_SIZE.extension : BANK_SIZE.base;

  const players = playerSpecs.map((spec, i) => ({
    id: `p${i}`,
    index: i,
    name: spec.name,
    isAI: !!spec.isAI,
    color: PLAYER_COLORS[i].hex,
    colorName: PLAYER_COLORS[i].name,
    resources: emptyResources(),
    devCards: [],
    settlements: [],
    cities: [],
    roads: [],
    knightsPlayed: 0,
    longestRoadLength: 0,
  }));

  const state = {
    board,
    players,
    bank: Object.fromEntries(RESOURCES.map((r) => [r, bankPer])),
    devDeck: [],
    turn: 0,
    currentPlayerIndex: 0,
    phase: 'setup',
    dice: null,
    lastRoll: null,
    robberHexId: board.robberHexId,
    longestRoad: { playerId: null, length: 0 },
    largestArmy: { playerId: null, size: 0 },
    devCardPlayedThisTurn: false,
    pendingDiscards: [],
    pendingGold: [],
    victoryPointGoal,
    winner: null,
    log: [],
    rng: { seed: seed >>> 0, cursor: 0 },
    // Snake order: forward once, then back again.
    setup: {
      order: [...players.map((p) => p.id), ...players.map((p) => p.id).reverse()],
      position: 0,
      awaiting: 'settlement',
      lastNode: null,
    },
  };

  state.devDeck = createDevDeck(state, board.modeId);
  log(state, 'system', `New game on a ${board.modeName} board (seed ${board.seedCode}). Playing to ${victoryPointGoal} points.`);
  log(state, 'system', `${players[0].name} places first.`);
  return state;
}

/* ---------- Victory ---------- */

/** Points everyone can see: buildings plus the two award cards. */
export function publicVictoryPoints(state, player) {
  return (
    player.settlements.length +
    player.cities.length * 2 +
    (state.longestRoad.playerId === player.id ? 2 : 0) +
    (state.largestArmy.playerId === player.id ? 2 : 0)
  );
}

/** Public points plus hidden victory point cards. */
export function totalVictoryPoints(state, player) {
  return publicVictoryPoints(state, player) + victoryPointCards(player);
}

function checkVictory(state) {
  // Only the player whose turn it is can win -- you cannot be pushed over the
  // line by someone else's move.
  const player = currentPlayer(state);
  if (totalVictoryPoints(state, player) >= state.victoryPointGoal) {
    state.winner = player.id;
    state.phase = 'gameOver';
    log(state, 'system', `${player.name} wins with ${totalVictoryPoints(state, player)} points!`, player.id);
  }
  return state;
}

/* ---------- Setup ---------- */

function setupPlayerId(state) {
  return state.setup.order[state.setup.position];
}

/** The second settlement each player places pays out its adjacent hexes. */
function payInitialResources(state, playerId, nodeId) {
  const graph = getGraph(state.board);
  const player = getPlayer(state, playerId);
  const node = graph.nodes.get(nodeId);
  const gained = emptyResources();
  for (const hexId of node.hexIds) {
    const hex = graph.hexById.get(hexId);
    if (!producesResource(hex.type)) continue;
    gained[hex.type] += 1;
  }
  for (const r of RESOURCES) {
    if (!gained[r]) continue;
    state.bank[r] -= gained[r];
    player.resources[r] += gained[r];
  }
  const summary = RESOURCES.filter((r) => gained[r] > 0).map((r) => `${gained[r]} ${r}`).join(', ');
  if (summary) log(state, 'produce', `${player.name} collected ${summary} from the second settlement.`, playerId);
}

function advanceSetup(state) {
  const s = state.setup;
  s.position += 1;
  s.awaiting = 'settlement';
  s.lastNode = null;
  if (s.position >= s.order.length) {
    // Setup complete: first player starts the first real turn.
    state.phase = 'roll';
    state.turn = 1;
    state.currentPlayerIndex = 0;
    state.devCardPlayedThisTurn = false;
    log(state, 'system', 'Setup complete. Roll to begin.');
  } else {
    state.currentPlayerIndex = getPlayer(state, setupPlayerId(state)).index;
  }
  return state;
}

/* ---------- Turn flow ---------- */

function beginRobberPhase(state) {
  const mustDiscard = playersMustDiscard(state);
  if (mustDiscard.length > 0) {
    state.pendingDiscards = mustDiscard;
    state.phase = 'discard';
    log(state, 'system', `${mustDiscard.length} player(s) must discard.`);
  } else {
    state.phase = 'robber';
  }
  return state;
}

export function endTurn(state) {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (state.currentPlayerIndex === 0) state.turn += 1;
  state.devCardPlayedThisTurn = false;
  state.dice = null;
  state.phase = 'roll';
  return state;
}

/* ---------- Legal-move queries (used by the UI and the AI) ---------- */

export function legalActions(state, playerId) {
  const player = getPlayer(state, playerId);
  const isCurrent = currentPlayer(state).id === playerId;
  const out = {
    settlements: [], cities: [], roads: [], canBuyDev: false, playableDev: [],
    canRoll: false, canEndTurn: false, robberHexes: [], mustDiscard: 0,
  };
  if (state.phase === 'gameOver') return out;

  if (state.phase === 'discard') {
    out.mustDiscard = state.pendingDiscards.includes(playerId) ? discardRequirement(player) : 0;
    return out;
  }
  if (!isCurrent) return out;

  if (state.phase === 'setup') {
    if (state.setup.awaiting === 'settlement') {
      out.settlements = legalSettlementNodes(state, playerId, { setup: true });
    } else {
      out.roads = legalRoadEdges(state, playerId, { setup: true, fromNode: state.setup.lastNode });
    }
    return out;
  }

  if (state.phase === 'robber') {
    out.robberHexes = state.board.hexes
      .filter((h) => h.type !== 'sea' && h.id !== state.robberHexId)
      .map((h) => h.id);
    return out;
  }

  if (state.phase === 'roll') {
    out.canRoll = true;
    // A Knight may be played before rolling.
    out.playableDev = playableDevCards(state, playerId).filter((c) => c.type === 'knight');
    return out;
  }

  if (state.phase === 'main') {
    out.settlements = legalSettlementNodes(state, playerId);
    out.cities = legalCityNodes(state, playerId);
    out.roads = legalRoadEdges(state, playerId);
    out.canBuyDev = state.devDeck.length > 0 &&
      ['sheep', 'wheat', 'ore'].every((r) => player.resources[r] >= 1);
    out.playableDev = playableDevCards(state, playerId);
    out.canEndTurn = true;
  }
  return out;
}

/* ---------- The single action entry point ---------- */

/**
 * Apply one action and return the new state.
 *
 * The state is cloned first, so callers (React, the AI's lookahead) can treat
 * every result as immutable.  Illegal actions throw with a human-readable reason.
 */
export function applyAction(state, action) {
  const next = cloneState(state);
  const actorId = action.playerId ?? currentPlayer(next).id;

  switch (action.type) {
    case 'setupSettlement': {
      requirePhase(next, 'setup');
      if (setupPlayerId(next) !== actorId) throw new Error('Not your placement');
      if (next.setup.awaiting !== 'settlement') throw new Error('Place a road first');
      placeSettlement(next, actorId, action.nodeId, { setup: true });
      // The second time round, the settlement pays out immediately.
      if (next.setup.position >= next.players.length) payInitialResources(next, actorId, action.nodeId);
      next.setup.awaiting = 'road';
      next.setup.lastNode = action.nodeId;
      break;
    }
    case 'setupRoad': {
      requirePhase(next, 'setup');
      if (setupPlayerId(next) !== actorId) throw new Error('Not your placement');
      if (next.setup.awaiting !== 'road') throw new Error('Place a settlement first');
      placeRoad(next, actorId, action.edgeId, { setup: true, fromNode: next.setup.lastNode });
      updateLongestRoad(next);
      advanceSetup(next);
      break;
    }
    case 'rollDice': {
      requirePhase(next, 'roll');
      requireCurrent(next, actorId);
      const d1 = rollDie(next);
      const d2 = rollDie(next);
      next.dice = [d1, d2];
      next.lastRoll = d1 + d2;
      log(next, 'roll', `${getPlayer(next, actorId).name} rolled ${d1} + ${d2} = ${d1 + d2}.`, actorId);
      if (next.lastRoll === 7) {
        beginRobberPhase(next);
      } else {
        const production = computeProduction(next, next.lastRoll);
        applyProduction(next, production);
        // Gold fields pay a resource of the owner's choice.
        next.pendingGold = Object.entries(production.goldChoices)
          .filter(([, n]) => n > 0)
          .map(([playerId, count]) => ({ playerId, count }));
        next.phase = next.pendingGold.length > 0 ? 'gold' : 'main';
      }
      break;
    }
    case 'chooseGold': {
      requirePhase(next, 'gold');
      const entry = next.pendingGold.find((g) => g.playerId === actorId);
      if (!entry) throw new Error('No gold to choose');
      const picks = action.resources || [];
      if (picks.length !== entry.count) throw new Error(`Choose exactly ${entry.count} resource(s)`);
      const player = getPlayer(next, actorId);
      for (const r of picks) {
        if (!RESOURCES.includes(r)) throw new Error(`Unknown resource: ${r}`);
        if (next.bank[r] <= 0) throw new Error(`The bank has no ${r} left`);
        next.bank[r] -= 1;
        player.resources[r] += 1;
      }
      log(next, 'produce', `${player.name} took ${picks.join(', ')} from a gold field.`, actorId);
      next.pendingGold = next.pendingGold.filter((g) => g.playerId !== actorId);
      if (next.pendingGold.length === 0) next.phase = 'main';
      break;
    }
    case 'discard': {
      requirePhase(next, 'discard');
      applyDiscard(next, actorId, action.resources);
      next.pendingDiscards = next.pendingDiscards.filter((id) => id !== actorId);
      if (next.pendingDiscards.length === 0) next.phase = 'robber';
      break;
    }
    case 'moveRobber': {
      requirePhase(next, 'robber');
      requireCurrent(next, actorId);
      moveRobber(next, action.hexId, actorId, action.victimId ?? null);
      next.phase = 'main';
      break;
    }
    case 'buildSettlement': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      placeSettlement(next, actorId, action.nodeId);
      refundToBank(next, { wood: 1, brick: 1, sheep: 1, wheat: 1 });
      // A new settlement can cut an opponent's road, so recheck the award.
      updateLongestRoad(next);
      checkVictory(next);
      break;
    }
    case 'buildCity': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      buildCity(next, actorId, action.nodeId);
      refundToBank(next, { wheat: 2, ore: 3 });
      checkVictory(next);
      break;
    }
    case 'buildRoad': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      placeRoad(next, actorId, action.edgeId);
      refundToBank(next, { wood: 1, brick: 1 });
      updateLongestRoad(next);
      checkVictory(next);
      break;
    }
    case 'buyDevCard': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      buyDevCard(next, actorId);
      checkVictory(next);
      break;
    }
    case 'playKnight': {
      if (next.phase !== 'roll' && next.phase !== 'main') throw new Error('Cannot play a Knight now');
      requireCurrent(next, actorId);
      playKnight(next, actorId, action.hexId, action.victimId ?? null);
      checkVictory(next);
      break;
    }
    case 'playRoadBuilding': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      playRoadBuilding(next, actorId, action.edgeIds);
      checkVictory(next);
      break;
    }
    case 'playYearOfPlenty': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      playYearOfPlenty(next, actorId, action.resources);
      break;
    }
    case 'playMonopoly': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      playMonopoly(next, actorId, action.resource);
      break;
    }
    case 'bankTrade': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      bankTrade(next, actorId, action.give, action.receive);
      break;
    }
    case 'playerTrade': {
      requirePhase(next, 'main');
      playerTrade(next, action.fromId, action.toId, action.give, action.receive);
      break;
    }
    case 'endTurn': {
      requirePhase(next, 'main');
      requireCurrent(next, actorId);
      endTurn(next);
      break;
    }
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
  return next;
}

/* ---------- Internals ---------- */

function requirePhase(state, phase) {
  if (state.phase !== phase) throw new Error(`Cannot do that during the ${state.phase} phase`);
}

function requireCurrent(state, playerId) {
  if (currentPlayer(state).id !== playerId) throw new Error('It is not your turn');
}

/** Building costs go back into the bank's supply. */
function refundToBank(state, cost) {
  for (const [r, n] of Object.entries(cost)) state.bank[r] += n;
}

/**
 * Deep clone of the mutable parts of the state.  The board is immutable and
 * shared by reference, which also keeps the cached board graph valid.
 */
export function cloneState(state) {
  return {
    ...state,
    board: state.board,
    players: state.players.map((p) => ({
      ...p,
      resources: { ...p.resources },
      devCards: p.devCards.map((c) => ({ ...c })),
      settlements: [...p.settlements],
      cities: [...p.cities],
      roads: [...p.roads],
    })),
    bank: { ...state.bank },
    devDeck: [...state.devDeck],
    dice: state.dice ? [...state.dice] : null,
    longestRoad: { ...state.longestRoad },
    largestArmy: { ...state.largestArmy },
    pendingDiscards: [...state.pendingDiscards],
    pendingGold: state.pendingGold.map((g) => ({ ...g })),
    log: [...state.log],
    rng: { ...state.rng },
    setup: { ...state.setup, order: [...state.setup.order] },
  };
}

export { stealTargets, discardRequirement, PIECE_LIMITS };
