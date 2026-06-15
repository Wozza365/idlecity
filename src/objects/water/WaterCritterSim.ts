// ── Water critters pure logic ───────────────────────────────────────────────
// Jumping-fish / paddling-duck / splash-ring simulation extracted from
// WaterArea — pure state updates with no Phaser/scene dependency.
// WaterArea owns one instance, calls the update methods from its `update()`,
// and reads `fish`/`ducks`/`splashes` from `drawCritters()`/`drawSplashes()`.

import { WATER_H } from '../../constants';

const FISH_MIN_INTERVAL      = 6000;  // ms between jumps (min)
const FISH_MAX_INTERVAL      = 12000; // ms between jumps (max)
const FISH_JUMP_DURATION_MIN = 650;   // ms
const FISH_JUMP_DURATION_MAX = 900;   // ms
const FISH_JUMP_HEIGHT_MIN   = 10;    // px
const FISH_JUMP_HEIGHT_MAX   = 18;    // px
const FISH_JUMP_TRAVEL_MIN   = 18;    // px
const FISH_JUMP_TRAVEL_MAX   = 34;    // px
const FISH_COLORS: readonly number[] = [0x6699cc, 0x88aabb, 0x5577aa, 0x77bbaa];

export const SPLASH_DURATION = 0.45; // seconds

const DUCK_SPEED_MIN = 3;  // px/s
const DUCK_SPEED_MAX = 6;  // px/s
const DUCK_DIP_DURATION = 500; // ms — head-dunk animation length

export interface FishJump {
  startX: number;
  baseY: number;
  dir: 1 | -1;
  t: number;        // progress 0..1
  duration: number; // ms
  height: number;   // arc height (px)
  travel: number;   // horizontal distance covered (px)
  color: number;
}

export interface Splash {
  x: number;
  y: number;
  t: number; // seconds elapsed
}

export interface Duck {
  x: number;
  y: number;
  xMin: number;
  xMax: number;
  dir: 1 | -1;
  speed: number;
  hasGreenHead: boolean;
  dipTimer: number;
  dipProgress: number; // 0 = not dipping; ramps 0→1 over the dunk
  bobSeed: number;
}

function randFishInterval(): number {
  return FISH_MIN_INTERVAL + Math.random() * (FISH_MAX_INTERVAL - FISH_MIN_INTERVAL);
}

export class WaterCritterSim {
  fish: FishJump[] = [];
  ducks: Duck[] = [];
  splashes: Splash[] = [];
  private fishTimer = 0;

  /** Clears fish/splashes and re-arms the jump timer — call from `render()`. */
  reset(): void {
    this.fish = [];
    this.splashes = [];
    this.fishTimer = randFishInterval();
  }

  /** Places 0-2 ducks in the open-water zone, gated by level like the other water features. */
  initDucks(level: number, transEndX: number, width: number, waterY: number, rockShoreH: number): void {
    const xMin = transEndX + 15;
    const xMax = width - 15;
    if (xMax <= xMin) { this.ducks = []; return; }

    const yMin = waterY + rockShoreH + 14;
    const yMax = waterY + WATER_H - 24;
    const count = level >= 6 ? 2 : level >= 2 ? 1 : 0;

    this.ducks = [];
    for (let i = 0; i < count; i++) {
      this.ducks.push({
        x: xMin + Math.random() * (xMax - xMin),
        y: yMin + Math.random() * Math.max(1, yMax - yMin),
        xMin,
        xMax,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: DUCK_SPEED_MIN + Math.random() * (DUCK_SPEED_MAX - DUCK_SPEED_MIN),
        hasGreenHead: i === 0,
        dipTimer: 2000 + Math.random() * 5000,
        dipProgress: 0,
        bobSeed: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Spawns the occasional jumping fish in the open-water zone and tracks its arc. */
  updateFish(delta: number, transEndX: number, width: number, waterY: number, rockShoreH: number): void {
    const xMin = transEndX + 15;
    const xMax = width - 15;
    if (xMax <= xMin) return;

    this.fishTimer -= delta;
    if (this.fishTimer <= 0 && this.fish.length === 0) {
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const travel = FISH_JUMP_TRAVEL_MIN + Math.random() * (FISH_JUMP_TRAVEL_MAX - FISH_JUMP_TRAVEL_MIN);
      const lo = dir === 1 ? xMin : xMin + travel;
      const hi = dir === 1 ? xMax - travel : xMax;
      if (hi > lo) {
        const startX = lo + Math.random() * (hi - lo);
        const baseY  = waterY + rockShoreH + 30
                     + Math.random() * (WATER_H - rockShoreH - 60);
        const duration = FISH_JUMP_DURATION_MIN + Math.random() * (FISH_JUMP_DURATION_MAX - FISH_JUMP_DURATION_MIN);
        const height = FISH_JUMP_HEIGHT_MIN + Math.random() * (FISH_JUMP_HEIGHT_MAX - FISH_JUMP_HEIGHT_MIN);
        const color = FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)];
        this.fish.push({ startX, baseY, dir, t: 0, duration, height, travel, color });
        this.splashes.push({ x: startX, y: baseY, t: 0 });
      }
      this.fishTimer = randFishInterval();
    }

    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
      f.t += delta / f.duration;
      if (f.t >= 1) {
        this.splashes.push({ x: f.startX + f.dir * f.travel, y: f.baseY, t: 0 });
        this.fish.splice(i, 1);
      }
    }
  }

  /** Paddles ducks back and forth, with an occasional head-dunk to feed. */
  updateDucks(delta: number): void {
    const dt = delta / 1000;
    for (const d of this.ducks) {
      if (d.dipProgress > 0) {
        d.dipProgress = Math.min(1, d.dipProgress + delta / DUCK_DIP_DURATION);
        if (d.dipProgress >= 1) {
          d.dipProgress = 0;
          d.dipTimer = 3000 + Math.random() * 6000;
        }
        continue;
      }

      d.dipTimer -= delta;
      if (d.dipTimer <= 0) { d.dipProgress = 0.001; continue; }

      d.x += d.dir * d.speed * dt;
      if (d.x <= d.xMin) { d.x = d.xMin; d.dir = 1; }
      if (d.x >= d.xMax) { d.x = d.xMax; d.dir = -1; }
    }
  }

  /** Advances splash ring lifetimes and removes expired ones. */
  updateSplashes(delta: number): void {
    const dt = delta / 1000;
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].t += dt;
      if (this.splashes[i].t >= SPLASH_DURATION) this.splashes.splice(i, 1);
    }
  }
}
