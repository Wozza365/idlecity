// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/cyclists/).
const _cyclistUrlMap = import.meta.glob<string>(
  '../../assets/cyclists/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getCyclistUrl(key: string): string {
  return _cyclistUrlMap[`../../assets/cyclists/${key}.png`] ?? '';
}

// 2-frame pedalling sprite sheets, one per verge.cyclistColors jersey colour.
export const CYCLIST_FRAME_WIDTH  = 26;
export const CYCLIST_FRAME_HEIGHT = 24;
export const CYCLIST_FRAME_COUNT  = 2;

// Wheel row (cycle-lane midline) as a fraction of frame height — use as the
// sprite's vertical origin so the wheels sit on the path.
export const CYCLIST_ORIGIN_Y = 18 / 24;

export const CYCLIST_KEYS: readonly string[] = [
  'cyclist_0', 'cyclist_1', 'cyclist_2', 'cyclist_3', 'cyclist_4', 'cyclist_5',
];

export function cyclistAnimKey(key: string): string {
  return `pedal_${key}`;
}
