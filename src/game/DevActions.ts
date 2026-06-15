// ── Dev-panel cheat actions (pure logic) ────────────────────────────────────
// State mutations triggered by the dev panel's cheat buttons, extracted from
// GameScene — pure functions/mutators with no Phaser/scene dependency.

import type { GameState } from './GameState';
import { MAX_ROAD_LEVEL, MAX_VERGE_LEVEL, MAX_WATER_LEVEL, PLOT_COUNT } from '../constants';

const DEV_GOLD_AMOUNT = 1_000_000_000;

/**
 * Computes the new `gameDayCount` for jumping to the start of the given
 * season, preserving the current "year" (each year is 40 game-days, with
 * Summer/Autumn/Winter/Spring starting at offsets 0/10/20/30).
 */
export function jumpToSeasonOffset(currentDayCount: number, season: string): number {
  const offsets: Record<string, number> = { Summer: 0, Autumn: 10, Winter: 20, Spring: 30 };
  const yearBase = Math.floor(currentDayCount / 40) * 40;
  return yearBase + (offsets[season] ?? 0);
}

/**
 * Mutates `state` to its "skip to high level" dev-cheat configuration: road,
 * verge, and water tracks maxed out, and all plots unlocked at preset levels
 * (highest on plot 0, descending toward the last plot).
 */
export function skipToHighLevelState(state: GameState): void {
  const SKIP_LEVELS = [75, 60, 45, 30, 15];
  state.road.level  = MAX_ROAD_LEVEL;
  state.verge.level = MAX_VERGE_LEVEL;
  state.water.level = MAX_WATER_LEVEL;
  for (let i = 0; i < PLOT_COUNT; i++) {
    state.plots[i].unlocked = true;
    state.plots[i].level = SKIP_LEVELS[i] ?? 1;
  }
}

/** Adds a fixed dev-cheat amount of gold to `state.gold` and `state.stats.totalMoneyEarned`. */
export function addDevGold(state: GameState): void {
  state.gold += DEV_GOLD_AMOUNT;
  state.stats.totalMoneyEarned += DEV_GOLD_AMOUNT;
}
