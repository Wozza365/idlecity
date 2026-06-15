import { describe, it, expect } from 'vitest';
import { defaultState } from '../game/GameState';
import { MAX_ROAD_LEVEL, MAX_VERGE_LEVEL, MAX_WATER_LEVEL, PLOT_COUNT } from '../constants';
import { addDevGold, jumpToSeasonOffset, skipToHighLevelState } from '../game/DevActions';

describe('jumpToSeasonOffset', () => {
  it('jumps to Autumn (offset 10) within the current year', () => {
    expect(jumpToSeasonOffset(5, 'Autumn')).toBe(10);
  });

  it('jumps to Winter (offset 20) in the current year, from later in that year', () => {
    expect(jumpToSeasonOffset(15, 'Winter')).toBe(20);
  });

  it('jumps into the next year when the target season offset is earlier than the current day within the year', () => {
    // Day 45 = year 1 (yearBase 40), day 5. Jumping to Winter (offset 20) -> 40 + 20 = 60.
    expect(jumpToSeasonOffset(45, 'Winter')).toBe(60);
  });

  it('wraps to the start of the current year (day 0 of that year) when jumping to Summer from late in the year', () => {
    // Day 38 = year 0 (yearBase 0), late in the year. Jumping to Summer (offset 0) -> 0.
    expect(jumpToSeasonOffset(38, 'Summer')).toBe(0);
  });

  it('returns the year base unchanged for an unrecognised season name', () => {
    expect(jumpToSeasonOffset(45, 'NotASeason')).toBe(40);
  });
});

describe('skipToHighLevelState', () => {
  it('sets road, verge, and water to their max levels', () => {
    const state = defaultState(PLOT_COUNT);
    skipToHighLevelState(state);

    expect(state.road.level).toBe(MAX_ROAD_LEVEL);
    expect(state.verge.level).toBe(MAX_VERGE_LEVEL);
    expect(state.water.level).toBe(MAX_WATER_LEVEL);
  });

  it('unlocks all plots and sets them to the preset skip levels [75, 60, 45, 30, 15]', () => {
    const state = defaultState(PLOT_COUNT);
    skipToHighLevelState(state);

    const expectedLevels = [75, 60, 45, 30, 15];
    for (let i = 0; i < PLOT_COUNT; i++) {
      expect(state.plots[i].unlocked).toBe(true);
      expect(state.plots[i].level).toBe(expectedLevels[i] ?? 1);
    }
  });
});

describe('addDevGold', () => {
  it('adds 1,000,000,000 to gold and totalMoneyEarned', () => {
    const state = defaultState(PLOT_COUNT);
    const startingGold = state.gold;
    const startingEarned = state.stats.totalMoneyEarned;

    addDevGold(state);

    expect(state.gold).toBe(startingGold + 1_000_000_000);
    expect(state.stats.totalMoneyEarned).toBe(startingEarned + 1_000_000_000);
  });

  it('accumulates correctly across repeated calls', () => {
    const state = defaultState(PLOT_COUNT);
    addDevGold(state);
    addDevGold(state);

    expect(state.gold).toBe(500 + 2 * 1_000_000_000);
    expect(state.stats.totalMoneyEarned).toBe(2 * 1_000_000_000);
  });
});
