import Phaser from 'phaser';
import type { LightSource } from '../../lighting/LightingSystem';

// Flickering beach bonfire — four small overlapping point lights at varied
// positions/colors (an organic flicker rather than a uniform disc) plus the
// animated logs/flames/sparks/smoke drawn on the FX layer. Shown at water
// level 9+. Extracted from WaterArea so the latter only needs to call
// render/update/draw/updateLighting/extraLights.
export class Bonfire {
  private _level = 0;
  private _x = 0;
  private _y = 0;
  private _time = 0;
  private _lights: Array<Extract<LightSource, { type?: 'point' }>> = [];

  get extraLights(): LightSource[] { return this._lights; }

  render(level: number, x: number, y: number): void {
    this._level = level;
    this._x = x;
    this._y = y;

    if (level >= 9) {
      this._lights = [
        { x,     y: y - 12, radius: 38, color: 0xFF6600, intensity: 0, noOcclusion: true },
        { x: x - 5, y: y - 6,  radius: 32, color: 0xFF8800, intensity: 0, noOcclusion: true },
        { x: x + 6, y: y - 4,  radius: 26, color: 0xFFAA00, intensity: 0, noOcclusion: true },
        { x: x + 1, y: y - 9,  radius: 20, color: 0xFFCC00, intensity: 0, noOcclusion: true },
      ];
    } else {
      this._lights = [];
    }
  }

  // Bonfire light flicker — four lights with independent phases/frequencies
  update(delta: number, nightFactor: number): void {
    const dt = delta / 1000;
    this._time += dt * 0.55; // slowed for more organic feel

    if (nightFactor > 0.05 && this._lights.length > 0) {
      const t  = this._time;
      const nf = nightFactor;
      const phases = [0,    0.8,  1.5,  2.3];
      const freqs  = [4.1,  3.3,  5.7,  2.9];
      const bases  = [0.65, 0.70, 0.68, 0.72];
      const amps   = [0.28, 0.22, 0.25, 0.20];
      const intens = [4.0,  3.2,  2.8,  2.2];
      for (let i = 0; i < this._lights.length; i++) {
        const f = bases[i] + amps[i] * Math.sin(t * freqs[i] + phases[i])
                           + 0.10   * Math.sin(t * freqs[i] * 2.3 + phases[i]);
        (this._lights[i] as { intensity: number }).intensity = nf * intens[i] * f;
      }
    }
  }

  draw(gfx: Phaser.GameObjects.Graphics, nightFactor: number): void {
    if (this._level < 9) return;
    const { _x: bx, _y: by, _time: t } = this;
    const nf = nightFactor;

    // Logs (always visible, with glowing embers)
    gfx.fillStyle(0x2A1508, 1);
    gfx.fillRect(bx - 10, by + 2, 20, 4);
    gfx.fillRect(bx - 7, by + 4, 14, 3);
    // Ember glow on logs
    if (nf > 0.05) {
      const emberA = nf * (0.4 + 0.3 * Math.sin(t * 3.1));
      gfx.fillStyle(0xFF5500, emberA);
      gfx.fillRect(bx - 8, by + 2, 16, 3);
    }

    if (nf < 0.06) return;
    const alpha = Math.min(1, nf * 1.8);

    // Base glow (wide, low, hot orange)
    gfx.fillStyle(0xFF3300, alpha * 0.7);
    gfx.fillRect(bx - 8, by - 2, 16, 5);

    // Outer flame — slow wobble
    const f1 = 0.55 + 0.45 * Math.sin(t * 3.2);
    const h1  = Math.round(12 * f1);
    gfx.fillStyle(0xDD1100, alpha * 0.85);
    gfx.fillRect(bx - 8, by - h1, 16, h1 + 2);

    // Mid flame — slightly offset
    const f2  = 0.6 + 0.4 * Math.sin(t * 2.7 + 0.8);
    const h2  = Math.round(18 * f2);
    const ox2 = Math.round(Math.sin(t * 1.9) * 2);
    gfx.fillStyle(0xFF5500, alpha * 0.82);
    gfx.fillRect(bx - 6 + ox2, by - h2, 12, h2 + 1);

    // Inner flame — hot orange-yellow
    const f3  = 0.65 + 0.35 * Math.sin(t * 3.8 + 1.4);
    const h3  = Math.round(22 * f3);
    const ox3 = Math.round(Math.sin(t * 2.4 + 0.5) * 1.5);
    gfx.fillStyle(0xFF8800, alpha * 0.78);
    gfx.fillRect(bx - 4 + ox3, by - h3, 8, h3);

    // Core — yellow-white hot
    const f4  = 0.7 + 0.3 * Math.sin(t * 4.6 + 0.2);
    const h4  = Math.round(14 * f4);
    gfx.fillStyle(0xFFCC00, alpha * 0.7);
    gfx.fillRect(bx - 2, by - h4 - 4, 4, h4);
    gfx.fillStyle(0xFFEE44, alpha * 0.55);
    gfx.fillRect(bx - 1, by - h4 - 8, 2, 6);

    // Sparks — rise and drift
    gfx.fillStyle(0xFFFF88, alpha * 0.8);
    for (let i = 0; i < 7; i++) {
      const phase  = t * (1.8 + i * 0.4) + i * 1.3;
      const rise   = (phase % (Math.PI * 2)) / (Math.PI * 2);
      const drift  = Math.sin(t * 2.1 + i * 0.9) * 9;
      const sx     = bx + Math.round(drift);
      const sy     = by - 8 - Math.round(rise * 22);
      const fade   = 1 - rise;
      if (fade > 0.1) {
        gfx.fillStyle(i % 3 === 0 ? 0xFFAA22 : 0xFFFF44, alpha * fade * 0.75);
        gfx.fillRect(sx, sy, 1 + (i % 2), 1 + (i % 2));
      }
    }

    // Smoke puffs — grey dots drifting up slowly (day-visible)
    const smokeA = Math.max(0, 0.25 - nf * 0.1);
    if (smokeA > 0.01) {
      for (let i = 0; i < 4; i++) {
        const sp    = t * 0.4 + i * 0.7;
        const rise2 = (sp % (Math.PI * 2)) / (Math.PI * 2);
        const driftS = Math.sin(t * 0.8 + i * 1.1) * 7;
        gfx.fillStyle(0x888888, smokeA * (1 - rise2) * 0.8);
        gfx.fillCircle(bx + Math.round(driftS), by - 14 - Math.round(rise2 * 18), 3 + i % 3);
      }
    }
  }

  updateLighting(nf: number): void {
    if (nf < 0.05) {
      for (const b of this._lights) (b as { intensity: number }).intensity = 0;
    }
  }
}
