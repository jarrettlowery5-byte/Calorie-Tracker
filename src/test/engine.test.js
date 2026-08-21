import { describe, it, expect } from 'vitest';
import {
  canPlaceSettlement, canPlaceRoad, canBuildCity, satisfiesDistanceRule,
  legalSettlementNodes, buildingAt,
} from '../engine/build.js';
import { tradeRatios, handSize } from '../engine/helpers.js';
import { canBankTrade, bankTrade, playerTrade, canPlayerTrade } from '../engine/trade.js';
import {
  applyAction, legalActions, publicVictoryPoints, totalVictoryPoints, createGame,
} from '../engine/game.js';
import { makeGame, makeBoard, pose, cornersOf, ringOf, autoSetup } from './helpers.js';
import { getGraph } from '../engine/helpers.js';

describe('settlement placement', () => {
  it('honours the distance rule', () => {
    const s = makeGame();
    const graph = getGraph(s.board);
    const node = cornersOf(0, 0)[0];
    const neighbour = graph.nodeNeighbors.get(node)[0];

    expect(satisfiesDistanceRule(s, node)).toBe(true);
    pose(s, 1, { settlements: [node] });
    expect(satisfiesDistanceRule(s, node)).toBe(false);
    expect(satisfiesDistanceRule(s, neighbour)).toBe(false);
  });

  it('waives the connection rule during setup only', () => {
    const s = makeGame();
    const node = cornersOf(0, 0)[0];
    expect(canPlaceSettlement(s, 'p0', node, { setup: true }).ok).toBe(true);
    expect(canPlaceSettlement(s, 'p0', node).ok).toBe(false);
  });

  it('requires a connecting road outside setup', () => {
    const s = makeGame();
    const node = cornersOf(0, 0)[0];
    s.players[0].resources = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 };
    expect(canPlaceSettlement(s, 'p0', node).reason).toMatch(/connect/);
    pose(s, 0, { roads: [ringOf(0, 0)[0]] });
    expect(canPlaceSettlement(s, 'p0', node).ok).toBe(true);
  });

  it('requires the resources', () => {
    const s = makeGame();
    const node = cornersOf(0, 0)[0];
    pose(s, 0, { roads: [ringOf(0, 0)[0]] });
    expect(canPlaceSettlement(s, 'p0', node).reason).toMatch(/afford/);
  });

  it('never offers a node in the open sea', () => {
    const s = makeGame({ modeId: 'seafarers' });
    const graph = getGraph(s.board);
    for (const node of legalSettlementNodes(s, 'p0', { setup: true })) {
      const touchesLand = graph.nodes.get(node).hexIds
        .some((id) => graph.hexById.get(id).type !== 'sea');
      expect(touchesLand).toBe(true);
    }
  });
});

describe('road placement', () => {
  it('must connect to your own road or building', () => {
    const s = makeGame();
    const ring = ringOf(0, 0);
    s.players[0].resources = { wood: 2, brick: 2, sheep: 0, wheat: 0, ore: 0 };
    expect(canPlaceRoad(s, 'p0', ring[0]).reason).toMatch(/connect/);
    pose(s, 0, { settlements: [cornersOf(0, 0)[0]] });
    expect(canPlaceRoad(s, 'p0', ring[0]).ok).toBe(true);
  });

  it('cannot be built on an occupied edge', () => {
    const s = makeGame();
    const ring = ringOf(0, 0);
    s.players[0].resources = { wood: 2, brick: 2, sheep: 0, wheat: 0, ore: 0 };
    pose(s, 0, { settlements: [cornersOf(0, 0)[0]] });
    pose(s, 1, { roads: [ring[0]] });
    expect(canPlaceRoad(s, 'p0', ring[0]).reason).toMatch(/occupied/);
  });

  it('cannot be extended through an opponent building', () => {
    const s = makeGame();
    const ring = ringOf(0, 0);
    const corners = cornersOf(0, 0);
    s.players[0].resources = { wood: 2, brick: 2, sheep: 0, wheat: 0, ore: 0 };
    // p0 owns ring[1] (corners 0-1); an opponent sits on corner 1, so ring[2]
    // (corners 1-2) cannot be reached through them.
    pose(s, 0, { roads: [ring[1]] });
    pose(s, 1, { settlements: [corners[1]] });
    expect(canPlaceRoad(s, 'p0', ring[2]).reason).toMatch(/connect/);
  });
});

