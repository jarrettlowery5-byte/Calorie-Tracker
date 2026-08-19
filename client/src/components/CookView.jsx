import { useEffect, useMemo, useRef, useState } from "react";
import { DAYS, IS_LOCAL } from "../api";
import { getStoredApiKey } from "../local/generate";
import { useApp } from "../store";

const PROGRESS_KEY = "appetite-cook-progress";

// Cooking progress is per planned meal and lives on the device — it survives
// the screen locking mid-recipe, and resets when you clear it by hand.
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProgress(all) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}

const dishImageUrl = (recipe) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `professional food photography of ${recipe.name}, ${recipe.cuisine} dish, plated, appetizing, natural light`
  )}?width=768&height=432&nologo=true&seed=${recipe.id}`;

export default function CookView() {
  const { plan } = useApp();
  const [openId, setOpenId] = useState(null);

  const openEntry = plan.find((p) => p.id === openId);

  if (plan.length === 0) {
    return (
      <p className="text-center text-muted py-12 text-sm">
        Nothing to cook yet — plan some meals first and they'll show up here with
        step-by-step instructions.
      </p>
    );
  }

  if (openEntry) {
    return <CookingSession entry={openEntry} onBack={() => setOpenId(null)} />;
  }

  // Today's meals float to the top; the rest keep week order.
  const todayLabel = DAYS[(new Date().getDay() + 6) % 7];
  const sorted = [...plan].sort((a, b) => {
    const rank = (e) =>
      e.dayOfWeek === todayLabel ? -1 : e.dayOfWeek ? DAYS.indexOf(e.dayOfWeek) : 99;
    return rank(a) - rank(b);
  });

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-semibold px-1">What are you cooking?</h2>
      {sorted.map((entry) => {
        const recipe = entry.recipe;
        if (!recipe) return null;
        const isToday = entry.dayOfWeek === todayLabel;
        return (
          <button
            key={entry.id}
            onClick={() => setOpenId(entry.id)}
            className="card w-full text-left overflow-hidden flex items-stretch"
          >
            <img
              src={dishImageUrl(recipe)}
              alt=""
              className="w-24 h-24 object-cover bg-herb-soft shrink-0"
              loading="lazy"
              onError={(e) => e.currentTarget.remove()}
            />
            <div className="p-3 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {entry.dayOfWeek && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      isToday ? "bg-herb text-white" : "bg-herb-soft text-herb"
                    }`}
                  >
                    {isToday ? "TODAY" : entry.dayOfWeek.toUpperCase()}
                  </span>
                )}
                {recipe.steps && (
                  <span className="text-[10px] text-muted">✓ instructions ready</span>
                )}
              </div>
              <h3 className="font-display font-semibold leading-snug mt-1">{recipe.name}</h3>
              <p className="text-xs text-muted mt-0.5">
                {recipe.cookTimeMin} min · {recipe.appliance}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CookingSession({ entry, onBack }) {
  const { settings, generateSteps, showToast } = useApp();
  const recipe = entry.recipe;
  const servings = entry.servingsOverride ?? settings.servings;
  const scale = recipe.servings > 0 ? servings / recipe.servings : 1;

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [showIngredients, setShowIngredients] = useState(true);
  const [done, setDone] = useState(() => new Set(loadProgress()[entry.id] ?? []));
  const wakeLockRef = useRef(null);

  const includedSides = recipe.sides.filter((s) => entry.includedSideIds.includes(s.id));
  const instructions = recipe.steps;
  const keyMissing = IS_LOCAL && !getStoredApiKey();

  // Keep the screen on while a recipe is open — hands are usually busy.
  useEffect(() => {
    if (!instructions || !("wakeLock" in navigator)) return;
    let released = false;
    navigator.wakeLock
      .request("screen")
      .then((lock) => {
        if (released) lock.release();
        else wakeLockRef.current = lock;
      })
      .catch(() => {}); // denied or unsupported — cooking still works
    return () => {
      released = true;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [instructions]);

  const toggleStep = (key) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      const all = loadProgress();
      all[entry.id] = [...next];
      saveProgress(all);
      return next;
    });
  };

  const resetProgress = () => {
    setDone(new Set());
    const all = loadProgress();
    delete all[entry.id];
    saveProgress(all);
  };

  const write = async () => {
    setGenerating(true);
    setError(null);
    try {
      await generateSteps(recipe.id, {
        servings,
        includedSideIds: entry.includedSideIds,
      });
      showToast("Instructions ready");
    } catch (err) {
      setError(err.message || "Couldn't write the instructions — try again.");
    } finally {
      setGenerating(false);
    }
  };

  const totalSteps = useMemo(() => {
    if (!instructions) return 0;
    return (
      instructions.prep.length +
      instructions.steps.length +
      instructions.sides.reduce((sum, s) => sum + s.steps.length, 0)
    );
  }, [instructions]);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-herb font-medium">
        ← All meals
      </button>

      <section className="card overflow-hidden">
        <img
          src={dishImageUrl(recipe)}
          alt=""
          className="w-full h-40 object-cover bg-herb-soft"
          onError={(e) => e.currentTarget.remove()}
        />
        <div className="p-4">
          <h2 className="font-display text-xl font-semibold leading-snug">{recipe.name}</h2>
          <p className="text-xs text-muted mt-1">
            {servings} servings · {recipe.cookTimeMin} min · {recipe.appliance}
            {entry.dayOfWeek ? ` · ${entry.dayOfWeek}` : ""}
          </p>
          {includedSides.length > 0 && (
            <p className="text-xs text-muted mt-1">
              With: {includedSides.map((s) => s.name).join(", ")}
            </p>
          )}
          {totalSteps > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>
                  {done.size} of {totalSteps} done
                </span>
                {done.size > 0 && (
                  <button className="underline" onClick={resetProgress}>
                    Start over
                  </button>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
                <div
                  className="h-full bg-herb rounded-full transition-all duration-300"
                  style={{ width: `${totalSteps ? (done.size / totalSteps) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card p-4">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setShowIngredients((v) => !v)}
        >
          <span className="font-display font-semibold">
            Ingredients{scale !== 1 && <span className="text-muted font-body text-sm font-normal"> · scaled ×{scale.toFixed(2).replace(/\.?0+$/, "")}</span>}
          </span>
          <span className="text-muted">{showIngredients ? "▾" : "▸"}</span>
        </button>
        {showIngredients && (
          <ul className="text-sm mt-2 space-y-1">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="flex justify-between gap-3">
                <span>{ing.name}</span>
                <span className="text-muted shrink-0">
                  {ing.quantity}
                  {scale !== 1 && ` ×${scale.toFixed(2).replace(/\.?0+$/, "")}`}
                </span>
              </li>
            ))}
            {includedSides.flatMap((side) =>
              side.ingredients.map((ing) => (
                <li key={`s${side.id}-${ing.id}`} className="flex justify-between gap-3">
                  <span>
                    {ing.name} <span className="text-muted text-xs">· {side.name}</span>
                  </span>
                  <span className="text-muted shrink-0">
                    {ing.quantity}
                    {scale !== 1 && ` ×${scale.toFixed(2).replace(/\.?0+$/, "")}`}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      {!instructions && (
        <section className="card p-4 text-center">
          <p className="text-sm text-muted mb-3">
            {keyMissing
              ? "Add your Anthropic API key in ⚙️ Settings to get step-by-step instructions for this meal."
              : "No instructions yet for this meal. Write them once and they're saved for good."}
          </p>
          <button className="btn-primary w-full" onClick={write} disabled={generating || keyMissing}>
            {generating ? "Writing the steps…" : "👩‍🍳 Get step-by-step instructions"}
          </button>
          {error && <p className="text-sm text-tomato mt-2">{error}</p>}
        </section>
      )}

      {instructions && (
        <>
          {instructions.prep.length > 0 && (
            <StepGroup title="Before you start">
              {instructions.prep.map((text, i) => (
                <StepRow
                  key={`prep-${i}`}
                  label={`${i + 1}`}
                  text={text}
                  checked={done.has(`prep-${i}`)}
                  onToggle={() => toggleStep(`prep-${i}`)}
                />
              ))}
            </StepGroup>
          )}

          <StepGroup title={recipe.name}>
            {instructions.steps.map((step, i) => (
              <StepRow
                key={`main-${i}`}
                label={`${i + 1}`}
                text={step.text}
                minutes={step.minutes}
                checked={done.has(`main-${i}`)}
                onToggle={() => toggleStep(`main-${i}`)}
              />
            ))}
          </StepGroup>

          {instructions.sides.map((side, si) => (
            <StepGroup key={`side-${si}`} title={side.name}>
              {side.steps.map((step, i) => (
                <StepRow
                  key={`side-${si}-${i}`}
                  label={`${i + 1}`}
                  text={step.text}
                  minutes={step.minutes}
                  checked={done.has(`side-${si}-${i}`)}
                  onToggle={() => toggleStep(`side-${si}-${i}`)}
                />
              ))}
            </StepGroup>
          ))}

          {instructions.tips.length > 0 && (
            <section className="card p-4">
              <h3 className="font-display font-semibold mb-2">Good to know</h3>
              <ul className="text-sm space-y-1.5">
                {instructions.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-honey">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button className="btn-ghost w-full" onClick={write} disabled={generating}>
            {generating ? "Rewriting…" : "↻ Rewrite instructions"}
          </button>
          {error && <p className="text-sm text-tomato text-center">{error}</p>}
        </>
      )}
    </div>
  );
}

function StepGroup({ title, children }) {
  return (
    <section>
      <h3 className="font-display font-semibold px-1 mb-1.5">{title}</h3>
      <div className="card divide-y divide-hairline">{children}</div>
    </section>
  );
}

function StepRow({ label, text, minutes, checked, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full text-left px-4 py-3 flex gap-3 items-start active:bg-herb-soft/50"
    >
      <span
        className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-semibold mt-0.5 ${
          checked ? "bg-herb border-herb text-white" : "border-hairline text-muted"
        }`}
      >
        {checked ? "✓" : label}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-relaxed ${checked ? "line-through text-muted" : ""}`}>
          {text}
        </span>
        {minutes > 0 && (
          <span className="text-[11px] text-muted mt-0.5 inline-block">~{minutes} min</span>
        )}
      </span>
    </button>
  );
}
