import Phaser from 'phaser';
import { ROAD_H, VERGE_H, WATER_H, NIGHT_TINT, lerpColor, dimColor } from '../constants';
import type { LightSource } from '../lighting/LightingSystem';
import type { WaterPalette } from '../theme/ThemeTypes';
import { WaterCritterSim, SPLASH_DURATION } from './water/WaterCritterSim';
import { BeachPeopleRenderer } from './water/BeachPeopleRenderer';
import { LighthouseFeature } from './water/LighthouseFeature';
import { PierAndStructures } from './water/PierAndStructures';
import { WaveFx } from './water/WaveFx';
import { Bonfire } from './water/Bonfire';

const BEACH_SHORE_H = 48;  // depth of sandy beach area
const ROCK_SHORE_H  = 22;  // depth of rocky area

// ── Water critters — jumping fish + paddling ducks ─────────────────────────────
const FISH_LEN = 6;
const DUCK_W = 8;
const DUCK_H = 5;

// ── Main class ────────────────────────────────────────────────────────────────

export class WaterArea {
  // Graphics layers (depth < 6.0 so they render behind verge)
  private waterGfx:        Phaser.GameObjects.Graphics; // 5.5  – gradient water + coast (static)
  private skyReflectGfx:   Phaser.GameObjects.Graphics; // 5.51 – sky horizon colour tint on water top
  private shadowGfx:       Phaser.GameObjects.Graphics; // 5.65 – structure shadows on water (sun-dep)
  private fxGfx:           Phaser.GameObjects.Graphics; // 5.85 – bonfire, sparkles, buoys (no lighting)
  private crittersGfx:     Phaser.GameObjects.Graphics; // 5.84 – jumping fish + paddling ducks

  // Layout
  private _level   = 0;
  private _width   = 0;
  private _waterY  = 0;
  private _palette!: WaterPalette;
  private _beachEndX  = 0;
  private _transEndX  = 0; // where rocky area starts (after transition)
  private _pierX      = 0;
  private _dockX1     = 0;
  private _dockX2     = 0;
  private _cafeX      = 16;
  private _lighthouseX    = 0;
  private _lighthouseTopY = 0;
  private _lighthouse!: LighthouseFeature;
  private _pierAndStructures!: PierAndStructures;
  private _beachPeople!: BeachPeopleRenderer;

  // Water critters
  private _critters = new WaterCritterSim();

  // Wave/foam/glitter animation on the FX layer
  private _waveFx = new WaveFx();

  // Bonfire — flames/sparks/smoke + flickering point lights, level 9+
  private _bonfire = new Bonfire();

  // Animation
  private _nightFactor     = 0;
  private _lastLightElevation = NaN;

  get extraLights(): LightSource[] {
    const out: LightSource[] = [];
    out.push(...this._pierAndStructures.extraLights);
    out.push(...this._bonfire.extraLights);
    out.push(...this._lighthouse.extraLights);
    return out;
  }

  getDockSlots(): number[] { return this._pierAndStructures.getDockSlots(); }

  constructor(scene: Phaser.Scene) {
    this.waterGfx       = scene.add.graphics().setDepth(5.5).setLighting(true);
    this.skyReflectGfx  = scene.add.graphics().setDepth(5.51);
    this.shadowGfx      = scene.add.graphics().setDepth(5.55);
    this.fxGfx          = scene.add.graphics().setDepth(5.85);
    this.crittersGfx    = scene.add.graphics().setDepth(5.84).setLighting(true);
    this._lighthouse    = new LighthouseFeature(scene);
    this._pierAndStructures = new PierAndStructures(scene);
    this._beachPeople   = new BeachPeopleRenderer(scene);
  }

  render(level: number, width: number, groundY: number, palette: WaterPalette): void {
    this._level   = level;
    this._width   = width;
    this._waterY  = groundY + ROAD_H + VERGE_H;
    this._palette = palette;

    // Layout geometry
    this._beachEndX  = Math.floor(width * 0.36);
    this._transEndX  = Math.floor(width * 0.60); // end of beach→rock transition
    this._pierX      = Math.floor(width * 0.23);
    this._dockX1     = this._beachEndX;           // dock replaces transition zone
    this._dockX2     = this._transEndX;
    this._cafeX      = 16;
    this._lighthouseX    = Math.floor(width * 0.63);
    this._lighthouseTopY = this._waterY + WATER_H * 0.5;

    this.drawWaterAndCoast();

    this._pierAndStructures.render(level, this._width, this._waterY, this._pierX, this._cafeX, this._dockX1, this._dockX2);
    this._lighthouse.render(level, this._lighthouseX, this._lighthouseTopY, palette);
    this._beachPeople.render(level, this._beachEndX, this._waterY, palette);
    this._bonfire.render(level, Math.floor(width * 0.17), this._waterY + 32);

    this._critters.reset();
    this._critters.initDucks(level, this._transEndX, this._width, this._waterY, ROCK_SHORE_H);
  }

