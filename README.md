# Catan Map Forge

A web app for generating and playing Catan-style board games. React + Vite, with
the board rendered as hand-built SVG hexes.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # rules-engine unit tests
```

## Tabs

- **Map Generator** — constraint-based random boards for three modes.
- **Play vs Computer** — the rules engine wired to an interactive UI with heuristic AI opponents.

## Map Generator

| Mode | Hexes | Tokens | Harbors |
| --- | --- | --- | --- |
| Original (3–4 players) | 19 (rows of 3-4-5-4-3) | 18 | 9 |
| Original + 5–6 player extension | 30 (rows of 3-4-5-6-5-4-3) | 28 | 11 |
| Seafarers — *Heading for New Shores* | 19 mainland + 8 island + 18 sea | 26 | 9 |

Constraint toggles: no red numbers touching, no duplicate numbers touching, no
same-resource clustering, pip balancing, desert in center, randomize harbors.

Generation is a genuine constraint-satisfaction search — see
[`src/catan/generator.js`](src/catan/generator.js). Terrain is shuffled and
tested; number tokens are then placed by a backtracking search that prunes on
every enabled constraint. If a constraint set can't be satisfied the generator
relaxes the softest constraints one at a time and reports exactly which ones it
dropped, instead of hanging or silently emitting an invalid board.

Every board is reproducible from its seed code, and can be exported as PNG
(download or clipboard) or as SVG.

## Layout sources

- The 5–6 player extension board is the official elongated hexagon of seven rows,
  3-4-5-6-5-4-3 = 30 land hexes, with 11 harbors (the extension adds one 3:1 and
  one 2:1 wool frame piece to the base game's 4× 3:1 and 5× 2:1).
- *Heading for New Shores* builds the mainland exactly like the base game and
  uses the box's eight extra terrain hexes — 2 gold fields, 2 mountains, and one
  each of fields, hills, pasture and forest — as four two-hex discovery islands,
  each one sea hex off the coast, carrying the eight extra number tokens.
  One adaptation: we lay a complete one-hex sea ring (18 tiles) rather than the
  physical frame's 15, which keeps the map symmetric on screen while preserving
  the one-sea-hex separation that matters.

## Project layout

```
src/lib/         hex geometry, seeded RNG, PNG/SVG export
src/catan/       terrain, tokens, layouts, scenarios, harbors, constraints, generator
src/engine/      headless rules engine (Phase 2)
src/ai/          heuristic AI opponents
src/components/  React UI
src/test/        Vitest unit tests
```

### Hex geometry

Pointy-top hexes on axial `(q, r)` coordinates. Vertices (settlement spots) and
edges (road spots) get exact integer identities derived from the three hexes that
meet at a corner, so no floating-point rounding is involved in deciding whether
two hexes share a corner. The classic 19-hex board yields exactly 54 nodes and
72 edges, as it should.
