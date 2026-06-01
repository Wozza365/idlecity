import Phaser from 'phaser';

export type BoatRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary';

export interface BoatDef {
  key: string;
  w: number;
  h: number;
  rarity: BoatRarity;
  speed: number;       // base speed px/s
  canDock: boolean;
  hullColor: number;
  accentColor: number;
  hasMast: boolean;
  hasHouse: boolean;   // has a cabin/wheelhouse drawn on deck
}

const RARITY_WEIGHTS: Record<BoatRarity, number> = {
  common:    40,
  uncommon:  28,
  rare:      18,
  very_rare:  9,
  legendary:  5,
};

export const BOAT_DEFS: readonly BoatDef[] = [
  // common
  { key: 'rowboat',        w: 20,  h:  7, rarity: 'common',    speed: 20,  canDock: false, hullColor: 0x8B5E3C, accentColor: 0xA0724E, hasMast: false, hasHouse: false },
  { key: 'motorboat',      w: 36,  h: 10, rarity: 'common',    speed: 62,  canDock: true,  hullColor: 0xEEEEDD, accentColor: 0x4488CC, hasMast: false, hasHouse: false },
  { key: 'fishing_boat',   w: 30,  h: 11, rarity: 'common',    speed: 26,  canDock: true,  hullColor: 0x3A5C7A, accentColor: 0xCC3333, hasMast: false, hasHouse: true  },
  // uncommon
  { key: 'sailboat',       w: 28,  h:  9, rarity: 'uncommon',  speed: 32,  canDock: true,  hullColor: 0xF5F5E8, accentColor: 0xCC8844, hasMast: true,  hasHouse: false },
  { key: 'kayak',          w: 22,  h:  5, rarity: 'uncommon',  speed: 44,  canDock: false, hullColor: 0xFF7744, accentColor: 0xFFAA22, hasMast: false, hasHouse: false },
  { key: 'speedboat',      w: 38,  h:  8, rarity: 'uncommon',  speed: 92,  canDock: false, hullColor: 0xCC2222, accentColor: 0xFFFFFF, hasMast: false, hasHouse: false },
  // rare
  { key: 'tugboat',        w: 40,  h: 14, rarity: 'rare',      speed: 36,  canDock: true,  hullColor: 0x222233, accentColor: 0xFF4400, hasMast: false, hasHouse: true  },
  { key: 'yacht',          w: 54,  h: 13, rarity: 'rare',      speed: 44,  canDock: true,  hullColor: 0xF8F8F2, accentColor: 0x888899, hasMast: true,  hasHouse: true  },
  { key: 'pedalo',         w: 22,  h: 10, rarity: 'rare',      speed: 14,  canDock: false, hullColor: 0xFFDD22, accentColor: 0xFF9900, hasMast: false, hasHouse: false },
  // very_rare
  { key: 'houseboat',      w: 60,  h: 18, rarity: 'very_rare', speed: 16,  canDock: true,  hullColor: 0x9B7A4A, accentColor: 0xC89A60, hasMast: false, hasHouse: true  },
  { key: 'ferry',          w: 68,  h: 16, rarity: 'very_rare', speed: 44,  canDock: true,  hullColor: 0xE2E2E2, accentColor: 0x3366AA, hasMast: false, hasHouse: true  },
  // legendary
  { key: 'container_ship', w: 88,  h: 20, rarity: 'legendary', speed: 28,  canDock: false, hullColor: 0x182838, accentColor: 0x3A88AA, hasMast: false, hasHouse: false },
];

export function pickRandomBoat(): BoatDef {
  const totalWeight = BOAT_DEFS.reduce((sum, def) => sum + RARITY_WEIGHTS[def.rarity], 0);
  let r = Math.random() * totalWeight;
  for (const def of BOAT_DEFS) {
    r -= RARITY_WEIGHTS[def.rarity];
    if (r <= 0) return def;
  }
  return BOAT_DEFS[0];
}

