import type Phaser from 'phaser';
import type { Road } from '../objects/Road';
import type { VergeRiver } from '../objects/VergeRiver';
import type { WaterArea } from '../objects/WaterArea';

// ── Sky ──────────────────────────────────────────────────────────────────────
// Sky.updateGradient() lerps between 6 colour "stops" keyed to sun elevation.
// Only the stop endpoints are themed — the elevation thresholds, lerp-t formulas,
// and seasonal/weather tint logic stay in Sky.ts unchanged.
export interface SkyPalette {
  night:      readonly [zenith: number, horizon: number]; // elev <= -0.15
  preDawn:    readonly [zenith: number, horizon: number]; // elev == -0.02
  sunrise:    readonly [zenith: number, horizon: number]; // elev == 0.05
  goldenHour: readonly [zenith: number, horizon: number]; // elev == 0.10
  morning:    readonly [zenith: number, horizon: number]; // elev == 0.25
  day:        readonly [zenith: number, horizon: number]; // elev >= 0.50
}

// ── Road ─────────────────────────────────────────────────────────────────────
export interface RoadPalette {
  dirtBase: number;                 // level 1-2 base
  dirtSpecks: readonly number[];    // scattered pebble/clod colours
  cobbleBase: number;               // level 3-4 base
  cobbleTracks: number;             // tyre-compacted tracks
  cobbleChips: readonly number[];   // crushed-stone chip colours
  asphalt: number;                  // level 5-9 base
  asphaltLines: number;             // lane-marking lines
  divider: number;                  // centre divider (level 8+)
  highway: number;                  // level 10 base
  highwayLines: number;             // highway centre line markings
}

// ── Verge ────────────────────────────────────────────────────────────────────
export interface VergePalette {
  grassBase: number;
  grassAlt: number;
  dirtBase: number;                  // level-0 bare dirt
  treeTrunk: number;
  treeCanopy: readonly number[];
  flowerColors: readonly number[];
  benchWood: number;
  benchMetal: number;
  pavingBase: number;
  pavingLine: number;
  cyclePathBase: number;
  bollardColor: number;
  cyclistColors: readonly number[];
}

// ── Water ────────────────────────────────────────────────────────────────────
export interface WaterPalette {
  waterTop: number; waterBot: number;
  sand: number; sandWet: number;
  rockBase: number; rockMid: number; rockLight: number; rockWet: number;
  mossGreen: number; mossDark: number;
  dockWood: number; pierWood: number;
  towelColors: readonly number[];
}

// ── Buildings ────────────────────────────────────────────────────────────────
// Each of the 7 building tiers (+ EmptyPlot) gets its OWN BuildingPalette —
// tiers currently look very different from one another (e.g. Tier1House's cream
// walls vs. Tier4Skyscraper's near-black curtain wall), so a single shared
// palette would change every tier's look. The *shape* below is shared so every
// tier is driven by the same semantic slots, while each tier's Classic values
// equal that tier's current literals (zero visual regression). Slots a given
// tier doesn't use are filled with a harmless placeholder (commented in
// ClassicTheme.ts). Tonal variants (highlights/shadows currently expressed as
// separate literals) derive via the existing lerpColor(base, white|black, t)
// helper instead of new slots.
export interface BuildingPalette {
  wall: number; wallShade: number;
  roof: number; roofShade: number;
  foundation: number;
  trim: number;            // window frames, corner boards, rake trim
  door: number; doorAccent: number;
  windowFrame: number; windowGlassDay: number; windowGlassDayAlt: number;
  chimney: number;
  yardGround: number;      // front-yard lawn/paving
  yardAccent: number;      // hedges, mow-stripe, flowerbed soil
  fence: number;
  glass: number; glassShade: number; // curtain-wall glass (tier4 etc.)
  accents: readonly number[];        // flowers, signage, misc small details
}

export type BuildingTierKey =
  | 'tier1' | 'twoStorey' | 'townhouse' | 'smallApartment'
  | 'largeApartment' | 'officeBlock' | 'tier4Skyscraper' | 'emptyPlot';

export type BuildingPalettes = Record<BuildingTierKey, BuildingPalette>;

export type BuildingFactory = (
  scene: Phaser.Scene, x: number, plotWidth: number, groundY: number,
  level: number, palette: BuildingPalette, params: ThemeParams, savedParticles?: object[],
) => Phaser.GameObjects.Container;

// ── Aggregate palette + gameplay params ─────────────────────────────────────
export interface ThemePalette {
  sky: SkyPalette;
  road: RoadPalette;
  verge: VergePalette;
  water: WaterPalette;
  building: BuildingPalettes;
}

export interface ThemeParams {
  carSpeedMultiplier: number;        // default 1 — scales CarManager velocities
  pedestrianSpeedMultiplier: number; // default 1 — scales PedestrianManager speeds
  ambientLightColor: number;         // default 0x888888 — LightingSystem ambient
  lampColor: number;                 // street lamps / porch lights
  windowGlowColor: number;           // night window-glow light colour
}

// ── Sparse override hooks (unused by Classic; escape hatch for future themes) ──
export interface ThemeOverrides {
  buildings?: Partial<Record<BuildingTierKey, BuildingFactory>>;
  road?: new (scene: Phaser.Scene) => Road;
  verge?: new (scene: Phaser.Scene) => VergeRiver;
  water?: new (scene: Phaser.Scene) => WaterArea;
  carSpriteKeys?: readonly string[];
}

export interface ThemeDefinition {
  id: number;          // 0 = Classic
  name: string;
  emoji: string;
  palette: ThemePalette;
  params: ThemeParams;
  /** Unused for Classic; future per-theme escape hatch for bespoke renderers. */
  overrides?: ThemeOverrides;
  /** Unused for Classic; future image-asset manifest. */
  assets?: { key: string; url: string }[];
}
