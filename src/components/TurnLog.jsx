import React, { useEffect, useRef } from 'react';

const ICONS = {
  roll: '🎲', build: '🔨', produce: '📦', robber: '🥷', dev: '🃏',
  trade: '🔁', discard: '🗑', award: '🏆', system: '•', bank: '🏦',
};

/** Scrolling record of everything that has happened, newest at the bottom. */
export default function TurnLog({ state }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [state.log.length]);

  const colorFor = (playerId) =>
    state.players.find((p) => p.id === playerId)?.color ?? 'transparent';

  return (
    <div className="turn-log">
      {state.log.map((entry) => (
        <div key={entry.id} className={`log-entry ${entry.kind}`}>
          <span className="log-icon">{ICONS[entry.kind] || '•'}</span>
          <span className="log-bar" style={{ background: colorFor(entry.playerId) }} />
          <span className="log-text">{entry.text}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
