# Catan Map Forge

A web app for generating and playing Catan-style board games. React + Vite, with
the board rendered as hand-built SVG hexes.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # rules-engine unit tests
npm run build    # production build + service worker
npm run preview  # serve the production build locally
```

## Install it on a phone

The app is a PWA: fully static, self-contained, and precached by a service
worker, so once installed it launches from the home screen with its own icon,
no browser chrome, and **works with no network at all**.

Deploy it (see below), open the URL on the phone, then:

- **iOS (Safari):** Share → *Add to Home Screen*. Safari does not read the web
  manifest, so `apple-touch-icon.png` and the `apple-mobile-web-app-*` meta tags
  in `index.html` are what give it a proper icon, title and standalone chrome.
- **Android (Chrome):** the *Install app* prompt, or menu → *Add to Home screen*.

### Deploying to GitHub Pages

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds, tests and
publishes on every push. It needs one manual setup step:

> Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**

The site then serves from `https://<owner>.github.io/<repo>/`. The workflow
passes `BASE_PATH=/<repo>/` so asset URLs, the manifest, the service worker
scope and the precache list all resolve under that subpath — verified by
serving the build from a subpath and reloading with the server shut down.

Note: GitHub Pages on a **private** repository requires a paid GitHub plan. If
the repo is private on the free plan, either make it public or deploy the `dist`
folder to any static host (Netlify, Cloudflare Pages, Vercel) — it is plain
static files with no server side.

### Regenerating the icons

`npm run icons` rasterises `scripts/icon.svg` into the PNG sizes iOS and Android
need. The PNGs are committed, so this is only needed if the icon changes;
Playwright is not a project dependency (see the script header).

## Tabs

- **Map Generator** — constraint-based random boards for three modes.
- **Play vs Computer** — the rules engine wired to an interactive UI with heuristic AI opponents.

## Map Generator

| Mode | Hexes | Tokens | Harbors |
| --- | --- | --- | --- |
| Original (3–4 players) | 19 (rows of 3-4-5-4-3) | 18 | 9 |
| Original + 5–6 player extension | 30 (rows of 3-4-5-6-5-4-3) | 28 | 11 |
| Seafarers — *New Shores* (3–4) | 19 mainland + 8 island + 18 sea | 26 | 9 |
| Seafarers — *New Shores* (5–6) | 30 mainland + 10 island + 22 sea | 38 | 11 |

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
- *Heading for New Shores (3–4)* builds the mainland exactly like the base game
  and uses the box's eight extra terrain hexes — 2 gold fields, 2 mountains, and
  one each of fields, hills, pasture and forest — as four two-hex discovery
  islands, each one sea hex off the coast, carrying the eight extra number
  tokens. One adaptation: we lay a complete one-hex sea ring (18 tiles) rather
  than the physical frame's 15, which keeps the map symmetric on screen while
  preserving the one-sea-hex separation that matters.

- *Heading for New Shores (5–6)* is **partly derived** and is labelled as such
  in the app. It needs four boxes on the table (base, Catan 5–6 extension,
  Seafarers, Seafarers 5–6 extension), and is built from their combined
  component pools:

  | Element | Status |
  | --- | --- |
  | 30-hex mainland, 3-4-5-6-5-4-3 | **Exact** — base + Catan 5–6 land is precisely 6/5/6/6/5 + 2 desert |
  | 28 mainland number tokens | **Exact** — base + Catan 5–6 token sets |
  | 22-tile ocean ring | **Exact** — Seafarers (15) + Seafarers 5–6 (7) sea tiles is exactly a complete one-hex ring around that mainland |
  | 10 island hexes with 4 gold fields | **Derived** — the Seafarers land pools minus the third desert, split into five two-hex islands |
  | 2 of the 10 island tokens | **Derived** — the Seafarers box supplies 8; two mid-value tokens are added, deliberately no 6 or 8 |
  | 15 VP (5 players) / 16 (6) | **Derived** — extrapolated from 13/14 at 3–4 players |

  The exact sea-tile match is the main reason to trust the overall shape. Every
  authoritative rulebook for that extension was unreachable from this
  environment, so the derived rows are inference from component lists rather
  than a transcription. They are all in one place — `src/catan/scenarios.js` —
  if you have the box and want to correct them.

## Rules engine (`src/engine`)

Headless and React-free, driven through one entry point:

```js
const next = applyAction(state, { type: 'buildSettlement', nodeId });
```

`applyAction` clones the state before mutating it, so every result can be
treated as immutable, and it throws a human-readable reason for any illegal
move. `legalActions(state, playerId)` returns everything a player may legally
do right now, which is what both the UI and the AI drive off.

Implemented: settlement/city/road placement and validation, resource production
(including the bank-shortage rule), the robber on a 7 with discards and
stealing, building costs, all five development cards with the not-this-turn and
one-per-turn restrictions, harbor trade ratios and player trades, longest road,
largest army, and 10-point win detection.

Two rules details worth knowing:

- **Longest road** is a longest-*trail* search: edges may not repeat, nodes may.
  An opponent's building blocks you from running *through* a node but not from
  starting or ending there, so a closed six-road loop with an enemy settlement
  on it is still six long.
- **Longest Road ties**: the holder keeps the card whenever they are among the
  leaders. If several challengers tie past the holder, the card is set aside
  until one of them pulls ahead.

`npm test` runs 104 tests across the generator, longest road, the robber, dev
cards, core rules and the AI.

## Play vs Computer

The engine wired to an interactive board: click to place and build, roll, trade
with the bank at your best harbor rate, play development cards, and follow the
turn log. One to three AI opponents.

The AI is **v1 — a competent club player, not an expert**. It scores spots by
pip production weighted toward the resources it is short of, favours diverse
three-terrain corners, prefers cities over new settlements, points roads at good
open spots, robs whoever is closest to winning, and trades to the bank only to
bridge a single-card gap toward something it actually wants to build.

The whole policy lives behind one function — `chooseAction(state, playerId)` in
[`src/ai/heuristic.js`](src/ai/heuristic.js) — so a stronger AI can be dropped
in without touching anything else.

**Not implemented in v1:** Seafarers play (ships and island victory points), so
the Play tab offers only Original and 5–6 player boards; and player-to-player
trade negotiation in the UI (the engine supports the trade itself).

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