describe('cities', () => {
  it('upgrade only your own settlement, and cost 2 wheat + 3 ore', () => {
    const s = makeGame();
    const node = cornersOf(0, 0)[0];
    pose(s, 1, { settlements: [node] });
    expect(canBuildCity(s, 'p0', node).reason).toMatch(/Not one of your/);

    const own = cornersOf(2, -2)[0];
    pose(s, 0, { settlements: [own] });
    expect(canBuildCity(s, 'p0', own).reason).toMatch(/afford/);
    s.players[0].resources = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 };
    expect(canBuildCity(s, 'p0', own).ok).toBe(true);
  });

  it('turn one settlement into one city worth two points', () => {
    let s = autoSetup(makeGame(), applyAction, legalActions);
    const p0 = s.players[0];
    expect(publicVictoryPoints(s, p0)).toBe(2); // two setup settlements
    const node = p0.settlements[0];
    s.players[0].resources = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 };
    s.phase = 'main';
    s = applyAction(s, { type: 'buildCity', nodeId: node });
    expect(s.players[0].settlements).toHaveLength(1);
    expect(s.players[0].cities).toHaveLength(1);
    expect(publicVictoryPoints(s, s.players[0])).toBe(3);
  });
});

describe('trading', () => {
  it('defaults to 4:1 with no harbor', () => {
    const s = makeGame();
    expect(tradeRatios(s, s.players[0])).toEqual({ wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 });
  });

  it('gives 3:1 on every resource from a generic harbor', () => {
    const s = makeGame();
    const generic = s.board.harbors.find((h) => h.type === 'generic');
    pose(s, 0, { settlements: [generic.nodes[0]] });
    expect(Object.values(tradeRatios(s, s.players[0]))).toEqual([3, 3, 3, 3, 3]);
  });

  it('gives 2:1 on the matching resource only', () => {
    const s = makeGame();
    const specific = s.board.harbors.find((h) => h.type !== 'generic');
    pose(s, 0, { settlements: [specific.nodes[0]] });
    const ratios = tradeRatios(s, s.players[0]);
    expect(ratios[specific.type]).toBe(2);
    for (const [res, ratio] of Object.entries(ratios)) {
      if (res !== specific.type) expect(ratio).toBe(4);
    }
  });

  it('needs a building on the harbor, not just a nearby one', () => {
    const s = makeGame();
    const harbor = s.board.harbors.find((h) => h.type === 'generic');
    expect(tradeRatios(s, s.players[0])[harbor.type === 'generic' ? 'wood' : harbor.type]).toBe(4);
  });

  it('moves the right number of cards on a bank trade', () => {
    const s = makeGame();
    s.players[0].resources = { wood: 4, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    const bankWood = s.bank.wood;
    bankTrade(s, 'p0', 'wood', 'ore');
    expect(s.players[0].resources.wood).toBe(0);
    expect(s.players[0].resources.ore).toBe(1);
    expect(s.bank.wood).toBe(bankWood + 4);
  });

  it('refuses a bank trade the player cannot cover', () => {
    const s = makeGame();
    s.players[0].resources = { wood: 3, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    expect(canBankTrade(s, 'p0', 'wood', 'ore').reason).toMatch(/Need 4 wood/);
  });

  it('swaps hands on a player trade and refuses one-sided offers', () => {
    const s = makeGame();
    s.players[0].resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    s.players[1].resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 1 };
    expect(canPlayerTrade(s, 'p0', 'p1', { wood: 2 }, {}).reason).toMatch(/Both sides/);
    playerTrade(s, 'p0', 'p1', { wood: 2 }, { ore: 1 });
    expect(s.players[0].resources).toMatchObject({ wood: 0, ore: 1 });
    expect(s.players[1].resources).toMatchObject({ wood: 2, ore: 0 });
  });
});

describe('victory', () => {
  it('counts buildings, awards and hidden cards', () => {
    const s = makeGame();
    pose(s, 0, { settlements: [cornersOf(0, 0)[0]], cities: [cornersOf(2, -2)[0]] });
    expect(publicVictoryPoints(s, s.players[0])).toBe(3);

    s.longestRoad = { playerId: 'p0', length: 5 };
    s.largestArmy = { playerId: 'p0', size: 3 };
    expect(publicVictoryPoints(s, s.players[0])).toBe(7);

    s.players[0].devCards.push({ type: 'victoryPoint', boughtTurn: 1, played: false });
    expect(publicVictoryPoints(s, s.players[0])).toBe(7); // still hidden
    expect(totalVictoryPoints(s, s.players[0])).toBe(8);
  });

  it('ends the game when the player in turn reaches the goal', () => {
    let s = autoSetup(makeGame(), applyAction, legalActions);
    s.phase = 'main';
    s.victoryPointGoal = 3;
    const node = s.players[0].settlements[0];
    s.players[0].resources = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 };
    s = applyAction(s, { type: 'buildCity', nodeId: node });
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe('p0');
  });
});

