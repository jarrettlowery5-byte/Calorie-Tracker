import React, { useState } from 'react';
import GeneratorTab from './components/GeneratorTab.jsx';
import PlayTab from './components/PlayTab.jsx';
import { generateBoard } from './catan/generator.js';
import { defaultConstraintState } from './catan/constraints.js';

const TABS = [
  { id: 'generator', label: 'Map Generator' },
  { id: 'play', label: 'Play vs Computer' },
];

export default function App() {
  const [tab, setTab] = useState('generator');
  // The generator's current board lives here so the Play tab can borrow it.
  const [board, setBoard] = useState(() =>
    generateBoard({ modeId: 'original', constraints: defaultConstraintState() }),
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo" aria-hidden="true">⬡</span>
          <div>
            <h1>Catan Map Forge</h1>
            <p>Constraint-based board generation and a playable rules engine.</p>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'generator' ? (
        <GeneratorTab board={board} setBoard={setBoard} />
      ) : (
        <PlayTab generatedBoard={board} />
      )}
    </div>
  );
}
