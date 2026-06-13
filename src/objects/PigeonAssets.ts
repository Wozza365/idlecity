// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/pigeons/).
const _pigeonUrlMap = import.meta.glob<string>(
  '../../assets/pigeons/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getPigeonUrl(key: string): string {
  return _pigeonUrlMap[`../../assets/pigeons/${key}.png`] ?? '';
}

// 6-frame sprite sheet (16x16 each), drawn facing right — flip via setFlipX
// for the opposite facing. Colours are baked in full and recoloured for
// night via setTint(lerpColor(0xffffff, NIGHT_TINT, nightFactor)).
export const PIGEON_KEY          = 'pigeon';
export const PIGEON_FRAME_WIDTH  = 16;
export const PIGEON_FRAME_HEIGHT = 16;

// Local canvas point (8, 13) maps to the pigeon's logical (x, y) — its
// centreline and ground-contact row — so position the sprite at (p.x, p.y).
export const PIGEON_ORIGIN_X = 8 / 16;
export const PIGEON_ORIGIN_Y = 13 / 16;

export const PIGEON_FRAME_IDLE   = 0;
export const PIGEON_FRAME_PECK   = 1;
export const PIGEON_FRAME_WALK_A = 2;
export const PIGEON_FRAME_WALK_B = 3;
export const PIGEON_FRAME_FLEE_A = 4;
export const PIGEON_FRAME_FLEE_B = 5;
