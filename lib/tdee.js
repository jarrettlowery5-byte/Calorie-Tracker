const db = require('../db');
const { addDays, diffDays } = require('./dates');

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

const PERIOD_DAYS = 14;          // adaptive check window
const MAX_ADJUSTMENT = 300;      // kcal/day cap per period, keeps noise from whipsawing the estimate
const KCAL_PER_LB = 3500;

function getProfile() {
  return db.prepare('SELECT * FROM profile WHERE id = 1').get() || null;
}

function currentWeight() {
  const w = db.prepare('SELECT weight_lbs FROM weights ORDER BY date DESC LIMIT 1').get();
  const p = getProfile();
  return w ? w.weight_lbs : (p ? p.weight_lbs : null);
}

// Mifflin-St Jeor. Weight in lbs, height in total inches.
function bmr(profile, weightLbs) {
  const kg = weightLbs * 0.45359237;
  const cm = profile.height_in * 2.54;
  const base = 10 * kg + 6.25 * cm - 5 * profile.age;
  return profile.sex === 'male' ? base + 5 : base - 161;
}

function formulaTdee(profile, weightLbs) {
  return bmr(profile, weightLbs) * (ACTIVITY_MULTIPLIERS[profile.activity] || 1.2);
}

function adjustmentOffset() {
  const row = db.prepare('SELECT COALESCE(SUM(adjustment), 0) AS total FROM tdee_adjustments').get();
  return row.total;
}

function manualAdjustment(profile) {
  return profile.calorie_adjustment || 0;
}

// Effective TDEE = Mifflin-St Jeor at current weight + cumulative adaptive offset
// + any manual adjustment (e.g. breastfeeding).
function effectiveTdee(profile) {
  const w = currentWeight() || profile.weight_lbs;
  return formulaTdee(profile, w) + adjustmentOffset() + manualAdjustment(profile);
}

// Trend weight (7-day rolling average of raw weigh-ins) at a given date, using
// entries within the 7 days ending on `date`. Falls back to nearest raw entry.
function trendWeightAt(date) {
  const rows = db.prepare(
    'SELECT weight_lbs FROM weights WHERE date > ? AND date <= ? ORDER BY date'
  ).all(addDays(date, -7), date);
  if (rows.length) return rows.reduce((s, r) => s + r.weight_lbs, 0) / rows.length;
  const nearest = db.prepare(
    'SELECT weight_lbs FROM weights ORDER BY ABS(julianday(date) - julianday(?)) LIMIT 1'
  ).get(date);
  return nearest ? nearest.weight_lbs : null;
}

// Runs the every-2-weeks adaptive check. Called lazily; idempotent per period.
// Returns the adjustment row if a NEW adjustment was recorded, else null.
function runAdaptiveCheck(today) {
  const profile = getProfile();
  if (!profile) return null;

  const last = db.prepare('SELECT period_end FROM tdee_adjustments ORDER BY period_end DESC LIMIT 1').get();
  let start = last ? addDays(last.period_end, 1) : profile.created_at;

  let recorded = null;
  // Walk forward through any complete 14-day periods (handles gaps in app usage).
  while (diffDays(start, today) >= PERIOD_DAYS) {
    const end = addDays(start, PERIOD_DAYS - 1);
    const result = evaluatePeriod(profile, start, end);
    if (result) {
      db.prepare(`
        INSERT INTO tdee_adjustments
          (period_start, period_end, adjustment, observed_tdee, expected_tdee,
           avg_intake, avg_exercise, weight_change_lbs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(start, end, result.adjustment, result.observedTdee, result.expectedTdee,
             result.avgIntake, result.avgExercise, result.weightChange);
      recorded = { period_start: start, period_end: end, ...result };
    }
    // Move to the next period whether or not this one had enough data —
    // a sparse period can never be evaluated later, so don't get stuck on it.
    start = addDays(end, 1);
  }
  return recorded;
}

// Energy balance over [start, end]: observed TDEE = avg intake + avg exercise
// - (weight change * 3500 / days). Requires enough logging to be meaningful.
function evaluatePeriod(profile, start, end) {
  const days = PERIOD_DAYS;

  const foodDays = db.prepare(
    'SELECT date, SUM(calories) AS cals FROM foods WHERE date >= ? AND date <= ? GROUP BY date'
  ).all(start, end);
  if (foodDays.length < 10) return null; // need most days logged

  const wStart = trendWeightAt(start);
  const wEnd = trendWeightAt(end);
  const weighCount = db.prepare(
    'SELECT COUNT(*) AS n FROM weights WHERE date >= ? AND date <= ?'
  ).get(start, end).n;
  if (wStart == null || wEnd == null || weighCount < 4) return null;

  const avgIntake = foodDays.reduce((s, r) => s + r.cals, 0) / foodDays.length;
  const exTotal = db.prepare(
    'SELECT COALESCE(SUM(calories), 0) AS c FROM exercises WHERE date >= ? AND date <= ?'
  ).get(start, end).c;
  const avgExercise = exTotal / days;

  const weightChange = wEnd - wStart;
  // total out = intake - stored energy; baseline TDEE = out - exercise
  const observedTdee = avgIntake - (weightChange * KCAL_PER_LB) / days - avgExercise;

  // Expected = what the formula (plus prior adjustments) predicted during that period.
  const midWeight = (wStart + wEnd) / 2;
  const priorOffset = db.prepare(
    'SELECT COALESCE(SUM(adjustment), 0) AS total FROM tdee_adjustments WHERE period_end < ?'
  ).get(start).total;
  const expectedTdee = formulaTdee(profile, midWeight) + priorOffset + manualAdjustment(profile);

  let adjustment = observedTdee - expectedTdee;
  adjustment = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, adjustment));

  return {
    adjustment: Math.round(adjustment),
    observedTdee: Math.round(observedTdee),
    expectedTdee: Math.round(expectedTdee),
    avgIntake: Math.round(avgIntake),
    avgExercise: Math.round(avgExercise),
    weightChange: Math.round(weightChange * 10) / 10,
  };
}

module.exports = {
  ACTIVITY_MULTIPLIERS,
  getProfile,
  currentWeight,
  bmr,
  formulaTdee,
  effectiveTdee,
  adjustmentOffset,
  manualAdjustment,
  trendWeightAt,
  runAdaptiveCheck,
};
