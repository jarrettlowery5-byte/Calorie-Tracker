/** Bank / harbor trading and player-to-player trades. */

import { getPlayer, tradeRatios, log } from './helpers.js';
import { RESOURCES } from '../catan/resources.js';

export function canBankTrade(state, playerId, give, receive) {
  if (!RESOURCES.includes(give) || !RESOURCES.includes(receive)) {
    return { ok: false, reason: 'Unknown resource' };
  }
  if (give === receive) return { ok: false, reason: 'Pick two different resources' };
  const player = getPlayer(state, playerId);
  const ratio = tradeRatios(state, player)[give];
  if (player.resources[give] < ratio) return { ok: false, reason: `Need ${ratio} ${give}` };
  if (state.bank[receive] <= 0) return { ok: false, reason: `The bank has no ${receive} left` };
  return { ok: true, ratio };
}

export function bankTrade(state, playerId, give, receive) {
  const check = canBankTrade(state, playerId, give, receive);
  if (!check.ok) throw new Error(check.reason);
  const player = getPlayer(state, playerId);
  player.resources[give] -= check.ratio;
  state.bank[give] += check.ratio;
  player.resources[receive] += 1;
  state.bank[receive] -= 1;
  log(state, 'trade', `${player.name} traded ${check.ratio} ${give} for 1 ${receive}.`, playerId);
  return state;
}

/** Direct trade between two players. Both hands are checked before anything moves. */
export function canPlayerTrade(state, fromId, toId, give, receive) {
  const from = getPlayer(state, fromId);
  const to = getPlayer(state, toId);
  if (!from || !to || fromId === toId) return { ok: false, reason: 'Invalid trade partners' };
  for (const r of RESOURCES) {
    if ((give[r] || 0) > from.resources[r]) return { ok: false, reason: `You do not have enough ${r}` };
    if ((receive[r] || 0) > to.resources[r]) return { ok: false, reason: `${to.name} does not have enough ${r}` };
  }
  const giveTotal = RESOURCES.reduce((n, r) => n + (give[r] || 0), 0);
  const recvTotal = RESOURCES.reduce((n, r) => n + (receive[r] || 0), 0);
  if (giveTotal === 0 || recvTotal === 0) return { ok: false, reason: 'Both sides must offer something' };
  return { ok: true };
}

export function playerTrade(state, fromId, toId, give, receive) {
  const check = canPlayerTrade(state, fromId, toId, give, receive);
  if (!check.ok) throw new Error(check.reason);
  const from = getPlayer(state, fromId);
  const to = getPlayer(state, toId);
  for (const r of RESOURCES) {
    from.resources[r] -= give[r] || 0;
    to.resources[r] += give[r] || 0;
    to.resources[r] -= receive[r] || 0;
    from.resources[r] += receive[r] || 0;
  }
  const fmt = (h) => RESOURCES.filter((r) => h[r] > 0).map((r) => `${h[r]} ${r}`).join(', ');
  log(state, 'trade', `${from.name} traded ${fmt(give)} to ${to.name} for ${fmt(receive)}.`, fromId);
  return state;
}
