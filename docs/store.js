/* Browser-only data layer: replaces the Node server.
   Exposes window.api(path, opts) with the same routes/shapes the server had,
   backed by localStorage, plus direct Anthropic API calls for AI estimation. */
(() => {
  'use strict';

  const STORE_KEY = 'calorie-tracker-v1';
  const KEY_KEY = 'calorie-tracker-api-key';

  // ---------- persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { profile: null, foods: [], favorites: [], exercises: [], weights: [], adjustments: [], nextId: 1 };
  }
  const db = load();
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  const nextId = () => db.nextId++;

  const getApiKey = () => localStorage.getItem(KEY_KEY) || '';
  const setApiKey = (k) => localStorage.setItem(KEY_KEY, (k || '').trim());

  // ---------- date helpers (YYYY-MM-DD strings, treated as UTC for math) ----------
  const toDate = (s) => new Date(s + 'T00:00:00Z');
  const toStr = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };
  const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
  const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toDate(s));
  const pad = (n) => String(n).padStart(2, '0');
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  // ---------- TDEE (Mifflin-St Jeor) ----------
  const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 };
  const PERIOD_DAYS = 14, MAX_ADJUSTMENT = 300, KCAL_PER_LB = 3500;
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : NaN);
  const round1 = (n) => Math.round(n * 10) / 10;

  function sortedWeights() { return [...db.weights].sort((a, b) => a.date < b.date ? -1 : 1); }
  function currentWeight() {
    const w = sortedWeights();
    return w.length ? w[w.length - 1].weight_lbs : (db.profile ? db.profile.weight_lbs : null);
  }
  function formulaTdee(profile, weightLbs) {
    const kg = weightLbs * 0.45359237, cm = profile.height_in * 2.54;
    const bmr = 10 * kg + 6.25 * cm - 5 * profile.age + (profile.sex === 'male' ? 5 : -161);
    return bmr * (ACTIVITY[profile.activity] || 1.2);
  }
  const adjustmentOffset = () => db.adjustments.reduce((s, a) => s + a.adjustment, 0);
  const manualAdjustment = (p) => p.calorie_adjustment || 0;
  const effectiveTdee = (p) => formulaTdee(p, currentWeight() || p.weight_lbs) + adjustmentOffset() + manualAdjustment(p);

  // 7-day rolling average ending at `date`; falls back to nearest raw entry.
  function trendWeightAt(date) {
    const lo = addDays(date, -7);
    const rows = db.weights.filter((w) => w.date > lo && w.date <= date);
    if (rows.length) return rows.reduce((s, r) => s + r.weight_lbs, 0) / rows.length;
    let best = null, bestDist = Infinity;
    for (const w of db.weights) {
      const d = Math.abs(diffDays(w.date, date));
      if (d < bestDist) { bestDist = d; best = w; }
    }
    return best ? best.weight_lbs : null;
  }

  // Every-2-weeks adaptive TDEE check; idempotent per period.
  function runAdaptiveCheck(today) {
    const profile = db.profile;
    if (!profile) return null;
    const ends = db.adjustments.map((a) => a.period_end).sort();
    let start = ends.length ? addDays(ends[ends.length - 1], 1) : profile.created_at;
    let recorded = null;
    while (diffDays(start, today) >= PERIOD_DAYS) {
      const end = addDays(start, PERIOD_DAYS - 1);
      const result = evaluatePeriod(profile, start, end);
      if (result) {
        db.adjustments.push({ id: nextId(), period_start: start, period_end: end, ...snakeAdj(result) });
        save();
        recorded = { period_start: start, period_end: end, ...result };
      }
      start = addDays(end, 1); // sparse periods can never be evaluated later; move on
    }
    return recorded;
  }
  const snakeAdj = (r) => ({
    adjustment: r.adjustment, observed_tdee: r.observedTdee, expected_tdee: r.expectedTdee,
    avg_intake: r.avgIntake, avg_exercise: r.avgExercise, weight_change_lbs: r.weightChange,
  });

  function evaluatePeriod(profile, start, end) {
    const inRange = (x) => x.date >= start && x.date <= end;
    const byDay = {};
    for (const f of db.foods.filter(inRange)) byDay[f.date] = (byDay[f.date] || 0) + f.calories;
    const foodDays = Object.values(byDay);
    if (foodDays.length < 10) return null;

    const wStart = trendWeightAt(start), wEnd = trendWeightAt(end);
    const weighCount = db.weights.filter(inRange).length;
    if (wStart == null || wEnd == null || weighCount < 4) return null;

    const avgIntake = foodDays.reduce((a, b) => a + b, 0) / foodDays.length;
    const avgExercise = db.exercises.filter(inRange).reduce((s, e) => s + e.calories, 0) / PERIOD_DAYS;
    const weightChange = wEnd - wStart;
    const observedTdee = avgIntake - (weightChange * KCAL_PER_LB) / PERIOD_DAYS - avgExercise;
    const priorOffset = db.adjustments.filter((a) => a.period_end < start).reduce((s, a) => s + a.adjustment, 0);
    const expectedTdee = formulaTdee(profile, (wStart + wEnd) / 2) + priorOffset + manualAdjustment(profile);
    const adjustment = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, observedTdee - expectedTdee));
    return {
      adjustment: Math.round(adjustment),
      observedTdee: Math.round(observedTdee),
      expectedTdee: Math.round(expectedTdee),
      avgIntake: Math.round(avgIntake),
      avgExercise: Math.round(avgExercise),
      weightChange: round1(weightChange),
    };
  }

  // ---------- route handlers (same shapes as the Node server) ----------
  const err = (msg) => { const e = new Error(msg); e.isApi = true; return e; };
  const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];

  function profilePost(b) {
    const heightIn = num(b.height_ft) * 12 + num(b.height_in);
    if (!['male', 'female'].includes(b.sex) || !(num(b.age) >= 13 && num(b.age) <= 100) ||
        !(heightIn >= 36 && heightIn <= 96) || !(num(b.weight_lbs) >= 50 && num(b.weight_lbs) <= 800) ||
        !(b.activity in ACTIVITY)) throw err('Invalid profile fields.');
    const deficit = Math.max(0, Math.min(1500, Math.round(num(b.deficit)) || 500));
    const goal = num(b.goal_weight_lbs) > 0 ? num(b.goal_weight_lbs) : null;
    const tgt = (v) => (num(v) > 0 && num(v) <= 1000 ? Math.round(num(v)) : null);
    const cadj = num(b.calorie_adjustment) >= -1000 && num(b.calorie_adjustment) <= 1000
      ? Math.round(num(b.calorie_adjustment)) : 0;
    const existing = db.profile;
    const createdAt = existing ? existing.created_at : (isValidDate(b.today) ? b.today : localToday());
    db.profile = {
      id: 1, sex: b.sex, age: Math.round(num(b.age)), height_in: heightIn, weight_lbs: num(b.weight_lbs),
      activity: b.activity, deficit, goal_weight_lbs: goal, created_at: createdAt,
      protein_target: tgt(b.protein_target), carbs_target: tgt(b.carbs_target), fat_target: tgt(b.fat_target),
      calorie_adjustment: cadj,
    };
    if (!existing) db.weights.push({ date: createdAt, weight_lbs: num(b.weight_lbs) });
    save();
    return { profile: db.profile };
  }

  function dayGet(date) {
    const profile = db.profile;
    if (!profile) throw err('Profile not set up yet.');
    if (!isValidDate(date)) date = localToday();
    const correction = runAdaptiveCheck(date);
    const foods = db.foods.filter((f) => f.date === date);
    const exercises = db.exercises.filter((e) => e.date === date);
    const exerciseCals = exercises.reduce((s, e) => s + e.calories, 0);
    const formula = formulaTdee(profile, currentWeight() || profile.weight_lbs);
    const offset = adjustmentOffset();
    const manual = manualAdjustment(profile);
    const budget = formula + offset + manual - profile.deficit + exerciseCals;
    const totals = foods.reduce((t, f) => ({
      calories: t.calories + f.calories, protein: t.protein + f.protein,
      carbs: t.carbs + f.carbs, fat: t.fat + f.fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    return {
      date,
      budget: {
        formulaTdee: Math.round(formula), adjustmentOffset: Math.round(offset),
        manualAdjustment: Math.round(manual),
        effectiveTdee: Math.round(formula + offset + manual), deficit: profile.deficit,
        exerciseCals: Math.round(exerciseCals), budget: Math.round(budget),
        remaining: Math.round(budget - totals.calories),
      },
      totals: {
        calories: Math.round(totals.calories), protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs), fat: Math.round(totals.fat),
      },
      targets: {
        protein: profile.protein_target || null,
        carbs: profile.carbs_target || null,
        fat: profile.fat_target || null,
      },
      meals: Object.fromEntries(MEALS.map((m) => [m, foods.filter((f) => f.meal === m)])),
      exercises,
      canCopyYesterday: db.foods.some((f) => f.date === addDays(date, -1)),
      tdeeCorrection: correction,
    };
  }

  function chartGet() {
    const profile = db.profile;
    if (!profile) throw err('Profile not set up yet.');
    const weights = sortedWeights();
    const rolling = weights.map((w) => ({ date: w.date, weight_lbs: round1(trendWeightAt(w.date)) }));
    const goal = profile.goal_weight_lbs;
    const projections = { planned: null, actual: null };

    if (weights.length) {
      const last = rolling[rolling.length - 1];
      if (goal != null && profile.deficit > 0 && goal < last.weight_lbs) {
        const slope = -profile.deficit / KCAL_PER_LB;
        const days = Math.ceil((goal - last.weight_lbs) / slope);
        const capped = Math.min(days, 365);
        projections.planned = {
          from: last,
          to: { date: addDays(last.date, capped), weight_lbs: round1(last.weight_lbs + slope * capped) },
          projectedDate: days <= 365 ? addDays(last.date, days) : null,
          ratePerWeek: Math.round(slope * 7 * 100) / 100,
        };
      }
      const cutoff = addDays(last.date, -30);
      const recent = weights.filter((w) => w.date >= cutoff);
      const span = recent.length >= 2 ? diffDays(recent[0].date, recent[recent.length - 1].date) : 0;
      const totalSpan = weights.length >= 2 ? diffDays(weights[0].date, weights[weights.length - 1].date) : 0;
      if (totalSpan >= 14 && recent.length >= 4 && span >= 10) {
        const xs = recent.map((w) => diffDays(recent[0].date, w.date));
        const ys = recent.map((w) => w.weight_lbs);
        const n = xs.length;
        const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
        const denom = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
        const slope = denom ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / denom : 0;
        let days = 90, projectedDate = null;
        if (goal != null && slope !== 0 && Math.sign(goal - last.weight_lbs) === Math.sign(slope)) {
          const d = Math.ceil((goal - last.weight_lbs) / slope);
          if (d > 0 && d <= 365) { days = d; projectedDate = addDays(last.date, d); }
          else if (d > 365) days = 365;
        }
        projections.actual = {
          from: last,
          to: { date: addDays(last.date, days), weight_lbs: round1(last.weight_lbs + slope * days) },
          projectedDate,
          ratePerWeek: Math.round(slope * 7 * 100) / 100,
        };
      }
    }
    return { weights, rolling, projections, goalWeight: goal };
  }

  function summaryGet(start) {
    const profile = db.profile;
    if (!profile) throw err('Profile not set up yet.');
    if (!isValidDate(start)) throw err('start date required');
    const end = addDays(start, 6);
    const byDay = {};
    for (const f of db.foods) {
      if (f.date < start || f.date > end) continue;
      byDay[f.date] = byDay[f.date] || { calories: 0, protein: 0 };
      byDay[f.date].calories += f.calories;
      byDay[f.date].protein += f.protein;
    }
    const exByDay = {};
    for (const e of db.exercises) {
      if (e.date < start || e.date > end) continue;
      exByDay[e.date] = (exByDay[e.date] || 0) + e.calories;
    }
    const eff = effectiveTdee(profile);
    const days = Object.keys(byDay).sort().map((date) => ({
      date,
      calories: Math.round(byDay[date].calories),
      protein: Math.round(byDay[date].protein),
      exercise: Math.round(exByDay[date] || 0),
      actualDeficit: Math.round(eff + (exByDay[date] || 0) - byDay[date].calories),
    }));
    const n = days.length;
    return {
      start, end, daysLogged: n,
      avgCalories: n ? Math.round(days.reduce((s, d) => s + d.calories, 0) / n) : null,
      avgProtein: n ? Math.round(days.reduce((s, d) => s + d.protein, 0) / n) : null,
      proteinTarget: profile.protein_target || null,
      plannedDeficit: profile.deficit,
      actualDeficit: n ? Math.round(days.reduce((s, d) => s + d.actualDeficit, 0) / n) : null,
      days,
    };
  }

  function historyGet() {
    const profile = db.profile;
    const byDay = {};
    for (const f of db.foods) {
      byDay[f.date] = byDay[f.date] || { calories: 0, protein: 0, entries: 0 };
      byDay[f.date].calories += f.calories;
      byDay[f.date].protein += f.protein;
      byDay[f.date].entries++;
    }
    const exByDay = {};
    for (const e of db.exercises) exByDay[e.date] = (exByDay[e.date] || 0) + e.calories;
    const eff = profile ? effectiveTdee(profile) : null;
    return {
      days: Object.keys(byDay).sort().reverse().slice(0, 120).map((date) => ({
        date,
        calories: Math.round(byDay[date].calories),
        protein: Math.round(byDay[date].protein),
        entries: byDay[date].entries,
        budget: profile ? Math.round(eff - profile.deficit + (exByDay[date] || 0)) : null,
      })),
    };
  }

  function tdeeGet() {
    const profile = db.profile;
    if (!profile) throw err('Profile not set up yet.');
    const w = currentWeight() || profile.weight_lbs;
    return {
      currentWeight: round1(w),
      formulaTdee: Math.round(formulaTdee(profile, w)),
      adjustmentOffset: Math.round(adjustmentOffset()),
      manualAdjustment: Math.round(manualAdjustment(profile)),
      effectiveTdee: Math.round(effectiveTdee(profile)),
      adjustments: [...db.adjustments].sort((a, b) => a.period_end < b.period_end ? 1 : -1),
    };
  }

  function quickGet() {
    const seen = new Set(), recents = [];
    for (const f of [...db.foods].sort((a, b) => b.id - a.id)) {
      const k = `${f.name}|${f.calories}|${f.protein}|${f.carbs}|${f.fat}`;
      if (seen.has(k)) continue;
      seen.add(k);
      recents.push({ name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
      if (recents.length >= 20) break;
    }
    return { favorites: [...db.favorites].sort((a, b) => a.name.localeCompare(b.name)), recents };
  }

  // ---------- AI (direct browser calls to the Anthropic API) ----------
  const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-opus-4-8';

  const FOOD_SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short food name including portion, e.g. "Ribeye steak (12 oz)"' },
            calories: { type: 'number' },
            protein: { type: 'number', description: 'grams' },
            carbs: { type: 'number', description: 'grams' },
            fat: { type: 'number', description: 'grams' },
          },
          required: ['name', 'calories', 'protein', 'carbs', 'fat'],
          additionalProperties: false,
        },
      },
      notes: { type: 'string', description: 'One short sentence on assumptions made (portion size, preparation).' },
    },
    required: ['items', 'notes'],
    additionalProperties: false,
  };
  const EXERCISE_SCHEMA = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short activity name including duration, e.g. "Running, 30 min"' },
      calories_burned: { type: 'number' },
      notes: { type: 'string', description: 'One short sentence on assumptions (intensity, duration).' },
    },
    required: ['name', 'calories_burned', 'notes'],
    additionalProperties: false,
  };

  async function anthropic(payload) {
    const key = getApiKey();
    if (!key) throw err('Add your Anthropic API key in Settings to enable AI estimation.');
    let res;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw err('Could not reach the AI service — check your connection.');
    }
    if (res.status === 401) throw err('Your API key was rejected — check it in Settings.');
    if (res.status === 429) throw err('AI is rate-limited right now — try again in a minute.');
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw err(detail?.error?.message || `AI request failed (${res.status}).`);
    }
    const data = await res.json();
    if (data.stop_reason === 'refusal') throw err('The model declined this request.');
    const block = (data.content || []).find((b) => b.type === 'text');
    if (!block) throw err('Empty model response.');
    try { return JSON.parse(block.text); }
    catch { throw err('AI returned an unreadable response — try again.'); }
  }

  function estimateFood({ description, image }) {
    if (!description && !image) throw err('Provide a description or a photo.');
    const content = [];
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
    content.push({
      type: 'text',
      text: image
        ? `Estimate the nutrition of the meal in this photo${description ? ` (context: ${description})` : ''}. Break it into distinct food items with realistic portion sizes.`
        : `Estimate the nutrition for: ${description}`,
    });
    return anthropic({
      model: MODEL, max_tokens: 4096, thinking: { type: 'adaptive' },
      system:
        'You are a nutrition estimator for a personal calorie tracker. Give your single best ' +
        'estimate of calories and macros (grams of protein, carbs, fat) using standard USDA-style ' +
        'nutrition data. When portion size is ambiguous, assume a typical serving and say so in ' +
        'notes. Never return zero for everything; always commit to a realistic estimate.',
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema: FOOD_SCHEMA } },
    });
  }

  function estimateExercise({ description }) {
    if (!description) throw err('Describe the exercise.');
    const weightLbs = currentWeight();
    if (!weightLbs) throw err('Set up your profile first.');
    return anthropic({
      model: MODEL, max_tokens: 2048, thinking: { type: 'adaptive' },
      system:
        'You estimate calories burned from exercise for a calorie tracker. Use MET values and the ' +
        "user's body weight. Estimate NET calories burned (above resting) for the described " +
        'activity and duration. If duration is missing, assume 30 minutes and say so in notes.',
      messages: [{ role: 'user', content: `Body weight: ${Math.round(weightLbs)} lbs.\nActivity: ${description}` }],
      output_config: { format: { type: 'json_schema', schema: EXERCISE_SCHEMA } },
    });
  }

  // ---------- export / import ----------
  function exportData() {
    return JSON.stringify({ ...db, exported_at: new Date().toISOString() }, null, 2);
  }
  function importData(json) {
    const data = JSON.parse(json);
    for (const k of ['foods', 'favorites', 'exercises', 'weights', 'adjustments']) {
      if (!Array.isArray(data[k])) throw err('Not a valid backup file.');
    }
    if (!data.profile || !data.profile.created_at) throw err('Not a valid backup file.');
    Object.assign(db, {
      profile: data.profile, foods: data.foods, favorites: data.favorites,
      exercises: data.exercises, weights: data.weights, adjustments: data.adjustments,
      nextId: data.nextId || 1,
    });
    save();
  }

  // ---------- the api() shim ----------
  window.api = async function api(path, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const [p, qs] = path.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    const b = opts.body || {};
    try {
      if (p === '/api/profile' && method === 'GET') return { profile: db.profile };
      if (p === '/api/profile' && method === 'POST') return profilePost(b);
      if (p === '/api/day') return dayGet(q.date);
      if (p === '/api/foods' && method === 'POST') {
        if (!isValidDate(b.date) || !MEALS.includes(b.meal) || !b.name || !(num(b.calories) >= 0)) throw err('Invalid food entry.');
        const id = nextId();
        db.foods.push({ id, date: b.date, meal: b.meal, name: String(b.name).slice(0, 200),
          calories: num(b.calories), protein: num(b.protein) || 0, carbs: num(b.carbs) || 0, fat: num(b.fat) || 0 });
        save();
        return { id };
      }
      let m;
      if ((m = p.match(/^\/api\/foods\/(\d+)$/)) && method === 'DELETE') {
        db.foods = db.foods.filter((f) => f.id !== Number(m[1])); save(); return { ok: true };
      }
      if (p === '/api/foods/copy-yesterday' && method === 'POST') {
        if (!isValidDate(b.date)) throw err('Invalid date.');
        const rows = db.foods.filter((f) => f.date === addDays(b.date, -1));
        for (const f of rows) db.foods.push({ ...f, id: nextId(), date: b.date });
        save();
        return { copied: rows.length };
      }
      if (p === '/api/quick') return quickGet();
      if (p === '/api/favorites' && method === 'POST') {
        if (!b.name || !(num(b.calories) >= 0)) throw err('Invalid favorite.');
        const name = String(b.name).slice(0, 200);
        const entry = { name, calories: num(b.calories), protein: num(b.protein) || 0, carbs: num(b.carbs) || 0, fat: num(b.fat) || 0 };
        const existing = db.favorites.find((f) => f.name === name);
        if (existing) Object.assign(existing, entry); else db.favorites.push({ id: nextId(), ...entry });
        save();
        return { ok: true };
      }
      if ((m = p.match(/^\/api\/favorites\/(\d+)$/)) && method === 'DELETE') {
        db.favorites = db.favorites.filter((f) => f.id !== Number(m[1])); save(); return { ok: true };
      }
      if (p === '/api/exercises' && method === 'POST') {
        if (!isValidDate(b.date) || !b.name || !(num(b.calories) > 0)) throw err('Invalid exercise entry.');
        const id = nextId();
        db.exercises.push({ id, date: b.date, name: String(b.name).slice(0, 200), calories: num(b.calories) });
        save();
        return { id };
      }
      if ((m = p.match(/^\/api\/exercises\/(\d+)$/)) && method === 'DELETE') {
        db.exercises = db.exercises.filter((e) => e.id !== Number(m[1])); save(); return { ok: true };
      }
      if (p === '/api/weights' && method === 'POST') {
        if (!isValidDate(b.date) || !(num(b.weight_lbs) >= 50 && num(b.weight_lbs) <= 800)) throw err('Invalid weigh-in.');
        db.weights = db.weights.filter((w) => w.date !== b.date);
        db.weights.push({ date: b.date, weight_lbs: num(b.weight_lbs) });
        save();
        return { ok: true };
      }
      if ((m = p.match(/^\/api\/weights\/([\d-]+)$/)) && method === 'DELETE') {
        db.weights = db.weights.filter((w) => w.date !== m[1]); save(); return { ok: true };
      }
      if (p === '/api/chart') return chartGet();
      if (p === '/api/summary') return summaryGet(q.start);
      if (p === '/api/history') return historyGet();
      if (p === '/api/tdee') return tdeeGet();
      if (p === '/api/estimate/food' && method === 'POST') return await estimateFood(b);
      if (p === '/api/estimate/exercise' && method === 'POST') return await estimateExercise(b);
      throw err(`Unknown route: ${method} ${p}`);
    } catch (e) {
      if (e.isApi) throw e;
      console.error(e);
      throw new Error(e.message || 'Something went wrong.');
    }
  };

  window.store = { getApiKey, setApiKey, exportData, importData };
})();
