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
export const ROAD_BAR_H = 62;
export const ROAD_H = 72;
export const ROAD_DIVIDER_H = 4;
export const VERGE_H = 60;
export const MAX_VERGE_LEVEL = 15;
export const RIVER_H = 48;
export const WATER_H = 100;
export const MAX_WATER_LEVEL = 12;
export const YARD_H = 20;

export const UNLOCK_COSTS: readonly number[] = [0, 50_000, 250_000, 1_500_000, 10_000_000];

// ── Pure helper functions ─────────────────────────────────────────────────────

// Exp-poly cost curve: 200 × exp(0.0695 × (L-1)^1.2) × 1.05^buildingIndex
// A=200 gives ~8s for the first upgrade (5 plots × $5/s income) — fast early progression.
// k=0.0695 targets ~$5B at level 99 with this base.
// Each successive building costs 5% more than the previous one at the same level.
export function upgradeCost(level: number, buildingIndex: number = 0): number {
  return Math.round(200 * Math.exp(0.0695 * Math.pow(level - 1, 1.2)) * Math.pow(1.05, buildingIndex));
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

export function roadUpgradeCost(level: number): number {
  return level === 0 ? 500 : level * level * 100;
}

export function waterUpgradeCost(level: number): number {
  if (level === 0) return 2_500;
  return level * level * 700 + 1_000;
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
  if (level === 0) return 1_500;
  return level * level * 400 + 600;
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
