import React, { useCallback, useMemo, useRef, useState } from 'react';
import BoardSvg from './BoardSvg.jsx';
import { generateBoard, boardStats } from '../catan/generator.js';
import { MODE_LIST, BOARD_MODES } from '../catan/layouts.js';
import { SCENARIO_LIST } from '../catan/scenarios.js';
import { CONSTRAINT_LIST, defaultConstraintState } from '../catan/constraints.js';
import { TERRAIN, RESOURCE_LABEL, harborLabel } from '../catan/resources.js';
import { codeToSeed } from '../lib/random.js';
import { downloadPng, downloadSvg, copyPngToClipboard } from '../lib/exportImage.js';

const RESOURCE_ORDER = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export default function GeneratorTab({ board, setBoard }) {
  const [modeId, setModeId] = useState(board?.modeId ?? 'original');
  const [scenarioId, setScenarioId] = useState(board?.scenarioId ?? 'new-shores');
  const [constraints, setConstraints] = useState(defaultConstraintState);
  const [seedInput, setSeedInput] = useState('');
  const [status, setStatus] = useState(null);
  const svgRef = useRef(null);

  const regenerate = useCallback(
    (opts = {}) => {
      const seed = opts.seed ?? (seedInput.trim() ? codeToSeed(seedInput) : undefined);
      try {
        const next = generateBoard({ modeId, scenarioId, constraints, seed });
        setBoard(next);
        setSeedInput('');
        setStatus(null);
      } catch (err) {
        setStatus({ tone: 'error', text: err.message });
      }
    },
    [modeId, scenarioId, constraints, seedInput, setBoard],
  );

  const stats = useMemo(() => (board ? boardStats(board) : null), [board]);
  const mode = BOARD_MODES[board?.modeId ?? modeId];

  const harborTally = useMemo(() => {
    if (!board) return [];
    const counts = {};
    for (const h of board.harbors) counts[h.type] = (counts[h.type] || 0) + 1;
    return Object.entries(counts).sort((a, b) => (a[0] === 'generic' ? -1 : b[0] === 'generic' ? 1 : a[0].localeCompare(b[0])));
  }, [board]);

  const withStatus = async (fn, okText) => {
    try {
      await fn();
      setStatus({ tone: 'ok', text: okText });
    } catch (err) {
      setStatus({ tone: 'error', text: err.message });
    }
  };

  if (!board) return null;

  return (
    <div className="layout">
      <aside className="panel controls">
        <section className="control-group">
          <h2>Board</h2>
          <label className="field">
            <span>Mode</span>
            <select value={modeId} onChange={(e) => setModeId(e.target.value)}>
              {MODE_LIST.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <p className="hint">{BOARD_MODES[modeId].blurb}</p>

          {BOARD_MODES[modeId].scenarioDriven && (
            <label className="field">
              <span>Scenario</span>
              <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                {SCENARIO_LIST.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="control-group">
          <h2>Constraints</h2>
          {CONSTRAINT_LIST.map((c) => (
            <label key={c.id} className="check" title={c.description}>
              <input
                type="checkbox"
                checked={!!constraints[c.id]}
                onChange={(e) => setConstraints((s) => ({ ...s, [c.id]: e.target.checked }))}
              />
              <span>
                <strong>{c.label}</strong>
                <em>{c.description}</em>
              </span>
            </label>
          ))}
        </section>

        <section className="control-group">
          <h2>Seed</h2>
          <p className="hint">
            Current: <code>{board.seedCode}</code> — every board is reproducible from its seed.
          </p>
          <div className="row">
            <input
              className="seed-input"
              placeholder="Paste a seed…"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && regenerate()}
            />
            <button className="btn ghost" onClick={() => regenerate({ seed: board.seed })}>
              Re-roll same seed
            </button>
          </div>
        </section>

        <div className="actions">
          <button className="btn primary big" onClick={() => regenerate()}>Regenerate</button>
          <div className="row">
            <button className="btn" onClick={() => withStatus(() => copyPngToClipboard(svgRef.current), 'Board copied to clipboard.')}>
              Copy image
            </button>
            <button className="btn" onClick={() => withStatus(() => downloadPng(svgRef.current, `catan-${board.seedCode}.png`), 'PNG downloaded.')}>
              Download PNG
            </button>
          </div>
          <button className="btn ghost" onClick={() => withStatus(() => downloadSvg(svgRef.current, `catan-${board.seedCode}.svg`), 'SVG downloaded.')}>
            Download SVG
          </button>
        </div>

        {status && <p className={`status ${status.tone}`}>{status.text}</p>}
        {board.meta.warnings.map((w) => (
          <p key={w} className="status warn">{w}</p>
        ))}
      </aside>

      <main className="board-area">
        <div className="board-header">
          <div>
            <h2>{board.modeName}{board.scenarioName ? ` — ${board.scenarioName}` : ''}</h2>
            <p className="sub">
              {board.hexes.filter((h) => h.slot === 'land').length} land hexes ·{' '}
              {board.hexes.filter((h) => h.number != null).length} number tokens ·{' '}
              {board.harbors.length} harbors · seed <code>{board.seedCode}</code>
            </p>
          </div>
        </div>

        <div className="board-frame">
          <BoardSvg ref={svgRef} board={board} />
        </div>

        {board.scenario && (
          <section className="panel scenario-note">
            <h3>{board.scenario.name}</h3>
            <p>{board.scenario.summary}</p>
            <ul>{board.scenario.specialRules.map((r) => <li key={r}>{r}</li>)}</ul>
          </section>
        )}

        <section className="panel report">
          <h3>Board report</h3>
          <table className="stats">
            <thead>
              <tr><th>Resource</th><th>Hexes</th><th>Pips</th><th>Red (6/8)</th><th>Share of pips</th></tr>
            </thead>
            <tbody>
              {RESOURCE_ORDER.map((res) => {
                const s = stats.byResource[res] || { hexes: 0, pips: 0, reds: 0 };
                const share = stats.totalPips ? (s.pips / stats.totalPips) * 100 : 0;
                return (
                  <tr key={res}>
                    <td>
                      <span className="swatch" style={{ background: TERRAIN[res].color }} />
                      {RESOURCE_LABEL[res]}
                    </td>
                    <td>{s.hexes}</td>
                    <td>{s.pips}</td>
                    <td>{s.reds}</td>
                    <td>
                      <div className="bar"><div className="bar-fill" style={{ width: `${share}%`, background: TERRAIN[res].color }} /></div>
                      <span className="bar-label">{share.toFixed(1)}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h4>Harbors</h4>
          <ul className="harbor-list">
            {harborTally.map(([type, count]) => (
              <li key={type}>
                <span className="swatch" style={{ background: type === 'generic' ? '#f3ead6' : TERRAIN[type].color }} />
                {harborLabel(type)} × {count}
              </li>
            ))}
          </ul>

          <h4>Constraints applied</h4>
          <ul className="constraint-report">
            {CONSTRAINT_LIST.map((c) => {
              const requested = !!board.constraints.requested[c.id];
              const relaxed = board.constraints.relaxed.includes(c.id);
              const state = !requested ? 'off' : relaxed ? 'relaxed' : 'on';
              return (
                <li key={c.id} className={state}>
                  <span className="dot" /> {c.label}
                  <em>{state === 'off' ? 'disabled' : state === 'relaxed' ? 'could not be satisfied — relaxed' : 'satisfied'}</em>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            Generated in {board.meta.attempts} attempt{board.meta.attempts === 1 ? '' : 's'} ·{' '}
            {board.meta.terrainAttempts} terrain shuffle{board.meta.terrainAttempts === 1 ? '' : 's'} ·{' '}
            {board.meta.searchNodes.toLocaleString()} search nodes.
          </p>
        </section>
      </main>
    </div>
  );
}
