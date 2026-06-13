// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/water-structures/).
const _waterStructureUrlMap = import.meta.glob<string>(
  '../../assets/water-structures/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getWaterStructureUrl(key: string): string {
  return _waterStructureUrlMap[`../../assets/water-structures/${key}.png`] ?? '';
}

export const WATER_STRUCTURE_KEYS: readonly string[] = [
  'pier', 'cafe', 'lifeguard-hut',
  'lighthouse', 'dock-plank', 'dock-post', 'dock-bollard', 'buoy-red', 'buoy-orange',
];

export const PIER_KEY = 'pier';
export const CAFE_KEY = 'cafe';
export const HUT_KEY  = 'lifeguard-hut';

// Pier: 26x35. Deck top sits at (wy + BEACH_SHORE_H - 10); anchor (px, wy)
// maps to texture (13, -37).
export const PIER_ORIGIN_X = 13 / 26;
export const PIER_ORIGIN_Y = -37 / 35;

// Beach café: 80x31. cafeY = wy + 2, roof starts at (cx - 2, cafeY - 5);
// anchor (cx, wy) maps to texture (2, 3).
export const CAFE_ORIGIN_X = 2 / 80;
export const CAFE_ORIGIN_Y = 3 / 31;

// Lifeguard hut: 40x42. hutY = wy + 5, hut body at (hx, hutY); anchor
// (hx, wy) maps to texture (1, 9).
export const HUT_ORIGIN_X = 1 / 40;
export const HUT_ORIGIN_Y = 9 / 42;

// Lighthouse tower: 24x74. Tex-y 25 is the tower-body top (where the gallery
// sits), tex-y 69 is the tower-body base (44px below, matching the old
// LH_TOWER_H), and tex-y 69-74 is the foundation slab. Anchor (lx, topY)
// maps to texture (12, 25).
export const LIGHTHOUSE_KEY      = 'lighthouse';
export const LIGHTHOUSE_ORIGIN_X = 12 / 24;
export const LIGHTHOUSE_ORIGIN_Y = 25 / 74;

// Dock deck plank: 16x48, tiled horizontally via TileSprite to fill dockW.
// Height matches BEACH_SHORE_H (the deck's vertical extent from wy).
export const DOCK_PLANK_KEY = 'dock-plank';

// Dock post/piling: 4x24 (14px visible wood + 10px submerged). origin (0.5, 0)
// anchors the top-centre to the deck underside (x, deckEnd).
export const DOCK_POST_KEY      = 'dock-post';
export const DOCK_POST_ORIGIN_X = 0.5;
export const DOCK_POST_ORIGIN_Y = 0;

// Dock bollard: 8x8. origin (0.5, 1) anchors the bottom-centre to the deck
// top surface (x, wy).
export const DOCK_BOLLARD_KEY      = 'dock-bollard';
export const DOCK_BOLLARD_ORIGIN_X = 0.5;
export const DOCK_BOLLARD_ORIGIN_Y = 1;

// Buoys: 12x20, red and orange variants. origin (0.5, 0.45): tex-y 0 (lantern)
// lands at world (by - 9), matching the old night-glow position.
export const BUOY_RED_KEY    = 'buoy-red';
export const BUOY_ORANGE_KEY = 'buoy-orange';
export const BUOY_ORIGIN_X   = 0.5;
export const BUOY_ORIGIN_Y   = 0.45;
