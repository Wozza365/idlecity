// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/water-structures/).
const _waterStructureUrlMap = import.meta.glob<string>(
  '../../assets/water-structures/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getWaterStructureUrl(key: string): string {
  return _waterStructureUrlMap[`../../assets/water-structures/${key}.png`] ?? '';
}

export const WATER_STRUCTURE_KEYS: readonly string[] = ['pier', 'cafe', 'lifeguard-hut'];

export const PIER_KEY = 'pier';
export const CAFE_KEY = 'cafe';
export const HUT_KEY  = 'lifeguard-hut';

// Pier: 26x35. Deck top sits at (wy + BEACH_SHORE_H - 10); anchor (px, wy)
// maps to texture (13, -37).
export const PIER_ORIGIN_X = 13 / 26;
export const PIER_ORIGIN_Y = -37 / 35;

// Beach café: 80x31. cafeY = wy + 2, roof starts at (cx - 2, cafeY - 5);
// anchor (cx, wy) maps to texture (2, 3).
export const CAFE_ORIGIN_X = 2 / 80;
export const CAFE_ORIGIN_Y = 3 / 31;

// Lifeguard hut: 40x42. hutY = wy + 5, hut body at (hx, hutY); anchor
// (hx, wy) maps to texture (1, 9).
export const HUT_ORIGIN_X = 1 / 40;
export const HUT_ORIGIN_Y = 9 / 42;
