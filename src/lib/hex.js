/**
 * Pointy-top hexagon geometry on an axial (q, r) coordinate system.
 *
 * Screen mapping (y grows downward, as in SVG):
 *   x = size * sqrt(3) * (q + r / 2)
 *   y = size * 1.5 * r
 *
 * With that mapping the six neighbour directions sit at screen angles
 * 0, 60, 120, 180, 240, 300 degrees and the six corners sit exactly between
 * them at 30, 90, 150, 210, 270, 330 degrees.  Corner 90/270 are the "points"
 * of the pointy-top hex.
 *
 * Corner `i` (angle 30 + 60*i) is shared with the neighbours in directions
 * `i` and `i + 1`.  The edge toward neighbour `i` therefore spans corners
 * `i - 1` and `i`.  Those two facts are the whole basis for the exact,
 * float-free vertex/edge identity scheme below.
 */

export const SQRT3 = Math.sqrt(3);

/** Neighbour offsets, indexed by direction. Order matches the angle order above. */
export const DIRECTIONS = [
  { q: 1, r: 0 },   // 0: E
  { q: 0, r: 1 },   // 1: SE
  { q: -1, r: 1 },  // 2: SW
  { q: -1, r: 0 },  // 3: W
  { q: 0, r: -1 },  // 4: NW
  { q: 1, r: -1 },  // 5: NE
];

export const DIRECTION_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];

/** Stable string id for a hex coordinate. */
export const hexId = (q, r) => `${q},${r}`;

/** Parse a hex id back into `{ q, r }`. */
export function parseHexId(id) {
  const [q, r] = id.split(',').map(Number);
  return { q, r };
}

export const neighbor = (q, r, dir) => ({
  q: q + DIRECTIONS[dir].q,
  r: r + DIRECTIONS[dir].r,
});

export const neighborId = (q, r, dir) => hexId(q + DIRECTIONS[dir].q, r + DIRECTIONS[dir].r);

/** All six neighbour ids of a hex. */
export function neighborIds(q, r) {
  return DIRECTIONS.map((_, dir) => neighborId(q, r, dir));
}

/** Axial distance between two hexes. */
export function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

/** Centre of a hex in pixel space. */
export function hexToPixel(q, r, size) {
  return {
    x: size * SQRT3 * (q + r / 2),
    y: size * 1.5 * r,
  };
}

/**
 * Pixel position of corner `i` of a hex.
 * Corner angles are 30 + 60*i degrees.
 */
export function cornerPixel(q, r, i, size) {
  const c = hexToPixel(q, r, size);
  const angle = ((30 + 60 * i) * Math.PI) / 180;
  return { x: c.x + size * Math.cos(angle), y: c.y + size * Math.sin(angle) };
}

/** The six corner points of a hex, as an SVG `points` string. */
export function hexPolygonPoints(q, r, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const p = cornerPixel(q, r, i, size);
    pts.push(`${p.x.toFixed(3)},${p.y.toFixed(3)}`);
  }
  return pts.join(' ');
}

/**
 * Exact identity for a vertex (settlement/city spot).
 *
 * A vertex is shared by exactly three hexes.  Corner `i` of hex `h` touches
 * `h`, `h + DIRECTIONS[i]` and `h + DIRECTIONS[i + 1]`.  Sorting those three
 * coordinates yields a canonical key that is identical no matter which of the
 * three hexes we approach the vertex from -- and it is integer-based, so there
 * is no floating point rounding involved.
 */
export function vertexId(q, r, i) {
  const a = DIRECTIONS[i % 6];
  const b = DIRECTIONS[(i + 1) % 6];
  const trio = [
    [q, r],
    [q + a.q, r + a.r],
    [q + b.q, r + b.r],
  ];
  trio.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return trio.map(([cq, cr]) => `${cq},${cr}`).join('|');
}

/** The three hex coordinates that meet at a vertex. */
export function vertexHexes(vid) {
  return vid.split('|').map((s) => parseHexId(s));
}

/** Pixel position of a vertex, derived from the three hexes that share it. */
export function vertexPixel(vid, size) {
  const hexes = vertexHexes(vid);
  // The vertex is the centroid of the three hex centres -- exact for a hex grid.
  let x = 0;
  let y = 0;
  for (const h of hexes) {
    const p = hexToPixel(h.q, h.r, size);
    x += p.x;
    y += p.y;
  }
  return { x: x / 3, y: y / 3 };
}

/** The six vertex ids of a hex, in corner order. */
export function hexVertexIds(q, r) {
  const out = [];
  for (let i = 0; i < 6; i++) out.push(vertexId(q, r, i));
  return out;
}

/** Canonical id for an edge (road spot): the two vertex ids, sorted. */
export function edgeId(vA, vB) {
  return vA < vB ? `${vA}::${vB}` : `${vB}::${vA}`;
}

/** The two vertex ids of an edge. */
export function edgeVertices(eid) {
  return eid.split('::');
}

/**
 * The edge of hex (q, r) facing neighbour direction `dir`.
 * Spans corners `dir - 1` and `dir`.
 */
export function hexEdgeId(q, r, dir) {
  return edgeId(vertexId(q, r, (dir + 5) % 6), vertexId(q, r, dir));
}

/** The six edge ids of a hex, indexed by neighbour direction. */
export function hexEdgeIds(q, r) {
  const out = [];
  for (let dir = 0; dir < 6; dir++) out.push(hexEdgeId(q, r, dir));
  return out;
}

/** Midpoint of an edge in pixel space. */
export function edgeMidpoint(eid, size) {
  const [a, b] = edgeVertices(eid);
  const pa = vertexPixel(a, size);
  const pb = vertexPixel(b, size);
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}

/** Angle (degrees) of an edge, useful for rotating road rectangles. */
export function edgeAngle(eid, size) {
  const [a, b] = edgeVertices(eid);
  const pa = vertexPixel(a, size);
  const pb = vertexPixel(b, size);
  return (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
}

/** Generate the hexes of a hexagonal ring of the given radius around the origin. */
export function hexRing(radius) {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const results = [];
  // Start at the "W" corner of the ring, then walk its six sides.
  // Walking direction `walk[k]` carries us from ring corner k to corner k + 1.
  let q = -radius;
  let r = 0;
  const walk = [1, 0, 5, 4, 3, 2];
  for (const dir of walk) {
    for (let step = 0; step < radius; step++) {
      results.push({ q, r });
      q += DIRECTIONS[dir].q;
      r += DIRECTIONS[dir].r;
    }
  }
  return results;
}

/** All hexes within `radius` of the origin (a filled hexagon). */
export function hexSpiral(radius) {
  const out = [];
  for (let k = 0; k <= radius; k++) out.push(...hexRing(k));
  return out;
}

/** Bounding box of a set of hexes, including their corners. */
export function boundsForHexes(hexes, size) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const h of hexes) {
    for (let i = 0; i < 6; i++) {
      const p = cornerPixel(h.q, h.r, i, size);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
