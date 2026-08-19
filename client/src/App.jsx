import { useState } from "react";
import { useApp } from "./store";
import BudgetMeter from "./components/BudgetMeter";
import RecipesView from "./components/RecipesView";
import PlanView from "./components/PlanView";
import GroceryView from "./components/GroceryView";
import PantryView from "./components/PantryView";
import SettingsSheet from "./components/SettingsSheet";

const TABS = [
  { id: "recipes", label: "Recipes", icon: "🍳" },
  { id: "plan", label: "Plan", icon: "🗓️" },
  { id: "grocery", label: "Grocery", icon: "🛒" },
  { id: "pantry", label: "Pantry", icon: "🧺" },
];

export default function App() {
  const { loading, toast, plan } = useApp();
  const [tab, setTab] = useState("recipes");
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-display text-2xl text-herb">The Weekly</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 max-w-2xl mx-auto">
      <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur border-b border-hairline">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <h1 className="font-display font-semibold text-2xl tracking-tight">
            The Weekly
          </h1>
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-9 h-9 rounded-full border border-hairline bg-white flex items-center justify-center text-lg"
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
        <BudgetMeter />
      </header>

      <main className="px-4 pt-4">
        {tab === "recipes" && <RecipesView />}
        {tab === "plan" && <PlanView />}
        {tab === "grocery" && <GroceryView />}
        {tab === "pantry" && <PantryView />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-hairline">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-xs font-medium ${
                tab === t.id ? "text-herb" : "text-muted"
              }`}
            >
              <span className="text-xl leading-none relative">
                {t.icon}
                {t.id === "plan" && plan.length > 0 && (
                  <span className="absolute -top-1 -right-2 bg-herb text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {plan.length}
                  </span>
                )}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

      {toast && (
        <div className="fixed bottom-20 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div className="bg-ink text-paper text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
