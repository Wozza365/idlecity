import { describe, it, expect } from 'vitest';
import {
  advanceBeachPersonPosition, advanceBeachPersonPhase, type BeachPersonSimState,
} from '../objects/water/BeachPeopleSim';

function makePerson(overrides: Partial<BeachPersonSimState> = {}): BeachPersonSimState {
  return {
    x: 0, dir: 1, xMin: 0, xMax: 10, speed: 1, phase: 'walk', phaseTimer: 1000,
    ...overrides,
  };
}

describe('advanceBeachPersonPosition', () => {
  it('clamps to xMax and reverses dir when walking past the upper bound', () => {
    const p = makePerson({ x: 9, dir: 1, xMin: 0, xMax: 10, speed: 5 });
    advanceBeachPersonPosition(p, 1); // dt=1s → x += speed*dir*dt = +5
    expect(p.x).toBe(10);
    expect(p.dir).toBe(-1);
  });

  it('clamps to xMin and reverses dir when walking past the lower bound', () => {
    const p = makePerson({ x: 1, dir: -1, xMin: 0, xMax: 10, speed: 5 });
    advanceBeachPersonPosition(p, 1); // dt=1s → x += speed*dir*dt = -5
    expect(p.x).toBe(0);
    expect(p.dir).toBe(1);
  });
});

describe('advanceBeachPersonPhase', () => {
  it('does nothing while the phase timer has not expired', () => {
    const p = makePerson({ phase: 'walk', phaseTimer: 1000 });
    const transitioned = advanceBeachPersonPhase(p, 100);
    expect(transitioned).toBe(false);
    expect(p.phase).toBe('walk');
    expect(p.phaseTimer).toBe(900);
  });

  it("transitions 'walk' -> 'sit' with phaseTimer reset into [7000, 19000) when the timer expires", () => {
    const p = makePerson({ phase: 'walk', phaseTimer: 100 });
    const transitioned = advanceBeachPersonPhase(p, 200);
    expect(transitioned).toBe(true);
    expect(p.phase).toBe('sit');
    expect(p.phaseTimer).toBeGreaterThanOrEqual(7000);
    expect(p.phaseTimer).toBeLessThan(19000);
  });

  it("transitions 'sit' -> 'walk' with phaseTimer reset into [3000, 10000) when the timer expires", () => {
    const p = makePerson({ phase: 'sit', phaseTimer: 50 });
    const transitioned = advanceBeachPersonPhase(p, 100);
    expect(transitioned).toBe(true);
    expect(p.phase).toBe('walk');
    expect(p.phaseTimer).toBeGreaterThanOrEqual(3000);
    expect(p.phaseTimer).toBeLessThan(10000);
    expect([1, -1]).toContain(p.dir);
  });
});
