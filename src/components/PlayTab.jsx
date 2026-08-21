import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BoardSvg from './BoardSvg.jsx';
import PlayerCard from './PlayerCard.jsx';
import TurnLog from './TurnLog.jsx';
import { generateBoard } from '../catan/generator.js';
import { defaultConstraintState } from '../catan/constraints.js';
import { BOARD_MODES } from '../catan/layouts.js';
import { RESOURCES, RESOURCE_ICON, RESOURCE_LABEL } from '../catan/resources.js';
import { createGame, applyAction, legalActions, totalVictoryPoints } from '../engine/game.js';
import { stealTargets, discardRequirement } from '../engine/production.js';
import { getPlayer, tradeRatios, handSize } from '../engine/helpers.js';
import { DEV_CARDS } from '../engine/constants.js';
import { chooseAction } from '../ai/heuristic.js';

const HUMAN_ID = 'p0';
const AI_NAMES = ['Bot Aurora', 'Bot Basalt', 'Bot Cinder'];
/** Board modes the engine can actually play: Seafarers needs ships, which v1 lacks. */
const PLAYABLE_MODES = Object.values(BOARD_MODES).filter((m) => m.supportsPlay);

/* ---------- New-game setup screen ---------- */

function NewGameScreen({ generatedBoard, onStart }) {
  const [opponents, setOpponents] = useState(2);
  const [source, setSource] = useState(generatedBoard.modeId === 'seafarers' ? 'new' : 'current');
  const [modeId, setModeId] = useState('original');
  const [goal, setGoal] = useState(10);
  const seafarers = generatedBoard.modeId === 'seafarers';

  const start = () => {
    const board = source === 'current' && !seafarers
      ? generatedBoard
      : generateBoard({ modeId, constraints: defaultConstraintState() });
    onStart({ board, opponents, goal });
  };

  return (
    <div className="new-game">
      <div className="panel new-game-panel">
        <h2>Play vs Computer</h2>
        <p className="hint">
          The rules engine wired to heuristic opponents. Marked <strong>v1</strong>: a
          competent club player, not an expert.
        </p>

        <label className="field">
          <span>Opponents</span>
          <select value={opponents} onChange={(e) => setOpponents(Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>{n} computer opponent{n > 1 ? 's' : ''}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Board</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="current" disabled={seafarers}>
              {seafarers ? 'Current map (Seafarers — not playable yet)' : `Current map (${generatedBoard.seedCode})`}
            </option>
            <option value="new">Generate a fresh board</option>
          </select>
        </label>
        {seafarers && (
          <p className="status warn">
            Seafarers boards need ships and island victory points, which this v1 engine
            does not implement yet. Generate an Original or 5–6 player board to play.
          </p>
        )}

        {source === 'new' && (
          <label className="field">
            <span>Board type</span>
            <select value={modeId} onChange={(e) => setModeId(e.target.value)}>
              {PLAYABLE_MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span>Play to</span>
          <select value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {[8, 10, 12].map((n) => <option key={n} value={n}>{n} victory points</option>)}
          </select>
        </label>

        <button className="btn primary big" onClick={start}>Start game</button>
      </div>
    </div>
  );
}

/* ---------- Small dialogs ---------- */

function ResourcePicker({ counts, onChange, max, limits }) {
  return (
    <div className="res-picker">
      {RESOURCES.map((r) => (
        <div key={r} className="res-row">
          <span className="res-name"><i>{RESOURCE_ICON[r]}</i> {RESOURCE_LABEL[r]}</span>
          <div className="stepper">
            <button className="btn tiny" disabled={!counts[r]} onClick={() => onChange(r, -1)}>−</button>
            <span className="stepper-value">{counts[r] || 0}</span>
            <button
              className="btn tiny"
              disabled={
                (max != null && Object.values(counts).reduce((a, b) => a + b, 0) >= max) ||
                (limits && (counts[r] || 0) >= limits[r])
              }
              onClick={() => onChange(r, 1)}
            >+</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- The game screen ---------- */

export default function PlayTab({ generatedBoard }) {
  const [game, setGame] = useState(null);
  const [pending, setPending] = useState(null);   // 'settlement' | 'city' | 'road' | 'roadBuilding'
  const [error, setError] = useState(null);
  const [robberPick, setRobberPick] = useState(null);  // { hexId, victims }
  const [draft, setDraft] = useState({});          // discard / year-of-plenty / gold picks
  const [tradeGive, setTradeGive] = useState(null);
  const [devPrompt, setDevPrompt] = useState(null); // 'yearOfPlenty' | 'monopoly'
  const [roadBuildingPicks, setRoadBuildingPicks] = useState([]);
  const [speed, setSpeed] = useState(650);

  const human = game ? getPlayer(game, HUMAN_ID) : null;
  const legal = useMemo(() => (game ? legalActions(game, HUMAN_ID) : null), [game]);
  const isHumanTurn = game && game.players[game.currentPlayerIndex].id === HUMAN_ID;

  const act = useCallback((action) => {
    setError(null);
    setGame((g) => {
      try {
        return applyAction(g, action);
      } catch (err) {
        setError(err.message);
        return g;
      }
    });
    setPending(null);
    setRobberPick(null);
    setDraft({});
    setDevPrompt(null);
    setRoadBuildingPicks([]);
  }, []);

  /**
   * Drive the computer players. Each tick applies exactly one AI action, which
   * keeps the board legible instead of the AIs' whole turn appearing at once.
   */
  useEffect(() => {
    if (!game || game.phase === 'gameOver') return undefined;
    const actor = game.players.find((p) => p.isAI && chooseAction(game, p.id));
    if (!actor) return undefined;
    const timer = setTimeout(() => {
      setGame((g) => {
        const action = chooseAction(g, actor.id);
        if (!action) return g;
        try {
          return applyAction(g, action);
        } catch (err) {
          // A stuck AI should never freeze the game; pass the turn instead.
          try { return applyAction(g, { type: 'endTurn', playerId: actor.id }); } catch { return g; }
        }
      });
    }, speed);
    return () => clearTimeout(timer);
  }, [game, speed]);

  if (!game) {
    return (
      <NewGameScreen
        generatedBoard={generatedBoard}
        onStart={({ board, opponents, goal }) => {
          const specs = [
            { name: 'You', isAI: false },
            ...AI_NAMES.slice(0, opponents).map((name) => ({ name, isAI: true })),
          ];
          setGame(createGame({ board, playerSpecs: specs, victoryPointGoal: goal, seed: Date.now() >>> 0 }));
        }}
      />
    );
  }

  /* ----- Board overlays ----- */

  const pieces = { buildings: {}, roads: {} };
  for (const p of game.players) {
    for (const n of p.settlements) pieces.buildings[n] = { color: p.color, kind: 'settlement' };
    for (const n of p.cities) pieces.buildings[n] = { color: p.color, kind: 'city' };
    for (const e of p.roads) pieces.roads[e] = { color: p.color };
  }

  let highlightNodes = null;
  let highlightEdges = null;
  let highlightHexes = null;
  let onNodeClick;
  let onEdgeClick;
  let onHexClick;

  if (isHumanTurn && game.phase === 'setup') {
    if (game.setup.awaiting === 'settlement') {
      highlightNodes = legal.settlements;
      onNodeClick = (nodeId) => act({ type: 'setupSettlement', nodeId });
    } else {
      highlightEdges = legal.roads;
      onEdgeClick = (edgeId) => act({ type: 'setupRoad', edgeId });
    }
  } else if (isHumanTurn && game.phase === 'robber' && !robberPick) {
    highlightHexes = legal.robberHexes;
    onHexClick = (hex) => {
      const victims = stealTargets(game, hex.id, HUMAN_ID);
      if (victims.length === 0) act({ type: 'moveRobber', hexId: hex.id });
      else setRobberPick({ hexId: hex.id, victims });
    };
  } else if (pending === 'settlement') {
    highlightNodes = legal.settlements;
    onNodeClick = (nodeId) => act({ type: 'buildSettlement', nodeId });
  } else if (pending === 'city') {
    highlightNodes = legal.cities;
    onNodeClick = (nodeId) => act({ type: 'buildCity', nodeId });
  } else if (pending === 'road') {
    highlightEdges = legal.roads;
    onEdgeClick = (edgeId) => act({ type: 'buildRoad', edgeId });
  } else if (pending === 'roadBuilding') {
    highlightEdges = legal.roads.filter((e) => !roadBuildingPicks.includes(e));
    onEdgeClick = (edgeId) => {
      const picks = [...roadBuildingPicks, edgeId];
      if (picks.length === 2) act({ type: 'playRoadBuilding', edgeIds: picks });
      else setRoadBuildingPicks(picks);
    };
  }

  const ratios = tradeRatios(game, human);
  const mustDiscard = game.phase === 'discard' && game.pendingDiscards.includes(HUMAN_ID);
  const discardNeed = mustDiscard ? discardRequirement(human) : 0;
  const goldEntry = game.phase === 'gold' ? game.pendingGold.find((g) => g.playerId === HUMAN_ID) : null;
  const draftTotal = Object.values(draft).reduce((a, b) => a + b, 0);
  const adjustDraft = (r, delta) =>
    setDraft((d) => ({ ...d, [r]: Math.max(0, (d[r] || 0) + delta) }));

  const winner = game.winner ? getPlayer(game, game.winner) : null;

  return (
    <div className="layout play-layout">
      <main className="board-area">
        <div className="board-header">
          <div>
            <h2>
              {game.phase === 'gameOver'
                ? `${winner.name} wins!`
                : `Turn ${game.turn} — ${game.players[game.currentPlayerIndex].name}`}
            </h2>
            <p className="sub">
              {phaseLabel(game, isHumanTurn, pending, roadBuildingPicks)}
              {game.dice && ` · rolled ${game.dice[0]} + ${game.dice[1]} = ${game.lastRoll}`}
            </p>
          </div>
          <div className="row speed-row">
            <label className="field inline">
              <span>AI speed</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                <option value={1200}>Slow</option>
                <option value={650}>Normal</option>
                <option value={200}>Fast</option>
              </select>
            </label>
            <button className="btn ghost" onClick={() => setGame(null)}>New game</button>
          </div>
        </div>

        <div className="board-frame">
          <BoardSvg
            board={game.board}
            pieces={pieces}
            robberHexId={game.robberHexId}
            highlightNodes={highlightNodes}
            highlightEdges={highlightEdges}
            highlightHexes={highlightHexes}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onHexClick={onHexClick}
          />
        </div>
      </main>

      <aside className="panel play-side">
        {game.phase === 'gameOver' ? (
          <section className="control-group">
            <h2>{winner.name} wins</h2>
            <ul className="final-scores">
              {[...game.players]
                .sort((a, b) => totalVictoryPoints(game, b) - totalVictoryPoints(game, a))
                .map((p) => (
                  <li key={p.id}>
                    <span className="chip" style={{ background: p.color }} />
                    {p.name}<strong>{totalVictoryPoints(game, p)} VP</strong>
                  </li>
                ))}
            </ul>
            <button className="btn primary big" onClick={() => setGame(null)}>Play again</button>
          </section>
        ) : (
          <section className="control-group">
            <h2>{sidebarHeading(game, isHumanTurn, mustDiscard, goldEntry, robberPick)}</h2>

            {/* --- Forced responses --- */}
            {mustDiscard && (
              <div className="prompt">
                <p>You hold {handSize(human.resources)} cards. Discard {discardNeed}.</p>
                <ResourcePicker counts={draft} onChange={adjustDraft} max={discardNeed} limits={human.resources} />
                <button
                  className="btn primary"
                  disabled={draftTotal !== discardNeed}
                  onClick={() => act({ type: 'discard', playerId: HUMAN_ID, resources: draft })}
                >
                  Discard {draftTotal}/{discardNeed}
                </button>
              </div>
            )}

            {goldEntry && (
              <div className="prompt">
                <p>Your gold field pays {goldEntry.count} resource{goldEntry.count > 1 ? 's' : ''} of your choice.</p>
                <ResourcePicker counts={draft} onChange={adjustDraft} max={goldEntry.count} />
                <button
                  className="btn primary"
                  disabled={draftTotal !== goldEntry.count}
                  onClick={() => act({
                    type: 'chooseGold',
                    playerId: HUMAN_ID,
                    resources: Object.entries(draft).flatMap(([r, n]) => Array(n).fill(r)),
                  })}
                >
                  Take {draftTotal}/{goldEntry.count}
                </button>
              </div>
            )}

            {robberPick && (
              <div className="prompt">
                <p>Steal from whom?</p>
                <div className="btn-grid">
                  {robberPick.victims.map((id) => {
                    const victim = getPlayer(game, id);
                    return (
                      <button key={id} className="btn" onClick={() => act({ type: 'moveRobber', hexId: robberPick.hexId, victimId: id })}>
                        <span className="chip" style={{ background: victim.color }} /> {victim.name}
                      </button>
                    );
                  })}
                  <button className="btn ghost" onClick={() => act({ type: 'moveRobber', hexId: robberPick.hexId })}>
                    Steal nothing
                  </button>
                </div>
              </div>
            )}

            {devPrompt === 'yearOfPlenty' && (
              <div className="prompt">
                <p>Take any two resources from the bank.</p>
                <ResourcePicker counts={draft} onChange={adjustDraft} max={2} />
                <button
                  className="btn primary"
                  disabled={draftTotal !== 2}
                  onClick={() => act({
                    type: 'playYearOfPlenty',
                    resources: Object.entries(draft).flatMap(([r, n]) => Array(n).fill(r)),
                  })}
                >
                  Take 2
                </button>
              </div>
            )}

            {devPrompt === 'monopoly' && (
              <div className="prompt">
                <p>Name a resource. Every opponent hands you all of theirs.</p>
                <div className="btn-grid">
                  {RESOURCES.map((r) => (
                    <button key={r} className="btn" onClick={() => act({ type: 'playMonopoly', resource: r })}>
                      {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* --- Normal turn actions --- */}
            {!mustDiscard && !goldEntry && !robberPick && !devPrompt && (
              <>
                {!isHumanTurn && <p className="hint">Waiting for {game.players[game.currentPlayerIndex].name}…</p>}

                {isHumanTurn && game.phase === 'setup' && (
                  <p className="hint">
                    {game.setup.awaiting === 'settlement'
                      ? 'Click a highlighted corner to place a settlement.'
                      : 'Click a highlighted edge to place the road beside it.'}
                  </p>
                )}

                {isHumanTurn && game.phase === 'roll' && (
                  <button className="btn primary big" onClick={() => act({ type: 'rollDice' })}>🎲 Roll dice</button>
                )}

                {isHumanTurn && game.phase === 'robber' && !robberPick && (
                  <p className="hint">Click a hex to move the robber there.</p>
                )}

                {isHumanTurn && game.phase === 'main' && (
                  <>
                    <h4>Build</h4>
                    <div className="btn-grid">
                      <button className={`btn ${pending === 'road' ? 'primary' : ''}`}
                        disabled={!legal.roads.length}
                        onClick={() => setPending(pending === 'road' ? null : 'road')}>
                        Road<em>1🌲 1🧱</em>
                      </button>
                      <button className={`btn ${pending === 'settlement' ? 'primary' : ''}`}
                        disabled={!legal.settlements.length}
                        onClick={() => setPending(pending === 'settlement' ? null : 'settlement')}>
                        Settlement<em>1🌲 1🧱 1🐑 1🌾</em>
                      </button>
                      <button className={`btn ${pending === 'city' ? 'primary' : ''}`}
                        disabled={!legal.cities.length}
                        onClick={() => setPending(pending === 'city' ? null : 'city')}>
                        City<em>2🌾 3⛰️</em>
                      </button>
                      <button className="btn" disabled={!legal.canBuyDev}
                        onClick={() => act({ type: 'buyDevCard' })}>
                        Dev card<em>1🐑 1🌾 1⛰️</em>
                      </button>
                    </div>
                    {pending && <p className="hint">Click a highlighted spot on the board, or press the button again to cancel.</p>}

                    <h4>Development cards ({human.devCards.length})</h4>
                    {human.devCards.length === 0 && <p className="hint">None yet.</p>}
                    <div className="dev-list">
                      {summariseDevCards(human).map(({ type, total, playable }) => (
                        <button
                          key={type}
                          className="btn dev-card"
                          disabled={!playable || type === 'victoryPoint'}
                          title={DEV_CARDS[type].description}
                          onClick={() => playDev(type, act, setDevPrompt, setPending, game)}
                        >
                          <strong>{DEV_CARDS[type].label}</strong>
                          <span className="dev-count">×{total}</span>
                        </button>
                      ))}
                    </div>

                    <h4>Trade with the bank</h4>
                    <div className="trade-grid">
                      {RESOURCES.map((r) => (
                        <button
                          key={r}
                          className={`btn tiny ${tradeGive === r ? 'primary' : ''}`}
                          disabled={human.resources[r] < ratios[r]}
                          title={`Give ${ratios[r]} ${RESOURCE_LABEL[r]}`}
                          onClick={() => setTradeGive(tradeGive === r ? null : r)}
                        >
                          {RESOURCE_ICON[r]} {ratios[r]}:1
                        </button>
                      ))}
                    </div>
                    {tradeGive && (
                      <div className="prompt">
                        <p>Give {ratios[tradeGive]} {RESOURCE_LABEL[tradeGive]} — receive:</p>
                        <div className="btn-grid">
                          {RESOURCES.filter((r) => r !== tradeGive).map((r) => (
                            <button key={r} className="btn tiny" disabled={game.bank[r] <= 0}
                              onClick={() => { act({ type: 'bankTrade', give: tradeGive, receive: r }); setTradeGive(null); }}>
                              {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button className="btn primary big end-turn" onClick={() => act({ type: 'endTurn' })}>
                      End turn
                    </button>
                  </>
                )}
              </>
            )}

            {error && <p className="status error">{error}</p>}
          </section>
        )}

        <section className="control-group">
          <h2>Players</h2>
          {game.players.map((p) => (
            <PlayerCard
              key={p.id}
              state={game}
              player={p}
              isYou={p.id === HUMAN_ID}
              isCurrent={game.players[game.currentPlayerIndex].id === p.id}
            />
          ))}
          <p className="hint">Playing to {game.victoryPointGoal} points. AI: v1 heuristic.</p>
        </section>

        <section className="control-group log-group">
          <h2>Turn log</h2>
          <TurnLog state={game} />
        </section>
      </aside>
    </div>
  );
}

/* ---------- helpers ---------- */

function summariseDevCards(player) {
  const groups = {};
  for (const card of player.devCards) {
    const g = (groups[card.type] ||= { type: card.type, total: 0, playable: false });
    g.total += 1;
    if (!card.played) g.playable = true;
  }
  return Object.values(groups);
}

function playDev(type, act, setDevPrompt, setPending, game) {
  if (type === 'knight') {
    // Reuse the robber flow: the engine treats a knight as a robber move.
    setPending(null);
    act({ type: 'playKnight', ...pickKnightTarget(game) });
  } else if (type === 'roadBuilding') {
    setPending('roadBuilding');
  } else if (type === 'yearOfPlenty' || type === 'monopoly') {
    setDevPrompt(type);
  }
}

/** For the human's knight we default to the AI's own robber heuristic. */
function pickKnightTarget(game) {
  const action = chooseAction({ ...game, phase: 'robber' }, HUMAN_ID);
  return action && action.hexId
    ? { hexId: action.hexId, victimId: action.victimId ?? null }
    : { hexId: game.board.hexes.find((h) => h.type !== 'sea' && h.id !== game.robberHexId).id };
}

/** Sidebar heading: says what is actually being asked of the human right now. */
function sidebarHeading(game, isHumanTurn, mustDiscard, goldEntry, robberPick) {
  if (mustDiscard) return 'Discard cards';
  if (goldEntry) return 'Gold field';
  if (robberPick) return 'Steal a card';
  if (!isHumanTurn) return 'Opponent\u2019s turn';
  if (game.phase === 'setup') return 'Place your pieces';
  if (game.phase === 'roll') return 'Roll to start your turn';
  if (game.phase === 'robber') return 'Move the robber';
  return 'Your turn';
}

function phaseLabel(game, isHumanTurn, pending, roadBuildingPicks) {
  if (game.phase === 'gameOver') return 'Game over';
  if (game.phase === 'discard') return 'Discarding after a 7';
  if (game.phase === 'gold') return 'Choosing gold field payouts';
  if (game.phase === 'setup') return `Setup — placing ${game.setup.awaiting}s`;
  if (game.phase === 'robber') return 'Moving the robber';
  if (pending === 'roadBuilding') return `Road Building — pick road ${roadBuildingPicks.length + 1} of 2`;
  if (pending) return `Placing a ${pending}`;
  if (game.phase === 'roll') return isHumanTurn ? 'Your roll' : 'Rolling';
  return isHumanTurn ? 'Your turn — build, trade or end' : 'Thinking…';
}
