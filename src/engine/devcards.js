/**
 * Development cards.
 *
 * Two rules constrain play: a card cannot be played on the turn it was bought,
 * and only one card may be played per turn (victory point cards are never
 * "played" -- they just count).
 */

import {
  getPlayer, canAfford, payFrom, shuffleInPlace, log, addResources,
} from './helpers.js';
import { BUILD_COSTS, BASE_DEV_DECK, EXTENSION_DEV_DECK } from './constants.js';
import { RESOURCES } from '../catan/resources.js';
import { placeRoad } from './build.js';
import { updateLargestArmy, updateLongestRoad } from './awards.js';
import { moveRobber } from './production.js';

export function createDevDeck(state, modeId) {
  const spec = modeId === 'extension' ? EXTENSION_DEV_DECK : BASE_DEV_DECK;
  const deck = [];
  for (const [type, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) deck.push(type);
  }
  return shuffleInPlace(state, deck);
}

export function canBuyDevCard(state, playerId) {
  const player = getPlayer(state, playerId);
  if (state.devDeck.length === 0) return { ok: false, reason: 'The development deck is empty' };
  if (!canAfford(player.resources, BUILD_COSTS.devCard)) {
    return { ok: false, reason: 'Cannot afford a development card' };
  }
  return { ok: true };
}

export function buyDevCard(state, playerId) {
  const check = canBuyDevCard(state, playerId);
  if (!check.ok) throw new Error(check.reason);
  const player = getPlayer(state, playerId);
  payFrom(player.resources, BUILD_COSTS.devCard);
  for (const [r, n] of Object.entries(BUILD_COSTS.devCard)) state.bank[r] += n;
  const type = state.devDeck.pop();
  // `boughtTurn` enforces the "not on the turn you bought it" rule.
  player.devCards.push({ type, boughtTurn: state.turn, played: false });
  log(state, 'dev', `${player.name} bought a development card.`, playerId);
  return state;
}

/** Cards this player is allowed to play right now. */
export function playableDevCards(state, playerId) {
  const player = getPlayer(state, playerId);
  if (state.devCardPlayedThisTurn) return [];
  return player.devCards
    .map((card, index) => ({ ...card, index }))
    .filter((c) => !c.played && c.type !== 'victoryPoint' && c.boughtTurn < state.turn);
}

function consumeCard(state, playerId, type) {
  const playable = playableDevCards(state, playerId);
  const card = playable.find((c) => c.type === type);
  if (!card) throw new Error(`No playable ${type} card`);
  const player = getPlayer(state, playerId);
  player.devCards[card.index].played = true;
  state.devCardPlayedThisTurn = true;
  return player;
}

export function playKnight(state, playerId, hexId, victimId = null) {
  const player = consumeCard(state, playerId, 'knight');
  player.knightsPlayed += 1;
  log(state, 'dev', `${player.name} played a Knight.`, playerId);
  moveRobber(state, hexId, playerId, victimId);
  updateLargestArmy(state);
  return state;
}

/** Two free roads. The second is optional if only one legal spot remains. */
export function playRoadBuilding(state, playerId, edgeIds) {
  const player = consumeCard(state, playerId, 'roadBuilding');
  log(state, 'dev', `${player.name} played Road Building.`, playerId);
  for (const edgeId of edgeIds.slice(0, 2)) {
    placeRoad(state, playerId, edgeId, { free: true });
  }
  updateLongestRoad(state);
  return state;
}

export function playYearOfPlenty(state, playerId, resources) {
  if (resources.length !== 2) throw new Error('Year of Plenty takes exactly two resources');
  for (const r of resources) {
    if (!RESOURCES.includes(r)) throw new Error(`Unknown resource: ${r}`);
    if (state.bank[r] <= 0) throw new Error(`The bank has no ${r} left`);
  }
  const player = consumeCard(state, playerId, 'yearOfPlenty');
  for (const r of resources) {
    state.bank[r] -= 1;
    player.resources[r] += 1;
  }
  log(state, 'dev', `${player.name} played Year of Plenty and took ${resources.join(' and ')}.`, playerId);
  return state;
}

export function playMonopoly(state, playerId, resource) {
  if (!RESOURCES.includes(resource)) throw new Error(`Unknown resource: ${resource}`);
  const player = consumeCard(state, playerId, 'monopoly');
  let taken = 0;
  for (const other of state.players) {
    if (other.id === playerId) continue;
    taken += other.resources[resource];
    other.resources[resource] = 0;
  }
  player.resources[resource] += taken;
  log(state, 'dev', `${player.name} played Monopoly on ${resource} and took ${taken} card(s).`, playerId);
  return state;
}

/** Victory point cards held (they always count, even unplayed). */
export const victoryPointCards = (player) =>
  player.devCards.filter((c) => c.type === 'victoryPoint').length;
