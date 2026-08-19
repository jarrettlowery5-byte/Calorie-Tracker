// Local (GitHub Pages) mode: the entire data layer lives in the browser's
// localStorage instead of the server's SQLite database. The method names and
// return shapes mirror the server API exactly, so the rest of the app doesn't
// know which mode it's running in.
import seedRecipes from "../data/seed-recipes.json";
import { buildGroceryList } from "./grocery";
import { generateRecipesInBrowser, generateStepsInBrowser } from "./generate";

const KEY = "the-weekly-v1";

export const normalizeName = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");

function emptyState() {
  return {
    nextId: 1,
    recipes: [], // hydrated shape, same as server responses
    plan: [], // {id, recipeId, dayOfWeek, servingsOverride, includedSideIds}
    pantry: [], // {id, name, category, have}
    prices: {}, // "name::store" -> price
    itemStores: {}, // normalized name -> store
    checks: [], // normalized names marked acquired
    settings: {
      budget: 120,
      servings: 4,
      defaultStore: "Walmart",
      dietaryExclusions: [],
    },
  };
}

let state = null;

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = { ...emptyState(), ...JSON.parse(raw) };
      return state;
    }
  } catch {
    // corrupted storage — start fresh
  }
  state = emptyState();
  for (const recipe of seedRecipes) {
    insertRecipe(recipe, "seed");
  }
  save();
  return state;
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function nextId() {
  return state.nextId++;
}

function insertRecipe(recipe, source) {
  const hydrated = {
    id: nextId(),
    name: recipe.name,
    cuisine: recipe.cuisine ?? "",
    tags: recipe.tags ?? [],
    servings: recipe.servings ?? 4,
    caloriesPerServing: Math.round(recipe.caloriesPerServing ?? 0),
    proteinPerServing: Math.round(recipe.proteinPerServing ?? 0),
    cookTimeMin: Math.round(recipe.cookTimeMin ?? 0),
    appliance: recipe.appliance ?? "",
    method: recipe.method ?? "",
    source,
    isFavorite: false,
    rating: 0,
    notes: "",
    createdAt: new Date().toISOString(),
    steps: null, // cooking instructions, generated on demand from the Cook tab
    ingredients: (recipe.ingredients ?? []).map((i) => ({
      id: nextId(),
      name: i.name,
      quantity: i.quantity ?? "",
      category: i.category ?? "Other",
      estCost: i.estCost ?? 0,
    })),
    sides: (recipe.sides ?? []).map((s) => ({
      id: nextId(),
      name: s.name,
      note: s.note ?? "",
      estCost: s.estCost ?? 0,
      caloriesPerServing: Math.round(s.caloriesPerServing ?? 0),
      ingredients: (s.ingredients ?? []).map((i) => ({
        id: nextId(),
        name: i.name,
        quantity: i.quantity ?? "",
        category: i.category ?? "Other",
        estCost: i.estCost ?? 0,
      })),
    })),
  };
  state.recipes.push(hydrated);
  return hydrated;
}

function sortedRecipes() {
  return [...state.recipes].sort(
    (a, b) => (b.isFavorite - a.isFavorite) || b.createdAt.localeCompare(a.createdAt)
  );
}

function hydratePlan() {
  return state.plan.map((entry) => ({
    ...entry,
    recipe: state.recipes.find((r) => r.id === entry.recipeId) ?? null,
  }));
}

function grocery() {
  return buildGroceryList(state);
}

