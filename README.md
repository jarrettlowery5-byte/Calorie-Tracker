# Appetite

A mobile-first meal planning + grocery budget app for one household. Set a weekly
budget and serving size, pick meal moods and appliances, get AI recipe
suggestions (with sides), plan the week, and let the grocery list build
itself — deduplicated, priced, pantry-aware, and always measured against your
budget by the sticky meter at the top.

**Stack:** React + Vite + Tailwind CSS · Node + Express · SQLite (better-sqlite3) · Anthropic API (Claude)

## Two ways to run it

1. **Phone / GitHub Pages (no computer needed):** the workflow in
   `.github/workflows/pages.yml` builds a phone-friendly version and publishes
   it to `docs/weekly/` on the branch GitHub Pages already serves, so it lives
   at `https://<your-username>.github.io/Calorie-Tracker/weekly/` — right next
   to the calorie tracker app at the same site's root. In this version all
   data (plan, prices, pantry) is stored in the phone's browser storage, and
   the ✨ Suggest button uses an Anthropic API key you paste into the app's
   Settings (⚙️) — the key is kept only on your device and sent only to
   Anthropic. Open the link on your phone and use "Add to Home Screen" for an
   app icon.

2. **Full version on a computer (server + database):** follow the setup below.
   Data lives in SQLite and the API key stays private on the backend.

## Setup

### 1. Get an Anthropic API key

Create a key at <https://console.anthropic.com/settings/keys>, then:

```bash
cp .env.example .env
# open .env and paste your key:
# ANTHROPIC_API_KEY=sk-ant-...
```

The key is read **only by the backend** (`server/`) from `process.env` via
`dotenv`. It is never bundled into or sent to the browser — the frontend only
calls our own `/api/*` endpoints, and the backend adds the key when talking to
Anthropic. `.env` is git-ignored.

The app works without a key (seed recipes, planning, grocery list, pantry,
prices all function) — only the ✨ Suggest button needs it.

### 2. Install

```bash
npm install            # root helper (concurrently)
npm run install:all    # installs server/ and client/ deps
```

### 3. Run in development

```bash
npm run dev
```

This starts both:

- **Backend** on <http://localhost:3001> (Express + SQLite; the database file is
  created at `server/data/weekly.db` and seeded with 6 starter recipes on first run)
- **Frontend** on <http://localhost:5173> (Vite dev server)

Open <http://localhost:5173>. The Vite dev server proxies every `/api/*` request
to the backend (see `client/vite.config.js`), so there's no CORS setup and the
API key stays server-side.

You can also run them separately: `npm run dev:server` / `npm run dev:client`.

### Production-ish run

```bash
npm run build   # builds client/dist
npm start       # Express serves the API and the built frontend on :3001
```

## Notes

- **Prices are estimates until corrected.** Tap any price in the grocery list to
  enter what you actually paid; it's saved per (ingredient, store) and reused in
  every future list, so estimates get more accurate over time.
- **Model:** recipe generation uses `claude-sonnet-5`. If usage grows,
  `claude-haiku-4-5` is a cheaper alternative (see `server/lib/generate.js`).
- **Real-time store pricing:** all store prices here are estimates. Of the
  supported chains (Walmart, Aldi, Trader Joe's, Publix, Kroger), **Kroger is
  the only one with a public pricing API** if live pricing is ever wired in.
- **Data layer:** single household in v1, but all reads/writes go through the
  helpers in `server/db.js`, so adding auth + a `household_id` column for
  two-person sync later is an additive migration, not a rewrite.

## Features

- Weekly budget + household servings + default store + dietary exclusions
  (hard filter), all persisted
- Meal-type & appliance chips that steer AI suggestions
- AI recipe generation with 2–3 recommended sides each (strict JSON schema,
  validated server-side); 6 built-in seed recipes
- Weekly plan with day assignment (Mon–Sun), per-day cook time/appliance
  summary, and a warning when two long cooks land on the same day
- Per-recipe serving scaler that scales ingredients, cost, and nutrition
- Smart grocery list: deduped across meals, "double-duty" badges on shared
  ingredients, checkboxes with still-to-buy total, group by aisle or by store
  with per-store subtotals
- Editable prices persisted per (ingredient, store)
- Pantry tracking — owned staples are excluded from list + budget; one-tap
  "I already have this"
- Weekly + per-day calories and protein totals (sides included)
- Favorites, 1–5 star ratings, and notes per recipe
- Copy the list as plain text (or Walmart-search format) and export dinners +
  prep reminders as a `.ics` calendar file
