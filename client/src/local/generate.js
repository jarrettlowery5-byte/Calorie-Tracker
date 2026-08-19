// Local (GitHub Pages) mode: there is no backend to hold the API key, so the
// browser calls Anthropic directly with a key the user pastes into Settings.
// The key is stored only in this device's localStorage and sent only to
// api.anthropic.com. This is a personal-app trade-off — the hosted server
// version (server/lib/generate.js) keeps the key fully private instead.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// claude-sonnet-5 for recipe quality; claude-haiku-4-5 is a cheaper
// alternative if usage grows.
const MODEL = "claude-sonnet-5";
const KEY_STORAGE = "the-weekly-apikey";

export function getStoredApiKey() {
  return localStorage.getItem(KEY_STORAGE) || "";
}

export function setStoredApiKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  category: z.enum([
    "Produce",
    "Meat & Seafood",
    "Dairy & Eggs",
    "Bakery",
    "Frozen",
    "Pantry",
    "Spices",
    "Other",
  ]),
  estCost: z.number(),
});

const SideSchema = z.object({
  name: z.string(),
  note: z.string(),
  estCost: z.number(),
  caloriesPerServing: z.number(),
  ingredients: z.array(IngredientSchema),
});

const RecipeSchema = z.object({
  name: z.string(),
  cuisine: z.string(),
  tags: z.array(z.string()),
  servings: z.number(),
  caloriesPerServing: z.number(),
  proteinPerServing: z.number(),
  estimatedCost: z.number(),
  cookTimeMin: z.number(),
  appliance: z.string(),
  method: z.string(),
  ingredients: z.array(IngredientSchema),
  sides: z.array(SideSchema),
});

const ResponseSchema = z.object({
  recipes: z.array(RecipeSchema),
});

const StepSchema = z.object({
  text: z.string(),
  minutes: z.number(),
});

const StepsResponseSchema = z.object({
  prep: z.array(z.string()),
  steps: z.array(StepSchema),
  sides: z.array(z.object({ name: z.string(), steps: z.array(StepSchema) })),
  tips: z.array(z.string()),
});

function buildStepsPrompt({ recipe, servings, includedSides = [] }) {
  const lines = [
    `Write clear step-by-step cooking instructions for "${recipe.name}" (${recipe.cuisine}).`,
    `Cooking for ${servings} servings. Main appliance: ${recipe.appliance}. Total time: about ${recipe.cookTimeMin} minutes.`,
    `Summary of the dish: ${recipe.method}`,
    "",
    "Ingredients (quantities are for the stated servings):",
    ...recipe.ingredients.map((i) => `- ${i.name}: ${i.quantity}`),
  ];
  if (includedSides.length) {
    lines.push("", "Also give separate instructions for these sides being served with it:");
    for (const side of includedSides) {
      lines.push(
        `- ${side.name} (${side.note}) — ingredients: ${
          side.ingredients.map((i) => `${i.name} ${i.quantity}`).join(", ") || "cook's choice"
        }`
      );
    }
  }
  lines.push(
    "",
    "Rules:",
    "- prep: 1-4 short things to do before cooking starts (chop, preheat, pat dry, marinate).",
    "- steps: 4-9 numbered steps for the main dish, in order. One action per step, written for a home cook.",
    "  Each step names the specific ingredients and amounts it uses, plus temperatures, pan sizes, and doneness cues",
    "  (e.g. 'until golden and 165°F inside'). minutes = roughly how long that step takes (0 if instant).",
    "- sides: instructions for each side listed above, timed so everything finishes together. Empty array if no sides.",
    "- tips: 1-3 short practical notes (make-ahead, substitutions, leftovers, common mistake to avoid).",
    "- Do not restate the ingredient list as a step. Be specific, not generic."
  );
  return lines.join("\n");
}

