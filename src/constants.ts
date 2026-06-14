// ── Balance tuning ────────────────────────────────────────────────────────────
// Single knob for overall income pace — applies to buildings and all area upgrades.
export const BASE_INCOME_MULTIPLIER = 1;

// ── Numeric constants ─────────────────────────────────────────────────────────

export const PLOT_COUNT = 5;
export const PLOT_BASE_HEIGHT = 60;
export const HEIGHT_PER_LEVEL = 6;
export const MAX_LEVEL = 100;
export const UI_HEIGHT = 276;
export const STATS_BAR_H = 68;
export const ROAD_BAR_H = 76;
export const ROAD_H = 72;
export const ROAD_DIVIDER_H = 4;
export const VERGE_H = 60;
export const MAX_VERGE_LEVEL = 15;
export const RIVER_H = 48;
export const WATER_H = 200;
export const MAX_WATER_LEVEL = 12;
export const YARD_H = 20;
export const MAX_ROAD_LEVEL = 10;

// ── Skins ──────────────────────────────────────────────────────────────────────
export const TOTAL_SKINS = 24;

export const UNLOCK_COSTS: readonly number[] = [0, 50_000, 250_000, 1_500_000, 10_000_000];

// ── Pure helper functions ─────────────────────────────────────────────────────

// Exp-poly cost curve, per building: BASE[i] × exp(K[i] × (L-1)^1.2)
// BASE[i] is the cost of the FIRST upgrade after a plot is unlocked. It now scales
// with that plot's unlock fee (roughly 4-8% of it) so newly-unlocked plots feel like
// a real continuation of the spend rather than dropping to a near-free upgrade.
// BASE[0]=200 is unchanged — gives ~8s for the first upgrade on the starter plot.
// K[i] is reduced slightly for higher-index buildings so each still tops out around
// the same ~$5-6B at level 99 despite its higher starting cost.
const BUILDING_BASE_COST: readonly number[]   = [200, 4_000, 16_000, 80_000, 400_000];
const BUILDING_GROWTH_RATE: readonly number[] = [0.0695, 0.0575, 0.0520, 0.0457, 0.0393];

export function upgradeCost(level: number, buildingIndex: number = 0): number {
  return Math.round(
    BUILDING_BASE_COST[buildingIndex] * Math.exp(BUILDING_GROWTH_RATE[buildingIndex] * Math.pow(level - 1, 1.2)),
  );
}

export function buildingHeight(level: number): number {
  if (level <= 15) return PLOT_BASE_HEIGHT;
  if (level <= 25) return PLOT_BASE_HEIGHT + 15 * HEIGHT_PER_LEVEL;
  if (level <= 40) return PLOT_BASE_HEIGHT + 25 * HEIGHT_PER_LEVEL;
  if (level <= 55) return PLOT_BASE_HEIGHT + 40 * HEIGHT_PER_LEVEL;
  if (level <= 70) return PLOT_BASE_HEIGHT + 55 * HEIGHT_PER_LEVEL;
  if (level <= 85) return PLOT_BASE_HEIGHT + 70 * HEIGHT_PER_LEVEL;
  return PLOT_BASE_HEIGHT + 85 * HEIGHT_PER_LEVEL;
}

// Exp-poly income curve: 5 × exp(0.06 × (L-1)^1.1) — starts at $50/hr, accelerates into endgame.
// ki=0.06, ei=1.1 keeps early income modest so area upgrades matter early;
// buildings dominate by level 70+ as intended.
// All values in internal units (displayed $/hr = value × GAME_HOUR_FACTOR).
export function perBuildingIncome(level: number): number {
  return 5 * Math.exp(0.06 * Math.pow(Math.max(0, level - 1), 1.1)) * BASE_INCOME_MULTIPLIER;
}

// Area income: quadratic per level so each upgrade is meaningfully more than the last.
// Fewer levels than buildings → each level carries greater weight per step.
export function roadIncome(level: number): number {
  return BASE_INCOME_MULTIPLIER * level * level * 0.6;
}
export function vergeIncome(level: number): number {
  return BASE_INCOME_MULTIPLIER * level * level * 0.4;
}
export function waterIncome(level: number): number {
  return BASE_INCOME_MULTIPLIER * level * level * 0.52;
}

// Road / verge / water upgrade costs use an exponential curve (base × e^(k·level)) so
// each tier becomes a serious investment — fully maxing each track now costs roughly
// $7M, up from tens of thousands previously, putting them on a similar scale to
// mid-to-late-game building upgrades.
export function roadUpgradeCost(level: number): number {
  if (level === 0) return 5_000;
  return Math.round(2_000 * Math.exp(0.85 * level));
}

export function waterUpgradeCost(level: number): number {
  if (level === 0) return 5_000;
  return Math.round(2_000 * Math.exp(0.6789 * level));
}

