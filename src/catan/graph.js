/**
 * Turns a list of hexes into the settlement/road graph the renderer and the
 * rules engine both work on.
 *
 * nodes  = settlement/city spots (hex corners), each shared by up to 3 hexes
 * edges  = road/ship spots (hex sides), each shared by up to 2 hexes
 */

import {
  hexVertexIds, hexEdgeIds, edgeVertices, vertexPixel, edgeMidpoint, neighborIds,
} from '../lib/hex.js';
import { isLand } from './resources.js';

export function buildGraph(hexes) {
  const hexById = new Map(hexes.map((h) => [h.id, h]));

  const nodes = new Map();      // nodeId -> { id, hexIds: [] }
  const edges = new Map();      // edgeId -> { id, nodes: [a, b], hexIds: [] }
  const hexNodes = new Map();   // hexId  -> [nodeId x6] in corner order
  const hexEdges = new Map();   // hexId  -> [edgeId x6] in direction order

  for (const h of hexes) {
    const vIds = hexVertexIds(h.q, h.r);
    const eIds = hexEdgeIds(h.q, h.r);
    hexNodes.set(h.id, vIds);
    hexEdges.set(h.id, eIds);

    for (const vid of vIds) {
      if (!nodes.has(vid)) nodes.set(vid, { id: vid, hexIds: [] });
      nodes.get(vid).hexIds.push(h.id);
    }
    for (const eid of eIds) {
      if (!edges.has(eid)) edges.set(eid, { id: eid, nodes: edgeVertices(eid), hexIds: [] });
      edges.get(eid).hexIds.push(h.id);
    }
  }

  // Adjacency: which nodes/edges touch which.
  const nodeEdges = new Map();      // nodeId -> [edgeId]
  const nodeNeighbors = new Map();  // nodeId -> [nodeId]
  for (const node of nodes.values()) {
    nodeEdges.set(node.id, []);
    nodeNeighbors.set(node.id, []);
  }
  for (const edge of edges.values()) {
    const [a, b] = edge.nodes;
    if (nodeEdges.has(a)) { nodeEdges.get(a).push(edge.id); nodeNeighbors.get(a).push(b); }
    if (nodeEdges.has(b)) { nodeEdges.get(b).push(edge.id); nodeNeighbors.get(b).push(a); }
  }

  // Hex-to-hex adjacency, restricted to hexes that exist on this board.
  const hexNeighbors = new Map();
  for (const h of hexes) {
    hexNeighbors.set(h.id, neighborIds(h.q, h.r).filter((id) => hexById.has(id)));
  }

  /** A node is buildable if it touches at least one land hex. */
  const landNodes = new Set();
  for (const node of nodes.values()) {
    if (node.hexIds.some((id) => isLand(hexById.get(id).type ?? hexById.get(id).slot))) {
      landNodes.add(node.id);
    }
  }

  return {
    hexes, hexById, nodes, edges, hexNodes, hexEdges,
    nodeEdges, nodeNeighbors, hexNeighbors, landNodes,
  };
}

/** Pixel helpers, kept out of the graph itself so the graph stays size-agnostic. */
export const nodePos = (nodeId, size) => vertexPixel(nodeId, size);
export const edgePos = (edgeId, size) => edgeMidpoint(edgeId, size);
