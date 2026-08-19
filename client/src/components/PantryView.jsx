import { useState } from "react";
import { useApp } from "../store";

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

export default function PantryView() {
  const { pantry, addPantryItem, togglePantryHave, deletePantryItem } = useApp();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Pantry");

  const add = async () => {
    if (!name.trim()) return;
    await addPantryItem({ name: name.trim(), category, have: true });
    setName("");
  };

  const owned = pantry.filter((p) => p.have);
  const needed = pantry.filter((p) => !p.have);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="font-display text-lg font-semibold mb-1">Pantry staples</h2>
        <p className="text-xs text-muted mb-3">
          Items marked "have" are automatically left off the grocery list and the budget.
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-hairline bg-white px-3 py-2 text-sm"
            placeholder="e.g. olive oil, rice, garlic powder…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <select
            className="rounded-xl border border-hairline bg-white px-2 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary w-full mt-2" onClick={add}>Add to pantry</button>
      </section>

      {[
        ["Have", owned],
        ["Need to restock", needed],
      ].map(([label, items]) =>
        items.length === 0 ? null : (
          <section key={label}>
            <h3 className="font-display font-semibold px-1 mb-1.5">{label}</h3>
            <div className="card divide-y divide-hairline">
              {items.map((item) => (
                <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={item.have}
                    onChange={() => togglePantryHave(item)}
                    className="w-5 h-5 rounded accent-herb"
                    aria-label={`${item.name}: have it`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted">{item.category}</p>
                  </div>
                  <button
                    className="text-muted hover:text-tomato"
                    onClick={() => deletePantryItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        )
      )}

      {pantry.length === 0 && (
        <p className="text-center text-muted py-6 text-sm">
          Nothing here yet — add staples you already own, or tap "I already have this" on any grocery item.
        </p>
      )}
    </div>
  );
}
