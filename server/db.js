import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "weekly.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Single-household v1. Every table that will need per-household scoping later
// gets its rows through the data-access helpers below, so adding a
// household_id column + auth is an additive migration, not a rewrite.
db.exec(`
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cuisine TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  servings INTEGER DEFAULT 4,
  cal_per_serving INTEGER DEFAULT 0,
  protein_per_serving INTEGER DEFAULT 0,
  cook_time_min INTEGER DEFAULT 0,
  appliance TEXT DEFAULT '',
  method TEXT DEFAULT '',
  source TEXT DEFAULT 'user' CHECK (source IN ('seed','ai','user')),
  is_favorite INTEGER DEFAULT 0,
  rating INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',
  est_cost REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  note TEXT DEFAULT '',
  est_cost REAL DEFAULT 0,
  cal_per_serving INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS side_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  side_id INTEGER NOT NULL REFERENCES sides(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',
  est_cost REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  day_of_week TEXT DEFAULT NULL,
  servings_override INTEGER DEFAULT NULL,
  included_side_ids TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS pantry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  have INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_name TEXT NOT NULL,
  store TEXT NOT NULL,
  price REAL NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (ingredient_name, store)
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  budget REAL DEFAULT 120,
  servings INTEGER DEFAULT 4,
  default_store TEXT DEFAULT 'Walmart',
  dietary_exclusions TEXT DEFAULT '[]'
);

-- Which store each grocery item is assigned to (keyed by normalized name).
CREATE TABLE IF NOT EXISTS item_stores (
  ingredient_name TEXT PRIMARY KEY,
  store TEXT NOT NULL
);

-- Grocery items checked off as acquired (keyed by normalized name).
CREATE TABLE IF NOT EXISTS grocery_checks (
  ingredient_name TEXT PRIMARY KEY
);
`);

db.prepare(
  "INSERT OR IGNORE INTO settings (id, budget, servings, default_store, dietary_exclusions) VALUES (1, 120, 4, 'Walmart', '[]')"
).run();

// Cooking instructions are generated on demand and cached on the recipe.
// Added after the first release, so existing databases get the column here.
const recipeColumns = db.prepare("PRAGMA table_info(recipes)").all().map((c) => c.name);
if (!recipeColumns.includes("steps")) {
  db.exec("ALTER TABLE recipes ADD COLUMN steps TEXT");
}

export const normalizeName = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");

// ---- recipes ----

const recipeRow = db.prepare("SELECT * FROM recipes WHERE id = ?");
const ingredientRows = db.prepare("SELECT * FROM ingredients WHERE recipe_id = ?");
const sideRows = db.prepare("SELECT * FROM sides WHERE recipe_id = ?");
const sideIngredientRows = db.prepare("SELECT * FROM side_ingredients WHERE side_id = ?");

function hydrateRecipe(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    tags: JSON.parse(row.tags || "[]"),
    servings: row.servings,
    caloriesPerServing: row.cal_per_serving,
    proteinPerServing: row.protein_per_serving,
    cookTimeMin: row.cook_time_min,
    appliance: row.appliance,
    method: row.method,
    source: row.source,
    isFavorite: !!row.is_favorite,
    rating: row.rating,
    notes: row.notes,
    createdAt: row.created_at,
    steps: row.steps ? JSON.parse(row.steps) : null,
    ingredients: ingredientRows.all(row.id).map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      category: i.category,
      estCost: i.est_cost,
    })),
    sides: sideRows.all(row.id).map((s) => ({
      id: s.id,
      name: s.name,
      note: s.note,
      estCost: s.est_cost,
      caloriesPerServing: s.cal_per_serving,
      ingredients: sideIngredientRows.all(s.id).map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        category: i.category,
        estCost: i.est_cost,
      })),
    })),
  };
}

export function getRecipe(id) {
  return hydrateRecipe(recipeRow.get(id));
}

export function listRecipes() {
  return db
    .prepare("SELECT * FROM recipes ORDER BY is_favorite DESC, created_at DESC")
    .all()
    .map(hydrateRecipe);
}

