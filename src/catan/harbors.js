/**
 * Harbor (port) placement.
 *
 * Harbors sit on a coastal hex side: one side of the edge is land, the other is
 * open water.  To place them the way the physical frame does -- spread evenly
 * all the way round the island -- we walk the coastline as a closed loop and
 * then pick evenly spaced positions along it.
 */

import { neighborId, hexEdgeId, edgeVertices, vertexPixel, hexToPixel } from '../lib/hex.js';

/**
 * Collect the coastal sides of a landmass: a (hex, direction) pair whose
 * neighbour in that direction is not part of the landmass.
 */
export function coastalSides(hexes, isLandmass) {
  const inMass = new Set(hexes.filter(isLandmass).map((h) => h.id));
  const sides = [];
  for (const h of hexes) {
    if (!inMass.has(h.id)) continue;
    for (let dir = 0; dir < 6; dir++) {
      if (!inMass.has(neighborId(h.q, h.r, dir))) {
        const eid = hexEdgeId(h.q, h.r, dir);
        sides.push({ hexId: h.id, q: h.q, r: h.r, dir, edgeId: eid, nodes: edgeVertices(eid) });
      }
    }
  }
  return sides;
}

/**
 * Order coastal sides into a single closed loop by following shared vertices.
 * If the landmass is disconnected we return the largest loop, which is what the
 * caller wants (harbors line the main island).
 */
export function walkCoastline(sides) {
  if (sides.length === 0) return [];

  // vertex -> sides touching it
  const byVertex = new Map();
  for (const s of sides) {
    for (const v of s.nodes) {
      if (!byVertex.has(v)) byVertex.set(v, []);
      byVertex.get(v).push(s);
    }
  }

  const unvisited = new Set(sides.map((s) => s.edgeId));
  const loops = [];

  while (unvisited.size > 0) {
    const startEdge = unvisited.values().next().value;
    const start = sides.find((s) => s.edgeId === startEdge);
    const loop = [];
    let current = start;
    let entryVertex = current.nodes[0];

    while (current && unvisited.has(current.edgeId)) {
      unvisited.delete(current.edgeId);
      loop.push(current);
      // Leave through the vertex we did not come in by.
      const exitVertex = current.nodes[0] === entryVertex ? current.nodes[1] : current.nodes[0];
      const candidates = (byVertex.get(exitVertex) || []).filter(
        (s) => s.edgeId !== current.edgeId && unvisited.has(s.edgeId),
      );
      current = candidates[0] || null;
      entryVertex = exitVertex;
    }
    loops.push(loop);
  }

  loops.sort((a, b) => b.length - a.length);
  return loops[0];
}

/**
 * Pick `count` positions spread as evenly as possible around a loop of
 * `total` positions.  For the classic board this yields the real thing:
 * 9 harbors over 30 coastal sides, separated by two or three empty sides.
 */
export function evenlySpacedIndices(total, count, offset = 0) {
  if (count <= 0 || total <= 0) return [];
  if (count >= total) return Array.from({ length: total }, (_, i) => i);
  const indices = [];
  for (let i = 0; i < count; i++) {
    indices.push((offset + Math.round((i * total) / count)) % total);
  }
  return indices;
}

/** Expand `{ generic: 4, wood: 1, ... }` into a flat list of harbor types. */
export function expandHarborSpec(spec) {
  const out = [];
  for (const [type, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) out.push(type);
  }
  return out;
}

/**
 * Place harbors around a landmass.
 *
 * @param hexes       all board hexes
 * @param isLandmass  predicate selecting the coast to line with harbors
 * @param spec        `{ generic: n, wood: n, ... }`
 * @param rng         RNG (used only when `randomize` is on)
 * @param randomize   shuffle both which side gets a harbor and which type it is
 */
export function placeHarbors(hexes, isLandmass, spec, rng, randomize) {
  const loop = walkCoastline(coastalSides(hexes, isLandmass));
  const types = expandHarborSpec(spec);
  const count = types.length;
  if (loop.length === 0) return [];

  // Rotating the start offset keeps the even spacing but moves every harbor,
  // which is what "randomize harbor positions" should feel like.
  const offset = randomize ? rng.int(loop.length) : 0;
  const slots = evenlySpacedIndices(loop.length, count, offset);
  const assigned = randomize ? rng.shuffle(types) : types;

  return slots.map((slotIndex, i) => {
    const side = loop[slotIndex];
    return {
      id: `harbor-${i}`,
      type: assigned[i],
      hexId: side.hexId,
      dir: side.dir,
      edgeId: side.edgeId,
      nodes: side.nodes,
    };
  });
}

/**
 * Geometry for drawing a harbor: the two dock endpoints on the coast plus a
 * point out in the water where the harbor label sits.
 */
export function harborGeometry(harbor, hexes, size) {
  const hex = hexes.find((h) => h.id === harbor.hexId);
  const centre = hexToPixel(hex.q, hex.r, size);
  const a = vertexPixel(harbor.nodes[0], size);
  const b = vertexPixel(harbor.nodes[1], size);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // Push outward, away from the hex centre, into the water.
  const dx = mid.x - centre.x;
  const dy = mid.y - centre.y;
  const len = Math.hypot(dx, dy) || 1;
  const out = { x: mid.x + (dx / len) * size * 0.62, y: mid.y + (dy / len) * size * 0.62 };
  return { a, b, mid, out };
}
