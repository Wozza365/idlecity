import Phaser from 'phaser';
import { type PlotState } from '../game/GameState';
import {
  PLOT_COUNT, ROAD_H, VERGE_H, RIVER_H, YARD_H, PLOT_BASE_HEIGHT,
  buildingHeight, lerpColor, sunColorAtElevation,
} from '../constants';

export class SunMoon {
  private sunCircle:    Phaser.GameObjects.Arc;
  private moonCircle:   Phaser.GameObjects.Arc;
  private sunGlowSprite: Phaser.GameObjects.Image;
  private moonGlowSprite: Phaser.GameObjects.Image;
  private sunGroundGlow: Phaser.GameObjects.Ellipse;
  private shadowGfx:    Phaser.GameObjects.Graphics;
  private debugGfx:     Phaser.GameObjects.Graphics;
  readonly sunLight:    Phaser.GameObjects.Light;
  readonly moonLight:   Phaser.GameObjects.Light;
  private DEBUG_SHADOWS = false;
  private _shadowAlpha  = 0;
  get shadowAlpha(): number { return this._shadowAlpha; }

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
    this.moonCircle   = scene.add.arc(cx, groundY, 16, 0, 360, false, 0xd0d0e8, 1).setDepth(3);
    this.moonGlowSprite = scene.add.image(cx, groundY, 'sun-glow')
      .setDisplaySize(180, 180)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(2);
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
    this.moonLight = scene.lights.addLight(cx, groundY, Math.max(800, width * 2), 0xc8d8ff, 0);
    this.moonLight.height = 400;
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
    this.moonGlowSprite.setPosition(moonX, moonY).setVisible(moonElev > 0.02);
    this.sunGlowSprite.setPosition(sunX, sunY).setVisible(sunAbove);

    this.sunGroundGlow
      .setPosition(sunX, groundY + 6)
      .setVisible(sunAbove)
      .setAlpha(Math.max(0, elevation * 0.22));

    this.sunLight.x         = sunX;
    this.sunLight.y         = sunY - 300;
    this.sunLight.height = Math.max(100, 500 * Math.max(0, elevation));
    this.sunLight.intensity = Math.max(0, Math.sqrt(Math.max(0, elevation)) * 3.2);

    const sunColor = sunColorAtElevation(elevation);
    this.sunCircle.setFillStyle(sunColor);
    this.sunGlowSprite.setTint(sunColor);
    this.sunLight.setColor(sunColor);

    // Moon glow and light
    this.moonGlowSprite.setTint(0xc8d8ff);
    this.moonGlowSprite.setAlpha(Math.max(0, moonElev * 0.6));

    this.moonLight.x         = moonX;
    this.moonLight.y         = moonY;
    this.moonLight.intensity = Math.max(0, moonElev * 0.5);

    const amb = elevation >= 0
      ? Math.max(0.20, elevation * 0.55 + 0.25)
      : Math.max(0.08, elevation * 0.80 + 0.20);
    const ambTint = lerpColor(0xff8833, 0xffffff, Math.min(1, elevation * 3));
    const ar = Math.round(((ambTint >> 16) & 0xff) * amb);
    const ag = Math.round(((ambTint >> 8)  & 0xff) * amb);
    const ab = Math.round( (ambTint        & 0xff) * amb);
    this.scene.lights.setAmbientColor((ar << 16) | (ag << 8) | ab);

