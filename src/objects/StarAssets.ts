// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/stars/).
const _starUrlMap = import.meta.glob<string>(
  '../../assets/stars/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getStarUrl(key: string): string {
  return _starUrlMap[`../../assets/stars/${key}.png`] ?? '';
}

// Soft white radial-glow texture — recoloured at runtime via setTint()
// (cream for the static star field, white for shooting-star segments).
export const STAR_KEY = 'star';

// The bright core's radius in the texture, in px — setScale(desiredRadius /
// STAR_CORE_R) renders the core at `desiredRadius` px, with the glow halo
// scaling proportionally.
export const STAR_CORE_R = 3;
