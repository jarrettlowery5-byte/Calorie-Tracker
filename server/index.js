import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  listRecipes,
  getRecipe,
  createRecipe,
  updateRecipeMeta,
  deleteRecipe,
  listPlan,
  addPlanEntry,
  updatePlanEntry,
  removePlanEntry,
  listPantry,
  addPantryItem,
  updatePantryItem,
  deletePantryItem,
  listPrices,
  upsertPrice,
  setItemStore,
  setChecked,
  getSettings,
  updateSettings,
} from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { buildGroceryList } from "./lib/grocery.js";
import { generateRecipes } from "./lib/generate.js";

seedIfEmpty();

const app = express();
app.use(express.json({ limit: "1mb" }));

const api = express.Router();

api.get("/health", (req, res) => {
  res.json({ ok: true, hasApiKey: !!process.env.ANTHROPIC_API_KEY });
});

// ---- settings ----
api.get("/settings", (req, res) => res.json(getSettings()));
api.put("/settings", (req, res) => res.json(updateSettings(req.body ?? {})));

// ---- recipes ----
api.get("/recipes", (req, res) => res.json(listRecipes()));

api.post("/recipes", (req, res) => {
  const recipe = req.body;
  if (!recipe?.name) return res.status(400).json({ error: "Recipe needs a name" });
  res.status(201).json(createRecipe(recipe, "user"));
});

api.patch("/recipes/:id", (req, res) => {
  const updated = updateRecipeMeta(Number(req.params.id), req.body ?? {});
  if (!updated) return res.status(404).json({ error: "Recipe not found" });
  res.json(updated);
});

api.delete("/recipes/:id", (req, res) => {
  deleteRecipe(Number(req.params.id));
  res.json({ ok: true });
});

// ---- AI generation ----
api.post("/recipes/generate", async (req, res) => {
  const { mealTypes = [], appliances = [], servings, remainingBudget, exclusions = [] } =
    req.body ?? {};
  try {
    const generated = await generateRecipes({
      mealTypes,
      appliances,
      servings: servings ?? getSettings().servings,
      remainingBudget: remainingBudget ?? getSettings().budget,
      exclusions,
    });
    const saved = generated.map((r) => createRecipe(r, "ai"));
    res.json({ recipes: saved });
  } catch (err) {
    console.error("Recipe generation failed:", err.message);
    res
      .status(err.status ?? 502)
      .json({ error: "Couldn't generate right now — try again.", detail: err.message });
  }
});

// ---- plan ----
api.get("/plan", (req, res) => res.json(listPlan()));

api.post("/plan", (req, res) => {
  const { recipeId } = req.body ?? {};
  if (!getRecipe(Number(recipeId))) return res.status(404).json({ error: "Recipe not found" });
  res.status(201).json(addPlanEntry(Number(recipeId)));
});

api.patch("/plan/:id", (req, res) => {
  const updated = updatePlanEntry(Number(req.params.id), req.body ?? {});
  if (!updated) return res.status(404).json({ error: "Plan entry not found" });
  res.json(updated);
});

api.delete("/plan/:id", (req, res) => {
  removePlanEntry(Number(req.params.id));
  res.json({ ok: true });
});

// ---- pantry ----
api.get("/pantry", (req, res) => res.json(listPantry()));

api.post("/pantry", (req, res) => {
  const { name, category, have } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "Pantry item needs a name" });
  res.status(201).json(addPantryItem({ name, category, have }));
});

api.patch("/pantry/:id", (req, res) => {
  const updated = updatePantryItem(Number(req.params.id), req.body ?? {});
  if (!updated) return res.status(404).json({ error: "Pantry item not found" });
  res.json(updated);
});

api.delete("/pantry/:id", (req, res) => {
  deletePantryItem(Number(req.params.id));
  res.json({ ok: true });
});

// ---- prices ----
api.get("/prices", (req, res) => res.json(listPrices()));

api.put("/prices", (req, res) => {
  const { ingredientName, store, price } = req.body ?? {};
  if (!ingredientName || !store || typeof price !== "number" || price < 0) {
    return res.status(400).json({ error: "ingredientName, store, and a non-negative price are required" });
  }
  upsertPrice({ ingredientName, store, price });
  res.json({ ok: true, list: buildGroceryList() });
});

// ---- grocery list (computed) ----
api.get("/grocery-list", (req, res) => res.json(buildGroceryList()));

api.put("/grocery-list/store", (req, res) => {
  const { ingredientName, store } = req.body ?? {};
  if (!ingredientName || !store) return res.status(400).json({ error: "ingredientName and store required" });
  setItemStore(ingredientName, store);
  res.json({ ok: true, list: buildGroceryList() });
});

api.put("/grocery-list/check", (req, res) => {
  const { ingredientName, acquired } = req.body ?? {};
  if (!ingredientName) return res.status(400).json({ error: "ingredientName required" });
  setChecked(ingredientName, !!acquired);
  res.json({ ok: true, list: buildGroceryList() });
});

app.use("/api", api);

// Serve the built frontend in production (client/dist), if present.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`The Weekly backend listening on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠ ANTHROPIC_API_KEY not set — AI recipe generation is disabled until you add it to .env");
  }
});
