# Calorie Tracker

A personal, local-first calorie and macro tracking web app. Mobile-first UI, no login,
all data stored in a single SQLite file on your machine.

## Features

- **One-time profile setup** (sex, age, height, weight, activity level) — never asked again, editable in Settings.
- **TDEE via Mifflin-St Jeor**; daily budget = TDEE − deficit (default 500, adjustable) + exercise logged that day.
- **Food logging** with calories/protein/carbs/fat, grouped by breakfast/lunch/dinner/snacks, with favorites, recent foods, and a "copy yesterday" action.
- **AI estimation** (server-side via the Anthropic API): from a text description ("12 oz ribeye") or a photo of a meal.
- **Exercise logging** with AI burn estimates that use your current body weight.
- **Daily weigh-ins** with a trend chart: raw weights, 7-day rolling average, goal line, and dotted projections — planned pace (from your deficit, 3500 kcal/lb) and, once 14+ days of data exist, your actual rate of loss.
- **Adaptive TDEE**: every 2 weeks, average intake vs. actual weight change is compared and your TDEE estimate is corrected (shown to you, capped at ±300 kcal per period).
- **Weekly summary** (avg calories, protein, actual vs. planned deficit) and browsable per-day history.

## Two ways to run it

### 1. Browser-only (recommended for phones — nothing to install)

The `docs/` folder is a fully static build: all logic and data live in your browser
(localStorage), and AI calls go straight from the browser to the Anthropic API with a
key you paste into Settings (stored only on your device). Host it on GitHub Pages:

1. Make the repository public (Settings → General → Danger Zone → Change visibility) —
   Pages is free only for public repos, and the repo contains only code, never your data.
2. Repo Settings → Pages → "Deploy from a branch" → pick the branch, folder `/docs` → Save.
3. Open `https://<username>.github.io/Calorie-Tracker/` on your phone and use
   Share → "Add to Home Screen" to install it like an app (works offline).

Back up occasionally with Settings → Export backup — clearing the browser's site data
erases the log.

### 2. Self-hosted Node server

Requires Node.js 22+.

```sh
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Or put `ANTHROPIC_API_KEY=sk-ant-...` in a `.env` file next to `server.js`.
Then open http://localhost:3000 (on your phone: `http://<your-computer-ip>:3000`).

Everything except AI estimation works without an API key.

## Data

All data lives in `data.db` (SQLite, via Node's built-in `node:sqlite`). Back it up by copying the file. Override the location with `DB_PATH`.

## Notes

- AI estimation uses `claude-opus-4-8` with structured outputs; photos are downscaled to ≤1024px client-side before upload.
- The adaptive TDEE check needs ≥10 logged food days and ≥4 weigh-ins in a 14-day period; sparse periods are skipped.
