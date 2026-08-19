import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [plan, setPlan] = useState([]);
  const [pantry, setPantry] = useState([]);
  const [grocery, setGrocery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshGrocery = useCallback(async () => {
    setGrocery(await api.getGroceryList());
  }, []);

  const refreshAll = useCallback(async () => {
    const [s, r, p, pa, g] = await Promise.all([
      api.getSettings(),
      api.getRecipes(),
      api.getPlan(),
      api.getPantry(),
      api.getGroceryList(),
    ]);
    setSettings(s);
    setRecipes(r);
    setPlan(p);
    setPantry(pa);
    setGrocery(g);
  }, []);

  useEffect(() => {
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  const actions = useMemo(
    () => ({
      showToast,

      async updateSettings(patch) {
        setSettings(await api.updateSettings(patch));
        await refreshGrocery();
      },

      async generateRecipes(params) {
        const { recipes: created } = await api.generateRecipes(params);
        setRecipes((prev) => [...created, ...prev]);
        return created;
      },

      async toggleFavorite(recipe) {
        const updated = await api.patchRecipe(recipe.id, { isFavorite: !recipe.isFavorite });
        setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      },

      async rateRecipe(id, rating) {
        const updated = await api.patchRecipe(id, { rating });
        setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      },

      async saveNotes(id, notes) {
        const updated = await api.patchRecipe(id, { notes });
        setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      },

      async deleteRecipe(id) {
        await api.deleteRecipe(id);
        setRecipes((prev) => prev.filter((r) => r.id !== id));
        setPlan(await api.getPlan());
        await refreshGrocery();
      },

      async addToPlan(recipeId) {
        await api.addToPlan(recipeId);
        setPlan(await api.getPlan());
        await refreshGrocery();
        showToast("Added to the week");
      },

      async updatePlanEntry(id, patch) {
        const updated = await api.patchPlanEntry(id, patch);
        setPlan((prev) => prev.map((p) => (p.id === id ? updated : p)));
        await refreshGrocery();
      },

      async removePlanEntry(id) {
        await api.removePlanEntry(id);
        setPlan((prev) => prev.filter((p) => p.id !== id));
        await refreshGrocery();
      },

      async addPantryItem(item) {
        await api.addPantryItem(item);
        setPantry(await api.getPantry());
        await refreshGrocery();
      },

      async togglePantryHave(item) {
        await api.patchPantryItem(item.id, { have: !item.have });
        setPantry(await api.getPantry());
        await refreshGrocery();
      },

      async deletePantryItem(id) {
        await api.deletePantryItem(id);
        setPantry(await api.getPantry());
        await refreshGrocery();
      },

      async setItemStore(name, store) {
        const { list } = await api.setItemStore(name, store);
        setGrocery(list);
      },

      async setItemChecked(name, acquired) {
        // Optimistic: flip the checkbox immediately, then sync totals from the server.
        setGrocery((prev) =>
          prev && {
            ...prev,
            items: prev.items.map((i) => (i.name === name ? { ...i, acquired } : i)),
          }
        );
        const { list } = await api.setItemChecked(name, acquired);
        setGrocery(list);
      },

      async savePrice(name, store, price) {
        const { list } = await api.savePrice(name, store, price);
        setGrocery(list);
        showToast("Price saved — future lists will use it");
      },

      // "I already have this": move a grocery item into the pantry as owned.
      async moveToPantry(item) {
        await api.addPantryItem({ name: item.displayName, category: item.category, have: true });
        setPantry(await api.getPantry());
        await refreshGrocery();
        showToast(`${item.displayName} moved to pantry`);
      },
    }),
    [refreshGrocery, showToast]
  );

  const value = useMemo(
    () => ({ settings, recipes, plan, pantry, grocery, loading, toast, ...actions }),
    [settings, recipes, plan, pantry, grocery, loading, toast, actions]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

// ---- shared derived helpers ----

export function planEntryCost(entry, settings) {
  const recipe = entry.recipe;
  if (!recipe) return 0;
  const effective = entry.servingsOverride ?? settings?.servings ?? recipe.servings;
  const scale = recipe.servings > 0 ? effective / recipe.servings : 1;
  const base = recipe.ingredients.reduce((sum, i) => sum + (i.estCost || 0), 0);
  const sidesCost = recipe.sides
    .filter((s) => entry.includedSideIds.includes(s.id))
    .reduce((sum, s) => sum + (s.estCost || 0), 0);
  return (base + sidesCost) * scale;
}

export function planEntryNutrition(entry) {
  const recipe = entry.recipe;
  if (!recipe) return { calories: 0, protein: 0 };
  const sidesCal = recipe.sides
    .filter((s) => entry.includedSideIds.includes(s.id))
    .reduce((sum, s) => sum + (s.caloriesPerServing || 0), 0);
  return {
    calories: (recipe.caloriesPerServing || 0) + sidesCal,
    protein: recipe.proteinPerServing || 0,
  };
}

export function money(n) {
  return `$${(n ?? 0).toFixed(2)}`;
}
