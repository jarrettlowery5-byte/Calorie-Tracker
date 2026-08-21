/**
 * Board generation, modelled as constraint satisfaction.
 *
 * The pipeline is:
 *   1. TERRAIN  -- shuffle the terrain bag into the land hexes (honouring
 *                  "desert in center"), then validate layout-level constraints.
 *                  Repeat until valid or out of attempts.
 *   2. NUMBERS  -- backtracking search that assigns number tokens hex by hex.
 *                  Constraints prune the search at every node, so a dead end
 *                  backtracks rather than throwing the whole board away.
 *   3. HARBORS  -- evenly spaced around the coastline, optionally shuffled.
 *
 * If the enabled constraints cannot all be met, we relax them one at a time in
 * priority order (softest first) and report exactly which ones were dropped,
 * rather than spinning forever or silently producing an invalid board.
 */

import { createRng, randomSeed, seedToCode } from '../lib/random.js';
import { neighborIds, hexId, hexDistance } from '../lib/hex.js';
import { resolveRecipe } from './layouts.js';
import { expandTokenSpec, pipsFor, isRedNumber } from './tokens.js';
import { producesResource } from './resources.js';
import { placeHarbors } from './harbors.js';
import { CONSTRAINTS, CONSTRAINT_LIST, computePipBudget, takesNumber } from './constraints.js';

/** Safety caps so a bad constraint combination can never hang the browser. */
export const MAX_TERRAIN_ATTEMPTS = 400;
export const MAX_SEARCH_NODES = 120000;
/** How many times to re-roll before giving up on the current constraint set. */
export const ATTEMPTS_PER_LEVEL = 6;

/** Expand `{ wood: 4, ... }` into a flat bag of terrain ids. */
function expandTerrainSpec(spec) {
  const out = [];
  for (const [type, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) out.push(type);
  }
  return out;
}

/** Build the adjacency lookup the constraint context needs. */
function buildAdjacency(hexes) {
  const present = new Set(hexes.map((h) => h.id));
  const adj = new Map();
  for (const h of hexes) {
    adj.set(h.id, neighborIds(h.q, h.r).filter((id) => present.has(id)));
  }
  return adj;
}

/** Index of the hex closest to the centroid of the landmass. */
function mostCentralHex(hexes) {
  const cx = hexes.reduce((s, h) => s + h.q, 0) / hexes.length;
  const cy = hexes.reduce((s, h) => s + h.r, 0) / hexes.length;
  let best = null;
  let bestD = Infinity;
  for (const h of hexes) {
    const d = hexDistance({ q: h.q, r: h.r }, { q: Math.round(cx), r: Math.round(cy) });
    if (d < bestD) { bestD = d; best = h; }
  }
  return best;
}

/**
 * STEP 1 -- terrain.
 * Places one region's terrain bag into that region's land hexes.
 */
function placeTerrain(regionHexes, terrainSpec, rng, { desertInCenter }) {
  const bag = expandTerrainSpec(terrainSpec);
  if (bag.length !== regionHexes.length) {
    throw new Error(
      `Terrain bag (${bag.length}) does not match land hex count (${regionHexes.length})`,
    );
  }

  const assignment = new Map();
  let remaining = rng.shuffle(bag);
  let openHexes = regionHexes;

  if (desertInCenter && remaining.includes('desert')) {
    const centre = mostCentralHex(regionHexes);
    assignment.set(centre.id, 'desert');
    remaining = remaining.slice();
    remaining.splice(remaining.indexOf('desert'), 1);
    openHexes = regionHexes.filter((h) => h.id !== centre.id);
    remaining = rng.shuffle(remaining);
  }

  openHexes.forEach((hex, i) => assignment.set(hex.id, remaining[i]));
  return assignment;
}

/**
 * STEP 2 -- numbers, by backtracking search.
 *
 * Hexes are visited in breadth-first order from a random seed hex so that each
 * new assignment is adjacent to already-decided hexes: constraints then bite
 * immediately and prune the tree early instead of at the very end.
 */
