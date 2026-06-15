import { describe, it, expect } from 'vitest';
import { advanceTime, computeSunAngle, elapsedMs, gameTimeString, setMidnight } from '../game/TimeOfDaySystem';

describe('computeSunAngle', () => {
  it('returns the noon angle (π/2) at elapsed=0, regardless of season', () => {
    expect(computeSunAngle(0, 1)).toBeCloseTo(Math.PI / 2, 10);
    expect(computeSunAngle(0, -1)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('returns π at the sunset boundary, for summer (c1=1) and winter (c1=-1)', () => {
    // Summer sunset boundary
    const summerSunset = 98172.89337332969;
    expect(computeSunAngle(summerSunset, 1)).toBeCloseTo(Math.PI, 10);

    // Winter sunset boundary
    const winterSunset = 71985.60287942411;
    expect(computeSunAngle(winterSunset, -1)).toBeCloseTo(Math.PI, 10);
  });

  it('returns 2π at the sunrise boundary, for summer (c1=1) and winter (c1=-1)', () => {
    // Summer sunrise boundary
    const summerSunrise = 141827.10662667028;
    expect(computeSunAngle(summerSunrise, 1)).toBeCloseTo(2 * Math.PI, 10);

    // Winter sunrise boundary
    const winterSunrise = 168014.3971205759;
    expect(computeSunAngle(winterSunrise, -1)).toBeCloseTo(2 * Math.PI, 10);
  });

  it('approaches 5π/2 as elapsed approaches the cycle boundary (240_000)', () => {
    const angle = computeSunAngle(239_999, 1);
    expect(angle).toBeCloseTo((5 * Math.PI) / 2, 2);
    expect(angle).toBeLessThan((5 * Math.PI) / 2);
  });
});

describe('gameTimeString', () => {
  it('returns "12:00" at elapsed=0 (noon)', () => {
    expect(gameTimeString(0)).toBe('12:00');
  });

  it('returns "00:00" at the half-cycle point (120_000ms, midnight)', () => {
    expect(gameTimeString(120_000)).toBe('00:00');
  });
});

describe('setMidnight + elapsedMs', () => {
  it('produces a timeOffsetMs that yields exactly 120_000 elapsed for various master-clock values', () => {
    for (const masterClockValue of [0, 50_000, 120_000, 200_000, 239_999]) {
      const offset = setMidnight(masterClockValue);
      expect(elapsedMs(masterClockValue, offset)).toBe(120_000);
    }
  });
});

describe('advanceTime', () => {
  it('increments by exactly 240_000/24', () => {
    expect(advanceTime(0)).toBe(240_000 / 24);
  });

  it('wraps modulo 240_000', () => {
    expect(advanceTime(230_000)).toBe(0);
    expect(advanceTime(239_999)).toBeCloseTo((239_999 + 240_000 / 24) % 240_000, 10);
  });
});
