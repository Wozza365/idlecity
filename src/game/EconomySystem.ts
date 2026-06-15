// ── Economy pure logic ──────────────────────────────────────────────────────
// Tax/income and population math extracted from GameScene — pure functions
// operating on GameState/PlotState, with no Phaser/scene dependency.

import type { GameState, PlotState } from './GameState';
import { totalPopulationCapacity } from './GameState';
import {
  perBuildingIncome, roadIncome, vergeIncome, waterIncome, populationGrowthRate,
} from '../constants';

/**
 * Income for a single plot, including the neighbour-bonus: +15% per
 * unlocked adjacent plot (left and/or right).
 */
export function plotIncomeWithNeighbourBonus(plots: PlotState[], index: number): number {
  const plot = plots[index];
  const base = perBuildingIncome(plot.level);
  const neighbours =
    (index > 0 && plots[index - 1].unlocked ? 1 : 0) +
    (index < plots.length - 1 && plots[index + 1].unlocked ? 1 : 0);
  return base * (1 + neighbours * 0.15);
}

/**
 * Total per-second tax income: sum of each unlocked plot's income (with
 * neighbour bonus) plus road/verge/water income.
 */
export function taxRate(state: GameState): number {
  const plots = state.plots;
  let total = 0;
  for (let i = 0; i < plots.length; i++) {
    if (!plots[i].unlocked) continue;
    total += plotIncomeWithNeighbourBonus(plots, i);
  }
  total += roadIncome(state.road.level);
  total += vergeIncome(state.verge.level);
  total += waterIncome(state.water.level);
  return total;
}

/** Maps a building level (1-100) to its tier number (1-7). */
export function buildingTier(level: number): number {
  if (level <= 15) return 1;
  if (level <= 25) return 2;
  if (level <= 40) return 3;
  if (level <= 55) return 4;
  if (level <= 70) return 5;
  if (level <= 85) return 6;
  return 7;
}

/**
 * Advances `state.population` toward `totalPopulationCapacity(state)` over
 * `dtSeconds`, mutating `state.population` in place. The growth rate is
 * jittered per-tick (avg 1x) so growth feels organic.
 */
export function updatePopulation(state: GameState, dtSeconds: number): void {
  const capacity = totalPopulationCapacity(state);
  const baseRate = populationGrowthRate(state.road.level, state.verge.level, state.water.level);
  // Jitter the rate per tick (avg 1x) so growth feels organic — bursts of
  // several new residents arriving together, then quieter ticks with just
  // one or two — without changing the overall pacing.
  const rate = baseRate * (0.5 + Math.random());
  state.population += (capacity - state.population) * (1 - Math.exp(-rate * dtSeconds));
}
