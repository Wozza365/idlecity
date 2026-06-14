// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/boats/).
const _boatUrlMap = import.meta.glob<string>(
  '../../assets/boats/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getBoatUrl(key: string): string {
  return _boatUrlMap[`../../assets/boats/${key}.png`] ?? '';
}

export type BoatRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary';

export interface BoatDef {
  key: string;
  w: number;
  /** Hull height — used for spacing/lighting placement. */
  h: number;
  /** Full texture height, including any mast/funnel above the hull. */
  texH: number;
  rarity: BoatRarity;
  speed: number;       // base speed px/s
  canDock: boolean;
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
  { key: 'rowboat',        w: 60,  h: 20, texH:  20, rarity: 'common',    speed: 20,  canDock: false },
  { key: 'motorboat',      w: 100, h: 28, texH:  28, rarity: 'common',    speed: 62,  canDock: true  },
  { key: 'fishing_boat',   w: 84,  h: 30, texH:  44, rarity: 'common',    speed: 26,  canDock: true  },
  // uncommon
  { key: 'sailboat',       w: 80,  h: 26, texH:  68, rarity: 'uncommon',  speed: 32,  canDock: true  },
  { key: 'kayak',          w: 70,  h: 16, texH:  16, rarity: 'uncommon',  speed: 44,  canDock: false },
  { key: 'speedboat',      w: 108, h: 22, texH:  22, rarity: 'uncommon',  speed: 92,  canDock: false },
  // rare
  { key: 'tugboat',        w: 108, h: 36, texH:  64, rarity: 'rare',      speed: 36,  canDock: true  },
  { key: 'yacht',          w: 145, h: 35, texH:  92, rarity: 'rare',      speed: 44,  canDock: true  },
  { key: 'pedalo',         w: 70,  h: 28, texH:  28, rarity: 'rare',      speed: 14,  canDock: false },
  // very_rare
  { key: 'houseboat',      w: 144, h: 42, texH:  42, rarity: 'very_rare', speed: 16,  canDock: true  },
  { key: 'ferry',          w: 162, h: 36, texH:  36, rarity: 'very_rare', speed: 44,  canDock: true  },
  // legendary
  { key: 'container_ship', w: 210, h: 46, texH:  46, rarity: 'legendary', speed: 28,  canDock: false },
  { key: 'cruise_ship',    w: 340, h: 64, texH: 164, rarity: 'legendary', speed: 18,  canDock: false },
];

export const ALL_BOAT_KEYS: readonly string[] = BOAT_DEFS.map(d => d.key);

export function pickRandomBoat(): BoatDef {
  const totalWeight = BOAT_DEFS.reduce((sum, def) => sum + RARITY_WEIGHTS[def.rarity], 0);
  let r = Math.random() * totalWeight;
  for (const def of BOAT_DEFS) {
    r -= RARITY_WEIGHTS[def.rarity];
    if (r <= 0) return def;
  }
  return BOAT_DEFS[0];
}

// Transparent border added around every boat texture by
// generate-boat-textures.cjs so a dark outline can be drawn around the
// whole silhouette without clipping.
const TEX_PAD = 1;

/** Vertical origin (0–1) so the hull's centre stays anchored even when the
 *  texture extends upward for a mast or funnel. */
export function boatOriginY(def: BoatDef): number {
  const extraTop = def.texH - def.h;
  return (extraTop + TEX_PAD + def.h / 2) / (def.texH + TEX_PAD * 2);
}
