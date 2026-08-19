import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecipe, recipeCount } from "./db.js";

// Seed data is shared with the client's local (GitHub Pages) mode.
const here = path.dirname(fileURLToPath(import.meta.url));
const seedRecipes = JSON.parse(
  fs.readFileSync(path.join(here, "..", "client", "src", "data", "seed-recipes.json"), "utf8")
);

export function seedIfEmpty() {
  if (recipeCount() > 0) return false;
  for (const recipe of seedRecipes) {
    createRecipe(recipe, "seed");
  }
  console.log(`Seeded ${seedRecipes.length} starter recipes.`);
  return true;
}
