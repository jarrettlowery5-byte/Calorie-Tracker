import { DAYS } from "../api";
import { money, planEntryCost, planEntryNutrition, useApp } from "../store";
import BudgetMeter from "./BudgetMeter";
import Icon from "./Icon";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeView() {
  const { plan, recipes, grocery, settings, go } = useApp();

  const todayLabel = DAYS[(new Date().getDay() + 6) % 7];
  const tonight = plan.find((p) => p.dayOfWeek === todayLabel);
  const toBuy = grocery?.items?.filter((i) => !i.acquired) ?? [];
  const unassigned = plan.filter((p) => !p.dayOfWeek).length;

  const week = plan.reduce(
    (acc, entry) => {
      const n = planEntryNutrition(entry);
      return {
        calories: acc.calories + n.calories,
        protein: acc.protein + n.protein,
        cost: acc.cost + planEntryCost(entry, settings),
      };
    },
    { calories: 0, protein: 0, cost: 0 }
  );

  const actions = [
    { id: "recipes", icon: "search", title: "Find recipes", sub: "Search or get ideas" },
    { id: "import", icon: "plus", title: "Add a recipe", sub: "From a link or written down" },
    { id: "grocery", icon: "cart", title: "Grocery list", sub: toBuy.length ? `${toBuy.length} left to buy` : "Nothing to buy" },
    { id: "cook", icon: "chef", title: "Cook a meal", sub: plan.length ? "Step-by-step" : "Plan one first" },
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="eyebrow">{greeting()}</p>
        <h1 className="page-title mt-1">
          {plan.length === 0
            ? "Let's fill the week."
            : tonight
            ? `Tonight: ${tonight.recipe?.name ?? "dinner"}.`
            : `${plan.length} ${plan.length === 1 ? "meal" : "meals"} planned this week.`}
        </h1>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">
          Pick meals you're in the mood for, keep the week inside your budget, and
          cook them with the steps in hand.
        </p>
      </section>

      <BudgetMeter variant="card" />

      <section>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={() => go(a.id)}
              className="card-pressable p-4 text-left hover:border-herb/40 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-herb-soft text-herb grid place-items-center mb-2.5">
                <Icon name={a.icon} className="w-[18px] h-[18px]" />
              </span>
              <p className="font-semibold text-sm">{a.title}</p>
              <p className="text-xs text-muted mt-0.5">{a.sub}</p>
            </button>
          ))}
        </div>
      </section>

      {tonight && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="section-title">Tonight</h2>
            <button onClick={() => go("cook")} className="text-sm text-herb font-medium">
              Open Cook →
            </button>
          </div>
          <button onClick={() => go("cook")} className="card-pressable w-full text-left p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold leading-snug">
                  {tonight.recipe?.name}
                </p>
                <p className="text-xs text-muted mt-1 flex items-center gap-1.5">
                  <Icon name="clock" className="w-3.5 h-3.5" />
                  {tonight.recipe?.cookTimeMin} min · {tonight.recipe?.appliance}
                </p>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${
                  tonight.recipe?.steps
                    ? "bg-herb-soft text-herb"
                    : "bg-honey/15 text-honey border border-honey/40"
                }`}
              >
                {tonight.recipe?.steps ? "Steps ready" : "Needs steps"}
              </span>
            </div>
          </button>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="section-title">This week</h2>
          <button onClick={() => go("plan")} className="text-sm text-herb font-medium">
            Edit plan →
          </button>
        </div>

        {plan.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-muted mb-3">
              Nothing planned yet. Find a few meals and they'll show up here.
            </p>
            <button className="btn-primary" onClick={() => go("recipes")}>
              Browse recipes
            </button>
          </div>
        ) : (
          <div className="card divide-y divide-hairline overflow-hidden">
            {DAYS.map((day) => {
              const entries = plan.filter((p) => p.dayOfWeek === day);
              const isToday = day === todayLabel;
              return (
                <button
                  key={day}
                  onClick={() => go("plan")}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-herb-soft/30 transition-colors"
                >
                  <span
                    className={`text-xs font-semibold w-10 shrink-0 ${
                      isToday ? "text-herb" : "text-muted"
                    }`}
                  >
                    {day}
                  </span>
                  <span className="min-w-0 flex-1 text-sm truncate">
                    {entries.length === 0 ? (
                      <span className="text-muted/70">—</span>
                    ) : (
                      entries.map((e) => e.recipe?.name).join(" · ")
                    )}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-semibold text-white bg-herb px-1.5 py-0.5 rounded-full shrink-0">
                      TODAY
                    </span>
                  )}
                </button>
              );
            })}
            {unassigned > 0 && (
              <button
                onClick={() => go("plan")}
                className="w-full text-left px-4 py-2.5 text-sm text-muted hover:bg-herb-soft/30 transition-colors"
              >
                {unassigned} meal{unassigned === 1 ? "" : "s"} without a day — assign →
              </button>
            )}
          </div>
        )}
      </section>

      {plan.length > 0 && (
        <section>
          <h2 className="section-title mb-2">Week at a glance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Plan cost" value={money(week.cost)} />
            <Stat label="Still to buy" value={money(grocery?.totals?.stillToBuy ?? 0)} />
            <Stat label="Calories / serving" value={week.calories} />
            <Stat label="Protein" value={`${week.protein}g`} />
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <button onClick={() => go("pantry")} className="card-pressable p-4 text-left">
          <span className="w-9 h-9 rounded-xl bg-herb-soft text-herb grid place-items-center mb-2.5">
            <Icon name="basket" className="w-[18px] h-[18px]" />
          </span>
          <p className="font-semibold text-sm">Pantry</p>
          <p className="text-xs text-muted mt-0.5">
            Staples you own are left off the list
          </p>
        </button>
        <div className="card p-4">
          <span className="w-9 h-9 rounded-xl bg-herb-soft text-herb grid place-items-center mb-2.5">
            <Icon name="book" className="w-[18px] h-[18px]" />
          </span>
          <p className="font-semibold text-sm">{recipes.length} recipes saved</p>
          <p className="text-xs text-muted mt-0.5">
            {recipes.filter((r) => r.isFavorite).length} favorited
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card p-3.5">
      <p className="font-display text-xl font-semibold tracking-tight">{value}</p>
      <p className="eyebrow mt-0.5 !tracking-[0.1em]">{label}</p>
    </div>
  );
}
