import { useState } from "react";
import { APPLIANCES, IS_LOCAL } from "../api";
import { getStoredApiKey } from "../local/generate";
import { money, useApp } from "../store";
import Icon from "./Icon";

const MODES = [
  { id: "link", label: "From a link", icon: "link" },
  { id: "paste", label: "Paste text", icon: "book" },
  { id: "type", label: "Type it in", icon: "pencil" },
];

const CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry",
  "Spices",
  "Other",
];

export default function ImportView() {
  const { importRecipe, settings, showToast, go, addToPlan } = useApp();
  const [mode, setMode] = useState("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  const keyMissing = IS_LOCAL && !getStoredApiKey();

  const run = async (params) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const recipe = await importRecipe({ ...params, servings: settings.servings });
      setSaved(recipe);
      setUrl("");
      setText("");
      showToast(`Saved "${recipe.name}"`);
    } catch (err) {
      setError(err.message || "That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Add a recipe</p>
        <h1 className="page-title mt-1">Bring your own recipes in.</h1>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">
          Paste a link, paste the text, or type it out. Appetite pulls out the
          ingredients — with prices, so they flow into your grocery list and
          budget — and the cooking steps for the Cook tab.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setMode(m.id);
              setError(null);
            }}
            className={`chip flex items-center gap-1.5 ${mode === m.id ? "chip-on" : "chip-off"}`}
          >
            <Icon name={m.icon} className="w-4 h-4" />
            {m.label}
          </button>
        ))}
      </div>

      {keyMissing && mode !== "type" && (
        <div className="card p-4 text-sm text-muted">
          Reading a recipe needs your Anthropic API key — add it under ⚙️ Settings.
          You can still use <strong className="text-ink">Type it in</strong> without one.
        </div>
      )}

      {mode === "link" && (
        <section className="card p-4">
          <label className="label" htmlFor="recipe-url">Recipe link</label>
          <input
            id="recipe-url"
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://www.allrecipes.com/recipe/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            className="btn-primary w-full mt-3"
            disabled={busy || keyMissing || !url.trim()}
            onClick={() => run({ url: url.trim() })}
          >
            {busy ? "Reading the page…" : "Import from link"}
          </button>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Some sites block being read from a phone browser. If that happens, copy the
            recipe text and use <strong className="text-ink">Paste text</strong> — that always works.
          </p>
        </section>
      )}

      {mode === "paste" && (
        <section className="card p-4">
          <label className="label" htmlFor="recipe-text">Recipe text</label>
          <textarea
            id="recipe-text"
            className="input min-h-[220px] leading-relaxed"
            placeholder={"Grandma's chili\n\n2 lb ground beef\n1 onion, diced\n2 cans kidney beans\n...\n\nBrown the beef, add the onion..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn-primary w-full mt-3"
            disabled={busy || keyMissing || text.trim().length < 30}
            onClick={() => run({ text: text.trim() })}
          >
            {busy ? "Reading it…" : "Import this recipe"}
          </button>
          <p className="text-xs text-muted mt-2">
            Messy is fine — handwritten notes, a screenshot's text, a family recipe card.
          </p>
        </section>
      )}

      {mode === "type" && <ManualForm onSaved={setSaved} />}

      {error && (
        <div className="card p-4 border-tomato/40 bg-tomato/[0.04]">
          <p className="text-sm text-tomato font-medium">{error}</p>
          {mode === "link" && (
            <button className="btn-ghost mt-3" onClick={() => setMode("paste")}>
              Paste the text instead →
            </button>
          )}
        </div>
      )}

      {saved && <SavedCard recipe={saved} onPlan={() => addToPlan(saved.id).then(() => go("plan"))} onCook={() => go("cook")} />}
    </div>
  );
}

function SavedCard({ recipe, onPlan, onCook }) {
  const cost = recipe.ingredients.reduce((sum, i) => sum + (i.estCost || 0), 0);
  return (
    <section className="card p-4 border-herb/40 bg-herb-soft/30">
      <div className="flex items-center gap-2 text-herb mb-2">
        <Icon name="check" className="w-4 h-4" strokeWidth={2.2} />
        <p className="text-sm font-semibold">Saved to your recipes</p>
      </div>
      <h2 className="font-display text-lg font-semibold leading-snug">{recipe.name}</h2>
      <p className="text-xs text-muted mt-1">
        {recipe.ingredients.length} ingredients · {money(cost)} · {recipe.cookTimeMin} min ·{" "}
        {recipe.appliance}
        {recipe.steps?.steps?.length ? ` · ${recipe.steps.steps.length} steps` : ""}
      </p>
      <div className="flex gap-2 mt-3">
        <button className="btn-primary flex-1" onClick={onPlan}>
          Add to the week
        </button>
        <button className="btn-ghost" onClick={onCook}>
          Cook tab
        </button>
      </div>
    </section>
  );
}

