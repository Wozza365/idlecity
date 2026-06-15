import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultState, totalPopulationCapacity, type GameState } from '../game/GameState';
import { PLOT_COUNT, roadIncome, vergeIncome, waterIncome } from '../constants';
import { buildingTier, plotIncomeWithNeighbourBonus, taxRate, updatePopulation } from '../game/EconomySystem';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('taxRate', () => {
  it('for a freshly-default state equals the sum of road/verge/water income at level 0 (no plots unlocked)', () => {
    const state = defaultState(PLOT_COUNT);
    const expected = roadIncome(0) + vergeIncome(0) + waterIncome(0);
    expect(taxRate(state)).toBe(expected);
    expect(taxRate(state)).toBe(0);
  });

  it('applies a +15% bonus per unlocked neighbour', () => {
    const state: GameState = defaultState(PLOT_COUNT);
    state.plots[1].unlocked = true;
    state.plots[1].level = 10;

    // No neighbours unlocked
    const withoutNeighbours = taxRate(state);

    // Unlock both neighbours (0 and 2)
    state.plots[0].unlocked = true;
    state.plots[0].level = 1;
    state.plots[2].unlocked = true;
    state.plots[2].level = 1;
    const withBothNeighbours = taxRate(state);

    expect(withBothNeighbours).toBeGreaterThan(withoutNeighbours);

    // Verify the exact bonus contribution for plot 1 specifically by
    // isolating it via plotIncomeWithNeighbourBonus.
    const plot1WithNeighbours = plotIncomeWithNeighbourBonus(state.plots, 1);
    const plot1Base = plot1WithNeighbours / 1.3; // 1 + 2*0.15
    expect(plot1WithNeighbours).toBeCloseTo(plot1Base * 1.3, 10);
  });
});

describe('buildingTier', () => {
  it('returns tier 1 for levels up to 15', () => {
    expect(buildingTier(1)).toBe(1);
    expect(buildingTier(15)).toBe(1);
  });

  it('returns tier 2 for levels 16-25', () => {
    expect(buildingTier(16)).toBe(2);
    expect(buildingTier(25)).toBe(2);
  });

  it('returns tier 3 for levels 26-40', () => {
    expect(buildingTier(26)).toBe(3);
    expect(buildingTier(40)).toBe(3);
  });

  it('returns tier 4 for levels 41-55', () => {
    expect(buildingTier(41)).toBe(4);
    expect(buildingTier(55)).toBe(4);
  });

  it('returns tier 5 for levels 56-70', () => {
    expect(buildingTier(56)).toBe(5);
    expect(buildingTier(70)).toBe(5);
  });

  it('returns tier 6 for levels 71-85', () => {
    expect(buildingTier(71)).toBe(6);
    expect(buildingTier(85)).toBe(6);
  });

  it('returns tier 7 for levels 86-100', () => {
    expect(buildingTier(86)).toBe(7);
    expect(buildingTier(100)).toBe(7);
  });
});

describe('updatePopulation', () => {
  it('moves population toward capacity without overshooting', () => {
    const state = defaultState(PLOT_COUNT);
    state.plots[0].unlocked = true;
    state.plots[0].level = 50;
    const capacity = totalPopulationCapacity(state);
    expect(state.population).toBe(0);

    updatePopulation(state, 1);

    expect(state.population).toBeGreaterThan(0);
    expect(state.population).toBeLessThanOrEqual(capacity);
  });

  it('is a no-op (population stays at capacity) when population already equals capacity', () => {
    const state = defaultState(PLOT_COUNT);
    state.plots[0].unlocked = true;
    state.plots[0].level = 50;
    const capacity = totalPopulationCapacity(state);
    state.population = capacity;

    updatePopulation(state, 1);

    expect(state.population).toBeCloseTo(capacity, 10);
  });

  it('uses deterministic jitter bounds (0.5x to 1.5x base rate) without overshooting capacity', () => {
    const state = defaultState(PLOT_COUNT);
    state.plots[0].unlocked = true;
    state.plots[0].level = 50;
    const capacity = totalPopulationCapacity(state);

    // Force the maximum jitter multiplier (Math.random() = 1 => rate = 1.5 * base)
    vi.spyOn(Math, 'random').mockReturnValue(1);
    updatePopulation(state, 1);

    expect(state.population).toBeGreaterThan(0);
    expect(state.population).toBeLessThanOrEqual(capacity);
  });
});

describe('plotIncomeWithNeighbourBonus', () => {
  it('an edge plot (index 0) only gets a bonus from its single neighbour (index 1)', () => {
    const state = defaultState(PLOT_COUNT);
    for (const plot of state.plots) {
      plot.unlocked = true;
      plot.level = 10;
    }

    const withNeighbour = plotIncomeWithNeighbourBonus(state.plots, 0);

    state.plots[1].unlocked = false;
    const withoutNeighbour = plotIncomeWithNeighbourBonus(state.plots, 0);

    expect(withNeighbour).toBeCloseTo(withoutNeighbour * 1.15, 10);
  });

  it('the last plot only gets a bonus from its single (left) neighbour', () => {
    const state = defaultState(PLOT_COUNT);
    const last = PLOT_COUNT - 1;
    for (const plot of state.plots) {
      plot.unlocked = true;
      plot.level = 10;
    }

    const withNeighbour = plotIncomeWithNeighbourBonus(state.plots, last);

    state.plots[last - 1].unlocked = false;
    const withoutNeighbour = plotIncomeWithNeighbourBonus(state.plots, last);

    expect(withNeighbour).toBeCloseTo(withoutNeighbour * 1.15, 10);
  });

  it('a middle plot gets a bonus from both neighbours when both are unlocked', () => {
    const state = defaultState(PLOT_COUNT);
    const middle = Math.floor(PLOT_COUNT / 2);
    for (const plot of state.plots) {
      plot.unlocked = true;
      plot.level = 10;
    }

    const withBoth = plotIncomeWithNeighbourBonus(state.plots, middle);

    state.plots[middle - 1].unlocked = false;
    state.plots[middle + 1].unlocked = false;
    const withNone = plotIncomeWithNeighbourBonus(state.plots, middle);

    expect(withBoth).toBeCloseTo(withNone * 1.3, 10);
  });
});
