import {
  listPlan,
  listPantry,
  getPriceMap,
  getItemStoreMap,
  getCheckedSet,
  getSettings,
  normalizeName,
} from "../db.js";

// Builds the computed grocery list from the weekly plan:
// scale by servings, dedupe by normalized ingredient name, apply saved store
// prices, subtract pantry items, and compute totals (overall + per store).
export function buildGroceryList() {
  const settings = getSettings();
  const plan = listPlan();
  const pantry = listPantry();
  const priceMap = getPriceMap();
  const storeMap = getItemStoreMap();
  const checked = getCheckedSet();

  const pantryOwned = new Set(
    pantry.filter((p) => p.have).map((p) => normalizeName(p.name))
  );

  const items = new Map(); // normalized name -> aggregate
  const pantryExcluded = new Map();

  const addIngredient = (ing, scale, usedByLabel) => {
    const key = normalizeName(ing.name);
    const scaledCost = (ing.estCost || 0) * scale;

    if (pantryOwned.has(key)) {
      const existing = pantryExcluded.get(key) || {
        name: key,
        displayName: ing.name,
        category: ing.category,
        usedBy: [],
        savedCost: 0,
      };
      if (!existing.usedBy.includes(usedByLabel)) existing.usedBy.push(usedByLabel);
      existing.savedCost += scaledCost;
      pantryExcluded.set(key, existing);
      return;
    }

    const existing = items.get(key) || {
      name: key,
      displayName: ing.name,
      category: ing.category || "Other",
      quantities: [],
      usedBy: [],
      estCost: 0,
    };
    const qty = scale === 1 ? ing.quantity : `${ing.quantity} ×${round2(scale)}`;
    if (qty) existing.quantities.push(qty);
    if (!existing.usedBy.includes(usedByLabel)) existing.usedBy.push(usedByLabel);
    existing.estCost += scaledCost;
    items.set(key, existing);
  };

  for (const entry of plan) {
    const recipe = entry.recipe;
    if (!recipe) continue;
    const effectiveServings = entry.servingsOverride ?? settings.servings;
    const scale = recipe.servings > 0 ? effectiveServings / recipe.servings : 1;

    for (const ing of recipe.ingredients) addIngredient(ing, scale, recipe.name);

    for (const side of recipe.sides) {
      if (!entry.includedSideIds.includes(side.id)) continue;
      const label = `${side.name} (${recipe.name})`;
      if (side.ingredients.length > 0) {
        for (const ing of side.ingredients) addIngredient(ing, scale, label);
      } else {
        // Side with no itemized ingredients: carry its cost as one line item.
        addIngredient(
          { name: side.name, quantity: "", category: "Other", estCost: side.estCost },
          scale,
          label
        );
      }
    }
  }

  const list = [...items.values()].map((item) => {
    const store = storeMap.get(item.name) || settings.defaultStore;
    const savedPrice = priceMap.get(`${item.name}::${store}`);
    const cost = savedPrice !== undefined ? savedPrice : round2(item.estCost);
    return {
      ...item,
      estCost: round2(item.estCost),
      store,
      cost: round2(cost),
      priceSource: savedPrice !== undefined ? "saved" : "estimate",
      acquired: checked.has(item.name),
      doubleDuty: item.usedBy.length > 1,
    };
  });

  list.sort((a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName));

  const estimatedTotal = round2(list.reduce((sum, i) => sum + i.cost, 0));
  const stillToBuy = round2(list.filter((i) => !i.acquired).reduce((sum, i) => sum + i.cost, 0));

  const byStore = {};
  for (const item of list) {
    byStore[item.store] ??= { total: 0, stillToBuy: 0, count: 0 };
    byStore[item.store].total = round2(byStore[item.store].total + item.cost);
    if (!item.acquired) byStore[item.store].stillToBuy = round2(byStore[item.store].stillToBuy + item.cost);
    byStore[item.store].count += 1;
  }

  const pantrySavings = round2(
    [...pantryExcluded.values()].reduce((sum, i) => sum + i.savedCost, 0)
  );

  return {
    items: list,
    pantryExcluded: [...pantryExcluded.values()].map((i) => ({ ...i, savedCost: round2(i.savedCost) })),
    totals: {
      estimatedTotal,
      stillToBuy,
      budget: settings.budget,
      remaining: round2(settings.budget - estimatedTotal),
      pantrySavings,
      byStore,
    },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