export async function generateStepsInBrowser({ recipe, servings, includedSides }) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("Add your Anthropic API key in Settings (⚙️) first.");
  }
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system:
      "You are an experienced home cook writing recipe instructions that are easy to follow while standing at the stove. Return data exactly matching the requested schema.",
    messages: [{ role: "user", content: buildStepsPrompt({ recipe, servings, includedSides }) }],
    output_config: { format: zodOutputFormat(StepsResponseSchema, "instructions") },
  });

  if (response.parsed_output) return response.parsed_output;

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
  const parsed = StepsResponseSchema.safeParse(JSON.parse(cleaned));
  if (!parsed.success) {
    throw new Error("The instructions came back in an unexpected format — try again.");
  }
  return parsed.data;
}

function buildPrompt({ mealTypes, appliances, servings, remainingBudget, exclusions, query }) {
  const lines = [
    "Suggest 4 dinner recipes for a home cook planning a week of meals on a budget.",
    `Household servings: ${servings}.`,
    `Remaining weekly grocery budget: $${Number(remainingBudget).toFixed(2)} — keep each recipe's estimated cost modest so several recipes can fit within it.`,
  ];
  if (query) {
    lines.push(
      `The cook is searching for: "${query}". Every suggestion must fit that description.`
    );
  }
  if (mealTypes?.length) {
    lines.push(`Preferred meal styles (match these): ${mealTypes.join(", ")}.`);
  }
  if (appliances?.length) {
    lines.push(
      `Available appliances: ${appliances.join(", ")}. Strongly prefer recipes cooked with these appliances; set each recipe's "appliance" field to one of them.`
    );
  }
  if (exclusions?.length) {
    lines.push(
      `HARD dietary exclusions — never include these ingredients or anything derived from them, in mains OR sides: ${exclusions.join(", ")}.`
    );
  }
  lines.push(
    "Rules:",
    "- 5-7 ingredients per recipe, each with a realistic USD price for Walmart/Aldi.",
    "- Each recipe includes 2-3 recommended sides, each with its own note (why it pairs / how to make it in one line), estimated cost, calories per serving, and 1-4 ingredients with prices.",
    "- estimatedCost is the sum of the recipe's ingredient costs. Prices are estimates a shopper will correct over time — keep them realistic, not padded.",
    "- method is one concise sentence.",
    "- cookTimeMin is total time including prep.",
    "- tags should reuse the requested meal styles where they apply."
  );
  return lines.join("\n");
}

export async function generateRecipesInBrowser(params) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("Add your Anthropic API key in Settings (⚙️) first.");
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system:
      "You are a practical meal-planning assistant for a budget-conscious household. Return recipe data exactly matching the requested schema.",
    messages: [{ role: "user", content: buildPrompt(params) }],
    output_config: { format: zodOutputFormat(ResponseSchema, "recipes") },
  });

  if (response.parsed_output) {
    return response.parsed_output.recipes;
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
  const parsed = ResponseSchema.safeParse(JSON.parse(cleaned));
  if (!parsed.success) {
    throw new Error("The model returned recipes in an unexpected format — try again.");
  }
  return parsed.data.recipes;
}

// ---- importing an existing recipe (from a link, or text the user typed) ----

const ImportedRecipeSchema = RecipeSchema.extend({
  sourceName: z.string(),
  instructions: z.object({
    prep: z.array(z.string()),
    steps: z.array(StepSchema),
    tips: z.array(z.string()),
  }),
});

const ImportResponseSchema = z.object({ recipe: ImportedRecipeSchema });

