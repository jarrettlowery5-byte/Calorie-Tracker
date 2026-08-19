import { useEffect, useMemo, useRef, useState } from "react";
import { MEAL_TYPES, APPLIANCES, IS_LOCAL } from "../api";
import { getStoredApiKey } from "../local/generate";
import { matchesQuery, SEARCH_SUGGESTIONS } from "../lib/search";
import { useApp } from "../store";
import RecipeCard from "./RecipeCard";
import Icon from "./Icon";

export default function RecipesView() {
  const { recipes, settings, grocery, generateRecipes, showToast, go } = useApp();
  const [query, setQuery] = useState("");
  const [mealTypes, setMealTypes] = useState([]);
  const [appliances, setAppliances] = useState([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Endless feed: reaching the end of the list asks for more suggestions.
  const [feedIds, setFeedIds] = useState([]);
  const [feedState, setFeedState] = useState("idle"); // idle | loading | error
  const [armed, setArmed] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);

  const toggle = (setter) => (value) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  const toggleMeal = toggle(setMealTypes);
  const toggleAppliance = toggle(setAppliances);

  const groceryNames = useMemo(
    () => new Set((grocery?.items ?? []).map((i) => i.name)),
    [grocery]
  );

  const feedIdSet = useMemo(() => new Set(feedIds), [feedIds]);

  const filtered = useMemo(() => {
    let list = recipes.filter((r) => !feedIdSet.has(r.id));
    if (favoritesOnly) list = list.filter((r) => r.isFavorite);
    if (query.trim()) list = list.filter((r) => matchesQuery(r, query));
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
  }, [recipes, query, mealTypes, appliances, favoritesOnly, feedIdSet]);

  const feedRecipes = useMemo(
    () => feedIds.map((id) => recipes.find((r) => r.id === id)).filter(Boolean),
    [feedIds, recipes]
  );

  const keyMissing = IS_LOCAL && !getStoredApiKey();
  const activeFilters = mealTypes.length + appliances.length;

  const ask = async ({ silent } = {}) => {
    if (loadingRef.current || keyMissing) return;
    loadingRef.current = true;
    setFeedState("loading");
    if (!silent) setGenerating(true);
    setError(null);
    try {
      const created = await generateRecipes({
        query: query.trim() || undefined,
        mealTypes,
        appliances,
        servings: settings.servings,
        remainingBudget: Math.max(0, grocery?.totals?.remaining ?? settings.budget),
        exclusions: settings.dietaryExclusions,
      });
      setFeedIds((prev) => [...prev, ...created.map((r) => r.id)]);
      setFeedState("idle");
      if (!silent) showToast(`${created.length} new ideas`);
    } catch (err) {
      setFeedState("error");
      if (!silent) setError(err.message || "Couldn't generate right now — try again.");
    } finally {
      loadingRef.current = false;
      setGenerating(false);
    }
  };

  useEffect(() => {
    const arm = () => setArmed(true);
    window.addEventListener("scroll", arm, { once: true, passive: true });
    return () => window.removeEventListener("scroll", arm);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !armed || favoritesOnly || keyMissing || feedState === "error") return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && ask({ silent: true }),
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Recipes</p>
        <h1 className="page-title mt-1">What sounds good?</h1>
      </header>

      <div>
        <div className="relative">
          <Icon
            name="search"
            className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            className="input pl-11 pr-10"
            type="search"
            placeholder="Search skillet meals, crock pot, quick chicken…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search recipes"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              aria-label="Clear search"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-2.5 overflow-x-auto no-scrollbar pb-0.5">
          {SEARCH_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setQuery(query.toLowerCase() === s.toLowerCase() ? "" : s)}
              className={`chip shrink-0 ${query.toLowerCase() === s.toLowerCase() ? "chip-on" : "chip-off"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className={`chip ${activeFilters ? "chip-on" : "chip-off"}`}
        >
          Filters{activeFilters ? ` · ${activeFilters}` : ""}
        </button>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`chip flex items-center gap-1.5 ${favoritesOnly ? "chip-on" : "chip-off"}`}
        >
          <Icon name="heart" className="w-4 h-4" filled={favoritesOnly} />
          Favorites
        </button>
        <button onClick={() => go("import")} className="chip chip-off flex items-center gap-1.5 ml-auto">
          <Icon name="plus" className="w-4 h-4" />
          Add
        </button>
      </div>

      {filtersOpen && (
        <section className="card p-4 space-y-4">
          <div>
            <p className="eyebrow mb-2">Meal style</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((t) => (
                <button key={t} onClick={() => toggleMeal(t)}
                  className={`chip ${mealTypes.includes(t) ? "chip-on" : "chip-off"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2">Appliances you'll use</p>
            <div className="flex flex-wrap gap-2">
              {APPLIANCES.map((a) => (
                <button key={a} onClick={() => toggleAppliance(a)}
                  className={`chip ${appliances.includes(a) ? "chip-on" : "chip-off"}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          {settings.dietaryExclusions.length > 0 && (
            <p className="text-xs text-muted">
              Always excluding: {settings.dietaryExclusions.join(", ")}
            </p>
          )}
          {activeFilters > 0 && (
            <button
              className="btn-quiet text-xs px-0"
              onClick={() => {
                setMealTypes([]);
                setAppliances([]);
              }}
            >
              Clear filters
            </button>
          )}
        </section>
      )}

      <button className="btn-primary w-full flex items-center justify-center gap-2"
        onClick={() => ask()} disabled={generating || keyMissing}>
        <Icon name="sparkle" className="w-4 h-4" />
        {generating
          ? "Cooking up ideas…"
          : query.trim()
          ? `Get ${query.trim()} ideas`
          : "Suggest recipes"}
      </button>
      {keyMissing && (
        <p className="text-xs text-muted text-center -mt-3">
          Add your API key in ⚙️ Settings for AI suggestions — search works without one.
        </p>
      )}
      {error && <p className="text-sm text-tomato text-center -mt-3">{error}</p>}

      <div className="flex items-baseline justify-between">
        <h2 className="section-title">
          {filtered.length} {filtered.length === 1 ? "recipe" : "recipes"}
        </h2>
        {query.trim() && (
          <p className="text-xs text-muted">matching "{query.trim()}"</p>
        )}
      </div>

      <div className="space-y-3">
        {filtered.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} groceryNames={groceryNames} />
        ))}

        {filtered.length === 0 && feedRecipes.length === 0 && (
          <div className="card p-6 text-center">
            <p className="text-sm text-muted">
              {query.trim()
                ? `Nothing saved matches "${query.trim()}" yet.`
                : "No recipes match these filters yet."}
            </p>
            {!keyMissing && (
              <button className="btn-primary mt-3" onClick={() => ask()} disabled={generating}>
                {generating ? "Looking…" : query.trim() ? `Find ${query.trim()} recipes` : "Suggest some"}
              </button>
            )}
          </div>
        )}

        {feedRecipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} groceryNames={groceryNames} />
        ))}
      </div>

      {!favoritesOnly && (
        <div ref={sentinelRef} className="py-6 text-center text-sm text-muted">
          {feedState === "loading" && <p className="animate-pulse">Cooking up more ideas…</p>}
          {feedState === "error" && (
            <div>
              <p className="text-tomato mb-2">Couldn't load more right now.</p>
              <button className="btn-ghost" onClick={() => { setFeedState("idle"); ask({ silent: true }); }}>
                Try again
              </button>
            </div>
          )}
          {feedState === "idle" && !keyMissing && filtered.length > 0 && (
            <p>Keep scrolling for more ideas ↓</p>
          )}
        </div>
      )}
    </div>
  );
}
