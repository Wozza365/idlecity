import Phaser from 'phaser';
import { ROAD_H, VERGE_H, lerpColor } from '../constants';

const MAX_PUDDLES    = 10;
const MAX_SNOW_PILES = 9;
const PUDDLE_SPAWN_MS = 5_000;
const SNOW_SPAWN_MS   = 7_000;

// px / s at intensity=1
const PUDDLE_GROW_RATE   = 0.6;
const PUDDLE_SHRINK_RATE = 0.35;
const SNOW_GROW_RATE     = 1.0;
const SNOW_SHRINK_RATE   = 0.4;

// Puddle radius (px) above which raindrop ripples start appearing
const RIPPLE_MIN_RX = 6;

interface Ripple {
  ox: number; oy: number; // spawn offset from the puddle centre, in px
  age:  number;
  life: number;
}

interface Puddle {
  x: number; y: number;
  rx: number; ry: number;
  maxRx: number; maxRy: number;
  onVerge: boolean;
  // A second, smaller lobe overlapping the main body breaks up the
  // perfect-ellipse silhouette so the puddle reads as an irregular pool.
  lobeDx: number; lobeDy: number; lobeScale: number;
  shimmerPhase: number;
  rippleTimer: number;
  ripples: Ripple[];
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
  private elapsed     = 0;

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

  /**
   * @param elevation   sin(sunAngle) — drives the night-darkening of puddle reflections
   * @param horizonColor current sky horizon colour — puddles mirror it like tiny pools
   */
  update(delta: number, rainIntensity: number, snowIntensity: number, elevation: number, horizonColor: number): void {
    const dt = delta / 1000;
    this.elapsed += dt;
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
        this.updateRipples(p, dt, rainIntensity);
      }
    } else {
      this.puddleTimer = 0;
      this.puddles = this.puddles.filter(p => {
        p.rx -= PUDDLE_SHRINK_RATE * dt;
        p.ry -= PUDDLE_SHRINK_RATE * 0.27 * dt;
        p.ripples = p.ripples.filter(r => (r.age += dt) < r.life);
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

    this.draw(rainIntensity, elevation, horizonColor);
  }

  /** Age existing ripples and occasionally spawn a new one near the puddle's centre. */
  private updateRipples(p: Puddle, dt: number, rainIntensity: number): void {
    p.ripples = p.ripples.filter(r => (r.age += dt) < r.life);
    if (p.rx < RIPPLE_MIN_RX) return;
    p.rippleTimer -= dt;
    if (p.rippleTimer <= 0) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 0.5; // fraction of the radius from centre
      p.ripples.push({ ox: Math.cos(a) * p.rx * d, oy: Math.sin(a) * p.ry * d, age: 0, life: 0.8 + Math.random() * 0.6 });
      p.rippleTimer = (1.0 + Math.random() * 2.0) / Math.max(0.25, rainIntensity);
    }
  }

  private spawnPuddle(): void {
    const onVerge = Math.random() < 0.35;
    const margin = 6;
    const y = onVerge
      ? this.groundY + ROAD_H + margin + Math.random() * (VERGE_H - margin * 2)
      : this.groundY + margin + Math.random() * (ROAD_H - margin * 2);
    const x    = this.width * (0.04 + Math.random() * 0.92);
    const maxRx = 7 + Math.random() * 13;
    const maxRy = maxRx * (0.19 + Math.random() * 0.13);
    const lobeAngle = Math.random() * Math.PI * 2;
    const lobeDist  = 0.12 + Math.random() * 0.22;
    this.puddles.push({
      x, y, rx: 1, ry: 0.3, maxRx, maxRy, onVerge,
      lobeDx: Math.cos(lobeAngle) * lobeDist,
      lobeDy: Math.sin(lobeAngle) * lobeDist,
      lobeScale: 0.55 + Math.random() * 0.3,
      shimmerPhase: Math.random() * Math.PI * 2,
      rippleTimer: 1 + Math.random() * 2,
      ripples: [],
    });
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

  private draw(rainIntensity: number, elevation: number, horizonColor: number): void {
    this.roadGfx.clear();
    this.vergeGfx.clear();

    // Night factor: 0 in daylight, ramping to 1 after dusk — dims puddle reflections
    const nightFactor = Math.max(0, Math.min(1, (0.15 - elevation) / 0.35));
    // Puddles act as little mirrors of the sky overhead — blend a dark, neutral
    // wet-asphalt tone with a touch of the current horizon colour, darkening
    // further after dark. Kept fairly dark so the reflection reads as subtle.
    const skyTint        = lerpColor(0x2a3d52, horizonColor, 0.35);
    const bodyColor      = lerpColor(skyTint, 0x10141e, nightFactor * 0.75);
    const highlightColor = lerpColor(lerpColor(0xe8f0fa, horizonColor, 0.3), 0x222c40, nightFactor * 0.8);
    const rimColor       = lerpColor(0x05070c, bodyColor, 0.3);

    for (const p of this.puddles) {
      if (p.rx <= 0.5) continue;
      const sizeRatio = p.rx / p.maxRx;
      const alpha = sizeRatio * (0.20 + 0.14 * rainIntensity);
      const gfx = p.onVerge ? this.vergeGfx : this.roadGfx;

      // Damp halo — softly darkens the surface around the standing water
      gfx.fillStyle(0x000000, alpha * 0.12);
      gfx.fillEllipse(p.x, p.y, p.rx * 1.6, p.ry * 1.6);

      // Secondary lobe breaks up the perfect-ellipse outline
      gfx.fillStyle(bodyColor, alpha);
      gfx.fillEllipse(p.x + p.rx * p.lobeDx, p.y + p.ry * p.lobeDy, p.rx * 2 * p.lobeScale, p.ry * 2 * p.lobeScale);

      // Main body — sky-tinted reflection
      gfx.fillEllipse(p.x, p.y, p.rx * 2, p.ry * 2);

      // Subtle dark rim separates the puddle from the road/verge surface
      gfx.lineStyle(1, rimColor, alpha * 0.55);
      gfx.strokeEllipse(p.x, p.y, p.rx * 2, p.ry * 2);

      // Slow shimmer on the reflection highlight
      const shimmer = 0.5 + 0.5 * Math.sin(this.elapsed * 1.4 + p.shimmerPhase);
      gfx.fillStyle(highlightColor, alpha * (0.28 + 0.2 * shimmer));
      gfx.fillEllipse(p.x - p.rx * 0.15, p.y - p.ry * 0.18, p.rx * (0.95 + 0.15 * shimmer), p.ry * 0.7);

      // Raindrop ripples spreading across the surface
      for (const r of p.ripples) {
        const t = r.age / r.life;
        const ringAlpha = alpha * (1 - t) * 0.6;
        if (ringAlpha <= 0.01) continue;
        const rw = p.rx * (0.15 + 0.8 * t);
        const rh = p.ry * (0.15 + 0.8 * t);
        gfx.lineStyle(1, highlightColor, ringAlpha);
        gfx.strokeEllipse(p.x + r.ox, p.y + r.oy, rw * 2, rh * 2);
      }
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