function buildImportPrompt({ text, url, servings, fromPhotos }) {
  return [
    fromPhotos
      ? "The attached photo(s) show a recipe — a recipe card, a cookbook page, a handwritten note, or a screenshot. Read every part of it, including handwriting, and extract the recipe. If several photos are given they are pages of the SAME recipe, so combine them."
      : url
      ? `Below is the text of a recipe web page (${url}). Extract the recipe from it, ignoring navigation, ads, comments, and any life story around it.`
      : "Below is a recipe someone wrote down. Structure it.",
    `Scale the ingredient quantities to ${servings} servings and set "servings" to ${servings}.`,
    "",
    "Rules:",
    '- sourceName: the site or cookbook it came from, or "" if unknown.',
    "- ingredients: every ingredient needed, each with a realistic USD price for Walmart/Aldi in estCost",
    "  (this is what drives the grocery list and budget, so never leave prices at 0).",
    "- estimatedCost: the sum of the ingredient costs.",
    "- caloriesPerServing / proteinPerServing: your best estimate if the source doesn't say.",
    "- appliance: the main appliance used (Stove, Oven, Air fryer, Instant Pot, Crock pot, Grill, Microwave).",
    "- tags: short descriptors that fit (e.g. High-protein, Quick, Comfort, Italian, Vegetarian).",
    "- method: one concise sentence describing the dish.",
    "- sides: leave as an empty array unless the source explicitly includes side dishes.",
    "- instructions.prep: 1-4 things to do before cooking starts.",
    "- instructions.steps: the cooking steps in order, one action each, keeping the source's specifics",
    "  (temperatures, times, doneness cues). minutes = roughly how long that step takes.",
    "- instructions.tips: up to 3 short notes from the source worth keeping.",
    '- If the text is not a recipe at all, return a recipe named "NOT_A_RECIPE" with empty arrays.',
    '- If the photos are unreadable or are not a recipe, return a recipe named "NOT_A_RECIPE" with empty arrays.',
    ...(text ? ["", "--- SOURCE TEXT ---", text.slice(0, 60000)] : []),
  ].join("\n");
}

function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

// A page on another domain can't be fetched directly from the browser, so we
// go through public reader/proxy services. They're tried in order and the
// first one that returns usable text wins; if all fail the UI falls back to
// asking the cook to paste the recipe text.
const READERS = [
  { url: (u) => `https://r.jina.ai/${u}`, parse: (t) => t },
  { url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, parse: htmlToText },
  { url: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`, parse: htmlToText },
];

export async function fetchRecipePageInBrowser(url) {
  const failures = [];
  for (const reader of READERS) {
    try {
      const res = await fetch(reader.url(url), { redirect: "follow" });
      if (!res.ok) {
        failures.push(`${res.status}`);
        continue;
      }
      const text = reader.parse(await res.text());
      if (text && text.length > 400) return text;
      failures.push("too short");
    } catch (err) {
      failures.push(err.message);
    }
  }
  throw new Error(
    "Couldn't read that page from your browser (some sites block it). Paste the recipe text instead — that always works."
  );
}

export async function importRecipeInBrowser({ text, url, images, servings }) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("Add your Anthropic API key in Settings (⚙️) first.");
  }
  const fromPhotos = images?.length > 0;
  const source = fromPhotos ? text : text || (await fetchRecipePageInBrowser(url));
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // Photos go in as image blocks before the instructions, so Claude reads the
  // card first and then knows what to do with it.
  const content = [
    ...(images ?? []).map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.media_type, data: img.data },
    })),
    { type: "text", text: buildImportPrompt({ text: source, url, servings, fromPhotos }) },
  ];

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system:
      "You extract recipes into structured data. Keep the source's actual quantities and steps — do not invent a different dish.",
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(ImportResponseSchema, "recipe") },
  });

  let recipe = response.parsed_output?.recipe;
  if (!recipe) {
    const raw = response.content.find((b) => b.type === "text")?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
    const parsed = ImportResponseSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) throw new Error("Couldn't read a recipe out of that.");
    recipe = parsed.data.recipe;
  }
  if (recipe.name === "NOT_A_RECIPE" || !recipe.ingredients?.length) {
    throw new Error(
      fromPhotos
        ? "Couldn't read a recipe in that photo. Try again with the card filling the frame, in good light and in focus."
        : "That didn't look like a recipe — try pasting the recipe text instead."
    );
  }
  return recipe;
}
