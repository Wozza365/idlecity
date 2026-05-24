import Phaser from 'phaser';
import { type PlotState } from '../game/GameState';
import {
  PLOT_COUNT, ROAD_H, VERGE_H, RIVER_H, YARD_H,
  buildingHeight, lerpColor, sunColorAtElevation,
} from '../constants';

export class SunMoon {
  private sunCircle:    Phaser.GameObjects.Arc;
  private moonCircle:   Phaser.GameObjects.Arc;
  private sunGlowSprite: Phaser.GameObjects.Image;
  private sunGroundGlow: Phaser.GameObjects.Ellipse;
  private shadowGfx:    Phaser.GameObjects.Graphics;
  readonly sunLight:    Phaser.GameObjects.Light;

  constructor(private scene: Phaser.Scene, groundY: number) {
    const { width } = scene.scale;
    const cx = width / 2;

    // Glow texture: opaque Gaussian from white (centre) → black (edge).
    // Black pixels add nothing in ADD blend mode, bypassing premultiplied-alpha
    // banding. 30 stops trace a smooth Gaussian so there are no visible kinks.
    const texSize    = 512;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width  = texSize;
    glowCanvas.height = texSize;
    const ctx2d = glowCanvas.getContext('2d')!;
    const half  = texSize / 2;
    const grad  = ctx2d.createRadialGradient(half, half, 0, half, half, half);
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const v = Math.round(Math.exp(-t * t * 7) * 255);
      grad.addColorStop(t, `rgb(${v},${v},${v})`);
    }
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(0, 0, texSize, texSize);
    scene.textures.addCanvas('sun-glow', glowCanvas);

