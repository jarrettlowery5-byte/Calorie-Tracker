import { money, useApp } from "../store";

// Signature element: the budget meter. Fills herb green, shifts to honey past
// ~85%, turns tomato when over budget. Reacts live as meals are added.
// `variant="bar"` is the slim always-visible strip under the header;
// `variant="card"` is the richer block on the home page.
export default function BudgetMeter({ variant = "bar" }) {
  const { grocery, settings } = useApp();
  const budget = grocery?.totals?.budget ?? settings?.budget ?? 0;
  const spent = grocery?.totals?.estimatedTotal ?? 0;
  const remaining = budget - spent;
  const pct = budget > 0 ? (spent / budget) * 100 : 0;

  const over = pct > 100;
  const warm = pct >= 85 && !over;
  const barColor = over ? "bg-tomato" : warm ? "bg-honey" : "bg-herb";
  const textColor = over ? "text-tomato" : warm ? "text-honey" : "text-herb";

  const track = (h) => (
    <div
      className={`${h} rounded-full bg-hairline/80 overflow-hidden`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={spent}
      aria-label="Weekly budget used"
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );

  if (variant === "card") {
    return (
      <section className="card p-5">
        <p className="eyebrow">Weekly grocery budget</p>
        <div className="flex items-end justify-between mt-1.5 mb-3">
          <p className="font-display text-3xl font-semibold tracking-tight">
            <span className={textColor}>{money(spent)}</span>
            <span className="text-muted text-lg font-normal"> / {money(budget)}</span>
          </p>
          <p className={`text-sm font-semibold ${over ? "text-tomato" : "text-muted"}`}>
            {over ? `${money(-remaining)} over` : `${money(remaining)} left`}
          </p>
        </div>
        {track("h-2.5")}
        <p className="text-xs text-muted mt-2.5">
          {over
            ? "Over budget — trim a meal or correct a price to get back under."
            : "Estimates update as you plan meals. Correct any price to sharpen them."}
        </p>
      </section>
    );
  }

  return (
    <div className="px-4 pb-2.5 pt-0.5">
      <div className="flex items-baseline justify-between text-[13px] mb-1.5">
        <span className="font-semibold">
          <span className={textColor}>{money(spent)}</span>
          <span className="text-muted font-normal"> of {money(budget)}</span>
        </span>
        <span className={`font-semibold ${over ? "text-tomato" : "text-muted"}`}>
          {over ? `${money(-remaining)} over` : `${money(remaining)} left`}
        </span>
      </div>
      {track("h-1.5")}
    </div>
  );
}
