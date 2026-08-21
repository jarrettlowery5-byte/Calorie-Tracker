import { describe, it, expect } from 'vitest';
import {
  computeProduction, applyProduction, discardRequirement, playersMustDiscard,
  applyDiscard, stealTargets, moveRobber,
} from '../engine/production.js';
import { applyAction, legalActions } from '../engine/game.js';
import { handSize } from '../engine/helpers.js';
import { makeGame, pose, cornersOf, autoSetup } from './helpers.js';

/** Find a producing hex and one of its corner nodes. */
function pickProducingHex(state, exclude = []) {
  return state.board.hexes.find(
    (h) => h.number != null && h.type !== 'gold' && !exclude.includes(h.id),
  );
}

describe('production', () => {
  it('pays one card per settlement and two per city', () => {
    const s = makeGame();
    const hex = pickProducingHex(s);
    const [node, other] = cornersOf(hex.q, hex.r);
    pose(s, 0, { settlements: [node] });
    pose(s, 1, { cities: [other] });

    const { gains } = computeProduction(s, hex.number);
    expect(gains.p0[hex.type]).toBe(1);
    expect(gains.p1[hex.type]).toBe(2);
  });

  it('pays nothing from the hex the robber sits on', () => {
    const s = makeGame();
    const hex = pickProducingHex(s);
    pose(s, 0, { settlements: [cornersOf(hex.q, hex.r)[0]] });

    expect(computeProduction(s, hex.number).gains.p0[hex.type]).toBe(1);
    s.robberHexId = hex.id;
    expect(computeProduction(s, hex.number).gains.p0[hex.type]).toBe(0);
  });

  it('pays nobody when the bank cannot cover every claimant', () => {
    const s = makeGame();
    const hex = pickProducingHex(s);
    const corners = cornersOf(hex.q, hex.r);
    pose(s, 0, { settlements: [corners[0]] });
    pose(s, 1, { settlements: [corners[2]] });
    s.bank[hex.type] = 1; // two claimants, one card left

    const { gains, shortages } = computeProduction(s, hex.number);
    expect(gains.p0[hex.type]).toBe(0);
    expect(gains.p1[hex.type]).toBe(0);
    expect(shortages).toContainEqual({ resource: hex.type, partial: false });
  });

  it('pays a lone claimant whatever the bank has left', () => {
    const s = makeGame();
    const hex = pickProducingHex(s);
    pose(s, 0, { cities: [cornersOf(hex.q, hex.r)[0]] }); // owed 2
    s.bank[hex.type] = 1;

    const { gains, shortages } = computeProduction(s, hex.number);
    expect(gains.p0[hex.type]).toBe(1);
    expect(shortages).toContainEqual({ resource: hex.type, partial: true });
  });

  it('moves the paid cards out of the bank', () => {
    const s = makeGame();
    const hex = pickProducingHex(s);
    pose(s, 0, { settlements: [cornersOf(hex.q, hex.r)[0]] });
    const before = s.bank[hex.type];
    applyProduction(s, computeProduction(s, hex.number));
    expect(s.players[0].resources[hex.type]).toBe(1);
    expect(s.bank[hex.type]).toBe(before - 1);
  });
});