    this.shadowGfx    = scene.add.graphics().setDepth(9.5);
    this.moonCircle   = scene.add.arc(cx, groundY, 16, 0, 360, false, 0xd0d0e8, 1).setDepth(2);
    this.sunGlowSprite = scene.add.image(cx, 80, 'sun-glow')
      .setDisplaySize(300, 300)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(3);
    this.sunCircle    = scene.add.arc(cx, 80, 20, 0, 360, false, 0xfff8aa, 1).setDepth(5);
    this.sunGroundGlow = scene.add
      .ellipse(cx, groundY + 6, Math.round(width * 0.5), 22, 0xfffae0, 0)
      .setDepth(6);
    this.sunLight = scene.lights.addLight(cx, 80, Math.max(800, width * 2), 0xffeeaa, 3.2);
  }

  update(
    sunAngle: number,
    width: number,
    groundY: number,
    panelTop: number,
    plots: PlotState[],
    plotWidth: number,
  ): void {
    const a      = sunAngle;
    const cx     = width / 2;
    const orbitX = width * 0.95;
    const orbitY = Math.round(groundY * 0.90);

    const elevation = Math.sin(a);
    const sunX      = cx - Math.cos(a) * orbitX;
    const sunY      = groundY - elevation * orbitY;
    const sunAbove  = elevation > 0.02;

    const moonElev = Math.sin(a + Math.PI);
    const moonX    = cx - Math.cos(a + Math.PI) * orbitX;
    const moonY    = groundY - moonElev * orbitY;

    this.sunCircle.setPosition(sunX, sunY).setVisible(sunAbove);
    this.moonCircle.setPosition(moonX, moonY).setVisible(moonElev > 0.02);
    this.sunGlowSprite.setPosition(sunX, sunY).setVisible(sunAbove);

    this.sunGroundGlow
      .setPosition(sunX, groundY + 6)
      .setVisible(sunAbove)
      .setAlpha(Math.max(0, elevation * 0.22));

    this.sunLight.x         = sunX;
    this.sunLight.y         = sunY;
    this.sunLight.intensity = Math.max(0, elevation * 3.2);

    const sunColor = sunColorAtElevation(elevation);
    this.sunCircle.setFillStyle(sunColor);
    this.sunGlowSprite.setTint(sunColor);
    this.sunLight.setColor(sunColor);

    const ambMin  = elevation >= 0 ? Math.max(0.08, 0.28 - elevation) : 0.08;
    const amb     = Math.max(ambMin, elevation * 0.55 + 0.14);
    const ambTint = lerpColor(0xff8833, 0xffffff, Math.min(1, elevation * 3));
    const ar = Math.round(((ambTint >> 16) & 0xff) * amb);
    const ag = Math.round(((ambTint >> 8)  & 0xff) * amb);
    const ab = Math.round( (ambTint        & 0xff) * amb);
    this.scene.lights.setAmbientColor((ar << 16) | (ag << 8) | ab);

    this.drawShadows(a, elevation, groundY, panelTop, plots, plotWidth);
  }

  resize(width: number): void {
    this.sunGroundGlow.setDisplaySize(Math.round(width * 0.5), 22);
    this.sunLight.radius = Math.max(800, width * 2);
  }

  /**
   * Draws soft ground shadows using parallel sun rays with multi-sample
   * penumbra simulation. NUM_SAMPLES point lights spread across the sun disc
   * each cast a shadow at 1/N alpha. Overlapping umbra regions reach full
   * alpha while penumbra edges appear softer.
   */
  private drawShadows(
    sunAngle: number,
    elevation: number,
    groundY: number,
    panelTop: number,
    plots: PlotState[],
    plotWidth: number,
  ): void {
    const gfx = this.shadowGfx;
    gfx.clear();
    if (elevation <= 0.02) return;

    const totalAlpha  = Math.min(0.99, elevation * 1.26 + 0.18);
    const maxShadow   = ROAD_H + VERGE_H + RIVER_H;
    const shadowExtent = Math.max(6, maxShadow * Math.pow(1 - elevation, 0.5));
    const shadBot      = Math.min(groundY + shadowExtent, panelTop);

    const NUM_SAMPLES    = 11;
    const DISC_SPREAD    = 0.10;
    const MAX_LEAN_RATIO = Math.cos(0.35) / Math.sin(0.35);

    for (let s = 0; s < NUM_SAMPLES; s++) {
      const t      = (s / (NUM_SAMPLES - 1)) - 0.5;
      const sAngle = sunAngle + t * DISC_SPREAD;
      const sElev  = Math.sin(sAngle);
      const sHoriz = Math.cos(sAngle);
      if (sElev <= 0.01) continue;

      const leanRate = Math.max(-MAX_LEAN_RATIO, Math.min(MAX_LEAN_RATIO, sHoriz / sElev));
      gfx.fillStyle(0x000022, totalAlpha / NUM_SAMPLES);

      for (let i = 0; i < PLOT_COUNT; i++) {
        const plot = plots[i];
        if (!plot.unlocked) continue;

        const x  = i * plotWidth;
        const w  = plotWidth;
        const h  = buildingHeight(plot.level);
        const bw = plot.level <= 15 ? Math.round(w * 0.82) : w;
        const bx = plot.level <= 15 ? x + Math.round((w - bw) / 2) : x;

        if (plot.level <= 15) {
          const buildGY  = groundY - YARD_H;
          const roofHVal = Math.round(bw * 0.42);
          const mid      = bx + Math.round(bw / 2);
          const chx      = bx + Math.round(bw * 0.67);
          const chimneyH = roofHVal + 2;

          // Total building height including roof and chimney
          const totalH = h + roofHVal + chimneyH;
          const maxLean = leanRate * (shadowExtent + YARD_H + totalH);

          const p1x = bx,              p1y = buildGY;
          const p2x = bx + bw,         p2y = buildGY;
          const p3x = bx + bw + maxLean, p3y = shadBot;
          const p4x = bx + maxLean,      p4y = shadBot;

          // Main shadow trapezoid (accounts for full building height including roof and chimney)
          gfx.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
          gfx.fillTriangle(p1x, p1y, p3x, p3y, p4x, p4y);

          // Roof peak adds an extra wedge from building top to roof peak shadow
          const peakLean = leanRate * (shadowExtent + YARD_H + h + roofHVal);
          const peakShadX = mid + peakLean;
          if (peakShadX < p3x && leanRate >= 0) {
            gfx.fillTriangle(p2x, p2y, peakShadX, shadBot, p3x, p3y);
          } else if (peakShadX > p4x && leanRate < 0) {
            gfx.fillTriangle(p1x, p1y, p4x, p4y, peakShadX, shadBot);
          }

          // Chimney adds an extra wedge from roof peak to chimney shadow
          const chimneyLean = maxLean;
          const chimneyShadX = chx + chimneyLean;
          if (chimneyShadX > peakShadX && leanRate >= 0) {
            gfx.fillTriangle(peakShadX, shadBot, p3x, p3y, chimneyShadX, shadBot);
          } else if (chimneyShadX < peakShadX && leanRate < 0) {
            gfx.fillTriangle(peakShadX, shadBot, p4x, p4y, chimneyShadX, shadBot);
          }
        } else {
          const lean = leanRate * shadowExtent;
          const p1x = bx,             p1y = groundY;
          const p2x = bx + bw,        p2y = groundY;
          const p3x = bx + bw + lean, p3y = shadBot;
          const p4x = bx + lean,      p4y = shadBot;

          gfx.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
          gfx.fillTriangle(p1x, p1y, p3x, p3y, p4x, p4y);
        }
      }
    }
  }
}
