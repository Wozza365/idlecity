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

// Raindrop splashes — small expanding rings scattered across the whole road
// and verge while it rains, independent of puddles.
const SPLASH_RATE_BASE  = 4;   // splashes / s once it's raining at all
const SPLASH_RATE_SCALE = 9;   // additional splashes / s at rainIntensity=1
const SPLASH_LIFE_MIN   = 0.30;
const SPLASH_LIFE_MAX   = 0.55;
const SPLASH_R_MIN      = 1.5;
const SPLASH_R_MAX      = 4;

interface Splash {
  x: number; y: number;
  age:  number;
  life: number;
  onVerge: boolean;
  maxR: number;
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
  private splashes:  Splash[]   = [];

  private puddleTimer = 0;
  private snowTimer   = 0;
  private splashAccum = 0;
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
    this.splashes  = [];
    this.puddleTimer = 0;
    this.snowTimer   = 0;
    this.splashAccum = 0;
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
      }

      // Spawn raindrop splashes across the whole floor area, at a rate
      // proportional to both rain intensity and the road's width.
      const rate = (SPLASH_RATE_BASE + SPLASH_RATE_SCALE * rainIntensity) * (this.width / 480);
      this.splashAccum += rate * dt;
      while (this.splashAccum >= 1) {
        this.spawnSplash();
        this.splashAccum -= 1;
      }
    } else {
      this.puddleTimer = 0;
      this.splashAccum = 0;
      this.puddles = this.puddles.filter(p => {
        p.rx -= PUDDLE_SHRINK_RATE * dt;
        p.ry -= PUDDLE_SHRINK_RATE * 0.27 * dt;
        return p.rx > 0.5;
      });
    }

    // Age out splashes regardless of rain state, so existing ones finish
    // their animation even as the rain tapers off.
    this.splashes = this.splashes.filter(s => (s.age += dt) < s.life);

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

  private spawnSplash(): void {
    const onVerge = Math.random() < VERGE_H / (ROAD_H + VERGE_H);
    const y = onVerge
      ? this.groundY + ROAD_H + Math.random() * VERGE_H
      : this.groundY + Math.random() * ROAD_H;
    const x = Math.random() * this.width;
    this.splashes.push({
      x, y, onVerge,
      age: 0,
      life: SPLASH_LIFE_MIN + Math.random() * (SPLASH_LIFE_MAX - SPLASH_LIFE_MIN),
      maxR: SPLASH_R_MIN + Math.random() * (SPLASH_R_MAX - SPLASH_R_MIN),
    });
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
      const alpha = sizeRatio * (0.13 + 0.09 * rainIntensity);
      const gfx = p.onVerge ? this.vergeGfx : this.roadGfx;

      // Damp halo — softly darkens the surface around the standing water
      gfx.fillStyle(0x000000, alpha * 0.08);
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
      gfx.fillStyle(highlightColor, alpha * (0.22 + 0.16 * shimmer));
      gfx.fillEllipse(p.x - p.rx * 0.15, p.y - p.ry * 0.18, p.rx * (0.95 + 0.15 * shimmer), p.ry * 0.7);
    }

    // Raindrop splashes — small fading rings scattered across road & verge
    for (const s of this.splashes) {
      const t = s.age / s.life;
      const ringAlpha = (1 - t) * 0.35;
      if (ringAlpha <= 0.01) continue;
      const r = s.maxR * (0.2 + 0.8 * t);
      const gfx = s.onVerge ? this.vergeGfx : this.roadGfx;
      gfx.lineStyle(1, highlightColor, ringAlpha);
      gfx.strokeEllipse(s.x, s.y, r * 2, r * 0.9);
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
