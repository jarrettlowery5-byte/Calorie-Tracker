import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// The Anthropic API key lives only here on the backend, read from process.env
// (loaded via dotenv in index.js). The browser never sees it — the frontend
// talks to /api/* and this module talks to Anthropic.
// Model: claude-sonnet-5 for recipe quality. If usage grows, claude-haiku-4-5
// is a cheaper alternative that still handles structured recipe output well.
const MODEL = "claude-sonnet-5";

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

function buildPrompt({ mealTypes, appliances, servings, remainingBudget, exclusions }) {
  const lines = [
    "Suggest 4 dinner recipes for a home cook planning a week of meals on a budget.",
    `Household servings: ${servings}.`,
    `Remaining weekly grocery budget: $${Number(remainingBudget).toFixed(2)} — keep each recipe's estimated cost modest so several recipes can fit within it.`,
  ];
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

export async function generateRecipes(params) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
    );
    err.status = 503;
    throw err;
  }
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

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

  // Defensive fallback: pull the text block, strip any code fences, and parse.
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
  const parsed = ResponseSchema.safeParse(JSON.parse(cleaned));
  if (!parsed.success) {
    const err = new Error("Model returned recipes in an unexpected format.");
    err.status = 502;
    throw err;
  }
  return parsed.data.recipes;
}
