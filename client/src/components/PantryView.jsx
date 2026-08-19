import { useMemo, useState } from "react";
import { useApp } from "../store";
import { PANTRY_STAPLES } from "../data/pantry-staples";

const normalize = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");

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
  const [openGroup, setOpenGroup] = useState(PANTRY_STAPLES[0].group);

  const pantryByName = useMemo(() => {
    const map = new Map();
    for (const item of pantry) map.set(normalize(item.name), item);
    return map;
  }, [pantry]);

  const add = async () => {
    if (!name.trim()) return;
    await addPantryItem({ name: name.trim(), category, have: true });
    setName("");
  };

  // Tap a staple to check it into the pantry as owned; tap again to remove it.
  const toggleStaple = async (staple) => {
    const existing = pantryByName.get(normalize(staple.name));
    if (existing) await deletePantryItem(existing.id);
    else await addPantryItem({ name: staple.name, category: staple.category, have: true });
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

      <section className="card p-4">
        <h2 className="font-display text-lg font-semibold mb-1">Quick add staples</h2>
        <p className="text-xs text-muted mb-2">
          Tap what you already have — tap again to remove it.
        </p>
        <div className="divide-y divide-hairline">
          {PANTRY_STAPLES.map(({ group, items }) => {
            const ownedCount = items.filter((i) => pantryByName.has(normalize(i.name))).length;
            const open = openGroup === group;
            return (
              <div key={group} className="py-2">
                <button
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => setOpenGroup(open ? null : group)}
                >
                  <span className="text-sm font-semibold">
                    {group}
                    {ownedCount > 0 && (
                      <span className="ml-2 text-[11px] font-medium bg-herb-soft text-herb px-1.5 py-0.5 rounded-full">
                        {ownedCount} ✓
                      </span>
                    )}
                  </span>
                  <span className="text-muted text-sm">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {items.map((staple) => {
                      const owned = pantryByName.has(normalize(staple.name));
                      return (
                        <button
                          key={staple.name}
                          onClick={() => toggleStaple(staple)}
                          className={`chip ${owned ? "chip-on" : "chip-off"}`}
                        >
                          {owned ? "✓ " : ""}{staple.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
