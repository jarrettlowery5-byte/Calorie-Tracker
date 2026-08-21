import React, { forwardRef, useMemo } from 'react';
import {
  hexToPixel, hexPolygonPoints, boundsForHexes, vertexPixel, edgeVertices,
} from '../lib/hex.js';
import { TERRAIN, harborLabel } from '../catan/resources.js';
import { harborGeometry } from '../catan/harbors.js';
import NumberToken from './NumberToken.jsx';
import TerrainGlyph from './TerrainGlyph.jsx';

export const HEX_SIZE = 50;

/** The robber: a simple dark pawn silhouette. */
function Robber({ x, y, size }) {
  const s = size;
  return (
    <g transform={`translate(${x} ${y})`} style={{ pointerEvents: 'none' }}>
      <ellipse cx={0} cy={s * 0.3} rx={s * 0.2} ry={s * 0.07} fill="rgba(0,0,0,0.3)" />
      <path
        d={`M${-0.17 * s} ${0.3 * s}
            q0 ${-0.2 * s} ${0.09 * s} ${-0.3 * s}
            a${0.11 * s} ${0.11 * s} 0 1 1 ${0.16 * s} 0
            q${0.09 * s} ${0.1 * s} ${0.09 * s} ${0.3 * s} z`}
        fill="#33302c"
        stroke="#15130f"
        strokeWidth={s * 0.02}
      />
    </g>
  );
}

/** Settlement (house) / city (larger house with a tower) marker. */
function Building({ x, y, size, color, kind }) {
  const s = size * (kind === 'city' ? 0.30 : 0.24);
  return (
    <g transform={`translate(${x} ${y})`} style={{ pointerEvents: 'none' }}>
      <path
        d={
          kind === 'city'
            ? `M${-1.15 * s} ${0.7 * s} L${-1.15 * s} ${-0.1 * s} L${-0.45 * s} ${-0.7 * s}
               L${0.25 * s} ${-0.1 * s} L${0.25 * s} ${0.15 * s} L${1.15 * s} ${0.15 * s}
               L${1.15 * s} ${0.7 * s} Z`
            : `M${-0.8 * s} ${0.7 * s} L${-0.8 * s} ${-0.05 * s} L0 ${-0.75 * s}
               L${0.8 * s} ${-0.05 * s} L${0.8 * s} ${0.7 * s} Z`
        }
        fill={color}
        stroke="#1a1a1a"
        strokeWidth={size * 0.022}
        strokeLinejoin="round"
      />
    </g>
  );
}

/**
 * The board renderer, shared by the Map Generator and the Play tab.
 *
 * Generator mode just draws the map.  Play mode additionally draws pieces and
 * exposes clickable node/edge targets driven by `highlightNodes` / `highlightEdges`.
 */
