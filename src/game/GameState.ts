import type { SeasonSaveState } from './SeasonSystem';
import { MAX_LEVEL, MAX_ROAD_LEVEL, MAX_VERGE_LEVEL, MAX_WATER_LEVEL, TOTAL_SKINS, plotPopulationCapacity } from '../constants';

const SAVE_KEY = 'idlecity-save';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlotState {
  id: number;
  unlocked: boolean;
  level: number; // 1–100 when unlocked; 0 when locked
}

export interface RoadState {
  level: number; // 0 = locked, 1–10 = road tiers
}

export interface VergeState {
  level: number; // 0 = bare dirt, 1–15
}

export interface WaterState {
  level: number; // 0 = inactive, 1–12
}

export interface StatsState {
  totalPlayTimeMs: number;
  totalMoneyEarned: number;
  skinsUnlocked: number;
}

/** All persistent game data lives here. */
export interface GameState {
  gold: number;
  population: number;
  plots: PlotState[];
  road: RoadState;
  verge: VergeState;
  water: WaterState;
  stats: StatsState;
  season?: SeasonSaveState;
  townName: string;
  selectedSkin: number;
}

// ── Default state ──────────────────────────────────────────────────────────────

export function defaultState(plotCount: number): GameState {
  return {
    gold: 500,
    population: 0,
    townName: 'Idleville',
    plots: Array.from({ length: plotCount }, (_, i) => ({
      id: i,
      unlocked: false,
      level: 0,
    })),
    road: { level: 0 },
    verge: { level: 0 },
    water: { level: 0 },
    stats: { totalPlayTimeMs: 0, totalMoneyEarned: 0, skinsUnlocked: 1 },
    selectedSkin: 0,
  };
}

// ── Progress calculation ──────────────────────────────────────────────────────

/**
 * Overall game-completion percentage (0-100), based on the average of nine
 * progress ratios (each clamped to [0,1]): one per plot's level/MAX_LEVEL
 * (0 if locked), road/verge/water levels relative to their max, and skins
 * unlocked relative to the total available.
 */
export function calculateProgress(state: GameState): number {
  const ratios: number[] = [];

  for (const plot of state.plots) {
    ratios.push(plot.unlocked ? plot.level / MAX_LEVEL : 0);
  }

  ratios.push(state.road.level / MAX_ROAD_LEVEL);
  ratios.push(state.verge.level / MAX_VERGE_LEVEL);
  ratios.push(state.water.level / MAX_WATER_LEVEL);
  ratios.push(state.stats.skinsUnlocked / TOTAL_SKINS);

  const clamped = ratios.map(r => Math.max(0, Math.min(1, r)));
  const avg = clamped.reduce((a, b) => a + b, 0) / clamped.length;
  return Math.round(avg * 100);
}

/** Sum of each unlocked plot's population capacity — the target that `population` grows toward. */
export function totalPopulationCapacity(state: GameState): number {
  let total = 0;
  for (const plot of state.plots) {
    if (plot.unlocked) total += plotPopulationCapacity(plot.level);
  }
  return total;
}

// ── Persistence ────────────────────────────────────────────────────────────────

export function saveGame(state: GameState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

/**
 * Loads state from localStorage. Returns the default if nothing is saved,
 * the data is unreadable, or the plot count has changed.
 */
export function loadGame(plotCount: number): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState(plotCount);

    const parsed = JSON.parse(raw) as Partial<GameState>;

    if (
      typeof parsed.gold === 'number' &&
      Array.isArray(parsed.plots) &&
      parsed.plots.length === plotCount
    ) {
      if (!parsed.road)     parsed.road     = { level: 0 };
      if (!parsed.verge)    parsed.verge    = { level: 0 };
      if (!parsed.water)    parsed.water    = { level: 0 };
      if (!parsed.townName) parsed.townName = 'Idleville';
      if (!parsed.stats)    parsed.stats    = { totalPlayTimeMs: 0, totalMoneyEarned: 0, skinsUnlocked: 1 };
      if (typeof parsed.selectedSkin !== 'number') parsed.selectedSkin = 0;
      if (typeof parsed.population !== 'number') parsed.population = totalPopulationCapacity(parsed as GameState);
      return parsed as GameState;
    }
  } catch {
    // Corrupt or incompatible save — fall through to default
  }

  return defaultState(plotCount);
}
