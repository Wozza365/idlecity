// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/birds/).
const _birdUrlMap = import.meta.glob<string>(
  '../../assets/birds/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getBirdUrl(key: string): string {
  return _birdUrlMap[`../../assets/birds/${key}.png`] ?? '';
}

// Tiny 2-frame flapping bird silhouette for distant flocks.
export const BIRD_KEY = 'bird';

export const BIRD_FRAME_WIDTH  = 16;
export const BIRD_FRAME_HEIGHT = 13;

// Body/head point — the apex where both wings converge — as a fraction of
// the frame size. Set as the sprite's origin so positioning/flipping match
// the flight-direction "tip" used by the original Graphics path.
export const BIRD_ORIGIN_X = 13 / 16;
export const BIRD_ORIGIN_Y = 6 / 13;

export const BIRD_FRAME_SPREAD = 0; // wings spread wide (up-stroke)
export const BIRD_FRAME_TUCKED = 1; // wings tucked close to body (down-stroke)
