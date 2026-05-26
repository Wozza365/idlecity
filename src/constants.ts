// ── Numeric constants ─────────────────────────────────────────────────────────

export const PLOT_COUNT = 5;
export const PLOT_BASE_HEIGHT = 60;
export const HEIGHT_PER_LEVEL = 6;
export const MAX_LEVEL = 100;
export const UI_HEIGHT = 276;
export const STATS_BAR_H = 68;
export const ROAD_BAR_H = 62;
export const ROAD_H = 48;
export const VERGE_H = 24;
export const RIVER_H = 48;
export const YARD_H = 20;

export const UNLOCK_COSTS: readonly number[] = [0, 50_000, 250_000, 1_500_000, 10_000_000];

// ── Pure helper functions ─────────────────────────────────────────────────────

// Deterministic XorShift RNG — produces consistent costs across runs
const _upgradeCosts: number[] = (() => {
  let s = 0xdeadbeef >>> 0;
  const rng = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s = s >>> 0; return s / 0x100000000; };
  const costs: number[] = [];
  let cost = 250;
  for (let i = 0; i < 99; i++) {
    costs.push(Math.round(cost));
    cost *= 1 + 0.25 + rng() * 0.10;
  }
  return costs;
})();

export function upgradeCost(level: number): number {
  return _upgradeCosts[Math.min(level - 1, 98)];
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

// Tiered income: each tier has a fixed increment per level, with the rate and base compounding.
// All values in internal units (displayed $/hr = value × GAME_HOUR_FACTOR).
const _t1Base = 50, _t2Base = _t1Base + 0.115 * 15, _t3Base = _t2Base + 0.135 * 20, _t4Base = _t3Base + 0.155 * 30;
const _t1Inc = _t1Base * 0.115 / 10, _t2Inc = _t2Base * 0.135 / 10, _t3Inc = _t3Base * 0.155 / 10, _t4Inc = _t4Base * 0.175 / 10;
const _at15 = 5 + 14 * _t1Inc, _at35 = _at15 + 20 * _t2Inc, _at65 = _at35 + 30 * _t3Inc;

export function perBuildingIncome(level: number): number {
  if (level <= 15) return 5 + (level - 1) * _t1Inc;
  if (level <= 35) return _at15 + (level - 15) * _t2Inc;
  if (level <= 65) return _at35 + (level - 35) * _t3Inc;
  return _at65 + (level - 65) * _t4Inc;
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
