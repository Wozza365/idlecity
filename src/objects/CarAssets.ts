// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/cars/).
const _carUrlMap = import.meta.glob<string>(
  '../../assets/cars/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getCarUrl(key: string): string {
  return _carUrlMap[`../../assets/cars/${key}.png`] ?? '';
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary';

export interface CarDef {
  key: string;
  w: number;
  h: number;
  rarity: Rarity;
}

const RARITY_WEIGHTS: Record<Rarity, number> = {
  common:    45,
  uncommon:  30,
  rare:      15,
  very_rare:  7,
  legendary:  3,
};

export const CAR_DEFS: readonly CarDef[] = [
  // common — everyday cars you see constantly
  { key: 'sedan',              w:  29, h: 13, rarity: 'common'    },
  { key: 'sedan_blue',         w:  29, h: 13, rarity: 'common'    },
  { key: 'rounded_green',      w:  32, h: 13, rarity: 'common'    },
  { key: 'rounded_red',        w:  31, h: 12, rarity: 'common'    },
  { key: 'rounded_yellow',     w:  33, h: 11, rarity: 'common'    },
  { key: 'suv',                w:  31, h: 15, rarity: 'common'    },
  { key: 'suv_closed',         w:  28, h: 15, rarity: 'common'    },
  { key: 'taxi',               w:  33, h: 14, rarity: 'common'    },
  { key: 'van_small',          w:  31, h: 16, rarity: 'common'    },
  { key: 'station',            w:  34, h: 13, rarity: 'common'    },

  // uncommon — less frequent but unremarkable
  { key: 'suv_green',          w:  30, h: 15, rarity: 'uncommon'  },
  { key: 'suv_travel',         w:  32, h: 16, rarity: 'uncommon'  },
  { key: 'suv_large',          w:  33, h: 15, rarity: 'uncommon'  },
  { key: 'convertible',        w:  32, h: 13, rarity: 'uncommon'  },
  { key: 'sports_red',         w:  33, h: 12, rarity: 'uncommon'  },
  { key: 'sports_green',       w:  29, h: 11, rarity: 'uncommon'  },
  { key: 'sports_yellow',      w:  33, h: 11, rarity: 'uncommon'  },
  { key: 'sports_convertible', w:  33, h: 11, rarity: 'uncommon'  },
  { key: 'van',                w:  33, h: 17, rarity: 'uncommon'  },
  { key: 'police',             w:  33, h: 14, rarity: 'uncommon'  },
  { key: 'vintage',            w:  36, h: 12, rarity: 'uncommon'  },

  // rare — you notice when you see one
  { key: 'bus',                w:  45, h: 21, rarity: 'rare'      },
  { key: 'bus_school',         w:  46, h: 21, rarity: 'rare'      },
  { key: 'ambulance',          w:  38, h: 21, rarity: 'rare'      },
  { key: 'firetruck',          w:  44, h: 21, rarity: 'rare'      },
  { key: 'truck',              w:  59, h: 24, rarity: 'rare'      },
  { key: 'truckdelivery',      w:  44, h: 24, rarity: 'rare'      },
  { key: 'truckcabin',         w:  39, h: 24, rarity: 'rare'      },
  { key: 'transport',          w:  35, h: 17, rarity: 'rare'      },
  { key: 'van_flat',           w:  37, h: 17, rarity: 'rare'      },
  { key: 'van_large',          w:  35, h: 19, rarity: 'rare'      },
  { key: 'sedan_vintage',      w:  36, h: 13, rarity: 'rare'      },

  // very_rare — turns heads
  { key: 'tractor',            w:  24, h: 18, rarity: 'very_rare' },
  { key: 'towtruck',           w:  45, h: 20, rarity: 'very_rare' },
  { key: 'truckdark',          w:  37, h: 21, rarity: 'very_rare' },
  { key: 'truckcabin_vintage', w:  30, h: 20, rarity: 'very_rare' },
  { key: 'trucktank',          w:  65, h: 24, rarity: 'very_rare' },
  { key: 'riot',               w:  40, h: 21, rarity: 'very_rare' },
  { key: 'suv_military',       w:  28, h: 14, rarity: 'very_rare' },
  { key: 'sports_race',        w:  34, h: 12, rarity: 'very_rare' },
  { key: 'kart',               w:  22, h:  8, rarity: 'very_rare' },
  { key: 'buggy',              w:  23, h: 14, rarity: 'very_rare' },
  { key: 'cycle',              w:  16, h: 10, rarity: 'very_rare' },
  { key: 'cycle_low',          w:  16, h:  8, rarity: 'very_rare' },
  { key: 'scooter',            w:  15, h:  9, rarity: 'very_rare' },

  // legendary — once-in-a-lifetime sighting
  { key: 'hotdog',             w:  40, h: 29, rarity: 'legendary' },
  { key: 'formula',            w:  33, h:  9, rarity: 'legendary' },
  { key: 'vendor',             w:  38, h: 22, rarity: 'legendary' },
];

const TOTAL_WEIGHT = CAR_DEFS.reduce((s, d) => s + RARITY_WEIGHTS[d.rarity], 0);

export function pickRandomCar(): CarDef {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const def of CAR_DEFS) {
    r -= RARITY_WEIGHTS[def.rarity];
    if (r <= 0) return def;
  }
  return CAR_DEFS[0];
}

export const ALL_CAR_KEYS: readonly string[] = [...new Set(CAR_DEFS.map(d => d.key))];
