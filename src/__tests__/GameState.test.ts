import { describe, it, expect } from 'vitest';
import { calculateProgress, defaultState, type GameState } from '../game/GameState';
import { MAX_LEVEL, MAX_ROAD_LEVEL, MAX_VERGE_LEVEL, MAX_WATER_LEVEL, PLOT_COUNT, TOTAL_SKINS } from '../constants';

describe('calculateProgress', () => {
  it('returns 0 for a brand-new game', () => {
    const state = defaultState(PLOT_COUNT);
    // skinsUnlocked starts at 1, contributing a small non-zero ratio,
    // but everything else is 0 — overall percentage should round to 0.
    expect(calculateProgress(state)).toBe(0);
  });

  it('returns 100 when every track is fully maxed', () => {
    const state: GameState = defaultState(PLOT_COUNT);
    for (const plot of state.plots) {
      plot.unlocked = true;
      plot.level = MAX_LEVEL;
    }
    state.road.level = MAX_ROAD_LEVEL;
    state.verge.level = MAX_VERGE_LEVEL;
    state.water.level = MAX_WATER_LEVEL;
    state.stats.skinsUnlocked = TOTAL_SKINS;

    expect(calculateProgress(state)).toBe(100);
  });

  it('ignores level on locked plots', () => {
    const state: GameState = defaultState(PLOT_COUNT);
    // A locked plot with a non-zero level (shouldn't normally happen) must
    // still contribute 0 to the average.
    state.plots[0].unlocked = false;
    state.plots[0].level = MAX_LEVEL;

    const withLockedLevel = calculateProgress(state);

    state.plots[0].level = 0;
    const withoutLockedLevel = calculateProgress(state);

    expect(withLockedLevel).toBe(withoutLockedLevel);
  });

  it('clamps ratios above 1', () => {
    const state: GameState = defaultState(PLOT_COUNT);
    state.road.level = MAX_ROAD_LEVEL * 100;

    expect(calculateProgress(state)).toBeLessThanOrEqual(100);
  });
});