describe('turn flow', () => {
  it('runs setup as a snake and pays out the second settlement', () => {
    const s = autoSetup(makeGame({ players: 3 }), applyAction, legalActions);
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(1);
    expect(s.currentPlayerIndex).toBe(0);
    for (const p of s.players) {
      expect(p.settlements).toHaveLength(2);
      expect(p.roads).toHaveLength(2);
      // Everyone should have picked up cards from their second settlement.
      expect(handSize(p.resources)).toBeGreaterThan(0);
    }
  });

  it('rotates players and increments the turn counter', () => {
    let s = autoSetup(makeGame({ players: 3 }), applyAction, legalActions);
    for (let i = 0; i < 3; i++) {
      s = applyAction(s, { type: 'rollDice' });
      while (s.phase !== 'main') {
        if (s.phase === 'discard') {
          const pid = s.pendingDiscards[0];
          const p = s.players.find((x) => x.id === pid);
          const need = Math.floor(handSize(p.resources) / 2);
          const give = {};
          let left = need;
          for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore']) {
            const take = Math.min(left, p.resources[r]);
            if (take) { give[r] = take; left -= take; }
          }
          s = applyAction(s, { type: 'discard', playerId: pid, resources: give });
        } else if (s.phase === 'robber') {
          const hex = s.board.hexes.find((h) => h.type !== 'sea' && h.id !== s.robberHexId);
          s = applyAction(s, { type: 'moveRobber', hexId: hex.id });
        } else break;
      }
      s = applyAction(s, { type: 'endTurn' });
    }
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.turn).toBe(2);
  });

  it('rejects actions taken out of phase or out of turn', () => {
    const s = autoSetup(makeGame(), applyAction, legalActions);
    expect(() => applyAction(s, { type: 'endTurn' })).toThrow(/roll phase/);
    expect(() => applyAction(s, { type: 'rollDice', playerId: 'p1' })).toThrow(/not your turn/i);
  });

  it('never mutates the state it was given', () => {
    const s = autoSetup(makeGame(), applyAction, legalActions);
    const snapshot = JSON.stringify({ players: s.players, bank: s.bank, phase: s.phase });
    applyAction(s, { type: 'rollDice' });
    expect(JSON.stringify({ players: s.players, bank: s.bank, phase: s.phase })).toBe(snapshot);
  });
});
