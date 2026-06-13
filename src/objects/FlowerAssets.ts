// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/flowers/).
const _flowerUrlMap = import.meta.glob<string>(
  '../../assets/flowers/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getFlowerUrl(key: string): string {
  return _flowerUrlMap[`../../assets/flowers/${key}.png`] ?? '';
}

// Small flower blooms rendered in neutral grey/white tones so they can be
// recoloured at runtime via setTint() with any palette colour.
export const FLOWER_KEYS: readonly string[] = ['flower_a', 'flower_b', 'flower_c'];
