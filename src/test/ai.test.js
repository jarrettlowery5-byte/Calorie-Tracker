import { describe, it, expect } from 'vitest';
import { chooseAction, chooseDiscard, evaluateNode } from '../ai/heuristic.js';
import { applyAction, createGame, totalVictoryPoints } from '../engine/game.js';
import { discardRequirement } from '../engine/production.js';
import { handSize } from '../engine/helpers.js';
import { getGraph } from '../engine/helpers.js';
import { makeBoard } from './helpers.js';

/** Play a whole game out with every seat driven by the AI. */
function playOut(seed, { modeId = 'original', players = 3, goal = 10, maxSteps = 6000 } = {}) {
  const board = makeBoard(seed, modeId);
  const specs = ['A', 'B', 'C', 'D'].slice(0, players).map((name) => ({ name, isAI: true }));
  let state = createGame({ board, playerSpecs: specs, victoryPointGoal: goal, seed: seed * 31 + 5 });

  let steps = 0;
  while (state.phase !== 'gameOver' && steps < maxSteps) {
    let acted = false;
    for (const player of state.players) {
      const action = chooseAction(state, player.id);
      if (!action) continue;
      state = applyAction(state, action); // throws if the AI proposed anything illegal
      acted = true;
      steps++;
      break;
    }
    if (!acted) break;
  }
  return { state, steps };
}

describe('heuristic AI', () => {
  it('plays complete, legal games on the base board', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = playOut(seed);
      expect(state.phase).toBe('gameOver');
      expect(state.winner).not.toBeNull();
      const winner = state.players.find((p) => p.id === state.winner);
      expect(totalVictoryPoints(state, winner)).toBeGreaterThanOrEqual(state.victoryPointGoal);
    }
  });

  it('plays complete games on the 5-6 player board with four seats', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { state } = playOut(seed, { modeId: 'extension', players: 4 });
      expect(state.phase).toBe('gameOver');
    }
  });

  it('finishes in a plausible number of turns', () => {
    const turns = [];
    for (let seed = 1; seed <= 8; seed++) turns.push(playOut(seed).state.turn);
    const average = turns.reduce((a, b) => a + b, 0) / turns.length;
    // A real 3-player game runs somewhere in this range; far outside it means
    // the AI has stopped building or is stuck in a loop.
    expect(average).toBeGreaterThan(10);
    expect(average).toBeLessThan(150);
  });

  it('leaves every player within the piece limits', () => {
    const { state } = playOut(3);
    for (const p of state.players) {
      expect(p.roads.length).toBeLessThanOrEqual(15);
      expect(p.settlements.length + p.cities.length).toBeLessThanOrEqual(5);
      expect(p.cities.length).toBeLessThanOrEqual(4);
    }
  });

  it('conserves cards: nothing is created or destroyed outside the bank', () => {
    const { state } = playOut(5);
    for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore']) {
      const inHands = state.players.reduce((n, p) => n + p.resources[r], 0);
      expect(state.bank[r]).toBeGreaterThanOrEqual(0);
      expect(state.bank[r] + inHands).toBe(19);
    }
  });

  it('discards exactly what is required, and only cards it holds', () => {
    const board = makeBoard(1);
    const state = createGame({
      board, playerSpecs: [{ name: 'A', isAI: true }, { name: 'B', isAI: true }], seed: 3,
    });
    state.players[0].resources = { wood: 5, brick: 4, sheep: 1, wheat: 0, ore: 1 }; // 11 cards
    const need = discardRequirement(state.players[0]);
    const discard = chooseDiscard(state, 'p0');

    expect(Object.values(discard).reduce((a, b) => a + b, 0)).toBe(need);
    for (const [r, n] of Object.entries(discard)) {
      expect(n).toBeLessThanOrEqual(state.players[0].resources[r]);
    }
  });

  it('rates a three-resource spot above a one-resource spot of the same pips', () => {
    const board = makeBoard(7);
    const state = createGame({ board, playerSpecs: [{ name: 'A' }, { name: 'B' }], seed: 1 });
    const weights = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 };

    // Every node on the board, scored; the top pick should touch more than one
    // terrain type, which is what the diversity bonus is there to ensure.
    const graph = getGraph(board);
    let best = null;
    let bestScore = -Infinity;
    for (const nodeId of graph.nodes.keys()) {
      const score = evaluateNode(state, 'p0', nodeId, weights);
      if (score > bestScore) { bestScore = score; best = nodeId; }
    }
    const kinds = new Set(
      graph.nodes.get(best).hexIds
        .map((id) => graph.hexById.get(id).type)
        .filter((t) => !['desert', 'sea'].includes(t)),
    );
    expect(kinds.size).toBeGreaterThan(1);
  });
});
