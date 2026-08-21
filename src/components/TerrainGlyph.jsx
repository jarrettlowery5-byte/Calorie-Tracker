import React from 'react';

/**
 * Small decorative glyph drawn inside each hex, behind the number token.
 * Deliberately drawn with plain SVG primitives (no emoji, no icon font) so the
 * board serialises cleanly when exported to PNG.
 */
export default function TerrainGlyph({ type, size }) {
  const s = size;
  const common = { opacity: 0.15, fill: '#0d1b12', stroke: 'none' };

  switch (type) {
    case 'wood':
      return (
        <g {...common}>
          <path d={`M${-0.34 * s} ${0.16 * s} l${0.16 * s} ${-0.4 * s} l${0.16 * s} ${0.4 * s} z`} />
          <path d={`M${0.02 * s} ${0.24 * s} l${0.2 * s} ${-0.5 * s} l${0.2 * s} ${0.5 * s} z`} />
        </g>
      );
    case 'brick':
      return (
        <g {...common}>
          {[0, 1].map((row) =>
            [0, 1, 2].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={(-0.36 + col * 0.25 + (row % 2 ? 0.08 : 0)) * s}
                y={(-0.1 + row * 0.19) * s}
                width={0.21 * s}
                height={0.14 * s}
                rx={0.02 * s}
              />
            )),
          )}
        </g>
      );
    case 'sheep':
      return (
        <g {...common}>
          <ellipse cx={-0.05 * s} cy={0.02 * s} rx={0.26 * s} ry={0.19 * s} />
          <circle cx={0.2 * s} cy={-0.06 * s} r={0.11 * s} />
          <rect x={-0.18 * s} y={0.16 * s} width={0.05 * s} height={0.13 * s} />
          <rect x={0.04 * s} y={0.16 * s} width={0.05 * s} height={0.13 * s} />
        </g>
      );
    case 'wheat':
      return (
        <g {...common}>
          {[-0.26, 0, 0.26].map((dx, i) => (
            <g key={i} transform={`translate(${dx * s} 0)`}>
              <rect x={-0.02 * s} y={-0.12 * s} width={0.04 * s} height={0.4 * s} rx={0.02 * s} />
              <ellipse cx={-0.07 * s} cy={-0.1 * s} rx={0.05 * s} ry={0.1 * s} />
              <ellipse cx={0.07 * s} cy={-0.1 * s} rx={0.05 * s} ry={0.1 * s} />
            </g>
          ))}
        </g>
      );
    case 'ore':
      return (
        <g {...common}>
          <path d={`M${-0.4 * s} ${0.24 * s} l${0.24 * s} ${-0.42 * s} l${0.24 * s} ${0.42 * s} z`} />
          <path d={`M${-0.04 * s} ${0.26 * s} l${0.22 * s} ${-0.36 * s} l${0.22 * s} ${0.36 * s} z`} />
        </g>
      );
    case 'desert':
      return (
        <g fill="none" stroke="#8a6f3f" strokeWidth={0.05 * s} opacity={0.3} strokeLinecap="round">
          <path d={`M${-0.34 * s} ${0.06 * s} q${0.17 * s} ${-0.16 * s} ${0.34 * s} 0`} />
          <path d={`M${-0.16 * s} ${0.24 * s} q${0.17 * s} ${-0.16 * s} ${0.34 * s} 0`} />
        </g>
      );
    case 'gold':
      return (
        <g opacity={0.4} fill="#8a6200">
          <circle cx={0} cy={0.02 * s} r={0.3 * s} fill="none" stroke="#7a5800" strokeWidth={0.05 * s} />
          <path
            d={`M0 ${-0.2 * s} l${0.06 * s} ${0.13 * s} l${0.14 * s} ${0.02 * s} l${-0.1 * s} ${0.1 * s}
                l${0.03 * s} ${0.14 * s} l${-0.13 * s} ${-0.07 * s} l${-0.13 * s} ${0.07 * s}
                l${0.03 * s} ${-0.14 * s} l${-0.1 * s} ${-0.1 * s} l${0.14 * s} ${-0.02 * s} z`}
          />
        </g>
      );
    case 'sea':
      return (
        <g fill="none" stroke="#ffffff" strokeWidth={0.045 * s} opacity={0.16} strokeLinecap="round">
          <path d={`M${-0.36 * s} ${-0.1 * s} q${0.12 * s} ${-0.11 * s} ${0.24 * s} 0 q${0.12 * s} ${0.11 * s} ${0.24 * s} 0`} />
          <path d={`M${-0.36 * s} ${0.1 * s} q${0.12 * s} ${-0.11 * s} ${0.24 * s} 0 q${0.12 * s} ${0.11 * s} ${0.24 * s} 0`} />
          <path d={`M${-0.36 * s} ${0.3 * s} q${0.12 * s} ${-0.11 * s} ${0.24 * s} 0 q${0.12 * s} ${0.11 * s} ${0.24 * s} 0`} />
        </g>
      );
    default:
      return null;
  }
}