function orderHexesForSearch(numberedHexes, adj, rng) {
  const pool = new Map(numberedHexes.map((h) => [h.id, h]));
  const order = [];
  const seen = new Set();
  const roots = rng.shuffle(numberedHexes);

  for (const root of roots) {
    if (seen.has(root.id)) continue;
    const queue = [root.id];
    seen.add(root.id);
    while (queue.length) {
      const id = queue.shift();
      order.push(pool.get(id));
      for (const n of adj.get(id) || []) {
        if (pool.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
  }
  return order;
}

function placeNumbers(numberedHexes, bagsByRegion, adj, rng, active, pipBudget) {
  const numbers = new Map();
  const pipsByResource = {};
  const redsByResource = {};
  for (const h of numberedHexes) {
    if (producesResource(h.type)) { pipsByResource[h.type] = 0; redsByResource[h.type] = 0; }
  }

  const ctx = {
    neighborsOf: (id) => adj.get(id) || [],
    numberOf: (id) => numbers.get(id) ?? null,
    pipsByResource,
    redsByResource,
    pipBudget,
  };

  // Mutable per-region token bags: value -> remaining count.
  const bags = {};
  for (const [region, tokens] of Object.entries(bagsByRegion)) {
    const counts = new Map();
    for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
    bags[region] = counts;
  }

  const order = orderHexesForSearch(numberedHexes, adj, rng);
  const numberGuards = active.filter((c) => typeof c.allowNumber === 'function');
  const finalGuards = active.filter((c) => typeof c.checkNumbers === 'function');
  let nodes = 0;

  function search(i) {
    if (++nodes > MAX_SEARCH_NODES) return false;
    if (i === order.length) return finalGuards.every((c) => c.checkNumbers(ctx));

    const hex = order[i];
    const bag = bags[hex.region];
    const candidates = rng.shuffle([...bag.keys()].filter((v) => bag.get(v) > 0));

    for (const value of candidates) {
      if (!numberGuards.every((c) => c.allowNumber(ctx, hex, value))) continue;

      // Tentatively place.
      numbers.set(hex.id, value);
      bag.set(value, bag.get(value) - 1);
      if (producesResource(hex.type)) {
        pipsByResource[hex.type] += pipsFor(value);
        if (isRedNumber(value)) redsByResource[hex.type] += 1;
      }

      if (search(i + 1)) return true;

      // Undo.
      numbers.delete(hex.id);
      bag.set(value, bag.get(value) + 1);
      if (producesResource(hex.type)) {
        pipsByResource[hex.type] -= pipsFor(value);
        if (isRedNumber(value)) redsByResource[hex.type] -= 1;
      }
    }
    return false;
  }

  const ok = search(0);
  return ok ? { numbers, nodes } : null;
}

/** One full attempt at a board with a fixed set of active constraints. */
function attemptBoard(recipe, rng, enabled, activeIds) {
  const { hexes, regions } = recipe;
  const active = CONSTRAINT_LIST.filter((c) => activeIds.has(c.id));
  const adj = buildAdjacency(hexes);
  const desertInCenter = enabled.desertInCenter && activeIds.has('desertInCenter');

  const terrainGuards = active.filter((c) => typeof c.checkTerrain === 'function');
  const landHexesByRegion = {};
  for (const h of hexes) {
    if (h.slot !== 'land') continue;
    (landHexesByRegion[h.region] ||= []).push(h);
  }

  let typed = null;
  let terrainAttempts = 0;

  // --- Terrain: shuffle-and-test, since terrain constraints are cheap. ---
  while (terrainAttempts < MAX_TERRAIN_ATTEMPTS) {
    terrainAttempts++;
    const types = new Map();
    for (const [region, regionHexes] of Object.entries(landHexesByRegion)) {
      const spec = regions[region]?.terrainSpec;
      if (!spec) continue;
      for (const [id, type] of placeTerrain(regionHexes, spec, rng, { desertInCenter })) {
        types.set(id, type);
      }
    }
    const candidate = hexes.map((h) => ({ ...h, type: h.slot === 'sea' ? 'sea' : types.get(h.id) }));
    const ctx = {
      landHexes: candidate.filter((h) => h.slot === 'land'),
      typeOf: (id) => candidate.find((h) => h.id === id)?.type,
      neighborsOf: (id) => adj.get(id) || [],
    };
    if (terrainGuards.every((c) => c.checkTerrain(ctx))) { typed = candidate; break; }
  }
  if (!typed) return { ok: false, stage: 'terrain', terrainAttempts };

  // --- Numbers: backtracking search over the token bags. ---
  const numbered = typed.filter((h) => h.slot === 'land' && takesNumber(h.type));
  const bagsByRegion = {};
  for (const [region, def] of Object.entries(regions)) {
    if (def?.tokenSpec) bagsByRegion[region] = expandTokenSpec(def.tokenSpec);
  }
  for (const [region, tokens] of Object.entries(bagsByRegion)) {
    const need = numbered.filter((h) => h.region === region).length;
    if (tokens.length !== need) {
      throw new Error(`Region "${region}": ${tokens.length} tokens for ${need} numbered hexes`);
    }
  }

  const allTokens = Object.values(bagsByRegion).flat();
  const pipBudget = computePipBudget(numbered, allTokens);
  const result = placeNumbers(numbered, bagsByRegion, adj, rng, active, pipBudget);
  if (!result) return { ok: false, stage: 'numbers', terrainAttempts };

  const finished = typed.map((h) => {
    const number = result.numbers.get(h.id) ?? null;
    return { ...h, number, pips: pipsFor(number) };
  });
  return { ok: true, hexes: finished, terrainAttempts, nodes: result.nodes };
}

/**
 * Generate a board.
 *
 * @param {object}  options
 * @param {string}  options.modeId       'original' | 'extension' | 'seafarers'
 * @param {string} [options.scenarioId]  Seafarers scenario key
 * @param {object} [options.constraints] `{ [constraintId]: boolean }`
 * @param {number} [options.seed]        omit for a fresh random board
 */
export function generateBoard({ modeId = 'original', scenarioId, constraints = {}, seed } = {}) {
  const usedSeed = seed ?? randomSeed();
  const rng = createRng(usedSeed);
  const recipe = resolveRecipe(modeId, scenarioId);

  const enabled = { ...constraints };
  // Constraints that take part in the search, softest last so they drop first.
  const searchIds = CONSTRAINT_LIST
    .filter((c) => enabled[c.id] && !c.harborOnly)
    .sort((a, b) => a.priority - b.priority)
    .map((c) => c.id);

  const relaxed = [];
  let attempt = null;
  let activeIds = new Set(searchIds);

  // Try with everything on. Re-roll a few times first -- a failure is usually
  // just an unlucky shuffle, not proof the constraint set is unsatisfiable.
  // Only after ATTEMPTS_PER_LEVEL dead ends do we drop the softest constraint.
  let totalAttempts = 0;
  for (;;) {
    let solved = false;
    for (let i = 0; i < ATTEMPTS_PER_LEVEL; i++) {
      totalAttempts++;
      attempt = attemptBoard(recipe, rng, enabled, activeIds);
      if (attempt.ok) { solved = true; break; }
    }
    if (solved) break;
    const droppable = searchIds.filter((id) => activeIds.has(id));
    if (droppable.length === 0) break;
    const dropped = droppable[0]; // lowest priority == softest
    activeIds.delete(dropped);
    relaxed.push(dropped);
  }

  if (!attempt.ok) {
    // Should be unreachable: with no constraints active, any shuffle works.
    throw new Error(`Board generation failed at the ${attempt.stage} stage.`);
  }

  const hexes = attempt.hexes;
  const coastRegion = recipe.coastRegion;
  const isLandmass = coastRegion
    ? (h) => h.region === coastRegion
    : (h) => h.slot === 'land';
  const harbors = placeHarbors(
    hexes, isLandmass, recipe.harborSpec, rng, !!enabled.randomizeHarbors,
  );

  // The robber starts on the desert (the first one, if a board has two).
  const desert = hexes.find((h) => h.type === 'desert');

  const warnings = [];
  if (relaxed.length > 0) {
    const names = relaxed.map((id) => CONSTRAINTS[id].label).join(', ');
    warnings.push(
      `Could not satisfy every constraint on this layout. Relaxed: ${names}. ` +
      'Try regenerating, or turn some constraints off.',
    );
  }

  return {
    seed: usedSeed,
    seedCode: seedToCode(usedSeed),
    modeId,
    scenarioId: recipe.scenario?.id ?? null,
    modeName: recipe.mode.name,
    scenarioName: recipe.scenario?.name ?? null,
    scenario: recipe.scenario ?? null,
    hexes,
    harbors,
    robberHexId: desert?.id ?? null,
    regions: recipe.regions,
    constraints: { requested: enabled, relaxed, satisfied: [...activeIds] },
    meta: {
      attempts: totalAttempts,
      terrainAttempts: attempt.terrainAttempts,
      searchNodes: attempt.nodes,
      warnings,
    },
  };
}

/** Summary stats, used by the UI's board report. */
export function boardStats(board) {
  const byResource = {};
  let totalPips = 0;
  for (const hex of board.hexes) {
    if (!producesResource(hex.type)) continue;
    const entry = (byResource[hex.type] ||= { hexes: 0, pips: 0, reds: 0 });
    entry.hexes++;
    entry.pips += hex.pips;
    if (isRedNumber(hex.number)) entry.reds++;
    totalPips += hex.pips;
  }
  return { byResource, totalPips, hexCount: board.hexes.length };
}

export { hexId };