// No-AI path: type a recipe in by hand. Ingredient costs are optional —
// prices can be corrected later from the grocery list.
function ManualForm({ onSaved }) {
  const { createRecipe, settings, showToast } = useApp();
  const [name, setName] = useState("");
  const [servings, setServings] = useState(String(settings.servings));
  const [cookTime, setCookTime] = useState("30");
  const [appliance, setAppliance] = useState("Stove");
  const [rows, setRows] = useState([
    { name: "", quantity: "", category: "Produce", estCost: "" },
    { name: "", quantity: "", category: "Pantry", estCost: "" },
  ]);
  const [steps, setSteps] = useState("");
  const [busy, setBusy] = useState(false);

  const setRow = (i, patch) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    const ingredients = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        quantity: r.quantity.trim(),
        category: r.category,
        estCost: parseFloat(r.estCost) || 0,
      }));
    if (!name.trim() || ingredients.length === 0) return;

    setBusy(true);
    try {
      const stepLines = steps
        .split("\n")
        .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      const saved = await createRecipe({
        name: name.trim(),
        cuisine: "",
        tags: [],
        servings: parseInt(servings, 10) || settings.servings,
        caloriesPerServing: 0,
        proteinPerServing: 0,
        cookTimeMin: parseInt(cookTime, 10) || 0,
        appliance,
        method: stepLines[0] ?? "",
        ingredients,
        sides: [],
        instructions: stepLines.length
          ? { prep: [], steps: stepLines.map((text) => ({ text, minutes: 0 })), tips: [] }
          : null,
      });
      onSaved(saved);
      showToast(`Saved "${saved.name}"`);
      setName("");
      setSteps("");
      setRows([{ name: "", quantity: "", category: "Produce", estCost: "" }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-4 space-y-4">
      <div>
        <label className="label" htmlFor="m-name">Recipe name</label>
        <input id="m-name" className="input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Mom's baked ziti" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label" htmlFor="m-serv">Servings</label>
          <input id="m-serv" className="input" type="number" min="1" inputMode="numeric"
            value={servings} onChange={(e) => setServings(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="m-time">Minutes</label>
          <input id="m-time" className="input" type="number" min="0" inputMode="numeric"
            value={cookTime} onChange={(e) => setCookTime(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="m-app">Appliance</label>
          <select id="m-app" className="input" value={appliance} onChange={(e) => setAppliance(e.target.value)}>
            {APPLIANCES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="label">Ingredients</p>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_72px_64px] gap-2">
              <input className="input" placeholder="ingredient" value={row.name}
                onChange={(e) => setRow(i, { name: e.target.value })} />
              <input className="input" placeholder="qty" value={row.quantity}
                onChange={(e) => setRow(i, { quantity: e.target.value })} />
              <input className="input" placeholder="$" type="number" min="0" step="0.01" inputMode="decimal"
                value={row.estCost} onChange={(e) => setRow(i, { estCost: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn-ghost text-xs"
            onClick={() => setRows((p) => [...p, { name: "", quantity: "", category: "Pantry", estCost: "" }])}>
            + Add ingredient
          </button>
          {rows.length > 1 && (
            <button className="btn-quiet text-xs" onClick={() => setRows((p) => p.slice(0, -1))}>
              Remove last
            </button>
          )}
        </div>
        <p className="text-xs text-muted mt-2">
          Costs are optional — leave them blank and correct prices later from the grocery list.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="m-steps">Steps — one per line</label>
        <textarea id="m-steps" className="input min-h-[140px] leading-relaxed" value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder={"Boil the pasta 2 minutes short of the box time.\nBrown the beef with the onion.\nLayer, top with cheese, bake 25 min at 375°F."} />
      </div>

      <button className="btn-primary w-full" onClick={save}
        disabled={busy || !name.trim() || !rows.some((r) => r.name.trim())}>
        {busy ? "Saving…" : "Save recipe"}
      </button>
    </section>
  );
}
