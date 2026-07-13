const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sex TEXT NOT NULL CHECK (sex IN ('male','female')),
    age INTEGER NOT NULL,
    height_in REAL NOT NULL,          -- total inches
    weight_lbs REAL NOT NULL,         -- starting weight
    activity TEXT NOT NULL,           -- sedentary|light|moderate|very|extra
    deficit INTEGER NOT NULL DEFAULT 500,
    goal_weight_lbs REAL,
    protein_target REAL,
    carbs_target REAL,
    fat_target REAL,
    calorie_adjustment REAL,          -- manual kcal/day added to TDEE (e.g. breastfeeding)
    created_at TEXT NOT NULL          -- YYYY-MM-DD (local date at setup)
  );

  CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,               -- YYYY-MM-DD
    meal TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','dinner','snacks')),
    name TEXT NOT NULL,
    calories REAL NOT NULL,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_foods_date ON foods(date);

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    calories REAL NOT NULL,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    calories REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_exercises_date ON exercises(date);

  CREATE TABLE IF NOT EXISTS weights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    weight_lbs REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tdee_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,         -- exclusive of dates after; UNIQUE prevents re-running a period
    adjustment REAL NOT NULL,         -- kcal/day correction added to the running offset
    observed_tdee REAL NOT NULL,
    expected_tdee REAL NOT NULL,
    avg_intake REAL NOT NULL,
    avg_exercise REAL NOT NULL,
    weight_change_lbs REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (period_start, period_end)
  );
`);

// Migrations for databases created before these columns existed.
for (const col of ['protein_target', 'carbs_target', 'fat_target', 'calorie_adjustment']) {
  try { db.exec(`ALTER TABLE profile ADD COLUMN ${col} REAL`); } catch {}
}

module.exports = db;