  // ── Water gradient + coast ────────────────────────────────────────────────

  private drawWaterAndCoast(): void {
    const gfx = this.waterGfx;
    gfx.clear();
    const { _waterY: wy, _width: w, _beachEndX: bx, _transEndX: tx } = this;

    // ── Smooth water gradient (top → bottom = deep → lighter) ──
    const BAND = 4;
    for (let i = 0; i < WATER_H; i += BAND) {
      const t = i / WATER_H;
      gfx.fillStyle(lerpColor(this._palette.waterTop, this._palette.waterBot, t), 1);
      gfx.fillRect(0, wy + i, w, Math.min(BAND, WATER_H - i));
    }

    // ── Sandy beach (left) ──
    if (this._level >= 1) {
      gfx.fillStyle(this._palette.sand, 1);
      gfx.fillRect(0, wy, bx, BEACH_SHORE_H);

      // Wet sand — gently curved bottom edge using thin horizontal strips
      for (let col = 0; col < bx; col += 2) {
        const t  = col / bx;
        // Gentle sinusoidal variation: center dips slightly further into water
        const dip = Math.round(Math.sin(t * Math.PI) * 4);
        const wh  = 7 + dip;
        gfx.fillStyle(this._palette.sandWet, 1);
        gfx.fillRect(col, wy + BEACH_SHORE_H - wh, 2, wh);
      }
      // White foam strip at water's edge
      gfx.fillStyle(0xFFFFFF, 0.22);
      for (let col = 0; col < bx; col += 2) {
        const t  = col / bx;
        const dip = Math.round(Math.sin(t * Math.PI) * 4);
        gfx.fillRect(col, wy + BEACH_SHORE_H - (7 + dip), 2, 2);
      }

      // Sand pebble texture
      gfx.fillStyle(0xE8D0A0, 0.45);
      for (let i = 0; i < Math.floor(bx / 9); i++) {
        const px = ((i * 47 + 11) % Math.max(1, bx - 6)) + 3;
        const py = wy + 4 + ((i * 23 + 7) % (BEACH_SHORE_H - 12));
        gfx.fillRect(px, py, 1 + (i % 2), 1 + (i % 2));
      }

      // ── Smooth beach→rock transition (per-pixel width, smoothstep curve) ──
      const transW = tx - bx;
      const STEPS  = Math.max(1, Math.floor(transW / 3)); // ~3px each strip
      for (let s = 0; s < STEPS; s++) {
        const t0 = s / STEPS;
        const t1 = (s + 1) / STEPS;
        const tSmooth = t0 * t0 * (3 - 2 * t0); // smoothstep
        const sx = bx + Math.floor(t0 * transW);
        const sw = Math.max(1, Math.ceil(t1 * transW) - Math.floor(t0 * transW));
        const sh = Math.round(BEACH_SHORE_H * (1 - tSmooth) + ROCK_SHORE_H * tSmooth);
        const color = lerpColor(this._palette.sand, this._palette.rockBase, tSmooth);
        gfx.fillStyle(color, 1);
        gfx.fillRect(sx, wy, sw, sh);
        // Top edge highlight
        gfx.fillStyle(lerpColor(0xE8D0A0, this._palette.rockLight, tSmooth), 0.4);
        gfx.fillRect(sx, wy, sw, 1);
      }

      // ── Rocky coastline (right) — pixel-art layered blocks ──
      // Base fill
      gfx.fillStyle(this._palette.rockBase, 1);
      gfx.fillRect(tx, wy, w - tx, ROCK_SHORE_H);

      // Top face highlight (lighter)
      gfx.fillStyle(this._palette.rockLight, 1);
      gfx.fillRect(tx, wy, w - tx, 3);

      // Horizontal strata cracks
      gfx.fillStyle(0x404040, 1);
      gfx.fillRect(tx, wy + 8,  w - tx, 1);
      gfx.fillRect(tx, wy + 15, w - tx, 1);

      // Individual pixel-art rock blocks (4-6×3-4 rectangles)
      for (let rx = tx + 4; rx < w - 4; rx += 14) {
        const seed = (rx * 13 + 7) | 0;
        const rw   = 9 + (seed % 5);
        const rh   = 2 + (seed % 3);
        const ry2  = wy + 2 + (seed % 6);
        gfx.fillStyle(this._palette.rockMid, 1);
        gfx.fillRect(rx, ry2, rw, rh);
        // Pixel highlight
        gfx.fillStyle(this._palette.rockLight, 0.7);
        gfx.fillRect(rx, ry2, rw, 1);
      }

      // Bottom edge of rocky shore (shadow into water)
      gfx.fillStyle(0x000000, 0.2);
      gfx.fillRect(tx, wy + ROCK_SHORE_H - 3, w - tx, 3);
    }

  }

