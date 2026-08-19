import { useState } from "react";
import { STORES, EXCLUSION_PRESETS, IS_LOCAL } from "../api";
import { getStoredApiKey, setStoredApiKey } from "../local/generate";
import { useApp } from "../store";

export default function SettingsSheet({ onClose }) {
  const { settings, updateSettings } = useApp();
  const [budget, setBudget] = useState(String(settings.budget));
  const [servings, setServings] = useState(String(settings.servings));
  const [defaultStore, setDefaultStore] = useState(settings.defaultStore);
  const [exclusions, setExclusions] = useState(settings.dietaryExclusions);
  const [freeText, setFreeText] = useState("");
  const [apiKey, setApiKey] = useState(() => (IS_LOCAL ? getStoredApiKey() : ""));
  const [saving, setSaving] = useState(false);

  const toggleExclusion = (ex) =>
    setExclusions((prev) =>
      prev.includes(ex) ? prev.filter((e) => e !== ex) : [...prev, ex]
    );

  const addFreeText = () => {
    const val = freeText.trim().toLowerCase();
    if (val && !exclusions.includes(val)) setExclusions((prev) => [...prev, val]);
    setFreeText("");
  };

  const save = async () => {
    setSaving(true);
    try {
      if (IS_LOCAL) setStoredApiKey(apiKey);
      await updateSettings({
        budget: Math.max(0, parseFloat(budget) || 0),
        servings: Math.max(1, parseInt(servings, 10) || 1),
        defaultStore,
        dietaryExclusions: exclusions,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-ink/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="bg-paper w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-semibold mb-4">Household settings</h2>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-sm text-muted font-medium">Weekly budget ($)</span>
            <input
              type="number" min="0" step="5" inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-hairline bg-white px-3 py-2.5"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted font-medium">Servings</span>
            <input
              type="number" min="1" step="1" inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-hairline bg-white px-3 py-2.5"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </label>
        </div>

        <label className="block mb-4">
          <span className="text-sm text-muted font-medium">Default store</span>
          <select
            className="mt-1 w-full rounded-xl border border-hairline bg-white px-3 py-2.5"
            value={defaultStore}
            onChange={(e) => setDefaultStore(e.target.value)}
          >
            {STORES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>

        <div className="mb-4">
          <span className="text-sm text-muted font-medium">
            Dietary exclusions <span className="font-normal">(hard filter on suggestions)</span>
          </span>
          <div className="flex flex-wrap gap-2 mt-2">
            {[...new Set([...EXCLUSION_PRESETS, ...exclusions])].map((ex) => (
              <button
                key={ex}
                onClick={() => toggleExclusion(ex)}
                className={`chip ${exclusions.includes(ex) ? "bg-tomato/10 border-tomato text-tomato" : "chip-off"}`}
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              className="flex-1 rounded-xl border border-hairline bg-white px-3 py-2 text-sm"
              placeholder="Add allergy or dislike…"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFreeText()}
            />
            <button className="btn-ghost" onClick={addFreeText}>Add</button>
          </div>
        </div>

        {IS_LOCAL && (
          <label className="block mb-4">
            <span className="text-sm text-muted font-medium">Anthropic API key (for ✨ Suggest)</span>
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm"
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="block text-[11px] text-muted mt-1">
              Stored only on this device and sent only to Anthropic. Get a key at
              console.anthropic.com — everything except Suggest works without one.
            </span>
          </label>
        )}

        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
