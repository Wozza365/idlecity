// ── Numeric constants ─────────────────────────────────────────────────────────

export const PLOT_COUNT = 5;
export const PLOT_BASE_HEIGHT = 60;
export const HEIGHT_PER_LEVEL = 6;
export const MAX_LEVEL = 100;
export const UI_HEIGHT = 200;
export const STATS_BAR_H = 54;
export const ROAD_H = 48;
export const VERGE_H = 24;
export const RIVER_H = 48;
export const YARD_H = 20;

export const UNLOCK_COSTS: readonly number[] = [0, 500, 2_500, 15_000, 100_000];

// ── Pure helper functions ─────────────────────────────────────────────────────

export function upgradeCost(level: number): number {
  return level * level * 10;
}

export function buildingHeight(level: number): number {
  if (level <= 15) return PLOT_BASE_HEIGHT;
  const clamped = Math.max(1, Math.min(level, MAX_LEVEL));
  return PLOT_BASE_HEIGHT + (clamped - 1) * HEIGHT_PER_LEVEL;
}

export function perBuildingIncome(level: number): number {
  return Math.floor(Math.pow(level, 0.75) * 10);
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

export function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