  // ── Water critters — jumping fish + paddling ducks ────────────────────────

  /** Draws splash rings on the FX layer — called after drawFx(), without clearing it. */
  private drawSplashes(): void {
    if (this._critters.splashes.length === 0) return;
    const gfx = this.fxGfx;
    for (const s of this._critters.splashes) {
      const t = s.t / SPLASH_DURATION;
      const ringR = 2 + t * 10;
      const alpha = (1 - t) * 0.5;
      gfx.lineStyle(1, 0xFFFFFF, alpha);
      gfx.strokeCircle(s.x, s.y, ringR);

      if (t < 0.4) {
        const dropA = (1 - t / 0.4) * 0.7;
        gfx.fillStyle(0xFFFFFF, dropA);
        for (let j = 0; j < 3; j++) {
          const ang  = -Math.PI / 2 + (j - 1) * 0.5;
          const dist = 3 + t * 8;
          gfx.fillCircle(s.x + Math.cos(ang) * dist, s.y + Math.sin(ang) * dist, 1);
        }
      }
    }
  }

  /** Draws jumping fish (rotated to follow their arc) and paddling ducks. */
  private drawCritters(elevation: number): void {
    const gfx = this.crittersGfx;
    gfx.clear();
    if (this._critters.fish.length === 0 && this._critters.ducks.length === 0) return;

    const brightness = Math.max(0.25, Math.min(1, (elevation + 0.2) / 0.4));

    // Fish — a small two-tone wedge rotated to follow the jump-arc tangent
    for (const f of this._critters.fish) {
      const progress = f.t;
      const x = f.startX + f.dir * f.travel * progress;
      const y = f.baseY - f.height * Math.sin(progress * Math.PI);

      const vx = f.travel * f.dir;
      const vy = -f.height * Math.PI * Math.cos(progress * Math.PI);
      const angle = Math.atan2(vy, vx);

      gfx.save();
      gfx.translateCanvas(x, y);
      gfx.rotateCanvas(angle);
      gfx.fillStyle(dimColor(f.color, brightness * 0.7), 0.9);
      gfx.fillTriangle(-FISH_LEN / 2, 0, -FISH_LEN / 2 - 2.5, -2, -FISH_LEN / 2 - 2.5, 2);
      gfx.fillStyle(dimColor(f.color, brightness), 0.95);
      gfx.fillTriangle(-FISH_LEN / 2, -1.5, -FISH_LEN / 2, 1.5, FISH_LEN / 2, 0);
      gfx.restore();
    }

    // Ducks — paddling with a periodic head-dunk
    for (const d of this._critters.ducks) {
      const bob = Math.sin(this._waveFx.waveTime * 3 + d.bobSeed) * 0.8;
      const cx  = Math.round(d.x);
      const cy  = Math.round(d.y + bob);
      const dip = Math.sin(d.dipProgress * Math.PI);

      const bodyColor = dimColor(d.hasGreenHead ? 0xede0c8 : 0x8a6a45, brightness);
      const headColor = dimColor(d.hasGreenHead ? 0x2f5d3a : 0x5a4632, brightness);
      const beakColor = dimColor(0xe0a500, brightness);

      // Wake ripple behind the body
      gfx.fillStyle(0xFFFFFF, 0.12);
      gfx.fillEllipse(cx - d.dir * 2, cy + 2, DUCK_W + 4, 2);

      // Tail
      gfx.fillStyle(headColor, 1);
      gfx.fillTriangle(
        cx - d.dir * DUCK_W * 0.5, cy - 1,
        cx - d.dir * DUCK_W * 0.5, cy + 1,
        cx - d.dir * (DUCK_W * 0.5 + 2), cy - 1.5,
      );

      // Body
      gfx.fillStyle(bodyColor, 1);
      gfx.fillEllipse(cx, cy, DUCK_W, DUCK_H);

      // Head — dunks under during the dip animation
      const headX = cx + d.dir * DUCK_W * 0.45;
      const headY = cy - DUCK_H * 0.3 + dip * (DUCK_H * 0.9);
      gfx.fillStyle(headColor, 1);
      gfx.fillCircle(headX, headY, DUCK_H * 0.5);

      // Beak — hidden once the head is mostly underwater
      if (dip < 0.7) {
        gfx.fillStyle(beakColor, 1);
        gfx.fillTriangle(
          headX + d.dir * DUCK_H * 0.4, headY,
          headX + d.dir * DUCK_H * 1.0, headY - 0.5,
          headX + d.dir * DUCK_H * 0.4, headY + 0.8,
        );
      }

      // Splash ring while dunking
      if (dip > 0.7) {
        gfx.fillStyle(0xFFFFFF, (dip - 0.7) / 0.3 * 0.4);
        gfx.fillCircle(headX, cy - 1, 2);
      }
    }
  }

