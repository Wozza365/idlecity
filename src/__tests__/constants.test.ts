import { describe, it, expect } from 'vitest';
import {
  plotPopulationCapacity,
  populationGrowthRate,
  POPULATION_BASE_RATE,
  fmtPopulation,
  fmtBalance,
} from '../constants';

describe('plotPopulationCapacity', () => {
  it('returns 0 for locked/unbuilt plots (level <= 0)', () => {
    expect(plotPopulationCapacity(0)).toBe(0);
    expect(plotPopulationCapacity(-1)).toBe(0);
  });

  it('returns 10 at level 1', () => {
    expect(plotPopulationCapacity(1)).toBeCloseTo(10, 5);
  });

  it('grows monotonically with level', () => {
    let prev = plotPopulationCapacity(1);
    for (const level of [2, 15, 50, 85, 100]) {
      const cap = plotPopulationCapacity(level);
      expect(cap).toBeGreaterThan(prev);
      prev = cap;
    }
  });

  it('reaches megacity scale by level 100', () => {
    // 5 maxed plots should land in the hundreds-of-millions range.
    expect(plotPopulationCapacity(100) * 5).toBeGreaterThan(100_000_000);
  });
});

describe('populationGrowthRate', () => {
  it('is positive even at road/verge/water level 0 (growth never freezes)', () => {
    expect(populationGrowthRate(0, 0, 0)).toBeCloseTo(POPULATION_BASE_RATE, 10);
    expect(populationGrowthRate(0, 0, 0)).toBeGreaterThan(0);
  });

  it('roughly doubles the base rate when road/verge/water are maxed', () => {
    const maxed = populationGrowthRate(10, 15, 12);
    expect(maxed / POPULATION_BASE_RATE).toBeCloseTo(2.2, 1);
  });

  it('increases monotonically with each of road/verge/water', () => {
    const base = populationGrowthRate(0, 0, 0);
    expect(populationGrowthRate(1, 0, 0)).toBeGreaterThan(base);
    expect(populationGrowthRate(0, 1, 0)).toBeGreaterThan(base);
    expect(populationGrowthRate(0, 0, 1)).toBeGreaterThan(base);
  });
});

describe('fmtPopulation', () => {
  it('formats small numbers with thousands separators', () => {
    expect(fmtPopulation(0)).toBe('0');
    expect(fmtPopulation(847)).toBe('847');
  });

  it('shows sub-million values in full, with comma separators', () => {
    expect(fmtPopulation(12_345)).toBe('12,345');
    expect(fmtPopulation(999_999)).toBe('999,999');
  });

  it('shifts to K once the integer part would reach 7 digits, preserving precision', () => {
    expect(fmtPopulation(1_000_000)).toBe('1,000K');
    expect(fmtPopulation(1_284_392)).toBe('1,284K');
    expect(fmtPopulation(999_999_999)).toBe('999,999K');
  });

  it('shifts to M once the K-scaled value would reach 7 digits', () => {
    expect(fmtPopulation(1_000_000_000)).toBe('1,000M');
    expect(fmtPopulation(2_300_000_000)).toBe('2,300M');
  });

  it('shifts to B once the M-scaled value would reach 7 digits', () => {
    expect(fmtPopulation(1_000_000_000_000)).toBe('1,000B');
  });

  it('with a higher maxDigits, shows full numbers further before shifting units', () => {
    expect(fmtPopulation(7_123_456, 7)).toBe('7,123,456');
    expect(fmtPopulation(12_345_678, 7)).toBe('12,345K');
    expect(fmtPopulation(999_999_999, 9)).toBe('999,999,999');
  });
});

describe('fmtBalance', () => {
  it('shows sub-billion values in full, with comma separators', () => {
    expect(fmtBalance(0)).toBe('$0');
    expect(fmtBalance(1_234_567)).toBe('$1,234,567');
  });

  it('defaults to one decimal place at B scale', () => {
    expect(fmtBalance(1_823_456_789)).toBe('$1.8B');
  });

  it('shows more decimal places when maxFracDigits is higher', () => {
    expect(fmtBalance(1_823_456_789, 2)).toBe('$1.82B');
    expect(fmtBalance(1_823_456_789, 3)).toBe('$1.823B');
    expect(fmtBalance(1_823_456_789, 6)).toBe('$1.823457B');
  });

  it('shifts to T at trillion scale', () => {
    expect(fmtBalance(1_823_456_789_123, 3)).toBe('$1.823T');
  });
});
