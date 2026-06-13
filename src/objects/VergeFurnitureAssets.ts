// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/furniture/).
const _furnitureUrlMap = import.meta.glob<string>(
  '../../assets/furniture/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getFurnitureUrl(key: string): string {
  return _furnitureUrlMap[`../../assets/furniture/${key}.png`] ?? '';
}

export const FURNITURE_KEYS: readonly string[] = ['bench', 'lamp_default', 'lamp_ornate', 'bollard'];

// Bench: 30x15, anchored at the seat's front-top-centre.
export const BENCH_ORIGIN_X = 0.5;
export const BENCH_ORIGIN_Y = 6 / 15;

// Lamp posts (lamp_default / lamp_ornate): 14x19, anchored at the pole's
// base-centre (sits on the cycle-lane edge).
export const LAMP_ORIGIN_X = 2 / 14;
export const LAMP_ORIGIN_Y = 1;

// Bollard: 4x5, anchored at the pole's base-centre.
export const BOLLARD_ORIGIN_X = 0.5;
export const BOLLARD_ORIGIN_Y = 1;