  // ── Structure shadows on water ────────────────────────────────────────────

  updateShadows(sunAngle: number): void {
    const gfx = this.shadowGfx;
    gfx.clear();

    const elevation = Math.sin(sunAngle);
    if (elevation <= 0.04 || this._level === 0) return;

    const { _waterY: wy } = this;
    const alpha = Math.min(0.22, elevation * 0.28);
    const leanX = Math.cos(sunAngle) / Math.max(0.15, elevation);

    this._pierAndStructures.updateShadows(gfx, leanX, alpha, wy);
    this._lighthouse.drawShadow(gfx, leanX, alpha, elevation);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(delta: number, elevation: number, horizonColor = 0x1a5c9e): void {
    if (this._width === 0) return; // not yet rendered
    this.updateSkyReflection(horizonColor);
    this._waveFx.update(delta);
    this._bonfire.update(delta, this._nightFactor);
    this._lighthouse.update(delta, this._nightFactor);
    this._pierAndStructures.update(delta);

    this._beachPeople.update(delta, elevation, this._nightFactor);
    this.drawFx();

    this._critters.updateFish(delta, this._transEndX, this._width, this._waterY, ROCK_SHORE_H);
    this._critters.updateDucks(delta);
    this._critters.updateSplashes(delta);
    this.drawSplashes();
    this.drawCritters(elevation);
  }

  // ── Animated FX layer ─────────────────────────────────────────────────────

  private drawFx(): void {
    const gfx = this.fxGfx;
    gfx.clear();

    this._waveFx.draw(gfx, {
      width: this._width,
      waterY: this._waterY,
      beachEndX: this._beachEndX,
      dockX1: this._dockX1,
      dockX2: this._dockX2,
      transEndX: this._transEndX,
      level: this._level,
      nightFactor: this._nightFactor,
      lighthouseActive: this._level >= 8,
      lighthouseX: this._lighthouseX,
      lighthouseTopY: this._lighthouseTopY,
    });

    this._pierAndStructures.drawFx(gfx, this._nightFactor);

    this._bonfire.draw(gfx, this._nightFactor);
  }

  // ── Sky reflection ────────────────────────────────────────────────────────

  private updateSkyReflection(horizonColor: number): void {
    const gfx = this.skyReflectGfx;
    gfx.clear();
    if (this._width === 0) return;

    // Fade out reflection at night (water looks dark, not reflective)
    const alpha = 0.35 * Math.max(0, 1 - this._nightFactor * 2.0);
    if (alpha < 0.01) return;

    // Gradient overlay on the top 40% of the water band, fading to 0 at bottom
    const reflH = Math.floor(WATER_H * 0.40);
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      const frac = s / steps;
      gfx.fillStyle(horizonColor, alpha * (1 - frac));
      const y0 = this._waterY + Math.floor(frac * reflH);
      const y1 = this._waterY + Math.floor((s + 1) / steps * reflH);
      gfx.fillRect(0, y0, this._width, Math.max(1, y1 - y0));
    }
  }

  // ── Lighting updates ──────────────────────────────────────────────────────

  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightElevation) < 0.002) return;
    this._lastLightElevation = elevation;
    this._nightFactor = Math.max(0, Math.min(1, (0.2 - elevation) / 0.3));
    const nf = this._nightFactor;

    // Pier / café / lifeguard hut / dock — manual night tint (these images
    // skip the Light2D pipeline, same as cyclist/furniture sprites).
    const structTint = lerpColor(0xffffff, NIGHT_TINT, nf);
    this._pierAndStructures.updateLighting(nf, structTint);
    this._lighthouse.updateLighting(nf, structTint);
    this._bonfire.updateLighting(nf);
  }

  // ── Destroy ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.waterGfx.destroy();
    this.skyReflectGfx.destroy();
    this.shadowGfx.destroy();
    this.fxGfx.destroy();
    this._lighthouse.destroy();
    this._pierAndStructures.destroy();
    this._beachPeople.destroy();
    this.crittersGfx.destroy();
  }
}
