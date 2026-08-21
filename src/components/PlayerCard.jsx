import React from 'react';
import { RESOURCES, RESOURCE_ICON, RESOURCE_LABEL } from '../catan/resources.js';
import { publicVictoryPoints, totalVictoryPoints } from '../engine/game.js';
import { handSize } from '../engine/helpers.js';
import { PIECE_LIMITS } from '../engine/constants.js';

/**
 * One player's status. Opponents show only what a real opponent could see:
 * hand size and public points, not the cards themselves.
 */
export default function PlayerCard({ state, player, isYou, isCurrent }) {
  // Hidden victory point cards stay hidden until someone wins, then everything
  // is revealed -- otherwise an opponent's final score would not add up.
  const revealed = isYou || state.phase === 'gameOver';
  const points = revealed ? totalVictoryPoints(state, player) : publicVictoryPoints(state, player);
  const hidden = isYou ? 0 : player.devCards.length;

  return (
    <div className={`player-card ${isCurrent ? 'current' : ''} ${isYou ? 'you' : ''}`}>
      <div className="player-head">
        <span className="chip" style={{ background: player.color }} />
        <strong>{player.name}</strong>
        {isYou && <span className="tag">you</span>}
        {isCurrent && <span className="tag active">turn</span>}
        <span className="vp" title={isYou ? 'Your points, including hidden cards' : 'Points you can see'}>
          {points} VP
        </span>
      </div>

      {revealed && !isYou && (
        <p className="reveal-note">
          {player.devCards.filter((c) => c.type === 'victoryPoint').length} hidden victory point card(s)
        </p>
      )}

      {isYou ? (
        <div className="hand">
          {RESOURCES.map((r) => (
            <span key={r} className={`card-count ${player.resources[r] ? '' : 'zero'}`} title={RESOURCE_LABEL[r]}>
              <i>{RESOURCE_ICON[r]}</i>{player.resources[r]}
            </span>
          ))}
        </div>
      ) : (
        <div className="hand muted">
          <span className="card-count" title="Resource cards in hand">🂠 {handSize(player.resources)}</span>
          <span className="card-count" title="Development cards held">🃏 {hidden}</span>
        </div>
      )}

      <div className="player-meta">
        <span title="Settlements built">🏠 {player.settlements.length}/{PIECE_LIMITS.settlement}</span>
        <span title="Cities built">🏛 {player.cities.length}/{PIECE_LIMITS.city}</span>
        <span title="Roads built">🛤 {player.roads.length}/{PIECE_LIMITS.road}</span>
        <span title="Knights played">Kn {player.knightsPlayed}</span>
        {state.longestRoad.playerId === player.id && (
          <span className="badge" title={`Longest road: ${state.longestRoad.length}`}>Longest Road</span>
        )}
        {state.largestArmy.playerId === player.id && (
          <span className="badge" title={`${state.largestArmy.size} knights`}>Largest Army</span>
        )}
      </div>
    </div>
  );
}