const BoardSvg = forwardRef(function BoardSvg(
  {
    board,
    size = HEX_SIZE,
    pieces = null,
    highlightNodes = null,
    highlightEdges = null,
    highlightHexes = null,
    onNodeClick,
    onEdgeClick,
    onHexClick,
    robberHexId,
    showNodeDots = false,
    className = '',
  },
  ref,
) {
  const { hexes, harbors } = board;
  const robberOn = robberHexId ?? board.robberHexId;

  const view = useMemo(() => {
    const b = boundsForHexes(hexes, size);
    const pad = size * 1.05; // room for harbor docks and labels
    return {
      x: b.minX - pad,
      y: b.minY - pad,
      w: b.width + pad * 2,
      h: b.height + pad * 2,
    };
  }, [hexes, size]);

  const highlightNodeSet = useMemo(() => new Set(highlightNodes || []), [highlightNodes]);
  const highlightEdgeSet = useMemo(() => new Set(highlightEdges || []), [highlightEdges]);
  const highlightHexSet = useMemo(() => new Set(highlightHexes || []), [highlightHexes]);

  return (
    <svg
      ref={ref}
      className={`board-svg ${className}`}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${board.modeName} Catan board, seed ${board.seedCode}`}
    >
      <defs>
        <radialGradient id="ocean" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#3d87c4" />
          <stop offset="100%" stopColor="#1d5484" />
        </radialGradient>
        <filter id="tokenShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Ocean backdrop -- makes coastlines and islands read as land in water. */}
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#ocean)" rx={size * 0.3} />

      {/* --- Hexes --- */}
      <g>
        {hexes.map((hex) => {
          const centre = hexToPixel(hex.q, hex.r, size);
          const terrain = TERRAIN[hex.type] || TERRAIN.sea;
          const clickable = !!onHexClick;
          const lit = highlightHexSet.has(hex.id);
          return (
            <g
              key={hex.id}
              onClick={clickable ? () => onHexClick(hex) : undefined}
              style={{ cursor: clickable ? 'pointer' : 'default' }}
            >
              <polygon
                points={hexPolygonPoints(hex.q, hex.r, size)}
                fill={terrain.color}
                stroke={
                  hex.type === 'gold' ? terrain.rim
                    : hex.type === 'sea' ? 'rgba(255,255,255,0.18)'
                    : 'rgba(30,24,12,0.45)'
                }
                strokeWidth={size * (hex.type === 'gold' ? 0.075 : 0.035)}
              />
              {/* Terrain motif drawn large and faint so the number token can
                  sit on top of it without clipping the artwork awkwardly. */}
              <g transform={`translate(${centre.x} ${centre.y}) scale(1.7)`}>
                <TerrainGlyph type={hex.type} size={size} />
              </g>
              {lit && (
                <polygon
                  points={hexPolygonPoints(hex.q, hex.r, size)}
                  fill="rgba(255,255,255,0.25)"
                  stroke="#ffe680"
                  strokeWidth={size * 0.07}
                />
              )}
            </g>
          );
        })}
      </g>

      {/* --- Harbors: a dock line from each coastal corner out to the marker --- */}
      <g>
        {harbors.map((harbor) => {
          const g = harborGeometry(harbor, hexes, size);
          const generic = harbor.type === 'generic';
          const fill = generic ? '#f3ead6' : TERRAIN[harbor.type].color;
          const text = generic ? '#3a3226' : TERRAIN[harbor.type].text;
          return (
            <g key={harbor.id} style={{ pointerEvents: 'none' }}>
              <line x1={g.a.x} y1={g.a.y} x2={g.out.x} y2={g.out.y}
                stroke="#6b4f2a" strokeWidth={size * 0.055} strokeLinecap="round" />
              <line x1={g.b.x} y1={g.b.y} x2={g.out.x} y2={g.out.y}
                stroke="#6b4f2a" strokeWidth={size * 0.055} strokeLinecap="round" />
              <circle cx={g.out.x} cy={g.out.y} r={size * 0.29}
                fill={fill} stroke="#4a3a22" strokeWidth={size * 0.035} />
              <text x={g.out.x} y={g.out.y} textAnchor="middle" dominantBaseline="central"
                fontSize={size * 0.2} fontWeight="700" fill={text}
                fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif">
                {generic ? '3:1' : '2:1'}
              </text>
              {!generic && (
                <text x={g.out.x} y={g.out.y + size * 0.44} textAnchor="middle"
                  dominantBaseline="central" fontSize={size * 0.15} fontWeight="600"
                  fill="#f2f6fa" stroke="#123a5c" strokeWidth={size * 0.03}
                  paintOrder="stroke"
                  fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif">
                  {TERRAIN[harbor.type].label}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* --- Roads / ships --- */}
      {pieces && (
        <g>
          {Object.entries(pieces.roads || {}).map(([edgeId, road]) => {
            const [a, b] = edgeVertices(edgeId).map((v) => vertexPixel(v, size));
            return (
              <line key={edgeId} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={road.color} strokeWidth={size * 0.15} strokeLinecap="round"
                style={{ pointerEvents: 'none' }} />
            );
          })}
        </g>
      )}

      {/* --- Clickable edge targets (road placement) --- */}
      {highlightEdgeSet.size > 0 && (
        <g>
          {[...highlightEdgeSet].map((edgeId) => {
            const [a, b] = edgeVertices(edgeId).map((v) => vertexPixel(v, size));
            return (
              <line
                key={edgeId}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                className="edge-target"
                stroke="#ffe680" strokeWidth={size * 0.13} strokeLinecap="round"
                onClick={onEdgeClick ? () => onEdgeClick(edgeId) : undefined}
                style={{ cursor: onEdgeClick ? 'pointer' : 'default' }}
              />
            );
          })}
        </g>
      )}

      {/* --- Settlements / cities --- */}
      {pieces && (
        <g>
          {Object.entries(pieces.buildings || {}).map(([nodeId, b]) => {
            const p = vertexPixel(nodeId, size);
            return <Building key={nodeId} x={p.x} y={p.y} size={size} color={b.color} kind={b.kind} />;
          })}
        </g>
      )}

      {/* --- Clickable node targets (settlement/city placement) --- */}
      {(highlightNodeSet.size > 0 || showNodeDots) && (
        <g>
          {[...highlightNodeSet].map((nodeId) => {
            const p = vertexPixel(nodeId, size);
            return (
              <circle
                key={nodeId}
                cx={p.x} cy={p.y} r={size * 0.17}
                className="node-target"
                fill="rgba(255,230,128,0.9)" stroke="#8a6b16" strokeWidth={size * 0.03}
                onClick={onNodeClick ? () => onNodeClick(nodeId) : undefined}
                style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
              />
            );
          })}
        </g>
      )}

      {/* --- Number tokens (drawn above pieces so they stay readable) --- */}
      <g filter="url(#tokenShadow)">
        {hexes.map((hex) => {
          if (hex.number == null) return null;
          const c = hexToPixel(hex.q, hex.r, size);
          return (
            <NumberToken
              key={`t-${hex.id}`}
              x={c.x}
              y={c.y}
              value={hex.number}
              size={size}
              dimmed={robberOn === hex.id}
            />
          );
        })}
      </g>

      {/* --- Robber --- */}
      {robberOn && (() => {
        const hex = hexes.find((h) => h.id === robberOn);
        if (!hex) return null;
        const c = hexToPixel(hex.q, hex.r, size);
        return <Robber x={c.x} y={c.y - size * 0.05} size={size} />;
      })()}
    </svg>
  );
});

export default BoardSvg;
