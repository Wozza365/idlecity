import Phaser from 'phaser';
import { ROAD_H, VERGE_H } from '../constants';

const MAX_PUDDLES    = 10;
const MAX_SNOW_PILES = 9;
const PUDDLE_SPAWN_MS = 5_000;
const SNOW_SPAWN_MS   = 7_000;

// px / s at intensity=1
const PUDDLE_GROW_RATE   = 0.6;
const PUDDLE_SHRINK_RATE = 0.35;
const SNOW_GROW_RATE     = 1.0;
const SNOW_SHRINK_RATE   = 0.4;

interface Puddle {
  x: number; y: number;
  rx: number; ry: number;
  maxRx: number; maxRy: number;
  onVerge: boolean;
}

interface SnowPile {
  x: number; y: number;
  w: number; h: number;
  maxW: number; maxH: number;
  onVerge: boolean;
}

export class WeatherAccumulation {
  private readonly roadGfx:  Phaser.GameObjects.Graphics; // depth 7.06
  private readonly vergeGfx: Phaser.GameObjects.Graphics; // depth 6.03

  private puddles:   Puddle[]   = [];
  private snowPiles: SnowPile[] = [];

  private puddleTimer = 0;
  private snowTimer   = 0;

  private groundY = 0;
  private width   = 0;

  constructor(scene: Phaser.Scene) {
    this.roadGfx  = scene.add.graphics().setDepth(7.06);
    this.vergeGfx = scene.add.graphics().setDepth(6.03);
  }

  rebuild(width: number, groundY: number): void {
    this.width   = width;
    this.groundY = groundY;
    this.puddles   = [];
    this.snowPiles = [];
    this.puddleTimer = 0;
    this.snowTimer   = 0;
  }

  update(delta: number, rainIntensity: number, snowIntensity: number): void {
    const dt = delta / 1000;
    const rainActive = rainIntensity > 0.15;
    const snowActive = snowIntensity > 0.15;

    // ── Rain puddles ──────────────────────────────────────────────────────────
    if (rainActive) {
      this.puddleTimer += delta;
      if (this.puddleTimer >= PUDDLE_SPAWN_MS && this.puddles.length < MAX_PUDDLES) {
        if (Math.random() < 0.65) this.spawnPuddle();
        this.puddleTimer = 0;
      }
      for (const p of this.puddles) {
        p.rx = Math.min(p.maxRx, p.rx + PUDDLE_GROW_RATE * dt * rainIntensity);
        p.ry = Math.min(p.maxRy, p.ry + PUDDLE_GROW_RATE * 0.27 * dt * rainIntensity);
      }
    } else {
      this.puddleTimer = 0;
      this.puddles = this.puddles.filter(p => {
        p.rx -= PUDDLE_SHRINK_RATE * dt;
        p.ry -= PUDDLE_SHRINK_RATE * 0.27 * dt;
        return p.rx > 0.5;
      });
    }

    // ── Snow piles ────────────────────────────────────────────────────────────
    if (snowActive) {
      this.snowTimer += delta;
      if (this.snowTimer >= SNOW_SPAWN_MS && this.snowPiles.length < MAX_SNOW_PILES) {
        if (Math.random() < 0.60) this.spawnSnowPile();
        this.snowTimer = 0;
      }
      for (const sp of this.snowPiles) {
        sp.w = Math.min(sp.maxW, sp.w + SNOW_GROW_RATE * dt * snowIntensity);
        sp.h = Math.min(sp.maxH, sp.h + SNOW_GROW_RATE * 0.30 * dt * snowIntensity);
      }
    } else {
      this.snowTimer = 0;
      this.snowPiles = this.snowPiles.filter(sp => {
        sp.w -= SNOW_SHRINK_RATE * dt;
        sp.h -= SNOW_SHRINK_RATE * 0.30 * dt;
        return sp.w > 1;
      });
    }

    this.draw(rainIntensity);
  }

  private spawnPuddle(): void {
    const onVerge = Math.random() < 0.35;
    const margin = 6;
    const y = onVerge
      ? this.groundY + ROAD_H + margin + Math.random() * (VERGE_H - margin * 2)
      : this.groundY + margin + Math.random() * (ROAD_H - margin * 2);
    const x    = this.width * (0.04 + Math.random() * 0.92);
    const maxRx = 10 + Math.random() * 24;
    const maxRy = maxRx * (0.19 + Math.random() * 0.13);
    this.puddles.push({ x, y, rx: 1, ry: 0.3, maxRx, maxRy, onVerge });
  }

  private spawnSnowPile(): void {
    const onVerge = Math.random() < 0.55;
    let y: number;
    if (onVerge) {
      y = this.groundY + ROAD_H + 4 + Math.random() * (VERGE_H - 10);
    } else {
      // Hug the road edges (where snow gathers at kerbs)
      y = Math.random() < 0.5
        ? this.groundY + 3
        : this.groundY + ROAD_H - 7;
    }
    const x    = this.width * (0.02 + Math.random() * 0.96);
    const maxW  = 18 + Math.random() * 40;
    const maxH  = 5  + Math.random() * 9;
    this.snowPiles.push({ x, y, w: 2, h: 1, maxW, maxH, onVerge });
  }

  private draw(rainIntensity: number): void {
    this.roadGfx.clear();
    this.vergeGfx.clear();

    for (const p of this.puddles) {
      const sizeRatio = p.rx / p.maxRx;
      const alpha = sizeRatio * (0.32 + 0.18 * rainIntensity);
      const gfx = p.onVerge ? this.vergeGfx : this.roadGfx;
      // Main puddle body — slightly lighter sky-reflection colour for visibility on dark asphalt
      gfx.fillStyle(0x4466bb, alpha);
      gfx.fillEllipse(p.x, p.y, p.rx * 2, p.ry * 2);
      // Bright reflection highlight
      gfx.fillStyle(0xaaccee, alpha * 0.55);
      gfx.fillEllipse(p.x - p.rx * 0.12, p.y - p.ry * 0.15, p.rx * 1.1, p.ry * 0.75);
    }

    for (const sp of this.snowPiles) {
      const sizeRatio = sp.w / sp.maxW;
      const alpha = 0.55 + sizeRatio * 0.35;
      const gfx = sp.onVerge ? this.vergeGfx : this.roadGfx;
      // Pile body
      gfx.fillStyle(0xd8e8f4, alpha);
      gfx.fillEllipse(sp.x, sp.y, sp.w, sp.h);
      // Bright top highlight
      gfx.fillStyle(0xf8fbff, alpha * 0.65);
      gfx.fillEllipse(sp.x, sp.y - sp.h * 0.12, sp.w * 0.58, sp.h * 0.55);
    }
  }

  destroy(): void {
    this.roadGfx.destroy();
    this.vergeGfx.destroy();
  }
}
