import { useMemo, useState } from "react";
import { STORES } from "../api";
import { money, useApp } from "../store";
import { groceryListText } from "../lib/ics";

export default function GroceryView() {
  const { grocery, showToast } = useApp();
  const [groupBy, setGroupBy] = useState("aisle"); // 'aisle' | 'store'

  const groups = useMemo(() => {
    if (!grocery) return [];
    const map = new Map();
    for (const item of grocery.items) {
      const key = groupBy === "aisle" ? item.category : item.store;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [grocery, groupBy]);

  if (!grocery || grocery.items.length === 0) {
    return (
      <p className="text-center text-muted py-12 text-sm">
        Your grocery list builds itself from the weekly plan — add some meals first.
      </p>
    );
  }

  const { totals } = grocery;

  const copyText = async (forWalmart) => {
    await navigator.clipboard.writeText(groceryListText(grocery, { forWalmart }));
    showToast(forWalmart ? "Copied for Walmart search" : "List copied");
  };

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="grid grid-cols-2 gap-2 text-center mb-3">
          <div className="bg-paper rounded-lg py-2">
            <p className="font-semibold">{money(totals.estimatedTotal)}</p>
            <p className="text-[10px] text-muted uppercase tracking-wide">estimated total</p>
          </div>
          <div className="bg-paper rounded-lg py-2">
            <p className="font-semibold text-herb">{money(totals.stillToBuy)}</p>
            <p className="text-[10px] text-muted uppercase tracking-wide">still to buy</p>
          </div>
        </div>
        {totals.pantrySavings > 0 && (
          <p className="text-xs text-muted mb-3">
            🧺 Pantry saved you {money(totals.pantrySavings)} this week.
          </p>
        )}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 text-xs" onClick={() => copyText(false)}>Copy list</button>
          <button className="btn-ghost flex-1 text-xs" onClick={() => copyText(true)}>Copy for Walmart</button>
        </div>
        <p className="text-[11px] text-muted mt-2">
          Prices are estimates until you correct them — tap any price to fix it and it'll be remembered per store.
        </p>
      </section>

      <div className="flex rounded-xl border border-hairline overflow-hidden text-sm font-medium">
        <button
          className={`flex-1 py-2 ${groupBy === "aisle" ? "bg-herb text-white" : "bg-white text-muted"}`}
          onClick={() => setGroupBy("aisle")}
        >
          By aisle
        </button>
        <button
          className={`flex-1 py-2 ${groupBy === "store" ? "bg-herb text-white" : "bg-white text-muted"}`}
          onClick={() => setGroupBy("store")}
        >
          By store
        </button>
      </div>

      {groups.map(([label, items]) => (
        <section key={label}>
          <div className="flex items-baseline justify-between px-1 mb-1.5">
            <h3 className="font-display font-semibold">{label}</h3>
            {groupBy === "store" && totals.byStore[label] && (
              <p className="text-xs text-muted">
                {money(totals.byStore[label].stillToBuy)} to buy · {money(totals.byStore[label].total)} total
              </p>
            )}
          </div>
          <div className="card divide-y divide-hairline">
            {items.map((item) => (
              <GroceryItem key={item.name} item={item} />
            ))}
          </div>
        </section>
      ))}

      {grocery.pantryExcluded.length > 0 && (
        <section>
          <h3 className="font-display font-semibold px-1 mb-1.5 text-muted">Already in your pantry</h3>
          <div className="card divide-y divide-hairline">
            {grocery.pantryExcluded.map((item) => (
              <div key={item.name} className="px-4 py-2.5 flex justify-between text-sm text-muted">
                <span className="line-through">{item.displayName}</span>
                <span>saved {money(item.savedCost)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GroceryItem({ item }) {
  const { setItemChecked, setItemStore, savePrice, moveToPantry } = useApp();
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState("");
  const [showStore, setShowStore] = useState(false);

  const commitPrice = () => {
    const value = parseFloat(priceDraft);
    if (!Number.isNaN(value) && value >= 0) {
      savePrice(item.name, item.store, Math.round(value * 100) / 100);
    }
    setEditingPrice(false);
  };

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={item.acquired}
          onChange={(e) => setItemChecked(item.name, e.target.checked)}
          className="w-5 h-5 rounded accent-herb shrink-0"
          aria-label={`Mark ${item.displayName} acquired`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${item.acquired ? "line-through text-muted" : ""}`}>
            {item.displayName}
            {item.doubleDuty && (
              <span className="ml-1.5 text-[10px] font-semibold bg-honey/15 text-honey border border-honey/40 px-1.5 py-0.5 rounded-full align-middle">
                ♻ double-duty
              </span>
            )}
          </p>
          <p className="text-xs text-muted truncate">
            {item.quantities.join(" + ")} · for {item.usedBy.length} {item.usedBy.length === 1 ? "meal" : "meals"}
          </p>
        </div>

        {editingPrice ? (
          <input
            autoFocus
            type="number" min="0" step="0.01" inputMode="decimal"
            className="w-20 rounded-lg border border-herb px-2 py-1 text-sm text-right"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => e.key === "Enter" && commitPrice()}
          />
        ) : (
          <button
            onClick={() => {
              setPriceDraft(String(item.cost));
              setEditingPrice(true);
            }}
            className={`text-sm font-semibold shrink-0 ${item.priceSource === "saved" ? "text-herb" : "text-muted underline decoration-dotted"}`}
            title={item.priceSource === "saved" ? "Corrected price (saved)" : "Estimate — tap to correct"}
          >
            {money(item.cost)}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-1.5 pl-8">
        <button
          className="text-[11px] text-muted border border-hairline rounded-full px-2 py-0.5"
          onClick={() => setShowStore((v) => !v)}
        >
          🏬 {item.store}
        </button>
        <button
          className="text-[11px] text-muted border border-hairline rounded-full px-2 py-0.5"
          onClick={() => moveToPantry(item)}
        >
          I already have this
        </button>
      </div>

      {showStore && (
        <div className="flex flex-wrap gap-1.5 mt-2 pl-8">
          {STORES.map((store) => (
            <button
              key={store}
              className={`chip text-xs ${store === item.store ? "chip-on" : "chip-off"}`}
              onClick={() => {
                setItemStore(item.name, store);
                setShowStore(false);
              }}
            >
              {store}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
