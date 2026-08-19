async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  health: () => request("/health"),

  getSettings: () => request("/settings"),
  updateSettings: (patch) => request("/settings", { method: "PUT", body: patch }),

  getRecipes: () => request("/recipes"),
  patchRecipe: (id, patch) => request(`/recipes/${id}`, { method: "PATCH", body: patch }),
  deleteRecipe: (id) => request(`/recipes/${id}`, { method: "DELETE" }),
  generateRecipes: (params) =>
    request("/recipes/generate", { method: "POST", body: params }),

  getPlan: () => request("/plan"),
  addToPlan: (recipeId) => request("/plan", { method: "POST", body: { recipeId } }),
  patchPlanEntry: (id, patch) => request(`/plan/${id}`, { method: "PATCH", body: patch }),
  removePlanEntry: (id) => request(`/plan/${id}`, { method: "DELETE" }),

  getPantry: () => request("/pantry"),
  addPantryItem: (item) => request("/pantry", { method: "POST", body: item }),
  patchPantryItem: (id, patch) => request(`/pantry/${id}`, { method: "PATCH", body: patch }),
  deletePantryItem: (id) => request(`/pantry/${id}`, { method: "DELETE" }),

  getGroceryList: () => request("/grocery-list"),
  setItemStore: (ingredientName, store) =>
    request("/grocery-list/store", { method: "PUT", body: { ingredientName, store } }),
  setItemChecked: (ingredientName, acquired) =>
    request("/grocery-list/check", { method: "PUT", body: { ingredientName, acquired } }),
  savePrice: (ingredientName, store, price) =>
    request("/prices", { method: "PUT", body: { ingredientName, store, price } }),
};

export const STORES = ["Walmart", "Aldi", "Trader Joe's", "Publix", "Kroger"];

export const MEAL_TYPES = [
  "High-protein",
  "Low-cal",
  "Asian",
  "Mexican",
  "Comfort",
  "Italian",
  "Mediterranean",
  "Vegetarian",
  "Quick",
  "Kid-friendly",
  "Meal-prep",
  "Budget",
];

export const APPLIANCES = [
  "Stove",
  "Oven",
  "Air fryer",
  "Instant Pot",
  "Crock pot",
  "Grill",
  "Pizza oven",
  "Microwave",
];

export const EXCLUSION_PRESETS = [
  "no pork",
  "no shellfish",
  "no beef",
  "gluten-free",
  "dairy-free",
  "no nuts",
];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
