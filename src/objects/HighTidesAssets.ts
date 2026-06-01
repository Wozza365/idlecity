import Phaser from 'phaser';

const _htUrls = import.meta.glob<string>(
  '../../assets/high-tides/*.png',
  { query: '?url', import: 'default', eager: true },
);

export const HT_WAVE_FRAME_W = 80;
export const HT_WAVE_FRAME_H = 32;

// Land_to_Sea_Transitions.png: 400×144, 6 columns × 2 rows (2 anim frames).
// Column 0 = sand terrain; rows = animation frame 0/1.
// 16px dark border at top/bottom of each 72px row — we skip it and crop 32px of content.
// Frame 0 (row 0): sand (7px) → foam line at local y=7 → water
// Frame 1 (row 1): 1px sand → water (water appears higher = "lapping" effect)
export const HT_LAND_SEA_TILE_W  = 66;   // approx tile width (400 / 6 ≈ 66.67)
export const HT_LAND_SEA_CROP_Y0 = 16;   // skip top border in source row 0
export const HT_LAND_SEA_CROP_Y1 = 88;   // skip top border in source row 1 (72 + 16)
export const HT_LAND_SEA_CROP_H  = 32;   // height of each frame crop
export const HT_LAND_SEA_FOAM_Y  = 7;    // local y of foam/edge within frame 0

function htUrl(name: string): string {
  return _htUrls[`../../assets/high-tides/${name}`] ?? '';
}

export function loadHtAssets(scene: Phaser.Scene): void {
  const waveUrl = htUrl('water_particles.png');
  if (waveUrl) scene.load.spritesheet('ht-water-particles', waveUrl, { frameWidth: HT_WAVE_FRAME_W, frameHeight: HT_WAVE_FRAME_H });

  const landSeaUrl = htUrl('land_to_sea.png');
  if (landSeaUrl) scene.load.image('ht-land-sea', landSeaUrl);
}