const insertRecipe = db.prepare(`
  INSERT INTO recipes (name, cuisine, tags, servings, cal_per_serving, protein_per_serving,
    cook_time_min, appliance, method, source)
  VALUES (@name, @cuisine, @tags, @servings, @cal, @protein, @cookTime, @appliance, @method, @source)
`);
const insertIngredient = db.prepare(
  "INSERT INTO ingredients (recipe_id, name, quantity, category, est_cost) VALUES (?, ?, ?, ?, ?)"
);
const insertSide = db.prepare(
  "INSERT INTO sides (recipe_id, name, note, est_cost, cal_per_serving) VALUES (?, ?, ?, ?, ?)"
);
const insertSideIngredient = db.prepare(
  "INSERT INTO side_ingredients (side_id, name, quantity, category, est_cost) VALUES (?, ?, ?, ?, ?)"
);

export const createRecipe = db.transaction((recipe, source = "user") => {
  const info = insertRecipe.run({
    name: recipe.name,
    cuisine: recipe.cuisine ?? "",
    tags: JSON.stringify(recipe.tags ?? []),
    servings: recipe.servings ?? 4,
    cal: Math.round(recipe.caloriesPerServing ?? 0),
    protein: Math.round(recipe.proteinPerServing ?? 0),
    cookTime: Math.round(recipe.cookTimeMin ?? 0),
    appliance: recipe.appliance ?? "",
    method: recipe.method ?? "",
    source,
  });
  const recipeId = info.lastInsertRowid;
  for (const ing of recipe.ingredients ?? []) {
    insertIngredient.run(recipeId, ing.name, ing.quantity ?? "", ing.category ?? "Other", ing.estCost ?? 0);
  }
  for (const side of recipe.sides ?? []) {
    const sideInfo = insertSide.run(
      recipeId,
      side.name,
      side.note ?? "",
      side.estCost ?? 0,
      Math.round(side.caloriesPerServing ?? 0)
    );
    for (const ing of side.ingredients ?? []) {
      insertSideIngredient.run(sideInfo.lastInsertRowid, ing.name, ing.quantity ?? "", ing.category ?? "Other", ing.estCost ?? 0);
    }
  }
  return getRecipe(recipeId);
});

