import Phaser from 'phaser';

const _htUrls = import.meta.glob<string>(
  '../../assets/high-tides/*.png',
  { query: '?url', import: 'default', eager: true },
);

export const HT_WAVE_FRAME_W = 80;
export const HT_WAVE_FRAME_H = 32;

function htUrl(name: string): string {
  return _htUrls[`../../assets/high-tides/${name}`] ?? '';
}

export function loadHtAssets(scene: Phaser.Scene): void {
  const waveUrl = htUrl('water_particles.png');
  if (waveUrl) scene.load.spritesheet('ht-water-particles', waveUrl, { frameWidth: HT_WAVE_FRAME_W, frameHeight: HT_WAVE_FRAME_H });
}
