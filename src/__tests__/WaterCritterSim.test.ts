import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WaterCritterSim, SPLASH_DURATION } from '../objects/water/WaterCritterSim';

// Geometry used across tests: xMin = transEndX + 15, xMax = width - 15.
const TRANS_END_X = 0;
const WIDTH = 100;
const WATER_Y = 0;
const ROCK_SHORE_H = 22;

describe('WaterCritterSim.initDucks', () => {
  it('places 0 ducks below level 2', () => {
    const sim = new WaterCritterSim();
    sim.initDucks(0, TRANS_END_X, WIDTH, WATER_Y, ROCK_SHORE_H);
    expect(sim.ducks).toHaveLength(0);
  });

  it('places 1 duck at level 2', () => {
    const sim = new WaterCritterSim();
    sim.initDucks(2, TRANS_END_X, WIDTH, WATER_Y, ROCK_SHORE_H);
    expect(sim.ducks).toHaveLength(1);
  });

  it('places 2 ducks at level 6+', () => {
    const sim = new WaterCritterSim();
    sim.initDucks(6, TRANS_END_X, WIDTH, WATER_Y, ROCK_SHORE_H);
    expect(sim.ducks).toHaveLength(2);
  });
});

describe('WaterCritterSim.updateFish', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('spawns exactly one fish + splash when the timer expires and no fish is active', () => {
    const sim = new WaterCritterSim(); // fishTimer starts at 0 — first tick triggers a spawn check
    sim.updateFish(100, TRANS_END_X, WIDTH, WATER_Y, ROCK_SHORE_H);
    expect(sim.fish).toHaveLength(1);
    expect(sim.splashes).toHaveLength(1);
  });

  it('does not spawn a second fish while one is already active', () => {
    const sim = new WaterCritterSim();
    sim.updateFish(100, TRANS_END_X, WIDTH, WATER_Y, ROCK_SHORE_H);
    expect(sim.fish).toHaveLength(1);

    // Force the spawn timer to expire again while the first fish is still mid-jump.
    (sim as unknown as { fishTimer: number }).fishTimer = 0;
    sim.updateFish(1, TRANS_END_X, WIDTH, WATER_Y, ROCK_SHORE_H);
    expect(sim.fish).toHaveLength(1);
  });

  it('removes a fish once t>=1 and emits a landing splash', () => {
    const sim = new WaterCritterSim();
    sim.updateFish(100, TRANS_END_X, WIDTH, WATER_Y, ROCK_SHORE_H);
    expect(sim.fish).toHaveLength(1);
    const duration = sim.fish[0].duration;

    // Advance well past the jump's duration so t >= 1.
    sim.updateFish(duration, TRANS_END_X, WIDTH, WATER_Y, ROCK_SHORE_H);
    expect(sim.fish).toHaveLength(0);
    expect(sim.splashes).toHaveLength(2); // spawn splash + landing splash
  });
});

describe('WaterCritterSim.updateDucks', () => {
  it('reverses dir and clamps x when a duck hits xMax', () => {
    const sim = new WaterCritterSim();
    sim.ducks.push({
      x: 19, y: 0, xMin: 10, xMax: 20, dir: 1, speed: 5,
      hasGreenHead: false, dipTimer: 10_000, dipProgress: 0, bobSeed: 0,
    });
    sim.updateDucks(1000); // dt = 1s → x += speed*dir*dt = +5
    expect(sim.ducks[0].x).toBe(20);
    expect(sim.ducks[0].dir).toBe(-1);
  });

  it('reverses dir and clamps x when a duck hits xMin', () => {
    const sim = new WaterCritterSim();
    sim.ducks.push({
      x: 11, y: 0, xMin: 10, xMax: 20, dir: -1, speed: 5,
      hasGreenHead: false, dipTimer: 10_000, dipProgress: 0, bobSeed: 0,
    });
    sim.updateDucks(1000); // dt = 1s → x += speed*dir*dt = -5
    expect(sim.ducks[0].x).toBe(10);
    expect(sim.ducks[0].dir).toBe(1);
  });
});

describe('WaterCritterSim.updateSplashes', () => {
  it('removes a splash once its lifetime exceeds SPLASH_DURATION', () => {
    const sim = new WaterCritterSim();
    sim.splashes.push({ x: 0, y: 0, t: 0 });

    sim.updateSplashes(SPLASH_DURATION * 1000 - 1); // just under
    expect(sim.splashes).toHaveLength(1);

    sim.updateSplashes(2); // tip it over SPLASH_DURATION
    expect(sim.splashes).toHaveLength(0);
  });
});
