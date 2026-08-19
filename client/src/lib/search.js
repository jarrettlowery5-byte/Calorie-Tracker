// Recipe search that understands how people actually describe meals:
// "skillet meals", "one pot dinners", "crock pot", "quick chicken".

const NOISE = new Set([
  "meal", "meals", "recipe", "recipes", "dish", "dishes", "dinner", "dinners",
  "food", "idea", "ideas", "something", "for", "the", "a", "an", "and", "with",
  "my", "me", "some", "any", "make", "cook", "that", "of", "to", "in", "on",
]);

// A search term also matches these words in a recipe.
const SYNONYMS = {
  "one pot": ["one pot", "one-pot", "onepot", "instant pot", "crock pot", "slow cooker", "dutch oven", "stew", "chili", "soup", "casserole"],
  "one pan": ["one pan", "one-pan", "sheet pan", "sheet-pan", "skillet"],
  "sheet pan": ["sheet pan", "sheet-pan", "oven", "roast", "bake"],
  "crock pot": ["crock pot", "crockpot", "slow cooker", "slow-cooker"],
  "slow cooker": ["slow cooker", "crock pot", "crockpot"],
  "instant pot": ["instant pot", "pressure cooker", "instapot"],
  "pressure cooker": ["pressure cooker", "instant pot"],
  "air fryer": ["air fryer", "air-fryer", "airfryer"],
  skillet: ["skillet", "stove", "pan", "sear", "saute", "sauté", "stir-fry", "stir fry", "fry"],
  stovetop: ["stove", "skillet", "pan"],
  grill: ["grill", "grilled", "bbq", "barbecue"],
  oven: ["oven", "roast", "bake", "baked", "sheet pan"],
  quick: ["quick", "fast", "weeknight", "easy", "20 min", "30 min"],
  easy: ["easy", "quick", "simple", "weeknight"],
  healthy: ["healthy", "low-cal", "low cal", "light", "lean"],
  cheap: ["cheap", "budget", "affordable", "value"],
  budget: ["budget", "cheap", "affordable"],
  "meal prep": ["meal-prep", "meal prep", "batch", "leftovers", "make-ahead"],
  "high protein": ["high-protein", "high protein", "protein"],
  "low carb": ["low-carb", "low carb", "keto"],
  vegetarian: ["vegetarian", "veggie", "meatless"],
  pasta: ["pasta", "penne", "spaghetti", "noodle", "ziti", "macaroni"],
  chicken: ["chicken", "poultry"],
  beef: ["beef", "steak", "ground beef"],
  seafood: ["seafood", "fish", "salmon", "shrimp", "tilapia"],
  soup: ["soup", "stew", "chili", "chowder"],
};

// Longest keys first so "crock pot" wins over "pot".
const PHRASES = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);

export function recipeHaystack(recipe) {
  return [
    recipe.name,
    recipe.cuisine,
    recipe.appliance,
    recipe.method,
    ...(recipe.tags ?? []),
    ...(recipe.ingredients ?? []).map((i) => i.name),
    ...(recipe.sides ?? []).map((s) => s.name),
    recipe.cookTimeMin <= 30 ? "quick fast weeknight 30 min" : "",
  ]
    .join(" ")
    .toLowerCase();
}

// Split a query into groups of interchangeable terms; a recipe matches when
// every group hits somewhere in its text.
export function queryGroups(query) {
  let q = ` ${query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;
  const groups = [];

  for (const phrase of PHRASES) {
    if (phrase.includes(" ") && q.includes(` ${phrase} `)) {
      groups.push(SYNONYMS[phrase]);
      q = q.replace(` ${phrase} `, " ");
    }
  }

  for (const word of q.split(" ").filter(Boolean)) {
    if (NOISE.has(word)) continue;
    const singular = word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
    groups.push(SYNONYMS[word] ?? SYNONYMS[singular] ?? [singular]);
  }

  return groups;
}

export function matchesQuery(recipe, query) {
  if (!query.trim()) return true;
  const hay = recipeHaystack(recipe);
  return queryGroups(query).every((group) => group.some((term) => hay.includes(term)));
}

export const SEARCH_SUGGESTIONS = [
  "Skillet meals",
  "One pot meals",
  "Crock pot",
  "Air fryer",
  "Quick chicken",
  "Meal prep",
  "Vegetarian",
  "Budget",
];
