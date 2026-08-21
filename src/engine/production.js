/**
 * Resource production, the robber, and forced discards.
 */

import {
  getGraph, getPlayer, emptyResources, handSize, addResources, log, draw,
} from './helpers.js';
import { DISCARD_THRESHOLD } from './constants.js';
import { producesResource, RESOURCES } from '../catan/resources.js';

/**
 * Work out what every player earns from a dice roll.
 *
 * Official bank rule: if the bank cannot pay everyone owed a given resource,
 * nobody receives that resource -- unless exactly one player is owed any of it,
 * in which case they take whatever is left.
 *
 * Gold fields pay a resource of the owner's choice, so they are reported
 * separately as `goldChoices` for the caller to resolve.
 */
export function computeProduction(state, roll) {
  const graph = getGraph(state.board);
  const gains = Object.fromEntries(state.players.map((p) => [p.id, emptyResources()]));
  const goldChoices = Object.fromEntries(state.players.map((p) => [p.id, 0]));
  const demand = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  const claimants = Object.fromEntries(RESOURCES.map((r) => [r, new Set()]));

  for (const hex of state.board.hexes) {
    if (hex.number !== roll) continue;
    if (hex.id === state.robberHexId) continue; // the robber blocks production

    const isGold = hex.type === 'gold';
    if (!producesResource(hex.type) && !isGold) continue;

    for (const nodeId of graph.hexNodes.get(hex.id)) {
      for (const player of state.players) {
        const amount = player.cities.includes(nodeId) ? 2
          : player.settlements.includes(nodeId) ? 1 : 0;
        if (!amount) continue;
        if (isGold) {
          goldChoices[player.id] += amount;
        } else {
          gains[player.id][hex.type] += amount;
          demand[hex.type] += amount;
          claimants[hex.type].add(player.id);
        }
      }
    }
  }

  // Apply the bank-shortage rule per resource.
  const shortages = [];
  for (const res of RESOURCES) {
    if (demand[res] === 0) continue;
    const available = state.bank[res];
    if (demand[res] <= available) continue;
    if (claimants[res].size === 1) {
      // One claimant takes what remains.
      const only = [...claimants[res]][0];
      gains[only][res] = available;
      shortages.push({ resource: res, partial: true });
    } else {
      for (const id of claimants[res]) gains[id][res] = 0;
      shortages.push({ resource: res, partial: false });
    }
  }

  return { gains, goldChoices, shortages };
}

/** Apply a production result to the state, moving cards out of the bank. */
export function applyProduction(state, production) {
  for (const player of state.players) {
    const gained = production.gains[player.id];
    if (handSize(gained) === 0) continue;
    for (const res of RESOURCES) {
      const n = gained[res];
      if (!n) continue;
      state.bank[res] -= n;
      player.resources[res] += n;
    }
    const summary = RESOURCES.filter((r) => gained[r] > 0).map((r) => `${gained[r]} ${r}`).join(', ');
    log(state, 'produce', `${player.name} collected ${summary}.`, player.id);
  }
  for (const { resource, partial } of production.shortages) {
    log(state, 'bank', partial
      ? `The bank ran low on ${resource} — only part of it was paid out.`
      : `The bank could not pay everyone ${resource}, so nobody received any.`);
  }
  return state;
}

/** How many cards this player must discard on a 7 (half, rounded down). */
export function discardRequirement(player) {
  const n = handSize(player.resources);
  return n > DISCARD_THRESHOLD ? Math.floor(n / 2) : 0;
}

/** Everyone who has to discard, in turn order starting from the current player. */
export function playersMustDiscard(state) {
  return state.players.filter((p) => discardRequirement(p) > 0).map((p) => p.id);
}

export function applyDiscard(state, playerId, resources) {
  const player = getPlayer(state, playerId);
  const required = discardRequirement(player);
  const total = handSize(resources);
  if (total !== required) throw new Error(`Must discard exactly ${required} card(s)`);
  for (const res of RESOURCES) {
    const n = resources[res] || 0;
    if (n > player.resources[res]) throw new Error(`Not enough ${res} to discard`);
    player.resources[res] -= n;
    state.bank[res] += n;
  }
  log(state, 'discard', `${player.name} discarded ${required} card(s).`, playerId);
  return state;
}

/** Players the robber could steal from on a hex: anyone with a building there. */
export function stealTargets(state, hexId, thiefId) {
  const graph = getGraph(state.board);
  const nodes = graph.hexNodes.get(hexId) || [];
  const targets = new Set();
  for (const player of state.players) {
    if (player.id === thiefId) continue;
    if (handSize(player.resources) === 0) continue;
    if (nodes.some((n) => player.settlements.includes(n) || player.cities.includes(n))) {
      targets.add(player.id);
    }
  }
  return [...targets];
}

/** Move the robber and, optionally, steal one random card from a victim. */
export function moveRobber(state, hexId, thiefId, victimId = null) {
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex) throw new Error('No such hex');
  if (hex.type === 'sea') throw new Error('The robber cannot go into the sea');
  if (hexId === state.robberHexId) throw new Error('The robber must move to a different hex');

  state.robberHexId = hexId;
  const thief = getPlayer(state, thiefId);
  log(state, 'robber', `${thief.name} moved the robber.`, thiefId);

  if (!victimId) return state;
  const legal = stealTargets(state, hexId, thiefId);
  if (!legal.includes(victimId)) throw new Error('Cannot steal from that player');

  const victim = getPlayer(state, victimId);
  // Pick one card uniformly at random from the victim's hand.
  const hand = [];
  for (const res of RESOURCES) for (let i = 0; i < victim.resources[res]; i++) hand.push(res);
  const stolen = hand[Math.floor(draw(state) * hand.length)];
  victim.resources[stolen] -= 1;
  thief.resources[stolen] += 1;
  log(state, 'robber', `${thief.name} stole a card from ${victim.name}.`, thiefId);
  return state;
}
