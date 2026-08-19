import { useMemo, useState } from "react";
import { MEAL_TYPES, APPLIANCES } from "../api";
import { useApp } from "../store";
import RecipeCard from "./RecipeCard";

export default function RecipesView() {
  const { recipes, settings, grocery, generateRecipes, showToast } = useApp();
  const [mealTypes, setMealTypes] = useState([]);
  const [appliances, setAppliances] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const toggle = (setter) => (value) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const toggleMeal = toggle(setMealTypes);
  const toggleAppliance = toggle(setAppliances);

  // Names already on the grocery list — used for the anti-waste reuse nudge.
  const groceryNames = useMemo(
    () => new Set((grocery?.items ?? []).map((i) => i.name)),
    [grocery]
  );

  const filtered = useMemo(() => {
    let list = recipes;
    if (favoritesOnly) list = list.filter((r) => r.isFavorite);
    if (mealTypes.length) {
      list = list.filter((r) =>
        mealTypes.some((t) => r.tags.some((tag) => tag.toLowerCase() === t.toLowerCase()))
      );
    }
    if (appliances.length) {
      list = list.filter((r) =>
        appliances.some((a) => r.appliance.toLowerCase().includes(a.toLowerCase()))
      );
    }
    return list;
  }, [recipes, mealTypes, appliances, favoritesOnly]);

  const suggest = async () => {
    setGenerating(true);
    setError(null);
    try {
      const created = await generateRecipes({
        mealTypes,
        appliances,
        servings: settings.servings,
        remainingBudget: Math.max(0, grocery?.totals?.remaining ?? settings.budget),
        exclusions: settings.dietaryExclusions,
      });
      showToast(`${created.length} new recipes suggested`);
    } catch (err) {
      setError(err.message || "Couldn't generate right now — try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <p className="text-sm font-semibold mb-2">What sounds good this week?</p>
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPES.map((t) => (
            <button key={t} onClick={() => toggleMeal(t)}
              className={`chip ${mealTypes.includes(t) ? "chip-on" : "chip-off"}`}>
              {t}
            </button>
          ))}
        </div>
        <p className="text-sm font-semibold mt-4 mb-2">Appliances you'll use</p>
        <div className="flex flex-wrap gap-2">
          {APPLIANCES.map((a) => (
            <button key={a} onClick={() => toggleAppliance(a)}
              className={`chip ${appliances.includes(a) ? "chip-on" : "chip-off"}`}>
              {a}
            </button>
          ))}
        </div>
        {settings.dietaryExclusions.length > 0 && (
          <p className="text-xs text-muted mt-3">
            Excluding: {settings.dietaryExclusions.join(", ")} — edit in settings.
          </p>
        )}
        <button className="btn-primary w-full mt-4" onClick={suggest} disabled={generating}>
          {generating ? "Cooking up ideas…" : "✨ Suggest recipes"}
        </button>
        {generating && (
          <p className="text-sm text-muted text-center mt-2 animate-pulse">
            Asking the kitchen for ideas that fit your budget…
          </p>
        )}
        {error && (
          <p className="text-sm text-tomato text-center mt-2">{error}</p>
        )}
      </section>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">
          {filtered.length} recipe{filtered.length === 1 ? "" : "s"}
        </h2>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`chip ${favoritesOnly ? "chip-on" : "chip-off"}`}
        >
          ♥ Favorites
        </button>
      </div>

      <div className="space-y-4">
        {filtered.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} groceryNames={groceryNames} />
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted py-8 text-sm">
            No recipes match these filters yet — try Suggest, or loosen a filter.
          </p>
        )}
      </div>
    </div>
  );
}
