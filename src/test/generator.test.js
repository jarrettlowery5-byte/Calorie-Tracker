import { describe, it, expect } from 'vitest';
import { generateBoard } from '../catan/generator.js';
import { defaultConstraintState } from '../catan/constraints.js';
import { BASE_TOKEN_SPEC, EXTENSION_TOKEN_SPEC, expandTokenSpec, isRedNumber } from '../catan/tokens.js';
import { neighborIds, hexVertexIds, hexEdgeIds } from '../lib/hex.js';
import { buildGraph } from '../catan/graph.js';

const ALL = defaultConstraintState();

/** Neighbouring hex ids that actually exist on the board. */
function neighboursOf(board, hex) {
  const present = new Set(board.hexes.map((h) => h.id));
  return neighborIds(hex.q, hex.r).filter((id) => present.has(id));
}

function tallyTerrain(board) {
  const t = {};
  for (const h of board.hexes) if (h.slot === 'land') t[h.type] = (t[h.type] || 0) + 1;
  return t;
}

describe('board geometry', () => {
  it('gives the classic board 19 hexes, 54 nodes and 72 edges', () => {
    const board = generateBoard({ modeId: 'original', seed: 1, constraints: ALL });
    expect(board.hexes).toHaveLength(19);
    const nodes = new Set(board.hexes.flatMap((h) => hexVertexIds(h.q, h.r)));
    const edges = new Set(board.hexes.flatMap((h) => hexEdgeIds(h.q, h.r)));
    expect(nodes.size).toBe(54);
    expect(edges.size).toBe(72);
  });

  it('lays the extension board out in rows of 3-4-5-6-5-4-3', () => {
    const board = generateBoard({ modeId: 'extension', seed: 1, constraints: ALL });
    expect(board.hexes).toHaveLength(30);
    const rows = {};
    for (const h of board.hexes) rows[h.r] = (rows[h.r] || 0) + 1;
    expect(Object.keys(rows).map(Number).sort((a, b) => a - b).map((r) => rows[r]))
      .toEqual([3, 4, 5, 6, 5, 4, 3]);
  });

  it.each(['new-shores', 'new-shores-56'])(
    'keeps every %s island one sea hex off the mainland', (scenarioId) => {
      const board = generateBoard({ modeId: 'seafarers', scenarioId, seed: 1, constraints: ALL });
      const mainland = new Set(board.hexes.filter((h) => h.region === 'main').map((h) => h.id));
      const sea = new Set(board.hexes.filter((h) => h.type === 'sea').map((h) => h.id));
      const islands = board.hexes.filter((h) => h.region === 'islands');
      expect(islands.length).toBeGreaterThan(0);
      for (const hex of islands) {
        const neighbours = neighboursOf(board, hex);
        // Never touching the mainland...
        expect(neighbours.some((id) => mainland.has(id))).toBe(false);
        // ...but always reachable across open water.
        expect(neighbours.some((id) => sea.has(id))).toBe(true);
      }
    },
  );

  it('gives the 5-6 Seafarers board the full 30-hex mainland and a 22-tile ocean ring', () => {
    const board = generateBoard({ modeId: 'seafarers', scenarioId: 'new-shores-56', seed: 1, constraints: ALL });
    const count = (region) => board.hexes.filter((h) => h.region === region).length;
    // These three follow exactly from the boxes' component pools.
    expect(count('main')).toBe(30);
    expect(count('sea')).toBe(22);
    expect(count('islands')).toBe(10);
    // The mainland is the same 3-4-5-6-5-4-3 shape as the 5-6 player board.
    const rows = {};
    for (const h of board.hexes.filter((x) => x.region === 'main')) rows[h.r] = (rows[h.r] || 0) + 1;
    expect(Object.keys(rows).map(Number).sort((a, b) => a - b).map((r) => rows[r]))
      .toEqual([3, 4, 5, 6, 5, 4, 3]);
  });

  it('splits the 5-6 Seafarers islands into five adjacent two-hex pairs', () => {
    const board = generateBoard({ modeId: 'seafarers', scenarioId: 'new-shores-56', seed: 4, constraints: ALL });
    const groups = {};
    for (const h of board.hexes.filter((x) => x.region === 'islands')) (groups[h.island] ||= []).push(h);
    expect(Object.keys(groups)).toHaveLength(5);
    for (const pair of Object.values(groups)) {
      expect(pair).toHaveLength(2);
      expect(neighborIds(pair[0].q, pair[0].r)).toContain(pair[1].id);
    }
  });

  it('puts four gold fields on the 5-6 Seafarers board and two on the 3-4', () => {
    for (let seed = 1; seed <= 15; seed++) {
      expect(tallyTerrain(generateBoard({ modeId: 'seafarers', scenarioId: 'new-shores', seed, constraints: ALL })).gold).toBe(2);
      expect(tallyTerrain(generateBoard({ modeId: 'seafarers', scenarioId: 'new-shores-56', seed, constraints: ALL })).gold).toBe(4);
    }
  });

  it('never puts a number token on open water', () => {
    for (const scenarioId of ['new-shores', 'new-shores-56']) {
      for (let seed = 1; seed <= 10; seed++) {
        const board = generateBoard({ modeId: 'seafarers', scenarioId, seed, constraints: ALL });
        expect(board.hexes.filter((h) => h.type === 'sea').every((h) => h.number === null)).toBe(true);
      }
    }
  });
});

