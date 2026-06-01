import Phaser from 'phaser';

const _htUrls = import.meta.glob<string>(
  '../../assets/high-tides/*.png',
  { query: '?url', import: 'default', eager: true },
);

export const HT_CHAR_FRAME_W = 48;
export const HT_CHAR_FRAME_H = 48;
export const HT_WAVE_FRAME_W = 80;
export const HT_WAVE_FRAME_H = 32;

export const HT_CHAR_KEYS = ['ht-adrien', 'ht-ruby', 'ht-sunny', 'ht-trip'] as const;
export type HtCharKey = typeof HT_CHAR_KEYS[number];

function htUrl(name: string): string {
  return _htUrls[`../../assets/high-tides/${name}`] ?? '';
}

export function loadHtAssets(scene: Phaser.Scene): void {
  for (const [key, file] of [
    ['ht-adrien', 'adrien.png'],
    ['ht-ruby',   'ruby.png'],
    ['ht-sunny',  'sunny.png'],
    ['ht-trip',   'trip.png'],
  ] as [string, string][]) {
    const url = htUrl(file);
    if (url) scene.load.spritesheet(key, url, { frameWidth: HT_CHAR_FRAME_W, frameHeight: HT_CHAR_FRAME_H });
  }

  const waveUrl = htUrl('water_particles.png');
  if (waveUrl) scene.load.spritesheet('ht-water-particles', waveUrl, { frameWidth: HT_WAVE_FRAME_W, frameHeight: HT_WAVE_FRAME_H });
}
