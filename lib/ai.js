const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-4-8';

// Lazy so the server still boots (and everything but AI works) without a key.
let client = null;
function getClient() {
  if (!client) {
    try {
      client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
    } catch (err) {
      const e = new Error('AI estimation needs ANTHROPIC_API_KEY set on the server.');
      e.code = 'NO_API_KEY';
      throw e;
    }
  }
  return client;
}

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short food name including portion, e.g. "Ribeye steak (12 oz)"' },
          calories: { type: 'number' },
          protein: { type: 'number', description: 'grams' },
          carbs: { type: 'number', description: 'grams' },
          fat: { type: 'number', description: 'grams' },
        },
        required: ['name', 'calories', 'protein', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'One short sentence on assumptions made (portion size, preparation).' },
  },
  required: ['items', 'notes'],
  additionalProperties: false,
};

const EXERCISE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short activity name including duration, e.g. "Running, 30 min"' },
    calories_burned: { type: 'number' },
    notes: { type: 'string', description: 'One short sentence on assumptions (intensity, duration).' },
  },
  required: ['name', 'calories_burned', 'notes'],
  additionalProperties: false,
};

function parseStructured(response) {
  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined this request.');
  }
  const block = response.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Empty model response.');
  return JSON.parse(block.text);
}

// Estimate nutrition from a text description and/or a meal photo.
// image: { data: <base64>, media_type: 'image/jpeg' | 'image/png' | ... }
async function estimateFood({ description, image }) {
  const content = [];
  if (image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.media_type, data: image.data },
    });
  }
  content.push({
    type: 'text',
    text: image
      ? `Estimate the nutrition of the meal in this photo${description ? ` (context: ${description})` : ''}. Break it into distinct food items with realistic portion sizes.`
      : `Estimate the nutrition for: ${description}`,
  });

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system:
      'You are a nutrition estimator for a personal calorie tracker. Give your single best ' +
      'estimate of calories and macros (grams of protein, carbs, fat) using standard USDA-style ' +
      'nutrition data. When portion size is ambiguous, assume a typical serving and say so in ' +
      'notes. Never return zero for everything; always commit to a realistic estimate.',
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: FOOD_SCHEMA } },
  });

  return parseStructured(response);
}

// Estimate calories burned for an exercise description, using body weight.
async function estimateExercise({ description, weightLbs }) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system:
      'You estimate calories burned from exercise for a calorie tracker. Use MET values and the ' +
      "user's body weight. Estimate NET calories burned (above resting) for the described " +
      'activity and duration. If duration is missing, assume 30 minutes and say so in notes.',
    messages: [
      {
        role: 'user',
        content: `Body weight: ${Math.round(weightLbs)} lbs.\nActivity: ${description}`,
      },
    ],
    output_config: { format: { type: 'json_schema', schema: EXERCISE_SCHEMA } },
  });

  return parseStructured(response);
}

module.exports = { estimateFood, estimateExercise };