export function waterTierName(level: number): string {
  if (level === 0) return 'Open Water';
  if (level <= 2)  return 'Coastal';
  if (level <= 4)  return 'Sandy Cove';
  if (level <= 6)  return 'Harbour';
  if (level <= 8)  return 'Marina';
  if (level <= 10) return 'Resort';
  return 'Grand Marina';
}

export function vergeUpgradeCost(level: number): number {
  if (level === 0) return 3_000;
  return Math.round(2_000 * Math.exp(0.5224 * level));
}

export function vergeTierName(level: number): string {
  if (level === 0) return 'Bare Dirt';
  if (level <= 2)  return 'Grass Strip';
  if (level <= 4)  return 'Garden';
  if (level <= 6)  return 'Park Verge';
  if (level <= 8)  return 'Cycle Lane';
  if (level <= 11) return 'Boulevard';
  if (level <= 14) return 'Grand Blvd';
  return 'Premium';
}

export function lerpColor(a: number, b: number, t: number): number {
  const r  = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g  = Math.round(((a >> 8)  & 0xff) * (1 - t) + ((b >> 8)  & 0xff) * t);
  const bl = Math.round( (a        & 0xff) * (1 - t) +  (b        & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Component-wise multiply of two colours (each channel /255) — used to
 *  combine a per-instance tint (e.g. a flower's petal colour) with a
 *  global tint (e.g. night darkening) into a single Phaser tint value. */
export function multiplyColor(a: number, b: number): number {
  const r  = Math.round(((a >> 16) & 0xff) * ((b >> 16) & 0xff) / 255);
  const g  = Math.round(((a >> 8)  & 0xff) * ((b >> 8)  & 0xff) / 255);
  const bl = Math.round( (a        & 0xff) * ( b        & 0xff) / 255);
  return (r << 16) | (g << 8) | bl;
}

export function sunColorAtElevation(elev: number): number {
  const t = Math.max(0, Math.min(1, elev));
  if (t < 0.20) return lerpColor(0xff3300, 0xffaa33, t / 0.20);
  if (t < 0.50) return lerpColor(0xffaa33, 0xffe066, (t - 0.20) / 0.30);
  return lerpColor(0xffe066, 0xfff8e0, (t - 0.50) / 0.50);
}

export const UI_FONT = 'Inter, sans-serif';
export const MONO_FONT = "'Roboto Mono', monospace";

// 240_000 ms real = 24 game hours → 1 game hour = 10 real seconds = 10× the per-second rate
export const GAME_HOUR_FACTOR = 10;

export function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtRate(n: number): string {
  const v = (Math.round(n * 100) / 100).toFixed(2);
  const [int, dec] = v.split('.');
  return '$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

export function fmtBalance(n: number): string {
  const v = Math.floor(n);
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  return '$' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Population ────────────────────────────────────────────────────────────────
// Single knob for population scale — mirrors BASE_INCOME_MULTIPLIER's pattern.
export const POPULATION_CAPACITY_MULTIPLIER = 1;

// Exp-poly capacity curve per plot: 0 if locked/unbuilt, else 10 × exp(0.125 × (L-1)^1.06).
// Smoothly continuous across building tiers, same shape family as perBuildingIncome.
// At level 100 this is ~120M per plot — 5 maxed plots reach ~600M total (megacity scale).
export function plotPopulationCapacity(level: number): number {
  if (level <= 0) return 0;
  return 10 * Math.exp(0.125 * Math.pow(level - 1, 1.06)) * POPULATION_CAPACITY_MULTIPLIER;
}

// Base rate: at road/verge/water = 0, closes ~63% of the population gap every 3 hours.
export const POPULATION_BASE_RATE = 1 / (3 * 3600); // ≈ 9.26e-5 / sec

// Road/verge/water act as pure growth-rate multipliers — they never add to
// capacity directly. Each track's max level contributes +0.40 to the multiplier,
// so maxing all three roughly doubles the base rate (multiplier ≈ 2.2).
export function populationGrowthRate(roadLevel: number, vergeLevel: number, waterLevel: number): number {
  const multiplier = 1
    + roadLevel  * 0.04     // max road  (10) -> +0.40
    + vergeLevel * 0.02667  // max verge (15) -> +0.40
    + waterLevel * 0.0333;  // max water (12) -> +0.40
  return POPULATION_BASE_RATE * multiplier;
}

// Formatter for population counts (no "$" prefix, unlike fmtBalance). Shows as
// much precision as fits: full digits with thousands separators below 1M, then
// recursively shifts to the next unit (K/M/B) whenever the leading digit group
// would otherwise reach 7 digits — e.g. 1,500,000 reads as "1,500K" rather than
// the coarser "1.5M", and 999,999,999 reads as "999,999K" rather than "1.0M".
export function fmtPopulation(n: number): string {
  const UNITS = ['', 'K', 'M', 'B'];
  let v = Math.floor(n);
  let unit = 0;
  while (v >= 1_000_000 && unit < UNITS.length - 1) {
    v = Math.floor(v / 1000);
    unit++;
  }
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + UNITS[unit];
}