describe('discarding on a seven', () => {
  it('leaves hands of seven or fewer alone', () => {
    const s = makeGame();
    s.players[0].resources = { wood: 4, brick: 3, sheep: 0, wheat: 0, ore: 0 };
    expect(discardRequirement(s.players[0])).toBe(0);
  });

  it('takes half, rounded down', () => {
    const s = makeGame();
    s.players[0].resources = { wood: 4, brick: 4, sheep: 0, wheat: 0, ore: 0 }; // 8
    expect(discardRequirement(s.players[0])).toBe(4);
    s.players[1].resources = { wood: 5, brick: 4, sheep: 0, wheat: 0, ore: 0 }; // 9
    expect(discardRequirement(s.players[1])).toBe(4);
  });

  it('lists everyone over the limit', () => {
    const s = makeGame();
    s.players[0].resources = { wood: 8, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    s.players[2].resources = { wood: 0, brick: 0, sheep: 9, wheat: 0, ore: 0 };
    expect(playersMustDiscard(s)).toEqual(['p0', 'p2']);
  });

  it('rejects a discard of the wrong size', () => {
    const s = makeGame();
    s.players[0].resources = { wood: 8, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    expect(() => applyDiscard(s, 'p0', { wood: 3 })).toThrow(/exactly 4/);
  });

  it('returns discarded cards to the bank', () => {
    const s = makeGame();
    s.players[0].resources = { wood: 8, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    const before = s.bank.wood;
    applyDiscard(s, 'p0', { wood: 4 });
    expect(s.players[0].resources.wood).toBe(4);
    expect(s.bank.wood).toBe(before + 4);
  });
});

describe('the robber', () => {
  it('will not stay put or go to sea', () => {
    const s = makeGame({ modeId: 'seafarers' });
    expect(() => moveRobber(s, s.robberHexId, 'p0')).toThrow(/different hex/);
    const sea = s.board.hexes.find((h) => h.type === 'sea');
    expect(() => moveRobber(s, sea.id, 'p0')).toThrow(/sea/);
  });

  it('only lists victims who are on the hex and hold cards', () => {
    const s = makeGame();
    const hex = pickProducingHex(s);
    const corners = cornersOf(hex.q, hex.r);
    pose(s, 0, { settlements: [corners[0]] });
    pose(s, 1, { settlements: [corners[2]] });
    pose(s, 2, { settlements: [corners[4]] });
    s.players[1].resources.wood = 1;
    // p2 is on the hex but empty-handed; p0 is the thief.
    expect(stealTargets(s, hex.id, 'p0')).toEqual(['p1']);
  });

  it('moves exactly one card from victim to thief', () => {
    const s = makeGame();
    const hex = pickProducingHex(s, [s.robberHexId]);
    const corners = cornersOf(hex.q, hex.r);
    pose(s, 0, { settlements: [corners[0]] });
    pose(s, 1, { settlements: [corners[2]] });
    s.players[1].resources = { wood: 2, brick: 1, sheep: 0, wheat: 0, ore: 0 };

    moveRobber(s, hex.id, 'p0', 'p1');
    expect(handSize(s.players[0].resources)).toBe(1);
    expect(handSize(s.players[1].resources)).toBe(2);
    expect(s.robberHexId).toBe(hex.id);
  });

  it('refuses to steal from a player who is not on the hex', () => {
    const s = makeGame();
    const hex = pickProducingHex(s, [s.robberHexId]);
    s.players[1].resources.wood = 3;
    expect(() => moveRobber(s, hex.id, 'p0', 'p1')).toThrow(/Cannot steal/);
  });
});

describe('rolling a seven drives the phases', () => {
  it('goes roll -> discard -> robber -> main', () => {
    let s = autoSetup(makeGame(), applyAction, legalActions);
    // Force a seven by rigging the dice source.
    s.players[0].resources = { wood: 8, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    let rolled = null;
    for (let i = 0; i < 400 && rolled !== 7; i++) {
      const attempt = applyAction(s, { type: 'rollDice' });
      if (attempt.lastRoll === 7) { rolled = 7; s = attempt; break; }
      s.rng.cursor += 2; // try a different pair of dice
    }
    expect(rolled).toBe(7);
    expect(s.phase).toBe('discard');
    expect(s.pendingDiscards).toContain('p0');

    s = applyAction(s, { type: 'discard', playerId: 'p0', resources: { wood: 4 } });
    expect(s.phase).toBe('robber');

    const target = s.board.hexes.find((h) => h.type !== 'sea' && h.id !== s.robberHexId);
    s = applyAction(s, { type: 'moveRobber', hexId: target.id });
    expect(s.phase).toBe('main');
  });
});
