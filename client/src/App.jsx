import { useEffect, useRef } from "react";
import { useApp } from "./store";
import BudgetMeter from "./components/BudgetMeter";
import Icon from "./components/Icon";
import HomeView from "./components/HomeView";
import RecipesView from "./components/RecipesView";
import ImportView from "./components/ImportView";
import PlanView from "./components/PlanView";
import GroceryView from "./components/GroceryView";
import CookView from "./components/CookView";
import PantryView from "./components/PantryView";
import SettingsSheet from "./components/SettingsSheet";
import { useState } from "react";

// Primary sections. `bar: true` puts it in the phone's bottom nav; every
// section shows in the wider top nav and is reachable from Home.
const SECTIONS = [
  { id: "home", label: "Home", icon: "home", bar: true },
  { id: "recipes", label: "Recipes", icon: "book", bar: true },
  { id: "plan", label: "Plan", icon: "calendar", bar: true },
  { id: "grocery", label: "Shop", icon: "cart", bar: true },
  { id: "cook", label: "Cook", icon: "chef", bar: true },
  { id: "import", label: "Import", icon: "plus" },
  { id: "pantry", label: "Pantry", icon: "basket" },
];

const VIEWS = {
  home: HomeView,
  recipes: RecipesView,
  import: ImportView,
  plan: PlanView,
  grocery: GroceryView,
  cook: CookView,
  pantry: PantryView,
};

export default function App() {
  const { loading, toast, plan, grocery, tab, go } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mainRef = useRef(null);

  // Moving between sections should feel like opening a new page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-herb text-white grid place-items-center font-display text-2xl font-semibold">
          A
        </div>
        <p className="font-display text-xl text-muted">Appetite</p>
      </div>
    );
  }

  const View = VIEWS[tab] ?? HomeView;
  const toBuy = grocery?.items?.filter((i) => !i.acquired).length ?? 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur-md border-b border-hairline">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <button onClick={() => go("home")} className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-herb text-white grid place-items-center font-display text-lg font-semibold">
                A
              </span>
              <span className="font-display font-semibold text-xl tracking-tight">Appetite</span>
            </button>

            <nav className="hidden md:flex items-center gap-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => go(s.id)}
                  className={`navpill ${tab === s.id ? "navpill-on" : "navpill-off"}`}
                >
                  {s.label}
                </button>
              ))}
            </nav>

            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full border border-hairline bg-white grid place-items-center text-muted hover:text-ink hover:border-herb/40 transition-colors"
              aria-label="Settings"
            >
              <Icon name="gear" className="w-[18px] h-[18px]" />
            </button>
          </div>
          <BudgetMeter />
        </div>
      </header>

      <main ref={mainRef} className="max-w-3xl mx-auto px-4 pt-5 pb-28 md:pb-12">
        <View />
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-hairline safe-bottom">
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {SECTIONS.filter((s) => s.bar).map((s) => {
            const active = tab === s.id;
            const badge =
              s.id === "plan" ? plan.length : s.id === "grocery" ? toBuy : 0;
            return (
              <button
                key={s.id}
                onClick={() => go(s.id)}
                className={`py-2 flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-herb" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon name={s.icon} className="w-[22px] h-[22px]" strokeWidth={active ? 2 : 1.6} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-herb text-white text-[10px] leading-none rounded-full min-w-[15px] h-[15px] px-1 grid place-items-center">
                      {badge}
                    </span>
                  )}
                </span>
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

      {toast && (
        <div className="fixed bottom-24 md:bottom-8 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div className="bg-ink text-paper text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg animate-[fadeIn_150ms_ease-out]">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
