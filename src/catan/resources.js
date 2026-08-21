/** Terrain / resource definitions shared by the generator, renderer and rules engine. */

export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

/**
 * Terrain types.  `resource` is what the hex produces (null for non-producing
 * terrain).  `gold` produces a resource of the owner's choice, so it has no
 * single resource of its own.
 */
export const TERRAIN = {
  wood: { id: 'wood', terrain: 'Forest', resource: 'wood', label: 'Wood', color: '#2f6b34', text: '#eaf7ea' },
  brick: { id: 'brick', terrain: 'Hills', resource: 'brick', label: 'Brick', color: '#b4552d', text: '#fff1e8' },
  sheep: { id: 'sheep', terrain: 'Pasture', resource: 'sheep', label: 'Sheep', color: '#8fc44f', text: '#22330f' },
  wheat: { id: 'wheat', terrain: 'Fields', resource: 'wheat', label: 'Wheat', color: '#d4a72c', text: '#33280a' },
  ore: { id: 'ore', terrain: 'Mountains', resource: 'ore', label: 'Ore', color: '#7c8794', text: '#f2f5f8' },
  desert: { id: 'desert', terrain: 'Desert', resource: null, label: 'Desert', color: '#ddc9a0', text: '#5a4a2a' },
  // Gold sits next to Fields on the board, so it is deliberately much paler
  // than wheat and gets its own bright rim (see BoardSvg) to stay distinct.
  gold: { id: 'gold', terrain: 'Gold Field', resource: null, label: 'Gold', color: '#ffe27a', text: '#4a3500', rim: '#fff6cf' },
  sea: { id: 'sea', terrain: 'Sea', resource: null, label: 'Sea', color: '#2b6ea8', text: '#dcecf8' },
};

/** Hex types that a settlement can actually be built next to / that hold numbers. */
export const isLand = (type) => type !== 'sea';
export const producesResource = (type) => RESOURCES.includes(type);

export const RESOURCE_LABEL = {
  wood: 'Wood', brick: 'Brick', sheep: 'Sheep', wheat: 'Wheat', ore: 'Ore',
};

export const RESOURCE_ICON = {
  wood: '🌲', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛰️',
};

/** Harbor (port) types: 3:1 generic plus one 2:1 per resource. */
export const HARBOR_TYPES = ['generic', ...RESOURCES];

export const harborLabel = (type) => (type === 'generic' ? '3:1' : `2:1 ${RESOURCE_LABEL[type]}`);
export const harborRatio = (type) => (type === 'generic' ? 3 : 2);
