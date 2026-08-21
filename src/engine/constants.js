/** Rules constants: costs, the development-card deck, and player colours. */

export const BUILD_COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
};

/** Pieces each player starts with. */
export const PIECE_LIMITS = { road: 15, settlement: 5, city: 4 };

export const DEV_CARDS = {
  knight: { id: 'knight', label: 'Knight', description: 'Move the robber and steal a card. Three knights claim Largest Army.' },
  roadBuilding: { id: 'roadBuilding', label: 'Road Building', description: 'Build two roads for free.' },
  yearOfPlenty: { id: 'yearOfPlenty', label: 'Year of Plenty', description: 'Take any two resources from the bank.' },
  monopoly: { id: 'monopoly', label: 'Monopoly', description: 'Name a resource; every other player hands you all of theirs.' },
  victoryPoint: { id: 'victoryPoint', label: 'Victory Point', description: 'Worth 1 victory point. Kept hidden until you win.' },
};

/** Base game deck: 14 knights, 5 VP, 2 of each progress card = 25 cards. */
export const BASE_DEV_DECK = { knight: 14, victoryPoint: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2 };
/**
 * 5-6 player deck: 20 knights, 6 VP, 3 of each progress card = 35 cards.
 *
 * UNVERIFIED: we could not reach an official component list for the base-game
 * 5-6 extension while building this, so these counts are a proportional
 * extrapolation of the base deck rather than a confirmed transcription. The
 * ratios match the base deck closely (56% knights, 17% VP), so play feel is
 * right even if a count is off by one. Correct it here if you have the box.
 */
export const EXTENSION_DEV_DECK = { knight: 20, victoryPoint: 6, roadBuilding: 3, yearOfPlenty: 3, monopoly: 3 };

/** How many of each resource the bank holds. */
export const BANK_SIZE = { base: 19, extension: 24 };

export const PLAYER_COLORS = [
  { id: 'red', hex: '#d8483f', name: 'Red' },
  { id: 'blue', hex: '#3f7fd8', name: 'Blue' },
  { id: 'white', hex: '#e8e4da', name: 'White' },
  { id: 'orange', hex: '#e08c2a', name: 'Orange' },
  { id: 'green', hex: '#3f9d5c', name: 'Green' },
  { id: 'brown', hex: '#8a5a34', name: 'Brown' },
];

export const DEFAULT_VICTORY_POINTS = 10;
/** Hand size above which a 7 forces a discard. */
export const DISCARD_THRESHOLD = 7;
/** Roads needed before Longest Road can be claimed. */
export const LONGEST_ROAD_MIN = 5;
/** Knights needed before Largest Army can be claimed. */
export const LARGEST_ARMY_MIN = 3;
