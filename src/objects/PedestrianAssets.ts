// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/people/).
const _personUrlMap = import.meta.glob<string>(
  '../../assets/people/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getPersonUrl(key: string): string {
  return _personUrlMap[`../../assets/people/${key}.png`] ?? '';
}

export interface PersonDef {
  key: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

// 4-frame walk cycles cropped from Pixel Frog's "Pixel Adventure 1" character
// set (free for any project, pixelfrog-assets.itch.io/pixel-adventure-1).
export const PERSON_DEFS: readonly PersonDef[] = [
  { key: 'pink',   frameWidth: 23, frameHeight: 27, frameCount: 4 },
  { key: 'blue',   frameWidth: 24, frameHeight: 26, frameCount: 4 },
  { key: 'orange', frameWidth: 26, frameHeight: 30, frameCount: 4 },
  { key: 'green',  frameWidth: 25, frameHeight: 26, frameCount: 4 },
];

export const ALL_PERSON_KEYS: readonly string[] = PERSON_DEFS.map(d => d.key);

export function pickRandomPerson(): PersonDef {
  return PERSON_DEFS[Math.floor(Math.random() * PERSON_DEFS.length)];
}

export function walkAnimKey(personKey: string): string {
  return `walk_${personKey}`;
}
