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
  private debugGfx:     Phaser.GameObjects.Graphics;
  readonly sunLight:    Phaser.GameObjects.Light;
  private DEBUG_SHADOWS = false;

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
    this.debugGfx     = scene.add.graphics().setDepth(9.6);
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
    this.sunLight.height = 400;
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
    this.sunLight.height = Math.max(100, 500 * Math.max(0, elevation));
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

    this.drawShadows(sunAngle, elevation, groundY, panelTop, plots, plotWidth);
  }

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
    this.debugGfx.clear();
    if (elevation <= 0.02) return;

    const totalAlpha  = Math.min(0.99, elevation * 1.26 + 0.18);
    const maxShadow   = ROAD_H + VERGE_H + RIVER_H;
    const shadowExtent = Math.max(6, maxShadow * Math.pow(1 - elevation, 0.5));
    const shadBot      = Math.min(groundY + shadowExtent, panelTop);

    const NUM_SAMPLES    = 11;
    const DISC_SPREAD    = 0.10;
    const MAX_LEAN_RATIO = Math.cos(0.35) / Math.sin(0.35);

    // Capture first sample geometry for debug rendering
    let firstSampleLeanRate = 0;

    for (let s = 0; s < NUM_SAMPLES; s++) {
      const t      = (s / (NUM_SAMPLES - 1)) - 0.5;
      const sAngle = sunAngle + t * DISC_SPREAD;
      const sElev  = Math.sin(sAngle);
      const sHoriz = Math.cos(sAngle);
      if (sElev <= 0.01) continue;

      const leanRate = Math.max(-MAX_LEAN_RATIO, Math.min(MAX_LEAN_RATIO, sHoriz / sElev));
      if (s === 0 || (s === 1 && sElev <= 0.01)) firstSampleLeanRate = leanRate;
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

          const totalH = h + roofHVal + chimneyH;
          const maxLean = leanRate * (shadowExtent + YARD_H + totalH);

          const p1x = bx,              p1y = buildGY;
          const p2x = bx + bw,         p2y = buildGY;
          const p3x = bx + bw + maxLean, p3y = shadBot;
          const p4x = bx + maxLean,      p4y = shadBot;

          gfx.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
          gfx.fillTriangle(p1x, p1y, p3x, p3y, p4x, p4y);

          // Roof shadow: triangle at bottom of main shadow pointing further down
          const peakLean = leanRate * (shadowExtent + YARD_H + h + roofHVal);
          const peakShadX = mid + peakLean;
          const shadowDepth = shadBot - buildGY;
          const roofShadowTip = shadBot + Math.round(shadowDepth * roofHVal / h);
          gfx.fillTriangle(p4x, shadBot, p3x, shadBot, peakShadX, roofShadowTip);

          if (this.DEBUG_SHADOWS) {
            this.debugGfx.lineStyle(2, 0xffffff, 1);
            this.debugGfx.moveTo(p1x, p1y);
            this.debugGfx.lineTo(p2x, p2y);
            this.debugGfx.lineTo(p3x, p3y);
            this.debugGfx.lineTo(p4x, p4y);
            this.debugGfx.lineTo(p1x, p1y);
            this.debugGfx.strokePath();
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

    // Render clear outlines for main/roof/chimney shadows (center sample only, after penumbra sampling)
    if (this.DEBUG_SHADOWS) {
      const sAngle = sunAngle;
      const sElev = Math.sin(sAngle);
      const sHoriz = Math.cos(sAngle);
      if (sElev > 0.01) {
        const leanRate = Math.max(-MAX_LEAN_RATIO, Math.min(MAX_LEAN_RATIO, sHoriz / sElev));

        for (let i = 0; i < PLOT_COUNT; i++) {
          const plot = plots[i];
          if (!plot.unlocked) continue;

          const x = i * plotWidth;
          const w = plotWidth;
          const h = buildingHeight(plot.level);
          const bw = plot.level <= 15 ? Math.round(w * 0.82) : w;
          const bx = plot.level <= 15 ? x + Math.round((w - bw) / 2) : x;

          if (plot.level <= 15) {
            const buildGY = groundY - YARD_H;
            const roofHVal = Math.round(bw * 0.42);
            const mid = bx + Math.round(bw / 2);
            const chx = bx + Math.round(bw * 0.67);
            const chimneyH = roofHVal + 2;
            const totalH = h + roofHVal + chimneyH;
            const maxLean = leanRate * (shadowExtent + YARD_H + totalH);
            const peakLean = leanRate * (shadowExtent + YARD_H + h + roofHVal);

            const p1x = bx, p1y = buildGY;
            const p2x = bx + bw, p2y = buildGY;
            const p3x = bx + bw + maxLean, p3y = shadBot;
            const p4x = bx + maxLean, p4y = shadBot;

            // Main shadow white outline
            this.debugGfx.lineStyle(3, 0xffffff, 1);
            this.debugGfx.moveTo(p1x, p1y);
            this.debugGfx.lineTo(p2x, p2y);
            this.debugGfx.lineTo(p3x, p3y);
            this.debugGfx.lineTo(p4x, p4y);
            this.debugGfx.lineTo(p1x, p1y);
            this.debugGfx.strokePath();

          }
        }
      }
    }
  }

  resize(width: number): void {
    this.sunGroundGlow.setDisplaySize(Math.round(width * 0.5), 22);
    this.sunLight.radius = Math.max(800, width * 2);
  }

}