export const localApi = {
  async health() {
    return { ok: true, local: true };
  },

  async getSettings() {
    return { ...load().settings };
  },

  async updateSettings(patch) {
    load();
    state.settings = { ...state.settings, ...patch };
    save();
    return { ...state.settings };
  },

  async getRecipes() {
    load();
    return sortedRecipes();
  },

  async patchRecipe(id, { isFavorite, rating, notes }) {
    load();
    const recipe = state.recipes.find((r) => r.id === id);
    if (!recipe) throw new Error("Recipe not found");
    if (isFavorite !== undefined) recipe.isFavorite = !!isFavorite;
    if (rating !== undefined) recipe.rating = Math.max(0, Math.min(5, Math.round(rating)));
    if (notes !== undefined) recipe.notes = String(notes);
    save();
    return { ...recipe };
  },

  async deleteRecipe(id) {
    load();
    state.recipes = state.recipes.filter((r) => r.id !== id);
    state.plan = state.plan.filter((p) => p.recipeId !== id);
    save();
    return { ok: true };
  },

  async generateRecipes(params) {
    load();
    const generated = await generateRecipesInBrowser(params);
    const saved = generated.map((r) => insertRecipe(r, "ai"));
    save();
    return { recipes: saved };
  },

  async generateSteps(recipeId, { servings, includedSideIds = [] }) {
    load();
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (!recipe) throw new Error("Recipe not found");
    recipe.steps = await generateStepsInBrowser({
      recipe,
      servings: servings ?? recipe.servings,
      includedSides: recipe.sides.filter((s) => includedSideIds.includes(s.id)),
    });
    save();
    return { ...recipe };
  },

  async getPlan() {
    load();
    return hydratePlan();
  },

  async addToPlan(recipeId) {
    load();
    const entry = {
      id: nextId(),
      recipeId,
      dayOfWeek: null,
      servingsOverride: null,
      includedSideIds: [],
    };
    state.plan.push(entry);
    save();
    return hydratePlan().find((p) => p.id === entry.id);
  },

  async patchPlanEntry(id, patch) {
    load();
    const entry = state.plan.find((p) => p.id === id);
    if (!entry) throw new Error("Plan entry not found");
    if (patch.dayOfWeek !== undefined) entry.dayOfWeek = patch.dayOfWeek;
    if (patch.servingsOverride !== undefined) entry.servingsOverride = patch.servingsOverride;
    if (patch.includedSideIds !== undefined) entry.includedSideIds = patch.includedSideIds;
    save();
    return hydratePlan().find((p) => p.id === id);
  },

  async removePlanEntry(id) {
    load();
    state.plan = state.plan.filter((p) => p.id !== id);
    save();
    return { ok: true };
  },

  async getPantry() {
    load();
    return [...state.pantry].sort((a, b) => a.name.localeCompare(b.name));
  },

  async addPantryItem({ name, category = "Other", have = true }) {
    load();
    const existing = state.pantry.find((p) => normalizeName(p.name) === normalizeName(name));
    if (existing) {
      existing.have = !!have;
      existing.category = category;
      save();
      return { ...existing };
    }
    const item = { id: nextId(), name: name.trim(), category, have: !!have };
    state.pantry.push(item);
    save();
    return { ...item };
  },

  async patchPantryItem(id, patch) {
    load();
    const item = state.pantry.find((p) => p.id === id);
    if (!item) throw new Error("Pantry item not found");
    if (patch.name !== undefined) item.name = patch.name;
    if (patch.category !== undefined) item.category = patch.category;
    if (patch.have !== undefined) item.have = !!patch.have;
    save();
    return { ...item };
  },

  async deletePantryItem(id) {
    load();
    state.pantry = state.pantry.filter((p) => p.id !== id);
    save();
    return { ok: true };
  },

  async getGroceryList() {
    load();
    return grocery();
  },

  async setItemStore(ingredientName, store) {
    load();
    state.itemStores[normalizeName(ingredientName)] = store;
    save();
    return { ok: true, list: grocery() };
  },

  async setItemChecked(ingredientName, acquired) {
    load();
    const name = normalizeName(ingredientName);
    state.checks = state.checks.filter((n) => n !== name);
    if (acquired) state.checks.push(name);
    save();
    return { ok: true, list: grocery() };
  },

  async savePrice(ingredientName, store, price) {
    load();
    state.prices[`${normalizeName(ingredientName)}::${store}`] = price;
    save();
    return { ok: true, list: grocery() };
  },
};
