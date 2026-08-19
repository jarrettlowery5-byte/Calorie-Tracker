import { useMemo, useState } from "react";
import { money, useApp } from "../store";

export default function RecipeCard({ recipe, groceryNames }) {
  const { plan, addToPlan, toggleFavorite, rateRecipe, saveNotes, deleteRecipe } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(recipe.notes);

  const cost = recipe.ingredients.reduce((sum, i) => sum + (i.estCost || 0), 0);
  const inPlan = plan.some((p) => p.recipeId === recipe.id);

  // Anti-waste nudge: how many of this recipe's ingredients are already on
  // the grocery list from other planned meals?
  const reuseCount = useMemo(() => {
    if (!groceryNames?.size || inPlan) return 0;
    const normalize = (n) => n.trim().toLowerCase().replace(/\s+/g, " ");
    return recipe.ingredients.filter((i) => groceryNames.has(normalize(i.name))).length;
  }, [recipe, groceryNames, inPlan]);

  return (
    <article className="card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold leading-snug">{recipe.name}</h3>
            <p className="text-xs text-muted mt-0.5">
              {recipe.cuisine} · {recipe.appliance} · {recipe.cookTimeMin} min
              {recipe.source === "ai" && " · ✨ suggested"}
            </p>
          </div>
          <button
            onClick={() => toggleFavorite(recipe)}
            className={`text-2xl leading-none shrink-0 ${recipe.isFavorite ? "text-tomato" : "text-hairline"}`}
            aria-label={recipe.isFavorite ? "Remove from favorites" : "Save to favorites"}
          >
            ♥
          </button>
        </div>

        <p className="text-sm text-ink/80 mt-2">{recipe.method}</p>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {recipe.tags.map((tag) => (
            <span key={tag} className="text-[11px] font-medium bg-herb-soft text-herb px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <Stat label="est. cost" value={money(cost)} accent />
          <Stat label="serves" value={recipe.servings} />
          <Stat label="cal/serv" value={recipe.caloriesPerServing} />
          <Stat label="protein" value={`${recipe.proteinPerServing}g`} />
        </div>

        {reuseCount > 1 && (
          <p className="mt-3 text-xs bg-honey/10 text-ink border border-honey/40 rounded-lg px-2.5 py-1.5">
            ♻️ Reuses <strong>{reuseCount} ingredients</strong> already on your list — less waste, lower cost.
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <button
            className={inPlan ? "btn bg-herb-soft text-herb flex-1" : "btn-primary flex-1"}
            onClick={() => addToPlan(recipe.id)}
          >
            {inPlan ? "✓ In plan — add again" : "+ Add to week"}
          </button>
          <button className="btn-ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Less" : "Details"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-hairline bg-paper/60 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold mb-1.5">Ingredients <span className="text-muted font-normal">(prices are estimates)</span></p>
            <ul className="text-sm space-y-1">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="flex justify-between gap-2">
                  <span>{ing.name} <span className="text-muted">· {ing.quantity}</span></span>
                  <span className="text-muted">{money(ing.estCost)}</span>
                </li>
              ))}
            </ul>
          </div>

          {recipe.sides.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-1.5">Recommended sides</p>
              <ul className="space-y-2">
                {recipe.sides.map((side) => (
                  <li key={side.id} className="text-sm bg-white rounded-lg border border-hairline p-2.5">
                    <div className="flex justify-between gap-2 font-medium">
                      <span>{side.name}</span>
                      <span className="text-muted">{money(side.estCost)} · {side.caloriesPerServing} cal</span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">{side.note}</p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mt-1.5">Toggle sides on from the Plan tab once this meal is added.</p>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold mb-1.5">Your rating</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => rateRecipe(recipe.id, star === recipe.rating ? 0 : star)}
                  className={`text-2xl ${star <= recipe.rating ? "text-honey" : "text-hairline"}`}
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-1.5">Notes</p>
            <textarea
              className="w-full rounded-xl border border-hairline bg-white px-3 py-2 text-sm"
              rows={2}
              placeholder='e.g. "kids loved it", "double the sauce"'
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => notesDraft !== recipe.notes && saveNotes(recipe.id, notesDraft)}
            />
          </div>

          {recipe.source !== "seed" && (
            <button
              className="text-xs text-tomato underline"
              onClick={() => window.confirm(`Delete "${recipe.name}"?`) && deleteRecipe(recipe.id)}
            >
              Delete recipe
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-paper rounded-lg py-1.5">
      <p className={`text-sm font-semibold ${accent ? "text-honey" : ""}`}>{value}</p>
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
    </div>
  );
}
