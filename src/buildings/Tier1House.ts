import Phaser from 'phaser';
import { YARD_H, buildingHeight } from '../constants';

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((Math.round(ar + (br - ar) * t) << 16) |
          (Math.round(ag + (bg - ag) * t) << 8)  |
           Math.round(ab + (bb - ab) * t));
}

export class Tier1House extends Phaser.GameObjects.Container {
  private outlinePoints: Array<{ x: number; y: number; height: number }> = [];
  private windowLights: Phaser.GameObjects.Light[] = [];
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private lampConeGfx:    Phaser.GameObjects.Graphics | null = null;
  private smokeGfx:       Phaser.GameObjects.Graphics | null = null;
  private windowRects: Array<{ wx: number; wy: number; ww: number; wh: number; sashH: number; halfWw: number; upperDay: number; lowerDay: number }> = [];
  private smokeParticles: Array<{ x: number; y: number; alpha: number; dx: number }> = [];
  private chimneyX    = 0;
  private chimneyTopY = 0;
  private nextSmoke   = 0;
  private lightPhases: number[] = [];

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w      = plotWidth;
    const h      = buildingHeight(level);
    let   top    = groundY - h;

    const bw      = Math.round(w * 0.82);
    const bx      = x + Math.round((w - bw) / 2);
    const gy      = groundY;
    const foundH  = 6;
    const buildGY = gy - YARD_H;
    top -= YARD_H;
    const bodyH = h - foundH;

    // ── Body ──────────────────────────────────────────────────
    const body = scene.add.rectangle(bx + bw / 2, top + bodyH / 2, bw, bodyH, 0xfdf7ed);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Foundation ────────────────────────────────────────────
    gfx.fillStyle(0x9e9890, 1);
    gfx.fillRect(bx, buildGY - foundH, bw, foundH);
    gfx.lineStyle(1, 0x7e7870, 1);
    gfx.moveTo(bx, buildGY - foundH).lineTo(bx + bw, buildGY - foundH).strokePath();