export function drawBoatShape(
  gfx: Phaser.GameObjects.Graphics,
  def: BoatDef,
  nightFactor: number,
): void {
  const { w, h, hullColor, accentColor, hasMast, hasHouse, key } = def;
  const hw = Math.floor(w / 2);
  const hh = Math.floor(h / 2);

  // Hull base — all boats share a basic pointed-bow hull shape
  gfx.fillStyle(hullColor, 1);
  gfx.fillRect(-hw, -hh, w - 4, h);

  // Bow (right/forward) triangular point
  gfx.fillTriangle(
    hw - 4, -hh,
    hw - 4, hh,
    hw + 2, 0,
  );

  // Dark waterline stripe along the bottom
  gfx.fillStyle(0x000000, 0.25);
  gfx.fillRect(-hw, hh - 2, w, 2);

  // Deck surface (slightly lighter/different)
  const deckColor = blendColor(hullColor, 0xFFFFFF, 0.12);
  gfx.fillStyle(deckColor, 1);
  gfx.fillRect(-hw + 2, -hh + 2, w - 8, h - 4);

  // Type-specific details
  switch (key) {
    case 'rowboat': {
      // Two oarlock dots on sides
      gfx.fillStyle(0x5A3A1A, 1);
      gfx.fillRect(-2, -hh, 4, 2);
      gfx.fillRect(-2, hh - 2, 4, 2);
      break;
    }
    case 'motorboat': {
      // Blue stripe
      gfx.fillStyle(accentColor, 1);
      gfx.fillRect(-hw + 2, -1, w - 6, 2);
      // Outboard motor at stern
      gfx.fillStyle(0x555555, 1);
      gfx.fillRect(-hw - 3, -3, 4, 6);
      break;
    }
    case 'fishing_boat': {
      // Cabin/wheelhouse
      gfx.fillStyle(accentColor, 0.9);
      gfx.fillRect(-6, -hh + 1, 14, h - 4);
      // Antenna
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, -hh - 6, 1, 6);
      break;
    }
    case 'sailboat': {
      // Mast and sail
      gfx.fillStyle(0x8B6914, 1);
      gfx.fillRect(-1, -hh - 18, 2, 18 + h);
      // Sail (white triangle)
      gfx.fillStyle(0xFFFFF0, 0.9);
      gfx.fillTriangle(-1, -hh - 17, -1, 0, hw - 6, -hh - 4);
      // Accent on hull
      gfx.fillStyle(accentColor, 0.8);
      gfx.fillRect(-hw + 2, hh - 3, w - 8, 2);
      break;
    }
    case 'kayak': {
      // Very thin, bright colored — hull already set; just add paddler dot
      gfx.fillStyle(0x222222, 0.6);
      gfx.fillCircle(0, 0, 3);
      gfx.fillStyle(accentColor, 0.7);
      gfx.fillRect(-hw + 1, -1, w - 2, 2);
      break;
    }
    case 'speedboat': {
      // Windscreen
      gfx.fillStyle(0x88CCFF, 0.5);
      gfx.fillRect(-4, -hh + 1, 12, 4);
      // Accent stripe
      gfx.fillStyle(accentColor, 1);
      gfx.fillRect(-hw + 2, hh - 3, w - 6, 2);
      gfx.fillRect(-hw + 2, -hh + 1, w - 6, 2);
      break;
    }
    case 'tugboat': {
      // Wheelhouse
      gfx.fillStyle(accentColor, 1);
      gfx.fillRect(-8, -hh + 1, 16, h - 2);
      // Funnel
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(-4, -hh - 8, 8, 8);
      gfx.fillStyle(accentColor, 1);
      gfx.fillRect(-4, -hh - 10, 8, 3);
      break;
    }
    case 'yacht': {
      // Sleek hull accent
      gfx.fillStyle(accentColor, 0.6);
      gfx.fillRect(-hw + 2, hh - 3, w - 8, 2);
      // Cabin
      gfx.fillStyle(0xF0F0EE, 1);
      gfx.fillRect(-10, -hh + 1, 22, h - 4);
      // Mast
      gfx.fillStyle(0xAA9966, 1);
      gfx.fillRect(-1, -hh - 22, 2, 22 + h);
      // Sail
      gfx.fillStyle(0xFFFFF8, 0.85);
      gfx.fillTriangle(-1, -hh - 21, -1, 2, hw - 4, -hh - 2);
      break;
    }
    case 'pedalo': {
      // Paddle wheel circles on sides
      gfx.fillStyle(accentColor, 0.9);
      gfx.fillCircle(-2, -hh, 5);
      gfx.fillCircle(-2, hh, 5);
      gfx.fillStyle(0xDD8800, 1);
      gfx.fillCircle(-2, -hh, 3);
      gfx.fillCircle(-2, hh, 3);
      // Awning
      gfx.fillStyle(accentColor, 0.7);
      gfx.fillRect(-hw + 4, -hh - 3, w - 12, 3);
      break;
    }
    case 'houseboat': {
      // House structure
      gfx.fillStyle(accentColor, 1);
      gfx.fillRect(-hw + 4, -hh + 1, w - 14, h - 2);
      // Roof line
      gfx.fillStyle(blendColor(accentColor, 0x000000, 0.3), 1);
      gfx.fillRect(-hw + 4, -hh + 1, w - 14, 3);
      // Windows
      gfx.fillStyle(0xFFEE99, nightFactor > 0.3 ? 0.9 : 0.4);
      for (let wx = -hw + 8; wx < hw - 8; wx += 10) {
        gfx.fillRect(wx, -hh + 4, 6, 5);
      }
      break;
    }
    case 'ferry': {
      // Double-deck body
      gfx.fillStyle(accentColor, 0.8);
      gfx.fillRect(-hw + 3, -hh + 1, w - 8, 5);
      // Window row
      gfx.fillStyle(0x88BBDD, 0.7);
      for (let wx = -hw + 6; wx < hw - 6; wx += 8) {
        gfx.fillRect(wx, -hh + 2, 5, 3);
      }
      // Lower row
      gfx.fillStyle(0xFFEECC, nightFactor > 0.3 ? 0.9 : 0.5);
      for (let wx = -hw + 6; wx < hw - 6; wx += 8) {
        gfx.fillRect(wx, hh - 5, 5, 3);
      }
      break;
    }
    case 'container_ship': {
      // Colourful shipping containers
      const containerColors = [0xFF4444, 0x44AA44, 0x4444FF, 0xFFAA22, 0xFF44AA, 0x44FFAA];
      const cw = 12;
      const ch = h - 6;
      let cx = -hw + 8;
      let ci = 0;
      while (cx + cw < hw - 4) {
        gfx.fillStyle(containerColors[ci % containerColors.length], 0.9);
        gfx.fillRect(cx, -hh + 2, cw - 1, ch);
        ci++;
        cx += cw;
      }
      // Wheelhouse at front-right
      gfx.fillStyle(0xCCCCCC, 1);
      gfx.fillRect(hw - 14, -hh + 1, 10, h - 4);
      break;
    }
  }

  // Navigation lights at night
  if (nightFactor > 0.05) {
    const alpha = nightFactor * 0.95;
    // Port (top = red)
    gfx.fillStyle(0xFF2222, alpha);
    gfx.fillCircle(-hw + 4, -hh + 2, 2);
    // Starboard (bottom = green)
    gfx.fillStyle(0x22FF44, alpha);
    gfx.fillCircle(-hw + 4, hh - 2, 2);
    // Masthead or stern white for larger boats
    if (hasMast || hasHouse || w >= 36) {
      gfx.fillStyle(0xFFFFFF, alpha * 0.7);
      gfx.fillCircle(hw - 4, 0, 2);
    }
  }
}

function blendColor(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8)  & 0xff) * (1 - t) + ((b >> 8)  & 0xff) * t);
  const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}
