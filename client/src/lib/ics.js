import { DAYS } from "../api";

// Build a .ics calendar for the upcoming week: one dinner event per assigned
// meal, prep reminders the night before for long cooks / frozen proteins,
// and a shopping reminder listing the still-to-buy groceries.

function nextDateFor(dayLabel) {
  const target = DAYS.indexOf(dayLabel); // 0 = Mon
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7; // JS Sunday=0 → Monday=0
  let delta = target - todayIdx;
  if (delta < 0) delta += 7;
  const d = new Date(now);
  d.setDate(now.getDate() + delta);
  return d;
}

function fmt(d, hour, minute = 0) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}${pad(minute)}00`;
}

function escapeText(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function vevent({ uid, start, end, summary, description }) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@the-weekly`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function buildIcs({ plan, settings, grocery }) {
  const events = [];
  let uid = 1;

  for (const entry of plan) {
    if (!entry.dayOfWeek || !entry.recipe) continue;
    const date = nextDateFor(entry.dayOfWeek);
    const recipe = entry.recipe;

    events.push(
      vevent({
        uid: uid++,
        start: fmt(date, 18),
        end: fmt(date, 19),
        summary: `Dinner: ${recipe.name}`,
        description: `${recipe.method}\nCook time: ${recipe.cookTimeMin} min · ${recipe.appliance}`,
      })
    );

    // Prep reminder the evening before for long cooks or frozen proteins.
    const usesProtein = recipe.ingredients.some((i) => i.category === "Meat & Seafood");
    if (recipe.cookTimeMin >= 120 || usesProtein) {
      const prev = new Date(date);
      prev.setDate(date.getDate() - 1);
      const what =
        recipe.cookTimeMin >= 120
          ? `Prep for ${recipe.name} — it needs ${Math.round(recipe.cookTimeMin / 60)}+ hours tomorrow (${recipe.appliance}).`
          : `Thaw protein for ${recipe.name} tonight.`;
      events.push(
        vevent({
          uid: uid++,
          start: fmt(prev, 20),
          end: fmt(prev, 20, 15),
          summary: `Prep: ${recipe.name}`,
          description: what,
        })
      );
    }
  }

  const toBuy = (grocery?.items ?? []).filter((i) => !i.acquired);
  if (toBuy.length) {
    const shopDay = new Date();
    shopDay.setDate(shopDay.getDate() + 1);
    events.push(
      vevent({
        uid: uid++,
        start: fmt(shopDay, 9),
        end: fmt(shopDay, 10),
        summary: `Grocery run — ${toBuy.length} items (~$${grocery.totals.stillToBuy.toFixed(2)})`,
        description: toBuy.map((i) => `${i.displayName} (${i.store})`).join("\n"),
      })
    );
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Weekly//Meal Plan//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(content) {
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "the-weekly.ics";
  a.click();
  URL.revokeObjectURL(url);
}

// Plain-text grocery list formatted for pasting into Walmart delivery search
// (one item per line) with a summary header.
export function groceryListText(grocery, { forWalmart = false } = {}) {
  const toBuy = (grocery?.items ?? []).filter((i) => !i.acquired);
  if (forWalmart) {
    return toBuy.map((i) => i.displayName).join("\n");
  }
  const lines = [`The Weekly — grocery list (est. $${grocery.totals.stillToBuy.toFixed(2)} to buy)`];
  const byStore = {};
  for (const item of toBuy) {
    (byStore[item.store] ??= []).push(item);
  }
  for (const [store, items] of Object.entries(byStore)) {
    lines.push("", `— ${store} —`);
    for (const item of items) {
      lines.push(`[ ] ${item.displayName}${item.quantities.length ? ` (${item.quantities.join(" + ")})` : ""} — $${item.cost.toFixed(2)}`);
    }
  }
  return lines.join("\n");
}
