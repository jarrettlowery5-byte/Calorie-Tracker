import { money, useApp } from "../store";

// Signature element: sticky budget meter. Fills herb green, shifts to honey
// past ~85%, turns tomato when over budget. Reacts live as meals are added.
export default function BudgetMeter() {
  const { grocery, settings } = useApp();
  const budget = grocery?.totals?.budget ?? settings?.budget ?? 0;
  const spent = grocery?.totals?.estimatedTotal ?? 0;
  const remaining = budget - spent;
  const pct = budget > 0 ? (spent / budget) * 100 : 0;

  const over = pct > 100;
  const warm = pct >= 85 && !over;
  const barColor = over ? "bg-tomato" : warm ? "bg-honey" : "bg-herb";
  const textColor = over ? "text-tomato" : warm ? "text-honey" : "text-herb";

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex items-baseline justify-between text-sm mb-1.5">
        <span className="font-semibold">
          <span className={textColor}>{money(spent)}</span>
          <span className="text-muted font-normal"> of {money(budget)}</span>
        </span>
        <span className={`font-semibold ${over ? "text-tomato" : "text-muted"}`}>
          {over ? `${money(-remaining)} over` : `${money(remaining)} left`}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-hairline overflow-hidden" role="meter"
        aria-valuemin={0} aria-valuemax={budget} aria-valuenow={spent} aria-label="Weekly budget used">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