export function updateRecipeMeta(id, { isFavorite, rating, notes }) {
  const sets = [];
  const params = { id };
  if (isFavorite !== undefined) {
    sets.push("is_favorite = @fav");
    params.fav = isFavorite ? 1 : 0;
  }
  if (rating !== undefined) {
    sets.push("rating = @rating");
    params.rating = Math.max(0, Math.min(5, Math.round(rating)));
  }
  if (notes !== undefined) {
    sets.push("notes = @notes");
    params.notes = String(notes);
  }
  if (sets.length) {
    db.prepare(`UPDATE recipes SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }
  return getRecipe(id);
}

export function saveRecipeSteps(id, steps) {
  db.prepare("UPDATE recipes SET steps = ? WHERE id = ?").run(JSON.stringify(steps), id);
  return getRecipe(id);
}

export function deleteRecipe(id) {
  db.prepare("DELETE FROM plan WHERE recipe_id = ?").run(id);
  db.prepare("DELETE FROM recipes WHERE id = ?").run(id);
}

// ---- plan ----

export function listPlan() {
  return db
    .prepare("SELECT * FROM plan ORDER BY id")
    .all()
    .map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      dayOfWeek: row.day_of_week,
      servingsOverride: row.servings_override,
      includedSideIds: JSON.parse(row.included_side_ids || "[]"),
      recipe: getRecipe(row.recipe_id),
    }));
}

export function addPlanEntry(recipeId) {
  const info = db.prepare("INSERT INTO plan (recipe_id) VALUES (?)").run(recipeId);
  return listPlan().find((p) => p.id === info.lastInsertRowid);
}

export function updatePlanEntry(id, { dayOfWeek, servingsOverride, includedSideIds }) {
  const row = db.prepare("SELECT * FROM plan WHERE id = ?").get(id);
  if (!row) return null;
  db.prepare(
    "UPDATE plan SET day_of_week = ?, servings_override = ?, included_side_ids = ? WHERE id = ?"
  ).run(
    dayOfWeek === undefined ? row.day_of_week : dayOfWeek,
    servingsOverride === undefined ? row.servings_override : servingsOverride,
    includedSideIds === undefined ? row.included_side_ids : JSON.stringify(includedSideIds),
    id
  );
  return listPlan().find((p) => p.id === id);
}

export function removePlanEntry(id) {
  db.prepare("DELETE FROM plan WHERE id = ?").run(id);
}

// ---- pantry ----

export function listPantry() {
  return db.prepare("SELECT * FROM pantry ORDER BY name").all().map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    have: !!p.have,
  }));
}

export function addPantryItem({ name, category = "Other", have = true }) {
  const existing = db
    .prepare("SELECT id FROM pantry WHERE lower(trim(name)) = ?")
    .get(normalizeName(name));
  if (existing) {
    db.prepare("UPDATE pantry SET have = ?, category = ? WHERE id = ?").run(have ? 1 : 0, category, existing.id);
    return listPantry().find((p) => p.id === existing.id);
  }
  const info = db.prepare("INSERT INTO pantry (name, category, have) VALUES (?, ?, ?)").run(name.trim(), category, have ? 1 : 0);
  return listPantry().find((p) => p.id === info.lastInsertRowid);
}

export function updatePantryItem(id, { have, name, category }) {
  const row = db.prepare("SELECT * FROM pantry WHERE id = ?").get(id);
  if (!row) return null;
  db.prepare("UPDATE pantry SET name = ?, category = ?, have = ? WHERE id = ?").run(
    name === undefined ? row.name : name,
    category === undefined ? row.category : category,
    have === undefined ? row.have : have ? 1 : 0,
    id
  );
  return listPantry().find((p) => p.id === id);
}

export function deletePantryItem(id) {
  db.prepare("DELETE FROM pantry WHERE id = ?").run(id);
}

// ---- prices ----

export function listPrices() {
  return db.prepare("SELECT * FROM prices ORDER BY ingredient_name, store").all();
}

export function upsertPrice({ ingredientName, store, price }) {
  db.prepare(`
    INSERT INTO prices (ingredient_name, store, price, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT (ingredient_name, store)
    DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at
  `).run(normalizeName(ingredientName), store, price);
}

export function getPriceMap() {
  const map = new Map();
  for (const row of db.prepare("SELECT * FROM prices").all()) {
    map.set(`${row.ingredient_name}::${row.store}`, row.price);
  }
  return map;
}

// ---- item store assignment / acquired checks ----

export function getItemStoreMap() {
  const map = new Map();
  for (const row of db.prepare("SELECT * FROM item_stores").all()) {
    map.set(row.ingredient_name, row.store);
  }
  return map;
}

export function setItemStore(ingredientName, store) {
  db.prepare(`
    INSERT INTO item_stores (ingredient_name, store) VALUES (?, ?)
    ON CONFLICT (ingredient_name) DO UPDATE SET store = excluded.store
  `).run(normalizeName(ingredientName), store);
}

export function getCheckedSet() {
  return new Set(db.prepare("SELECT ingredient_name FROM grocery_checks").all().map((r) => r.ingredient_name));
}

export function setChecked(ingredientName, acquired) {
  const name = normalizeName(ingredientName);
  if (acquired) {
    db.prepare("INSERT OR IGNORE INTO grocery_checks (ingredient_name) VALUES (?)").run(name);
  } else {
    db.prepare("DELETE FROM grocery_checks WHERE ingredient_name = ?").run(name);
  }
}

// ---- settings ----

export function getSettings() {
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  return {
    budget: row.budget,
    servings: row.servings,
    defaultStore: row.default_store,
    dietaryExclusions: JSON.parse(row.dietary_exclusions || "[]"),
  };
}

export function updateSettings({ budget, servings, defaultStore, dietaryExclusions }) {
  const current = getSettings();
  db.prepare(
    "UPDATE settings SET budget = ?, servings = ?, default_store = ?, dietary_exclusions = ? WHERE id = 1"
  ).run(
    budget === undefined ? current.budget : budget,
    servings === undefined ? current.servings : servings,
    defaultStore === undefined ? current.defaultStore : defaultStore,
    dietaryExclusions === undefined ? JSON.stringify(current.dietaryExclusions) : JSON.stringify(dietaryExclusions)
  );
  return getSettings();
}

export function recipeCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM recipes").get().n;
}

export default db;