describe('terrain and token bags', () => {
  it('deals the exact base-game terrain', () => {
    const board = generateBoard({ modeId: 'original', seed: 3, constraints: ALL });
    expect(tallyTerrain(board)).toEqual({ wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1 });
  });

  it('deals the exact extension terrain', () => {
    const board = generateBoard({ modeId: 'extension', seed: 3, constraints: ALL });
    expect(tallyTerrain(board)).toEqual({ wood: 6, brick: 5, sheep: 6, wheat: 6, ore: 5, desert: 2 });
  });

  it('deals exactly two Seafarers gold fields', () => {
    const board = generateBoard({ modeId: 'seafarers', seed: 3, constraints: ALL });
    expect(tallyTerrain(board).gold).toBe(2);
  });

  it('places the exact base token bag, and none on the desert', () => {
    const board = generateBoard({ modeId: 'original', seed: 5, constraints: ALL });
    const numbers = board.hexes.filter((h) => h.number != null).map((h) => h.number).sort((a, b) => a - b);
    expect(numbers).toEqual(expandTokenSpec(BASE_TOKEN_SPEC));
    expect(board.hexes.filter((h) => h.type === 'desert').every((h) => h.number === null)).toBe(true);
    expect(board.hexes.filter((h) => h.type === 'sea').every((h) => h.number === null)).toBe(true);
  });

  it('places the exact extension token bag', () => {
    const board = generateBoard({ modeId: 'extension', seed: 5, constraints: ALL });
    const numbers = board.hexes.filter((h) => h.number != null).map((h) => h.number).sort((a, b) => a - b);
    expect(numbers).toEqual(expandTokenSpec(EXTENSION_TOKEN_SPEC));
  });

  it('starts the robber on a desert', () => {
    const board = generateBoard({ modeId: 'original', seed: 9, constraints: ALL });
    expect(board.hexes.find((h) => h.id === board.robberHexId).type).toBe('desert');
  });
});