    this.drawShadows(sunAngle, elevation, groundY, panelTop, plots, plotWidth, sunX, sunY, width);
  }

  private drawShadows(
    sunAngle: number,
    elevation: number,
    groundY: number,
    panelTop: number,
    plots: PlotState[],
    plotWidth: number,
    sunX: number,
    sunY: number,
    _width: number,
  ): void {
    this._shadowAlpha = 0;
    const gfx = this.shadowGfx;
    gfx.clear();
    this.debugGfx.clear();
    if (elevation <= 0.02) return;

    const totalAlpha  = Math.min(0.99, elevation * 1.26 + 0.18);
    const maxShadow   = ROAD_H + VERGE_H + RIVER_H;
    const shadowExtent = Math.max(6, maxShadow * Math.pow(1 - elevation, 0.5)) * 0.3;
    const shadBot      = Math.min(groundY + shadowExtent, panelTop);

    this._shadowAlpha = totalAlpha * 0.4;

    const SHADOW_NUM_SAMPLES = 33;
    const SHADOW_DISC_SPREAD = 0.40;
    const MAX_LEAN_RATIO = Math.cos(0.55) / Math.sin(0.55);

    // ── Sign shadow setup ─────────────────────────────────────────────────────
    const signLightY    = sunY - 300;
    const buildGroundY  = groundY - YARD_H;
    const signGapY      = 12;
    const signShadowH   = 3;
    const hasSignShadow = signLightY < buildGroundY;
    const signT1 = (buildGroundY + signGapY              - signLightY) / (buildGroundY - signLightY);
    const signT2 = (buildGroundY + signGapY + signShadowH - signLightY) / (buildGroundY - signLightY);
    const baseLeanRate = Math.max(-MAX_LEAN_RATIO, Math.min(MAX_LEAN_RATIO, Math.cos(sunAngle) / Math.sin(sunAngle)));

    for (let s = 0; s < SHADOW_NUM_SAMPLES; s++) {
      const t      = (s / (SHADOW_NUM_SAMPLES - 1)) - 0.5;
      const sAngle = sunAngle + t * SHADOW_DISC_SPREAD;
      const sElev  = Math.sin(sAngle);
      const sHoriz = Math.cos(sAngle);
      if (sElev <= 0.01) continue;

      const leanRate = Math.max(-MAX_LEAN_RATIO, Math.min(MAX_LEAN_RATIO, sHoriz / sElev));

      // ── Sign shadows: disc-spread penumbra ───────────────────────────────────
      if (hasSignShadow) {
        gfx.fillStyle(0x000022, totalAlpha * 0.45 / SHADOW_NUM_SAMPLES);
        const signSunX = sunX + (leanRate - baseLeanRate) * (buildGroundY - signLightY);
        for (let i = 0; i < PLOT_COUNT; i++) {
          if (plots[i].unlocked) continue;
          const scx = i * plotWidth + Math.round(plotWidth * 0.5);
          const sL  = scx - 12;
          const sR  = scx + 12;
          gfx.fillTriangle(
            signSunX + signT1 * (sL - signSunX), buildGroundY + signGapY,
            signSunX + signT1 * (sR - signSunX), buildGroundY + signGapY,
            signSunX + signT2 * (sR - signSunX), buildGroundY + signGapY + signShadowH,
          );
          gfx.fillTriangle(
            signSunX + signT1 * (sL - signSunX), buildGroundY + signGapY,
            signSunX + signT2 * (sR - signSunX), buildGroundY + signGapY + signShadowH,
            signSunX + signT2 * (sL - signSunX), buildGroundY + signGapY + signShadowH,
          );
        }
      }

      gfx.fillStyle(0x000022, totalAlpha / SHADOW_NUM_SAMPLES);

      for (let i = 0; i < PLOT_COUNT; i++) {
        const plot = plots[i];
        if (!plot.unlocked) continue;
        const x  = i * plotWidth;
        const w  = plotWidth;
        const h  = buildingHeight(plot.level);
        const bw = plot.level <= 15 ? Math.round(w * 0.82) : w;
        const bx = plot.level <= 15 ? x + Math.round((w - bw) / 2) : x;

        if (plot.level <= 15) {
          // Tier1House: polygon projection with fixed base
          const buildGY = groundY - YARD_H;
          const top = groundY - h - YARD_H;
          const roofHVal = Math.round(bw * 0.42);
          const mid = bx + Math.round(bw / 2);
          const ov = 6;

          // Project outline points: base stays fixed, points with height lean outward
          // Points: [bottom-left, bottom-right, right-eave, peak, left-eave]
          const outline = [
            { x: bx, y: buildGY, height: 0 },
            { x: bx + bw, y: buildGY, height: 0 },
            { x: bx + bw + ov, y: top, height: h + YARD_H },
            { x: mid, y: top - roofHVal, height: h + YARD_H + roofHVal },
            { x: bx - ov, y: top, height: h + YARD_H },
          ];

          // Project each point: base stays fixed, only tip leans
          const shadowPoints = outline.map(pt => ({
            x: pt.height === 0 ? pt.x : pt.x + leanRate * (shadowExtent + pt.height),
            y: pt.height === 0 ? buildGY : shadBot,
          }));

          // Fan triangulation from first point (bottom-left)
          const p0 = shadowPoints[0];
          for (let j = 1; j < shadowPoints.length - 1; j++) {
            gfx.fillTriangle(
              p0.x, p0.y,
              shadowPoints[j].x, shadowPoints[j].y,
              shadowPoints[j + 1].x, shadowPoints[j + 1].y
            );
          }

          if (this.DEBUG_SHADOWS) {
            this.debugGfx.lineStyle(2, 0xffffff, 1);
            this.debugGfx.moveTo(shadowPoints[0].x, shadowPoints[0].y);
            for (let j = 1; j < shadowPoints.length; j++) {
              this.debugGfx.lineTo(shadowPoints[j].x, shadowPoints[j].y);
            }
            this.debugGfx.lineTo(shadowPoints[0].x, shadowPoints[0].y);
            this.debugGfx.strokePath();
          }
        } else if (plot.level <= 25) {
          // TwoStoreyHouse: same polygon projection as Tier1House, fixed body height 88 (foundH 6 = bodyH 82)
          const tsBw    = Math.round(w * 0.82);
          const tsBx    = x + Math.round((w - tsBw) / 2);
          const tsBodyH = 82;
          const tsBuildGY = groundY - YARD_H;
          const tsTop   = tsBuildGY - tsBodyH;
          const tsRoofH = Math.round(tsBw * 0.38);
          const tsMid   = tsBx + Math.round(tsBw / 2);
          const tsOv    = 6;
          const tsEffH    = tsBodyH + YARD_H;
          const tsShadBot = Math.min(groundY + shadowExtent * tsEffH / (PLOT_BASE_HEIGHT + YARD_H), panelTop);

          const tsOutline = [
            { x: tsBx,               y: tsBuildGY,       height: 0 },
            { x: tsBx + tsBw,        y: tsBuildGY,       height: 0 },
            { x: tsBx + tsBw + tsOv, y: tsTop,           height: tsEffH },
            { x: tsMid,              y: tsTop - tsRoofH,  height: tsEffH + tsRoofH },
            { x: tsBx - tsOv,        y: tsTop,           height: tsEffH },
          ];
          const tsShadow = tsOutline.map(pt => ({
            x: pt.height === 0 ? pt.x : pt.x + leanRate * (shadowExtent + pt.height),
            y: pt.height === 0 ? tsBuildGY : tsShadBot,
          }));
          const tp0 = tsShadow[0];
          for (let j = 1; j < tsShadow.length - 1; j++) {
            gfx.fillTriangle(tp0.x, tp0.y, tsShadow[j].x, tsShadow[j].y, tsShadow[j + 1].x, tsShadow[j + 1].y);
          }
        } else if (plot.level <= 40) {
          // Townhouse: 78% width, centered
          const thBw     = Math.round(w * 0.78);
          const thBx     = x + Math.round((w - thBw) / 2);
          const thBuildGY = groundY - YARD_H;
          const thEffH   = h + YARD_H;
          const thShadBot = Math.min(groundY + shadowExtent * thEffH / (PLOT_BASE_HEIGHT + YARD_H), panelTop);
          const thLean   = leanRate * (shadowExtent + thEffH);
          gfx.fillTriangle(thBx,        thBuildGY, thBx + thBw,        thBuildGY, thBx + thBw + thLean, thShadBot);
          gfx.fillTriangle(thBx,        thBuildGY, thBx + thBw + thLean, thShadBot, thBx + thLean,       thShadBot);

        } else if (plot.level <= 55) {
          // SmallApartment: full width
          const saBuilGY  = groundY - YARD_H;
          const saEffH    = h + YARD_H;
          const saShadBot = Math.min(groundY + shadowExtent * saEffH / (PLOT_BASE_HEIGHT + YARD_H), panelTop);
          const saLean    = leanRate * (shadowExtent + saEffH);
          gfx.fillTriangle(x,     saBuilGY, x + w,     saBuilGY, x + w + saLean, saShadBot);
          gfx.fillTriangle(x,     saBuilGY, x + w + saLean, saShadBot, x + saLean, saShadBot);

        } else if (plot.level <= 70) {
          // LargeApartment: full width
          const laBuildGY = groundY - YARD_H;
          const laEffH    = h + YARD_H;
          const laShadBot = Math.min(groundY + shadowExtent * laEffH / (PLOT_BASE_HEIGHT + YARD_H), panelTop);
          const laLean    = leanRate * (shadowExtent + laEffH);
          gfx.fillTriangle(x,     laBuildGY, x + w,     laBuildGY, x + w + laLean, laShadBot);
          gfx.fillTriangle(x,     laBuildGY, x + w + laLean, laShadBot, x + laLean, laShadBot);

        } else if (plot.level <= 85) {
          // OfficeBlock: full width rectangle body + optional antenna spike (lv79+)
          const obBuildGY = groundY - YARD_H;
          const obEffH    = h + YARD_H;
          const obShadBot = Math.min(groundY + shadowExtent * obEffH / (PLOT_BASE_HEIGHT + YARD_H), panelTop);
          const obLean    = leanRate * (shadowExtent + obEffH);
          gfx.fillTriangle(x,     obBuildGY, x + w,     obBuildGY, x + w + obLean, obShadBot);
          gfx.fillTriangle(x,     obBuildGY, x + w + obLean, obShadBot, x + obLean, obShadBot);
          if (plot.level >= 79) {
            // Antenna mast at x + w*0.4, 28px tall
            const antX  = x + Math.round(w * 0.4);
            const antEffH = obEffH + 28;
            const antShadBot = Math.min(groundY + shadowExtent * antEffH / (PLOT_BASE_HEIGHT + YARD_H), panelTop);
            const antLean = leanRate * (shadowExtent + antEffH);
            gfx.fillTriangle(antX, obBuildGY, antX + 2, obBuildGY, antX + 2 + antLean, antShadBot);
            gfx.fillTriangle(antX, obBuildGY, antX + 2 + antLean, antShadBot, antX + antLean, antShadBot);
          }

        } else {
          // Tier4Skyscraper: full width body + spire (lv87+, ANTENNA_H=36) polygon shadow
          const skBuildGY = groundY - YARD_H;
          const skEffH    = h + YARD_H;
          const skShadBot = Math.min(groundY + shadowExtent * skEffH / (PLOT_BASE_HEIGHT + YARD_H), panelTop);
          const skLean    = leanRate * (shadowExtent + skEffH);
          // Body rectangle
          gfx.fillTriangle(x,     skBuildGY, x + w,     skBuildGY, x + w + skLean, skShadBot);
          gfx.fillTriangle(x,     skBuildGY, x + w + skLean, skShadBot, x + skLean, skShadBot);
          if (plot.level >= 87) {
            // Spire at x + w/2, 36px tall
            const spX    = x + Math.round(w / 2);
            const spEffH = skEffH + 36;
            const spShadBot = Math.min(groundY + shadowExtent * spEffH / (PLOT_BASE_HEIGHT + YARD_H), panelTop);
            const spLean = leanRate * (shadowExtent + spEffH);
            gfx.fillTriangle(spX - 1, skBuildGY, spX + 3, skBuildGY, spX + 1 + spLean, spShadBot);
          }
        }
      }
    }

    // Yard self-shadow — one draw at full shadowAlpha so it composites over pedestrians
    // (pedestrians are Graphics at depth 9.1; this shadowGfx is depth 9.5)
    gfx.fillStyle(0x000022, this._shadowAlpha);
    for (let i = 0; i < PLOT_COUNT; i++) {
      if (!plots[i].unlocked) continue;
      gfx.fillRect(i * plotWidth, groundY - YARD_H, plotWidth, YARD_H);
    }

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
            const totalH = h + roofHVal + (roofHVal + 2);
            const maxLean = leanRate * (shadowExtent + YARD_H + totalH);

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