    // ── Front yard lawn ───────────────────────────────────────
    gfx.fillStyle(0x5a8c3a, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    gfx.fillStyle(0x4a7a2e, 1);
    gfx.fillRect(x, buildGY, w, 2);

    // ── Roof params ───────────────────────────────────────────
    const roofH = Math.round(bw * 0.42);
    const ov    = 6;
    const mid   = bx + Math.round(bw / 2);

    // ── Building outline for shadow projection ─────────────────
    // Store the polygon points with their heights for shadow casting
    // Points go: bottom-left, bottom-right, right-eave, peak, left-eave
    this.outlinePoints = [
      { x: bx, y: buildGY, height: 0 },                          // bottom-left (ground level, no height)
      { x: bx + bw, y: buildGY, height: 0 },                     // bottom-right
      { x: bx + bw + ov, y: top, height: h + YARD_H },           // right roof eave (at building top, height from ground)
      { x: mid, y: top - roofH, height: h + YARD_H + roofH },    // roof peak (full height including roof)
      { x: bx - ov, y: top, height: h + YARD_H },                // left roof eave
    ];

    // ── Chimney (drawn before roof so roof occludes base) ─────
    const cw          = Math.round(bw * 0.10);
    const chx         = bx + Math.round(bw * 0.67);
    const chimneyTopY = top - roofH - 2;
    this.chimneyX     = chx + Math.round(cw / 2);
    this.chimneyTopY  = chimneyTopY;
    gfx.fillStyle(0x9a3e2e, 1);
    gfx.fillRect(chx, chimneyTopY, cw, top - chimneyTopY);

    // ── Roof ──────────────────────────────────────────────────
    gfx.fillStyle(0xb04030, 1);
    gfx.fillTriangle(bx - ov, top, bx + bw + ov, top, mid, top - roofH);

    // Lv 5+: gable window
    if (level >= 5) {
      const dw2 = Math.round(bw * 0.18);
      const dh2 = Math.round(roofH * 0.28);
      const dx2 = mid - Math.round(dw2 / 2);
      const dy2 = top - roofH + Math.round(roofH * 0.24);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(dx2, dy2, dw2, dh2);
      gfx.fillStyle(0x8ab4cc, 1);
      gfx.fillRect(dx2 + 2, dy2 + 2, dw2 - 4, dh2 - 4);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(dx2 + 2, dy2 + 2 + Math.round((dh2 - 4) / 2), dw2 - 4, 2);
      gfx.fillRect(dx2 + 2 + Math.round((dw2 - 4) / 2), dy2 + 2, 2, dh2 - 4);

      // Register glass rect and lights for the gable window
      const gpx = dx2 + 2, gpy = dy2 + 2, gpw = dw2 - 4, gph = dh2 - 4;
      const gSashH = Math.round(gph / 2);
      const gHalfWw = Math.round(gpw / 2);
      this.windowRects.push({ wx: gpx, wy: gpy, ww: gpw, wh: gph, sashH: gSashH, halfWw: gHalfWw, upperDay: 0x8ab4cc, lowerDay: 0x8ab4cc });
      for (const [offX, offY, pw, ph] of [
        [0,           0,          gHalfWw - 1,       gSashH],
        [gHalfWw + 1, 0,          gpw - gHalfWw - 1, gSashH],
        [0,           gSashH + 2, gHalfWw - 1,       gph - gSashH - 2],
        [gHalfWw + 1, gSashH + 2, gpw - gHalfWw - 1, gph - gSashH - 2],
      ] as [number, number, number, number][]) {
        this.windowLights.push(scene.lights.addLight(gpx + offX + pw / 2, gpy + offY + ph / 2, 48, 0xffaa44, 0));
      }
    }

    // Lv 14+: birdbath in right side of yard
    if (level >= 14) {
      const bbX     = x + Math.round(w * 0.80);
      const bbBaseY = buildGY - 2;
      gfx.fillStyle(0xb8b0a0, 1);
      gfx.fillRect(bbX, bbBaseY - 12, 2, 10);          // pedestal pole
      gfx.fillStyle(0xc8c0b0, 1);
      gfx.fillRect(bbX - 3, bbBaseY - 4, 8, 3);         // base disc
      gfx.fillStyle(0xd0c8b8, 1);
      gfx.fillRect(bbX - 6, bbBaseY - 15, 14, 4);       // basin
      gfx.fillStyle(0x7090a8, 1);
      gfx.fillRect(bbX - 5, bbBaseY - 14, 12, 2);       // water
    }

    // Rake trim + eave soffit
    gfx.lineStyle(2, 0xf0e4cc, 1);
    gfx.moveTo(bx - ov, top).lineTo(mid, top - roofH).strokePath();
    gfx.moveTo(bx + bw + ov, top).lineTo(mid, top - roofH).strokePath();
    gfx.lineStyle(2, 0xede0c8, 1);
    gfx.moveTo(bx - ov, top).lineTo(bx + bw + ov, top).strokePath();

    // ── Chimney brick detail above roof slope ─────────────────
    const slopeT = Math.max(0, (chx - mid) / (bw / 2 + ov));
    const slopeY = top - roofH + slopeT * roofH;
    gfx.lineStyle(1, 0x6e2818, 1);
    for (let cy = chimneyTopY + 4; cy < slopeY - 2; cy += 5) {
      gfx.moveTo(chx, cy).lineTo(chx + cw, cy).strokePath();
    }
    gfx.fillStyle(0x7a6e64, 1);
    gfx.fillRect(chx - 2, chimneyTopY, cw + 4, 3);

    // Lv 4+: low front hedge; Lv 10+ it grows taller
    if (level >= 4) {
      const hedgeH = level >= 10 ? 10 : 5;
      gfx.fillStyle(0x2d6a1e, 1);
      gfx.fillRect(bx, buildGY, bw, hedgeH);
      gfx.fillStyle(0x3a8428, 1);
      gfx.fillRect(bx, buildGY, bw, 2);
    }

    // ── Windows ───────────────────────────────────────────────
    const ww  = Math.round(bw * 0.15);
    const wh  = Math.round(ww * 1.4);
    const wy  = top + Math.round(bodyH * 0.18);
    const sw  = Math.round(ww * 0.40);
    const wx1 = bx + Math.round(bw * 0.16);
    const wx2 = bx + Math.round(bw * 0.66);

    for (const wxx of [wx1, wx2]) {
      if (level >= 2) {
        gfx.fillStyle(0x265c22, 1);
        gfx.fillRect(wxx - sw - 1, wy, sw, wh);
        gfx.fillRect(wxx + ww + 1, wy, sw, wh);
      }
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(wxx - 2, wy - 2, ww + 4, wh + 4);
      const sashH = Math.round(wh / 2) - 1;
      gfx.fillStyle(0x8ab4cc, 1);
      gfx.fillRect(wxx, wy, ww, sashH);
      gfx.fillStyle(0x9ec2d8, 1);
      gfx.fillRect(wxx, wy + sashH + 2, ww, wh - sashH - 2);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(wxx, wy + sashH, ww, 2);
      gfx.fillRect(wxx + Math.round(ww / 2) - 1, wy, 2, wh);
      gfx.fillRect(wxx - 3, wy + wh + 2, ww + 6, 3);
    }

    // ── Door ──────────────────────────────────────────────────
    const dw     = Math.round(bw * 0.20);
    const dh     = Math.round(bodyH * 0.52);
    const dx     = bx + Math.round((bw - dw) / 2);
    const dy     = buildGY - foundH - dh;
    const pInset = Math.round(dw * 0.12);
    const ph     = Math.round(dh * 0.32);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRect(dx - 2, dy - 2, dw + 4, dh + 2);
    gfx.fillStyle(0xb02e1e, 1);
    gfx.fillRect(dx, dy, dw, dh);
    gfx.fillStyle(0xc84030, 1);
    gfx.fillRect(dx + pInset, dy + 4,      dw - pInset * 2, ph);
    gfx.fillRect(dx + pInset, dy + ph + 8, dw - pInset * 2, ph);
    gfx.lineStyle(1, 0x7a1e10, 1);
    gfx.strokeRect(dx + pInset, dy + 4,      dw - pInset * 2, ph);
    gfx.strokeRect(dx + pInset, dy + ph + 8, dw - pInset * 2, ph);
    gfx.fillStyle(0xd4a820, 1);
    gfx.fillCircle(dx + dw - 5, dy + Math.round(dh * 0.52), 2);
    gfx.fillStyle(0xe8dcc8, 1);
    gfx.fillRect(dx - 3, dy - 5, dw + 6, 5);
    gfx.fillStyle(0xb0b0a4, 1);
    gfx.fillRect(dx - 3, buildGY - foundH, dw + 6, foundH);
    gfx.fillStyle(0xa0a094, 1);
    gfx.fillRect(dx - 6, buildGY - 3, dw + 12, 3);

    // Lv 9+: porch lantern above door
    let porchLightPos: { cx: number; cy: number } | null = null;
    if (level >= 9) {
      const lx = dx + Math.round(dw / 2);
      gfx.fillStyle(0x404038, 1);
      gfx.fillRect(lx - 3, dy - 10, 6, 8);
      gfx.fillStyle(0xffdd88, 1);
      gfx.fillRect(lx - 2, dy - 9, 4, 6);
      gfx.fillStyle(0x606058, 1);
      gfx.fillRect(lx - 1, dy - 2, 2, 3);
      porchLightPos = { cx: lx, cy: dy - 6 };
    }

    // ── Corner trim boards ────────────────────────────────────
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRect(bx, top, 4, bodyH);
    gfx.fillRect(bx + bw - 4, top, 4, bodyH);

    // Lv 3+: flower boxes under each window
    if (level >= 3) {
      for (const wxx of [wx1, wx2]) {
        const fbY = wy + wh + 6;
        const fbX = wxx - 3;
        const fbW = ww + 6;
        gfx.fillStyle(0x5c3818, 1);
        gfx.fillRect(fbX, fbY, fbW, 5);
        const flowerColors = [0xe83030, 0xffcc00, 0xff88aa];
        for (let f = 0; f < 3; f++) {
          gfx.fillStyle(flowerColors[f % 3], 1);
          gfx.fillCircle(fbX + Math.round(fbW * (f + 0.5) / 3), fbY - 2, 2);
        }
      }
    }

    // Lv 11+: stepping-stone path to door
    if (level >= 11) {
      const pathW = dw - 4;
      const pathX = dx + 2;
      gfx.fillStyle(0xc8b898, 1);
      for (let py = buildGY + 2; py < gy - 3; py += 7) {
        gfx.fillRect(pathX, py, pathW, 4);
      }
    }

    // Lv 6+: left bush (Lv 12+ becomes a tree)
    if (level >= 6) {
      const bshX = bx + 8;
      const bshY = buildGY - foundH;
      if (level >= 12) {
        gfx.fillStyle(0x5a3010, 1);
        gfx.fillRect(bshX - 1, bshY - 14, 3, 20);
        gfx.fillStyle(0x217a10, 1);
        gfx.fillCircle(bshX, bshY - 18, 9);
        gfx.fillStyle(0x2e9a1a, 1);
        gfx.fillCircle(bshX - 3, bshY - 21, 5);
        gfx.fillCircle(bshX + 4, bshY - 20, 6);
      } else {
        gfx.fillStyle(0x4a2808, 1);
        gfx.fillRect(bshX - 1, bshY - 7, 2, 13);
        gfx.fillStyle(0x257018, 1);
        gfx.fillCircle(bshX, bshY - 9, 6);
        gfx.fillStyle(0x308a20, 1);
        gfx.fillCircle(bshX - 2, bshY - 11, 3);
      }
    }

    // Lv 7+: right bush
    if (level >= 7) {
      const bshX = bx + bw - 8;
      const bshY = buildGY - foundH;
      gfx.fillStyle(0x4a2808, 1);
      gfx.fillRect(bshX - 1, bshY - 7, 2, 13);
      gfx.fillStyle(0x257018, 1);
      gfx.fillCircle(bshX, bshY - 9, 6);
      gfx.fillStyle(0x308a20, 1);
      gfx.fillCircle(bshX + 2, bshY - 11, 3);
    }

    // Lv 8+: picket fence at road edge of yard
    const fencePosts: Array<{ cx: number; cy: number }> = [];
    if (level >= 8) {
      const fenceBot = gy - 2;
      gfx.fillStyle(0xe8e4d8, 1);
      gfx.fillRect(x, fenceBot - 7, w, 2);
      const n = 6;
      const spacing = w / n;
      for (let i = 0; i < n; i++) {
        const fx = Math.round(x + spacing * (i + 0.5)) - 1;
        gfx.fillRect(fx, fenceBot - 10, 3, 10);
        gfx.fillTriangle(fx, fenceBot - 10, fx + 3, fenceBot - 10, fx + 1, fenceBot - 13);
        fencePosts.push({ cx: fx + 1, cy: fenceBot - 6 });
      }
    }

    // Lv 13+: mailbox at front-left of plot
    if (level >= 13) {
      const mbX = x + 5;
      const mbY = gy - 18;
      gfx.fillStyle(0x888880, 1);
      gfx.fillRect(mbX + 1, mbY + 3, 2, 6);
      gfx.fillStyle(0xcc3322, 1);
      gfx.fillRect(mbX, mbY, 9, 6);
      gfx.fillStyle(0xaa2818, 1);
      gfx.fillRect(mbX, mbY, 9, 2);
      gfx.fillStyle(0x888880, 1);
      gfx.fillRect(mbX + 9, mbY + 1, 1, 4);
      gfx.fillStyle(0xff6622, 1);
      gfx.fillRect(mbX + 10, mbY + 1, 4, 3);
    }

    // Lv 15+: flower bed in front of house
    if (level >= 15) {
      const fbY = buildGY + 2;
      const fbX = dx - 10;
      const fbW = dw + 20;
      gfx.fillStyle(0x4a2810, 1);
      gfx.fillRect(fbX, fbY, fbW, 4);
      const colors = [0xff4040, 0xffbb00, 0xff88cc, 0x88ee44, 0xff6600];
      for (let f = 0; f < 5; f++) {
        gfx.fillStyle(colors[f], 1);
        gfx.fillCircle(fbX + Math.round(fbW * (f + 0.5) / 5), fbY - 2, 2);
      }
    }

    this.add(gfx);

    // ── Lens glows & point lights ─────────────────────────────────────────────
    const lampConeGfx = scene.add.graphics();
    // Fence post lenses (level 8+)
    for (const { cx, cy } of fencePosts) {
      lampConeGfx.fillStyle(0xfff4cc, 1);
      lampConeGfx.fillCircle(cx, cy, 2);
    }
    // Porch lantern lens (level 9+)
    if (porchLightPos) {
      lampConeGfx.fillStyle(0xffdd88, 1);
      lampConeGfx.fillCircle(porchLightPos.cx, porchLightPos.cy, 2);
    }
    lampConeGfx.setAlpha(0);
    lampConeGfx.setBlendMode(Phaser.BlendModes.ADD);
    this.add(lampConeGfx);
    this.lampConeGfx = lampConeGfx;

    // Fence post point lights (level 8+)
    for (const { cx, cy } of fencePosts) {
      this.windowLights.push(scene.lights.addLight(cx, cy, 35, 0xffee88, 0));
    }
    // Porch lantern point light (level 9+)
    if (porchLightPos) {
      this.windowLights.push(scene.lights.addLight(porchLightPos.cx, porchLightPos.cy, 45, 0xffcc44, 0));
    }

    // ── Window glass overlay & lights ─────────────────────────────────────────
    // Non-lit Graphics drawn last in the container so it's always above the
    // lit building gfx. Cleared and redrawn each frame to smoothly blend the
    // glass colour from day-blue → warm-yellow at night. Redrawing dividers
    // here ensures they stay visible on top of the animated glass fill.
    const sashH = Math.round(wh / 2) - 1;
    const halfWw = Math.round(ww / 2);

    for (const wxx of [wx1, wx2]) {
      this.windowRects.push({ wx: wxx, wy, ww, wh, sashH, halfWw, upperDay: 0x8ab4cc, lowerDay: 0x9ec2d8 });
      const panes = [
        { px: wxx,              py: wy,             pw: halfWw - 1,      ph: sashH },
        { px: wxx + halfWw + 1, py: wy,             pw: ww - halfWw - 1, ph: sashH },
        { px: wxx,              py: wy + sashH + 2, pw: halfWw - 1,      ph: wh - sashH - 2 },
        { px: wxx + halfWw + 1, py: wy + sashH + 2, pw: ww - halfWw - 1, ph: wh - sashH - 2 },
      ];
      for (const { px, py, pw, ph } of panes) {
        this.windowLights.push(scene.lights.addLight(px + pw / 2, py + ph / 2, 64, 0xffaa44, 0));
      }
    }

    const windowGlassGfx = scene.add.graphics();
    windowGlassGfx.setLighting(true);
    this.drawWindowGlass(windowGlassGfx, 0);
    this.add(windowGlassGfx);
    this.windowGlassGfx = windowGlassGfx;

    const smokeGfx = scene.add.graphics();
    this.add(smokeGfx);
    this.smokeGfx = smokeGfx;

    this.lightPhases = this.windowLights.map(() => Math.random() * Math.PI * 2);

    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      for (const light of this.windowLights) {
        scene.lights.removeLight(light);
      }
    });
  }

  updateWindowLights(elevation: number): void {
    const t    = Math.max(0, Math.min(1, (0.3 - elevation) / 0.3));
    const time = this.scene.time.now / 1000;

    this.windowLights.forEach((light, i) => {
      const flicker = 1 + Math.sin(time * 1.7 + this.lightPhases[i]) * 0.10;
      light.intensity = t * 0.375 * flicker;
    });
    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, t);
    if (this.lampConeGfx) this.lampConeGfx.setAlpha(t * 0.45);

    // Chimney smoke
    const now = this.scene.time.now;
    if (now > this.nextSmoke) {
      this.smokeParticles.push({
        x: this.chimneyX + (Math.random() - 0.5) * 2,
        y: this.chimneyTopY,
        alpha: 0.5,
        dx: (Math.random() - 0.5) * 0.4,
      });
      this.nextSmoke = now + 200 + Math.random() * 150;
    }
    for (const p of this.smokeParticles) { p.y -= 0.07; p.x += p.dx; p.alpha -= 0.006; }
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      if (this.smokeParticles[i].alpha <= 0) this.smokeParticles.splice(i, 1);
    }
    if (this.smokeGfx) {
      this.smokeGfx.clear();
      for (const p of this.smokeParticles) {
        this.smokeGfx.fillStyle(0xb8b8b8, p.alpha);
        this.smokeGfx.fillCircle(Math.round(p.x), Math.round(p.y), 2);
      }
    }
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number): void {
    gfx.clear();
    for (const { wx, wy: winY, ww, wh, sashH, halfWw, upperDay, lowerDay } of this.windowRects) {
      gfx.fillStyle(lerpColor(upperDay, 0xffcc66, t), 1);
      gfx.fillRect(wx, winY, ww, sashH);
      gfx.fillStyle(lerpColor(lowerDay, 0xffcc66, t), 1);
      gfx.fillRect(wx, winY + sashH + 2, ww, wh - sashH - 2);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(wx, winY + sashH, ww, 2);
      gfx.fillRect(wx + halfWw - 1, winY, 2, wh);
    }
  }

  getOutlinePoints() {
    return this.outlinePoints;
  }
}
