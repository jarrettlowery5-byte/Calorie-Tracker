import { useMemo } from "react";
import { DAYS } from "../api";
import { money, planEntryCost, planEntryNutrition, useApp } from "../store";
import { buildIcs, downloadIcs } from "../lib/ics";

const LONG_COOK_MIN = 120;

export default function PlanView() {
  const { plan, settings, grocery, updatePlanEntry, removePlanEntry, showToast, go } = useApp();

  const byDay = useMemo(() => {
    const groups = { Unassigned: [] };
    for (const day of DAYS) groups[day] = [];
    for (const entry of plan) {
      (groups[entry.dayOfWeek] ?? groups.Unassigned).push(entry);
    }
    return groups;
  }, [plan]);

  const weekTotals = useMemo(() => {
    let calories = 0, protein = 0, cost = 0;
    for (const entry of plan) {
      const n = planEntryNutrition(entry);
      calories += n.calories;
      protein += n.protein;
      cost += planEntryCost(entry, settings);
    }
    return { calories, protein, cost };
  }, [plan, settings]);

  const exportIcs = () => {
    downloadIcs(buildIcs({ plan, settings, grocery }));
    showToast("Calendar file downloaded");
  };

  if (plan.length === 0) {
    return (
      <div className="space-y-5">
        <header>
          <p className="eyebrow">Weekly plan</p>
          <h1 className="page-title mt-1">Nothing planned yet.</h1>
        </header>
        <div className="card p-6 text-center">
          <p className="text-sm text-muted mb-3">
            Add meals from Recipes and they'll show up here, ready to slot into days.
          </p>
          <button className="btn-primary" onClick={() => go("recipes")}>
            Browse recipes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="eyebrow">Weekly plan</p>
        <h1 className="page-title mt-1">
          {plan.length} {plan.length === 1 ? "meal" : "meals"} this week
        </h1>
      </header>

      <section className="card p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Summary label="plan cost" value={money(weekTotals.cost)} />
          <Summary label="cal/serv · week" value={weekTotals.calories} />
          <Summary label="protein · week" value={`${weekTotals.protein}g`} />
        </div>
        <button className="btn-ghost w-full mt-3" onClick={exportIcs}>
          📅 Export dinners + prep reminders (.ics)
        </button>
      </section>

      {Object.entries(byDay).map(([day, entries]) => {
        if (entries.length === 0) return null;
        const dayCookMin = entries.reduce((sum, e) => sum + (e.recipe?.cookTimeMin || 0), 0);
        const appliances = [...new Set(entries.map((e) => e.recipe?.appliance).filter(Boolean))];
        const longCooks = entries.filter((e) => (e.recipe?.cookTimeMin || 0) >= LONG_COOK_MIN);
        const dayNutrition = entries.reduce(
          (acc, e) => {
            const n = planEntryNutrition(e);
            return { calories: acc.calories + n.calories, protein: acc.protein + n.protein };
          },
          { calories: 0, protein: 0 }
        );

        return (
          <section key={day}>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h3 className="section-title text-lg">{day === "Unassigned" ? "Not yet assigned" : day}</h3>
              {day !== "Unassigned" && (
                <p className="text-xs text-muted">
                  {dayCookMin} min · {appliances.join(", ")} · {dayNutrition.calories} cal · {dayNutrition.protein}g protein
                </p>
              )}
            </div>

            {longCooks.length >= 2 && (
              <p className="text-xs bg-tomato/10 border border-tomato/40 text-tomato rounded-lg px-2.5 py-1.5 mb-2">
                ⚠ Two long cooks on {day} ({longCooks.map((e) => e.recipe.name).join(" + ")}) — consider moving one.
              </p>
            )}

            <div className="space-y-3">
              {entries.map((entry) => (
                <PlanEntry
                  key={entry.id}
                  entry={entry}
                  settings={settings}
                  onUpdate={updatePlanEntry}
                  onRemove={removePlanEntry}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PlanEntry({ entry, settings, onUpdate, onRemove }) {
  const recipe = entry.recipe;
  if (!recipe) return null;
  const effective = entry.servingsOverride ?? settings.servings;
  const scale = recipe.servings > 0 ? effective / recipe.servings : 1;
  const cost = planEntryCost(entry, settings);
  const nutrition = planEntryNutrition(entry);

  const toggleSide = (sideId) => {
    const ids = entry.includedSideIds.includes(sideId)
      ? entry.includedSideIds.filter((id) => id !== sideId)
      : [...entry.includedSideIds, sideId];
    onUpdate(entry.id, { includedSideIds: ids });
  };

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-display text-[17px] font-semibold leading-snug">{recipe.name}</h4>
          <p className="text-xs text-muted mt-0.5">
            {recipe.cookTimeMin} min · {recipe.appliance} · {money(cost)} ·{" "}
            {nutrition.calories} cal/serv
          </p>
        </div>
        <button
          onClick={() => onRemove(entry.id)}
          className="text-muted hover:text-tomato text-lg leading-none shrink-0"
          aria-label="Remove from plan"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select
          className="rounded-xl border border-hairline bg-white px-2.5 py-1.5 text-sm"
          value={entry.dayOfWeek ?? ""}
          onChange={(e) => onUpdate(entry.id, { dayOfWeek: e.target.value || null })}
        >
          <option value="">Pick a day…</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 border border-hairline rounded-lg bg-white px-1 py-0.5">
          <button
            className="w-7 h-7 text-lg text-herb disabled:opacity-30"
            disabled={effective <= 1}
            onClick={() => onUpdate(entry.id, { servingsOverride: effective - 1 })}
            aria-label="Fewer servings"
          >
            −
          </button>
          <span className="text-sm font-medium w-14 text-center">
            {effective} serv{scale !== 1 && <span className="text-muted"> ×{scale.toFixed(2).replace(/\.?0+$/, "")}</span>}
          </span>
          <button
            className="w-7 h-7 text-lg text-herb"
            onClick={() => onUpdate(entry.id, { servingsOverride: effective + 1 })}
            aria-label="More servings"
          >
            +
          </button>
        </div>
      </div>

      {recipe.sides.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Sides</p>
          <div className="flex flex-wrap gap-2">
            {recipe.sides.map((side) => {
              const on = entry.includedSideIds.includes(side.id);
              return (
                <button
                  key={side.id}
                  onClick={() => toggleSide(side.id)}
                  className={`chip ${on ? "chip-on" : "chip-off"}`}
                  title={side.note}
                >
                  {on ? "✓ " : "+ "}{side.name} · {money(side.estCost * scale)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

function Summary({ label, value }) {
  return (
    <div className="bg-paper rounded-lg py-2">
      <p className="font-display text-lg font-semibold">{value}</p>
      <p className="eyebrow mt-0.5 !tracking-[0.1em]">{label}</p>
    </div>
  );
}
