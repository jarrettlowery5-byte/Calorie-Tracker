// Load .env if present (no dependency needed)
const fs = require('fs');
const path = require('path');
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');
const { addDays, diffDays, isValidDate } = require('./lib/dates');
const tdee = require('./lib/tdee');
const ai = require('./lib/ai');

const app = express();
app.use(express.json({ limit: '12mb' })); // meal photos arrive base64-encoded
app.use(express.static(path.join(__dirname, 'public')));

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : NaN);

function requireProfile(res) {
  const p = tdee.getProfile();
  if (!p) res.status(400).json({ error: 'Profile not set up yet.' });
  return p;
}

// ---------- Profile ----------

app.get('/api/profile', (req, res) => {
  res.json({ profile: tdee.getProfile() });
});

app.post('/api/profile', (req, res) => {
  const b = req.body || {};
  const heightIn = num(b.height_ft) * 12 + num(b.height_in);
  if (!['male', 'female'].includes(b.sex) ||
      !(num(b.age) >= 13 && num(b.age) <= 100) ||
      !(heightIn >= 36 && heightIn <= 96) ||
      !(num(b.weight_lbs) >= 50 && num(b.weight_lbs) <= 800) ||
      !(b.activity in tdee.ACTIVITY_MULTIPLIERS)) {
    return res.status(400).json({ error: 'Invalid profile fields.' });
  }
  const deficit = Math.max(0, Math.min(1500, Math.round(num(b.deficit)) || 500));
  const goal = num(b.goal_weight_lbs) > 0 ? num(b.goal_weight_lbs) : null;
  const tgt = (v) => (num(v) > 0 && num(v) <= 1000 ? Math.round(num(v)) : null);
  const cadj = num(b.calorie_adjustment) >= -1000 && num(b.calorie_adjustment) <= 1000
    ? Math.round(num(b.calorie_adjustment)) : 0;
  const existing = tdee.getProfile();
  const createdAt = existing ? existing.created_at
    : (isValidDate(b.today) ? b.today : new Date().toISOString().slice(0, 10));

  db.prepare(`
    INSERT INTO profile (id, sex, age, height_in, weight_lbs, activity, deficit, goal_weight_lbs,
                         protein_target, carbs_target, fat_target, calorie_adjustment, created_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sex=excluded.sex, age=excluded.age, height_in=excluded.height_in,
      weight_lbs=excluded.weight_lbs, activity=excluded.activity,
      deficit=excluded.deficit, goal_weight_lbs=excluded.goal_weight_lbs,
      protein_target=excluded.protein_target, carbs_target=excluded.carbs_target,
      fat_target=excluded.fat_target, calorie_adjustment=excluded.calorie_adjustment
  `).run(b.sex, Math.round(num(b.age)), heightIn, num(b.weight_lbs), b.activity, deficit, goal,
         tgt(b.protein_target), tgt(b.carbs_target), tgt(b.fat_target), cadj, createdAt);

  // First weigh-in seeds the trend chart
  if (!existing) {
    db.prepare('INSERT OR REPLACE INTO weights (date, weight_lbs) VALUES (?, ?)')
      .run(createdAt, num(b.weight_lbs));
  }
  res.json({ profile: tdee.getProfile() });
});

// ---------- Day view (budget + logs) ----------

