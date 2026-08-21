import React from 'react';
import { pipsFor, isRedNumber } from '../catan/tokens.js';

/**
 * A number token: white disc, the number (red for 6 and 8) and a row of pips
 * showing how many of the 36 dice combinations produce it.
 */
export default function NumberToken({ x, y, value, size, dimmed }) {
  if (value == null) return null;
  const r = size * 0.32;
  const red = isRedNumber(value);
  const pips = pipsFor(value);
  const pipR = size * 0.028;
  const gap = pipR * 2.6;
  const startX = -((pips - 1) * gap) / 2;

  return (
    <g transform={`translate(${x} ${y})`} opacity={dimmed ? 0.45 : 1} style={{ pointerEvents: 'none' }}>
      <circle cx={0} cy={size * 0.02} r={r} fill="rgba(0,0,0,0.22)" />
      <circle cx={0} cy={0} r={r} fill="#f6f1e4" stroke="#b9ad91" strokeWidth={size * 0.02} />
      <text
        x={0}
        y={-size * 0.02}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.34}
        fontWeight="700"
        fill={red ? '#c22a1f' : '#2c2a26'}
        fontFamily="'Georgia', 'Times New Roman', serif"
      >
        {value}
      </text>
      <g fill={red ? '#c22a1f' : '#2c2a26'}>
        {Array.from({ length: pips }, (_, i) => (
          <circle key={i} cx={startX + i * gap} cy={size * 0.17} r={pipR} />
        ))}
      </g>
    </g>
  );
}
