import { useRef, useState } from "react";
import { APPLIANCES, IS_LOCAL } from "../api";
import { getStoredApiKey } from "../local/generate";
import { prepareImage } from "../lib/image";
import { money, useApp } from "../store";
import Icon from "./Icon";

const MODES = [
  { id: "photo", label: "Take a photo", icon: "camera" },
  { id: "link", label: "From a link", icon: "link" },
  { id: "paste", label: "Paste text", icon: "book" },
  { id: "type", label: "Type it in", icon: "pencil" },
];

const MAX_PHOTOS = 4;

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
  const [mode, setMode] = useState("photo");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {media_type, data, preview}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

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
      setPhotos([]);
      showToast(`Saved "${recipe.name}"`);
    } catch (err) {
      setError(err.message || "That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = async (fileList) => {
    const files = [...fileList].slice(0, MAX_PHOTOS - photos.length);
    if (!files.length) return;
    setError(null);
    try {
      const prepared = await Promise.all(files.map(prepareImage));
      setPhotos((prev) => [...prev, ...prepared]);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Add a recipe</p>
        <h1 className="page-title mt-1">Bring your own recipes in.</h1>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">
          Snap a photo of a recipe card, paste a link, paste the text, or type it
          out. Appetite pulls out the ingredients — with prices, so they flow into
          your grocery list and budget — and the cooking steps for the Cook tab.
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
            className={`chip shrink-0 whitespace-nowrap flex items-center gap-1.5 ${
              mode === m.id ? "chip-on" : "chip-off"
            }`}
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

      {mode === "photo" && (
        <section className="card p-4">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />

          {photos.length === 0 ? (
            <button
              onClick={() => cameraRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-hairline hover:border-herb/50 transition-colors py-10 grid place-items-center gap-2"
            >
              <span className="w-12 h-12 rounded-2xl bg-herb-soft text-herb grid place-items-center">
                <Icon name="camera" className="w-6 h-6" />
              </span>
              <span className="font-semibold text-sm">Take a photo of the recipe</span>
              <span className="text-xs text-muted">Recipe card, cookbook page, or handwritten note</span>
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-hairline">
                  <img src={photo.preview} alt={`Recipe photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ink/70 text-paper grid place-items-center"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <Icon name="close" className="w-3.5 h-3.5" strokeWidth={2.4} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-hairline hover:border-herb/50 grid place-items-center text-muted"
                  aria-label="Add another photo"
                >
                  <Icon name="plus" className="w-6 h-6" />
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button className="btn-ghost flex-1 text-xs" onClick={() => libraryRef.current?.click()}>
              Choose from photos
            </button>
            {photos.length > 0 && (
              <button className="btn-quiet text-xs" onClick={() => setPhotos([])}>
                Clear
              </button>
            )}
          </div>

          <button
            className="btn-primary w-full mt-3"
            disabled={busy || keyMissing || photos.length === 0}
            onClick={() => run({ images: photos.map(({ media_type, data }) => ({ media_type, data })) })}
          >
            {busy
              ? "Reading the recipe…"
              : `Import ${photos.length > 1 ? `${photos.length} photos` : "this recipe"}`}
          </button>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Fill the frame with the card and keep it in focus. Long recipe? Add up to{" "}
            {MAX_PHOTOS} photos — front and back, or several pages — and they'll be read
            as one recipe.
          </p>
        </section>
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
          {mode === "photo" && (
        <section className="card p-4">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />

          {photos.length === 0 ? (
            <button
              onClick={() => cameraRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-hairline hover:border-herb/50 transition-colors py-10 grid place-items-center gap-2"
            >
              <span className="w-12 h-12 rounded-2xl bg-herb-soft text-herb grid place-items-center">
                <Icon name="camera" className="w-6 h-6" />
              </span>
              <span className="font-semibold text-sm">Take a photo of the recipe</span>
              <span className="text-xs text-muted">Recipe card, cookbook page, or handwritten note</span>
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-hairline">
                  <img src={photo.preview} alt={`Recipe photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ink/70 text-paper grid place-items-center"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <Icon name="close" className="w-3.5 h-3.5" strokeWidth={2.4} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-hairline hover:border-herb/50 grid place-items-center text-muted"
                  aria-label="Add another photo"
                >
                  <Icon name="plus" className="w-6 h-6" />
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button className="btn-ghost flex-1 text-xs" onClick={() => libraryRef.current?.click()}>
              Choose from photos
            </button>
            {photos.length > 0 && (
              <button className="btn-quiet text-xs" onClick={() => setPhotos([])}>
                Clear
              </button>
            )}
          </div>

          <button
            className="btn-primary w-full mt-3"
            disabled={busy || keyMissing || photos.length === 0}
            onClick={() => run({ images: photos.map(({ media_type, data }) => ({ media_type, data })) })}
          >
            {busy
              ? "Reading the recipe…"
              : `Import ${photos.length > 1 ? `${photos.length} photos` : "this recipe"}`}
          </button>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Fill the frame with the card and keep it in focus. Long recipe? Add up to{" "}
            {MAX_PHOTOS} photos — front and back, or several pages — and they'll be read
            as one recipe.
          </p>
        </section>
      )}

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