app.get('/api/day', (req, res) => {
  const profile = requireProfile(res);
  if (!profile) return;
  const date = isValidDate(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);

  // Lazily run the every-2-weeks adaptive TDEE check; surface the correction if new.
  const correction = tdee.runAdaptiveCheck(date);

  const foods = db.prepare('SELECT * FROM foods WHERE date = ? ORDER BY id').all(date);
  const exercises = db.prepare('SELECT * FROM exercises WHERE date = ? ORDER BY id').all(date);
  const exerciseCals = exercises.reduce((s, e) => s + e.calories, 0);

  const formula = tdee.formulaTdee(profile, tdee.currentWeight() || profile.weight_lbs);
  const offset = tdee.adjustmentOffset();
  const manual = tdee.manualAdjustment(profile);
  const effective = formula + offset + manual;
  const budget = effective - profile.deficit + exerciseCals;

  const totals = foods.reduce(
    (t, f) => ({ calories: t.calories + f.calories, protein: t.protein + f.protein,
                 carbs: t.carbs + f.carbs, fat: t.fat + f.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const yid = db.prepare('SELECT COUNT(*) AS n FROM foods WHERE date = ?').get(addDays(date, -1)).n;

  res.json({
    date,
    budget: {
      formulaTdee: Math.round(formula),
      adjustmentOffset: Math.round(offset),
      manualAdjustment: Math.round(manual),
      effectiveTdee: Math.round(effective),
      deficit: profile.deficit,
      exerciseCals: Math.round(exerciseCals),
      budget: Math.round(budget),
      remaining: Math.round(budget - totals.calories),
    },
    totals: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fat: Math.round(totals.fat),
    },
    targets: {
      protein: profile.protein_target || null,
      carbs: profile.carbs_target || null,
      fat: profile.fat_target || null,
    },
    meals: Object.fromEntries(MEALS.map((m) => [m, foods.filter((f) => f.meal === m)])),
    exercises,
    canCopyYesterday: yid > 0,
    tdeeCorrection: correction,
  });
});

// ---------- Foods ----------

app.post('/api/foods', (req, res) => {
  const b = req.body || {};
  if (!isValidDate(b.date) || !MEALS.includes(b.meal) || !b.name ||
      !(num(b.calories) >= 0)) {
    return res.status(400).json({ error: 'Invalid food entry.' });
  }
  const info = db.prepare(
    'INSERT INTO foods (date, meal, name, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(b.date, b.meal, String(b.name).slice(0, 200), num(b.calories),
        num(b.protein) || 0, num(b.carbs) || 0, num(b.fat) || 0);
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/foods/:id', (req, res) => {
  db.prepare('DELETE FROM foods WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/foods/copy-yesterday', (req, res) => {
  const date = req.body && req.body.date;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date.' });
  const yesterday = addDays(date, -1);
  const rows = db.prepare('SELECT * FROM foods WHERE date = ? ORDER BY id').all(yesterday);
  const insert = db.prepare(
    'INSERT INTO foods (date, meal, name, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const f of rows) insert.run(date, f.meal, f.name, f.calories, f.protein, f.carbs, f.fat);
  res.json({ copied: rows.length });
});

// Favorites + recents for quick add
app.get('/api/quick', (req, res) => {
  const favorites = db.prepare('SELECT * FROM favorites ORDER BY name').all();
  const recents = db.prepare(`
    SELECT name, calories, protein, carbs, fat, MAX(id) AS last_id
    FROM foods GROUP BY name, calories, protein, carbs, fat
    ORDER BY last_id DESC LIMIT 20
  `).all();
  res.json({ favorites, recents });
});

app.post('/api/favorites', (req, res) => {
  const b = req.body || {};
  if (!b.name || !(num(b.calories) >= 0)) return res.status(400).json({ error: 'Invalid favorite.' });
  db.prepare(`
    INSERT INTO favorites (name, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET calories=excluded.calories, protein=excluded.protein,
      carbs=excluded.carbs, fat=excluded.fat
  `).run(String(b.name).slice(0, 200), num(b.calories), num(b.protein) || 0, num(b.carbs) || 0, num(b.fat) || 0);
  res.json({ ok: true });
});

app.delete('/api/favorites/:id', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Exercises ----------

app.post('/api/exercises', (req, res) => {
  const b = req.body || {};
  if (!isValidDate(b.date) || !b.name || !(num(b.calories) > 0)) {
    return res.status(400).json({ error: 'Invalid exercise entry.' });
  }
  const info = db.prepare('INSERT INTO exercises (date, name, calories) VALUES (?, ?, ?)')
    .run(b.date, String(b.name).slice(0, 200), num(b.calories));
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/exercises/:id', (req, res) => {
  db.prepare('DELETE FROM exercises WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Weights & chart ----------

app.post('/api/weights', (req, res) => {
  const b = req.body || {};
  if (!isValidDate(b.date) || !(num(b.weight_lbs) >= 50 && num(b.weight_lbs) <= 800)) {
    return res.status(400).json({ error: 'Invalid weigh-in.' });
  }
  db.prepare('INSERT OR REPLACE INTO weights (date, weight_lbs) VALUES (?, ?)')
    .run(b.date, num(b.weight_lbs));
  res.json({ ok: true });
});

app.delete('/api/weights/:date', (req, res) => {
  db.prepare('DELETE FROM weights WHERE date = ?').run(req.params.date);
  res.json({ ok: true });
});

app.get('/api/chart', (req, res) => {
  const profile = requireProfile(res);
  if (!profile) return;

  const weights = db.prepare('SELECT date, weight_lbs FROM weights ORDER BY date').all();
  const rolling = weights.map((w) => ({
    date: w.date,
    weight_lbs: Math.round(tdee.trendWeightAt(w.date) * 10) / 10,
  }));

  const goal = profile.goal_weight_lbs;
  const projections = { planned: null, actual: null };

  if (weights.length) {
    const last = rolling[rolling.length - 1];
    const losing = goal != null && goal < last.weight_lbs;

    // Planned: straight line at deficit/3500 lbs per day from the current trend point.
    if (goal != null && profile.deficit > 0 && losing) {
      const slope = -profile.deficit / 3500; // lbs/day
      const days = Math.ceil((goal - last.weight_lbs) / slope);
      const capped = Math.min(days, 365);
      projections.planned = {
        from: last,
        to: { date: addDays(last.date, capped), weight_lbs: Math.round((last.weight_lbs + slope * capped) * 10) / 10 },
        projectedDate: days <= 365 ? addDays(last.date, days) : null,
        ratePerWeek: Math.round(slope * 7 * 100) / 100,
      };
    }

    // Actual: linear regression on raw weigh-ins (last 30 days), needs a 14+ day span.
    const cutoff = addDays(last.date, -30);
    const recent = weights.filter((w) => w.date >= cutoff);
    const span = recent.length >= 2 ? diffDays(recent[0].date, recent[recent.length - 1].date) : 0;
    const totalSpan = diffDays(weights[0].date, weights[weights.length - 1].date);
    if (totalSpan >= 14 && recent.length >= 4 && span >= 10) {
      const xs = recent.map((w) => diffDays(recent[0].date, w.date));
      const ys = recent.map((w) => w.weight_lbs);
      const n = xs.length;
      const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
      const denom = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
      const slope = denom ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / denom : 0;

      let days = 90; // default horizon when goal isn't ahead on this trajectory
      let projectedDate = null;
      if (goal != null && slope !== 0 && Math.sign(goal - last.weight_lbs) === Math.sign(slope)) {
        const d = Math.ceil((goal - last.weight_lbs) / slope);
        if (d > 0 && d <= 365) { days = d; projectedDate = addDays(last.date, d); }
        else if (d > 365) days = 365;
      }
      projections.actual = {
        from: last,
        to: { date: addDays(last.date, days), weight_lbs: Math.round((last.weight_lbs + slope * days) * 10) / 10 },
        projectedDate,
        ratePerWeek: Math.round(slope * 7 * 100) / 100,
      };
    }
  }

  res.json({ weights, rolling, projections, goalWeight: goal });
});

// ---------- Weekly summary ----------

app.get('/api/summary', (req, res) => {
  const profile = requireProfile(res);
  if (!profile) return;
  const start = isValidDate(req.query.start) ? req.query.start : null;
  if (!start) return res.status(400).json({ error: 'start date required' });
  const end = addDays(start, 6);

  const dayRows = db.prepare(`
    SELECT date, SUM(calories) AS calories, SUM(protein) AS protein
    FROM foods WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date
  `).all(start, end);
  const exByDay = Object.fromEntries(
    db.prepare('SELECT date, SUM(calories) AS c FROM exercises WHERE date >= ? AND date <= ? GROUP BY date')
      .all(start, end).map((r) => [r.date, r.c])
  );

  const effective = tdee.effectiveTdee(profile);
  const days = dayRows.map((r) => {
    const ex = exByDay[r.date] || 0;
    return {
      date: r.date,
      calories: Math.round(r.calories),
      protein: Math.round(r.protein),
      exercise: Math.round(ex),
      actualDeficit: Math.round(effective + ex - r.calories),
    };
  });

  const n = days.length;
  res.json({
    start, end,
    daysLogged: n,
    avgCalories: n ? Math.round(days.reduce((s, d) => s + d.calories, 0) / n) : null,
    avgProtein: n ? Math.round(days.reduce((s, d) => s + d.protein, 0) / n) : null,
    proteinTarget: profile.protein_target || null,
    plannedDeficit: profile.deficit,
    actualDeficit: n ? Math.round(days.reduce((s, d) => s + d.actualDeficit, 0) / n) : null,
    days,
  });
});

// ---------- History ----------

app.get('/api/history', (req, res) => {
  const profile = tdee.getProfile();
  const rows = db.prepare(`
    SELECT date, SUM(calories) AS calories, SUM(protein) AS protein, COUNT(*) AS entries
    FROM foods GROUP BY date ORDER BY date DESC LIMIT 120
  `).all();
  const exByDay = Object.fromEntries(
    db.prepare('SELECT date, SUM(calories) AS c FROM exercises GROUP BY date').all()
      .map((r) => [r.date, r.c])
  );
  const effective = profile ? tdee.effectiveTdee(profile) : null;
  res.json({
    days: rows.map((r) => ({
      date: r.date,
      calories: Math.round(r.calories),
      protein: Math.round(r.protein),
      entries: r.entries,
      budget: profile ? Math.round(effective - profile.deficit + (exByDay[r.date] || 0)) : null,
    })),
  });
});

// ---------- TDEE status ----------

app.get('/api/tdee', (req, res) => {
  const profile = requireProfile(res);
  if (!profile) return;
  const w = tdee.currentWeight() || profile.weight_lbs;
  res.json({
    currentWeight: Math.round(w * 10) / 10,
    formulaTdee: Math.round(tdee.formulaTdee(profile, w)),
    adjustmentOffset: Math.round(tdee.adjustmentOffset()),
    manualAdjustment: Math.round(tdee.manualAdjustment(profile)),
    effectiveTdee: Math.round(tdee.effectiveTdee(profile)),
    adjustments: db.prepare('SELECT * FROM tdee_adjustments ORDER BY period_end DESC').all(),
  });
});

// ---------- AI estimation ----------

app.post('/api/estimate/food', async (req, res) => {
  try {
    const { description, image } = req.body || {};
    if (!description && !image) return res.status(400).json({ error: 'Provide a description or a photo.' });
    if (image && (!image.data || !/^image\/(jpeg|png|webp|gif)$/.test(image.media_type || ''))) {
      return res.status(400).json({ error: 'Unsupported image.' });
    }
    res.json(await ai.estimateFood({ description, image }));
  } catch (err) {
    console.error('estimate/food failed:', err.message);
    res.status(502).json({ error: aiErrorMessage(err) });
  }
});

app.post('/api/estimate/exercise', async (req, res) => {
  try {
    const { description } = req.body || {};
    if (!description) return res.status(400).json({ error: 'Describe the exercise.' });
    const weightLbs = tdee.currentWeight();
    if (!weightLbs) return res.status(400).json({ error: 'Set up your profile first.' });
    res.json(await ai.estimateExercise({ description, weightLbs }));
  } catch (err) {
    console.error('estimate/exercise failed:', err.message);
    res.status(502).json({ error: aiErrorMessage(err) });
  }
});

function aiErrorMessage(err) {
  if (err.code === 'NO_API_KEY' || /resolve authentication method/i.test(err.message || '')) {
    return 'AI estimation needs ANTHROPIC_API_KEY set on the server.';
  }
  if (err instanceof Anthropic.AuthenticationError) return 'AI estimation needs a valid ANTHROPIC_API_KEY on the server.';
  if (err instanceof Anthropic.RateLimitError) return 'AI is rate-limited right now — try again in a minute.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service.';
  return 'AI estimation failed — enter it manually or retry.';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Calorie tracker running at http://localhost:${PORT}`));