describe('constraints', () => {
  const modes = ['original', 'extension', 'seafarers'];
  // Seafarers sweeps below run the default 3-4 scenario; the 5-6 one is swept separately.

  it.each(modes)('never puts two red numbers together on %s', (modeId) => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = generateBoard({ modeId, seed, constraints: ALL });
      if (board.constraints.relaxed.includes('noRedTouching')) continue;
      const byId = new Map(board.hexes.map((h) => [h.id, h]));
      for (const hex of board.hexes) {
        if (!isRedNumber(hex.number)) continue;
        for (const id of neighboursOf(board, hex)) {
          expect(isRedNumber(byId.get(id).number)).toBe(false);
        }
      }
    }
  });

  it.each(modes)('never puts duplicate numbers together on %s', (modeId) => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = generateBoard({ modeId, seed, constraints: ALL });
      if (board.constraints.relaxed.includes('noDuplicateTouching')) continue;
      const byId = new Map(board.hexes.map((h) => [h.id, h]));
      for (const hex of board.hexes) {
        if (hex.number == null) continue;
        for (const id of neighboursOf(board, hex)) {
          expect(byId.get(id).number).not.toBe(hex.number);
        }
      }
    }
  });

  it('never leaves three connected hexes of the same terrain', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = generateBoard({ modeId: 'original', seed, constraints: ALL });
      if (board.constraints.relaxed.includes('noResourceClustering')) continue;
      const byId = new Map(board.hexes.map((h) => [h.id, h]));
      const seen = new Set();
      for (const hex of board.hexes) {
        if (seen.has(hex.id) || hex.slot !== 'land' || hex.type === 'desert') continue;
        let size = 0;
        const stack = [hex.id];
        seen.add(hex.id);
        while (stack.length) {
          const id = stack.pop();
          size++;
          for (const n of neighboursOf(board, byId.get(id))) {
            if (!seen.has(n) && byId.get(n).type === hex.type) { seen.add(n); stack.push(n); }
          }
        }
        expect(size).toBeLessThan(3);
      }
    }
  });

  it('pins a desert to the centre when asked', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const board = generateBoard({
        modeId: 'original', seed, constraints: { ...ALL, desertInCenter: true },
      });
      expect(board.hexes.find((h) => h.id === '0,0').type).toBe('desert');
    }
  });

  it('respects the enabled set — turning constraints off still yields a legal bag', () => {
    const none = Object.fromEntries(Object.keys(ALL).map((k) => [k, false]));
    const board = generateBoard({ modeId: 'original', seed: 11, constraints: none });
    expect(board.hexes.filter((h) => h.number != null)).toHaveLength(18);
    expect(board.constraints.relaxed).toEqual([]);
  });

  it.each(['new-shores', 'new-shores-56'])(
    'satisfies red/duplicate rules across %s boards', (scenarioId) => {
      for (let seed = 1; seed <= 20; seed++) {
        const board = generateBoard({ modeId: 'seafarers', scenarioId, seed, constraints: ALL });
        const byId = new Map(board.hexes.map((h) => [h.id, h]));
        const sat = new Set(board.constraints.satisfied);
        for (const hex of board.hexes) {
          if (hex.number == null) continue;
          for (const id of neighboursOf(board, hex)) {
            const other = byId.get(id);
            if (other.number == null) continue;
            if (sat.has('noRedTouching')) {
              expect(isRedNumber(hex.number) && isRedNumber(other.number)).toBe(false);
            }
            if (sat.has('noDuplicateTouching')) expect(other.number).not.toBe(hex.number);
          }
        }
      }
    },
  );

  it('satisfies the whole default set on the great majority of seeds', () => {
    let relaxed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const board = generateBoard({ modeId: 'extension', seed, constraints: ALL });
      if (board.constraints.relaxed.length > 0) relaxed++;
    }
    expect(relaxed).toBeLessThanOrEqual(3);
  });
});

describe('harbors', () => {
  it('gives the base board 9 harbors: 4 generic and one per resource', () => {
    const board = generateBoard({ modeId: 'original', seed: 2, constraints: ALL });
    expect(board.harbors).toHaveLength(9);
    const tally = {};
    for (const h of board.harbors) tally[h.type] = (tally[h.type] || 0) + 1;
    expect(tally).toEqual({ generic: 4, wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 });
  });

  it('gives the extension board 11 harbors', () => {
    const board = generateBoard({ modeId: 'extension', seed: 2, constraints: ALL });
    expect(board.harbors).toHaveLength(11);
  });

  it('puts every harbor on a coastal edge, and never two on the same node', () => {
    const board = generateBoard({ modeId: 'original', seed: 4, constraints: ALL });
    const graph = buildGraph(board.hexes);
    const used = new Set();
    for (const harbor of board.harbors) {
      const edge = graph.edges.get(harbor.edgeId);
      // Coastal: the edge belongs to exactly one board hex.
      expect(edge.hexIds).toHaveLength(1);
      for (const node of harbor.nodes) {
        expect(used.has(node)).toBe(false);
        used.add(node);
      }
    }
  });
});

describe('determinism', () => {
  it('reproduces an identical board from the same seed', () => {
    const a = generateBoard({ modeId: 'original', seed: 12345, constraints: ALL });
    const b = generateBoard({ modeId: 'original', seed: 12345, constraints: ALL });
    expect(b.hexes).toEqual(a.hexes);
    expect(b.harbors).toEqual(a.harbors);
    expect(b.seedCode).toBe(a.seedCode);
  });

  it('produces different boards from different seeds', () => {
    const a = generateBoard({ modeId: 'original', seed: 1, constraints: ALL });
    const b = generateBoard({ modeId: 'original', seed: 2, constraints: ALL });
    expect(b.hexes).not.toEqual(a.hexes);
  });
});
