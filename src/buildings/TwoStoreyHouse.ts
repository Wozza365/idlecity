import Phaser from 'phaser';
import { YARD_H } from '../constants';
import { type DoorEntrance } from './types';

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((Math.round(ar + (br - ar) * t) << 16) |
          (Math.round(ag + (bg - ag) * t) << 8)  |
           Math.round(ab + (bb - ab) * t));
}

const BODY_H = 88;

type SmokeParticle = { x: number; y: number; alpha: number; dx: number; fadeRate: number; radius: number; maxAlpha: number; color: number; growing: boolean };

export class TwoStoreyHouse extends Phaser.GameObjects.Container {
  readonly doorEntrances: DoorEntrance[] = [];
  private windowLights:   Phaser.GameObjects.Light[] = [];
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private lampConeGfx:    Phaser.GameObjects.Graphics | null = null;
  private smokeGfx:       Phaser.GameObjects.Graphics | null = null;
  private windowRects: Array<{
    wx: number; wy: number; ww: number; wh: number;
    sashH: number; halfWw: number; upperDay: number; lowerDay: number;
  }> = [];
  private smokeParticles: SmokeParticle[] = [];
  private chimneyX    = 0;
  private chimneyTopY = 0;
  private nextSmoke   = 0;
  private lightPhases: number[] = [];
  private shadowGfx!: Phaser.GameObjects.Graphics;

  getSmokeParticles(): SmokeParticle[] { return this.smokeParticles; }

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number, initialParticles?: SmokeParticle[]) {
    super(scene, 0, 0);

    const w        = plotWidth;
    const bw       = Math.round(w * 0.82);
    const bx       = x + Math.round((w - bw) / 2);
    const gy       = groundY;
    const foundH   = 6;
    const bodyH    = BODY_H - foundH;
    const buildGY  = gy - YARD_H;
    const top      = buildGY - bodyH;

    // Upper floor is 43% of body height — ground floor gets the extra headroom
    const upperH    = Math.round(bodyH * 0.43);
    const floorDivY = top + upperH;

    // ── Body — warm limestone ──────────────────────────────────
    const body = scene.add.rectangle(bx + bw / 2, top + bodyH / 2, bw, bodyH, 0xf2ead8);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Foundation ────────────────────────────────────────────
    gfx.fillStyle(0x9e9890, 1);
    gfx.fillRect(bx, buildGY - foundH, bw, foundH);
    gfx.lineStyle(1, 0x7e7870, 1);
    gfx.moveTo(bx, buildGY - foundH).lineTo(bx + bw, buildGY - foundH).strokePath();

    // ── String course (floor divider) — 3-layer architectural band
    gfx.fillStyle(0xb0a48c, 1);
    gfx.fillRect(bx, floorDivY - 1, bw, 1);       // shadow above
    gfx.fillStyle(0xddd0b4, 1);
    gfx.fillRect(bx, floorDivY, bw, 5);            // main course
    gfx.fillStyle(0xede0c4, 1);
    gfx.fillRect(bx, floorDivY + 5, bw, 1);        // highlight below

    // ── Front yard lawn ───────────────────────────────────────
    gfx.fillStyle(0x5a8c3a, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    gfx.fillStyle(0x4a7a2e, 1);
    gfx.fillRect(x, buildGY, w, 2);

    // ── Roof params ───────────────────────────────────────────
    const roofH = Math.round(bw * 0.38);
    const ov    = 6;
    const mid   = bx + Math.round(bw / 2);

    // ── Chimney (behind roof) ─────────────────────────────────
    const cw          = Math.round(bw * 0.10);
    const chx         = bx + Math.round(bw * 0.67);
    const chimneyTopY = top - roofH - 2;
    this.chimneyX    = chx + Math.round(cw / 2);
    this.chimneyTopY = chimneyTopY;
    gfx.fillStyle(0x9a3e2e, 1);
    gfx.fillRect(chx, chimneyTopY, cw, top - chimneyTopY);

    // ── Roof ──────────────────────────────────────────────────
    gfx.fillStyle(0xa03828, 1);
    gfx.fillTriangle(bx - ov, top, bx + bw + ov, top, mid, top - roofH);

    // Lv 23+: gable window
    let gableRect: { gpx: number; gpy: number; gpw: number; gph: number } | null = null;
    if (level >= 23) {
      const gw2 = Math.round(bw * 0.18);
      const gh2 = Math.round(roofH * 0.28);
      const gx2 = mid - Math.round(gw2 / 2);
      const gy2 = top - roofH + Math.round(roofH * 0.24);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(gx2, gy2, gw2, gh2);
      gfx.fillStyle(0x8ab4cc, 1);
      gfx.fillRect(gx2 + 2, gy2 + 2, gw2 - 4, gh2 - 4);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(gx2 + 2, gy2 + 2 + Math.round((gh2 - 4) / 2), gw2 - 4, 2);
      gfx.fillRect(gx2 + 2 + Math.round((gw2 - 4) / 2), gy2 + 2, 2, gh2 - 4);
      gableRect = { gpx: gx2 + 2, gpy: gy2 + 2, gpw: gw2 - 4, gph: gh2 - 4 };
    }

    // Rake trim + eave soffit
    gfx.lineStyle(2, 0xf0e4cc, 1);
    gfx.moveTo(bx - ov, top).lineTo(mid, top - roofH).strokePath();
    gfx.moveTo(bx + bw + ov, top).lineTo(mid, top - roofH).strokePath();
    gfx.lineStyle(2, 0xede0c8, 1);
    gfx.moveTo(bx - ov, top).lineTo(bx + bw + ov, top).strokePath();

    // Chimney brick detail
    const slopeT = Math.max(0, (chx - mid) / (bw / 2 + ov));
    const slopeY = top - roofH + slopeT * roofH;
    gfx.lineStyle(1, 0x6e2818, 1);
    for (let cy = chimneyTopY + 4; cy < slopeY - 2; cy += 5) {
      gfx.moveTo(chx, cy).lineTo(chx + cw, cy).strokePath();
    }
    gfx.fillStyle(0x7a6e64, 1);
    gfx.fillRect(chx - 2, chimneyTopY, cw + 4, 3);

    // ── Corner quoins ─────────────────────────────────────────
    const qW = 7;
    for (const qbx of [bx, bx + bw - qW]) {
      const shadowX = qbx === bx ? qbx + qW - 1 : qbx;
      let qy = top; let wide = true;
      while (qy < buildGY - foundH - 2) {
        const qh = wide ? 9 : 5;
        gfx.fillStyle(0xe4d8be, 1);
        gfx.fillRect(qbx, qy, qW, Math.min(qh, buildGY - foundH - qy));
        gfx.fillStyle(0xbcb09a, 1);
        gfx.fillRect(shadowX, qy, 1, Math.min(qh, buildGY - foundH - qy));
        qy += qh + 2; wide = !wide;
      }
    }

    // ── Windows ───────────────────────────────────────────────
    const ww   = Math.round(bw * 0.15);
    const wh   = Math.round(ww * 1.4);
    const sw   = Math.round(ww * 0.40);
    const wx1  = bx + Math.round(bw * 0.16);
    const wx2  = bx + Math.round(bw * 0.66);
    const wyUp = top + Math.round((upperH - wh) / 2);
    const groundH = bodyH - upperH - 6; // subtract string course
    const wyLo = floorDivY + 6 + Math.round((groundH - wh) / 2);

    for (const [wxx, wy] of [[wx1, wyUp], [wx2, wyUp], [wx1, wyLo], [wx2, wyLo]] as [number, number][]) {
      // Stone lintel above window
      gfx.fillStyle(0xd4c8ae, 1);
      gfx.fillRect(wxx - 4, wy - 6, ww + 8, 4);
      gfx.fillStyle(0xb0a48c, 1);
      gfx.fillRect(wxx - 4, wy - 7, ww + 8, 1);

      // Lv 17+: shutters
      if (level >= 17) {
        gfx.fillStyle(0x8c2418, 1);
        gfx.fillRect(wxx - sw - 1, wy, sw, wh);
        gfx.fillRect(wxx + ww + 1, wy, sw, wh);
      }

      // White frame
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(wxx - 2, wy - 2, ww + 4, wh + 4);

      // Glass panes
      const sashH = Math.round(wh / 2) - 1;
      gfx.fillStyle(0x8ab4cc, 1);
      gfx.fillRect(wxx, wy, ww, sashH);
      gfx.fillStyle(0x9ec2d8, 1);
      gfx.fillRect(wxx, wy + sashH + 2, ww, wh - sashH - 2);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(wxx, wy + sashH, ww, 2);
      gfx.fillRect(wxx + Math.round(ww / 2) - 1, wy, 2, wh);

      // Deeper projecting sill with shadow
      gfx.fillStyle(0xd4c8ae, 1);
      gfx.fillRect(wxx - 4, wy + wh + 2, ww + 8, 4);
      gfx.fillStyle(0xb0a48c, 1);
      gfx.fillRect(wxx - 4, wy + wh + 6, ww + 8, 1);
    }

    // ── Door ──────────────────────────────────────────────────
    const dw     = Math.round(bw * 0.20);
    const dh     = Math.round((bodyH - upperH - 6) * 0.82);
    const dx     = bx + Math.round((bw - dw) / 2);
    const dy     = buildGY - foundH - dh;
    this.doorEntrances = [{ x: dx + Math.round(dw / 2), y: buildGY - foundH }];
    const pInset = Math.round(dw * 0.12);
    const ph     = Math.round(dh * 0.30);

    // Classical pediment above door
    const portW = dw + 18;
    const portX = dx - 9;
    gfx.fillStyle(0xe0d4bc, 1);
    gfx.fillRect(portX, dy - 9, portW, 7);
    gfx.fillStyle(0xb0a48c, 1);
    gfx.fillRect(portX, dy - 9, portW, 1);
    gfx.fillStyle(0xe8dcca, 1);
    gfx.fillTriangle(portX, dy - 9, portX + portW, dy - 9, portX + Math.round(portW / 2), dy - 17);
    gfx.lineStyle(1, 0xb0a48c, 1);
    gfx.moveTo(portX, dy - 9)
       .lineTo(portX + Math.round(portW / 2), dy - 17)
       .lineTo(portX + portW, dy - 9).strokePath();

    // Door surround + body
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRect(dx - 3, dy - 2, dw + 6, dh + 2);
    gfx.fillStyle(0x8a2010, 1);
    gfx.fillRect(dx, dy, dw, dh);
    gfx.fillStyle(0xa02818, 1);
    gfx.fillRect(dx + pInset, dy + 4,      dw - pInset * 2, ph);
    gfx.fillRect(dx + pInset, dy + ph + 8, dw - pInset * 2, ph);
    gfx.lineStyle(1, 0x601408, 1);
    gfx.strokeRect(dx + pInset, dy + 4,      dw - pInset * 2, ph);
    gfx.strokeRect(dx + pInset, dy + ph + 8, dw - pInset * 2, ph);
    gfx.fillStyle(0xd4a820, 1);
    gfx.fillCircle(dx + dw - 5, dy + Math.round(dh * 0.52), 2);
    gfx.fillStyle(0xb0b0a4, 1);
    gfx.fillRect(dx - 3, buildGY - foundH, dw + 6, foundH);
    gfx.fillStyle(0xa0a094, 1);
    gfx.fillRect(dx - 6, buildGY - 3, dw + 12, 3);

    // ── Lv 18+: flower boxes under ground-floor windows ───────
    if (level >= 18) {
      for (const wxx of [wx1, wx2]) {
        const fbY = wyLo + wh + 8;
        const fbX = wxx - 3;
        const fbW = ww + 6;
        gfx.fillStyle(0x5c3818, 1);
        gfx.fillRect(fbX, fbY, fbW, 5);
        const flowerCols = [0xe83030, 0xffcc00, 0xff88aa];
        for (let f = 0; f < 3; f++) {
          gfx.fillStyle(flowerCols[f % 3], 1);
          gfx.fillCircle(fbX + Math.round(fbW * (f + 0.5) / 3), fbY - 2, 2);
        }
      }
    }

    // ── Lv 19+: left bush ─────────────────────────────────────
    if (level >= 19) {
      const bshX = bx + 7;
      const bshY = buildGY - foundH;
      gfx.fillStyle(0x4a2808, 1);
      gfx.fillRect(bshX - 1, bshY - 7, 2, 13);
      gfx.fillStyle(0x257018, 1);
      gfx.fillCircle(bshX, bshY - 9, 6);
      gfx.fillStyle(0x308a20, 1);
      gfx.fillCircle(bshX - 2, bshY - 11, 3);
    }

    // ── Lv 20+: right bush ────────────────────────────────────
    if (level >= 20) {
      const bshX = bx + bw - 7;
      const bshY = buildGY - foundH;
      gfx.fillStyle(0x4a2808, 1);
      gfx.fillRect(bshX - 1, bshY - 7, 2, 13);
      gfx.fillStyle(0x257018, 1);
      gfx.fillCircle(bshX, bshY - 9, 6);
      gfx.fillStyle(0x308a20, 1);
      gfx.fillCircle(bshX + 2, bshY - 11, 3);
    }

    // ── Lv 21+: hedge ─────────────────────────────────────────
    if (level >= 21) {
      gfx.fillStyle(0x2d6a1e, 1);
      gfx.fillRect(bx, buildGY, bw, 8);
      gfx.fillStyle(0x3a8428, 1);
      gfx.fillRect(bx, buildGY, bw, 2);
    }

    // ── Lv 22+: porch lantern ─────────────────────────────────
    let porchLightPos: { cx: number; cy: number } | null = null;
    if (level >= 22) {
      const lx = dx + Math.round(dw / 2);
      gfx.fillStyle(0x404038, 1);
      gfx.fillRect(lx - 3, dy - 10, 6, 8);
      gfx.fillStyle(0xffdd88, 1);
      gfx.fillRect(lx - 2, dy - 9, 4, 6);
      gfx.fillStyle(0x606058, 1);
      gfx.fillRect(lx - 1, dy - 2, 2, 3);
      porchLightPos = { cx: lx, cy: dy - 6 };
    }

    // ── Lv 24+: picket fence ──────────────────────────────────
    const fencePosts: Array<{ cx: number; cy: number }> = [];
    if (level >= 24) {
      const fenceBot = gy - 2;
      gfx.fillStyle(0xe8e4d8, 1);
      gfx.fillRect(x, fenceBot - 7, w, 2);
      const n = 6, spacing = w / n;
      for (let i = 0; i < n; i++) {
        const fx = Math.round(x + spacing * (i + 0.5)) - 1;
        gfx.fillRect(fx, fenceBot - 10, 3, 10);
        gfx.fillTriangle(fx, fenceBot - 10, fx + 3, fenceBot - 10, fx + 1, fenceBot - 13);
        fencePosts.push({ cx: fx + 1, cy: fenceBot - 6 });
      }
    }

    // ── Lv 25+: mailbox + stepping stones ─────────────────────
    if (level >= 25) {
      const mbX = x + 5, mbY = gy - 18;
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
      gfx.fillStyle(0xc8b898, 1);
      for (let py = buildGY + 2; py < gy - 3; py += 7) {
        gfx.fillRect(dx + 2, py, dw - 4, 4);
      }
    }

    this.add(gfx);

    // ── Lamp cone glows ───────────────────────────────────────
    const lampConeGfx = scene.add.graphics();
    for (const { cx, cy } of fencePosts) {
      lampConeGfx.fillStyle(0xfff4cc, 1);
      lampConeGfx.fillCircle(cx, cy, 2);
    }
    if (porchLightPos) {
      lampConeGfx.fillStyle(0xffdd88, 1);
      lampConeGfx.fillCircle(porchLightPos.cx, porchLightPos.cy, 2);
    }
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.add(lampConeGfx);
    this.lampConeGfx = lampConeGfx;

    for (const { cx, cy } of fencePosts) {
      this.windowLights.push(scene.lights.addLight(cx, cy, 35, 0xffee88, 0));
    }
    if (porchLightPos) {
      this.windowLights.push(scene.lights.addLight(porchLightPos.cx, porchLightPos.cy, 45, 0xffcc44, 0));
    }

    // ── Window glass overlay & point lights ───────────────────
    const sashH  = Math.round(wh / 2) - 1;
    const halfWw = Math.round(ww / 2);

    for (const [wxx, wy] of [[wx1, wyUp], [wx2, wyUp], [wx1, wyLo], [wx2, wyLo]] as [number, number][]) {
      this.windowRects.push({ wx: wxx, wy, ww, wh, sashH, halfWw, upperDay: 0x8ab4cc, lowerDay: 0x9ec2d8 });
      for (const [offX, offY, pw, ph] of [
        [0,          0,          halfWw - 1,      sashH],
        [halfWw + 1, 0,          ww - halfWw - 1, sashH],
        [0,          sashH + 2,  halfWw - 1,      wh - sashH - 2],
        [halfWw + 1, sashH + 2,  ww - halfWw - 1, wh - sashH - 2],
      ] as [number, number, number, number][]) {
        this.windowLights.push(scene.lights.addLight(wxx + offX + pw / 2, wy + offY + ph / 2, 64, 0xffaa44, 0));
      }
    }

    if (gableRect) {
      const { gpx, gpy, gpw, gph } = gableRect;
      const gSashH  = Math.round(gph / 2);
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

    const windowGlassGfx = scene.add.graphics();
    windowGlassGfx.setLighting(true);
    this.drawWindowGlass(windowGlassGfx, 0);
    this.add(windowGlassGfx);
    this.windowGlassGfx = windowGlassGfx;

    const smokeGfx = scene.add.graphics();
    this.add(smokeGfx);
    this.smokeGfx = smokeGfx;

    this.lightPhases = this.windowLights.map(() => Math.random() * Math.PI * 2);

    if (initialParticles?.length) this.smokeParticles = [...initialParticles];

    const sg = scene.add.graphics();
    sg.fillStyle(0x000022, 1);
    sg.fillRect(bx, top, bw, buildGY - top);                                      // body
    sg.fillTriangle(bx - ov, top, bx + bw + ov, top, mid, top - roofH);           // roof
    sg.fillRect(chx - 2, chimneyTopY, cw + 4, top - chimneyTopY);                 // chimney
    sg.setDepth(9.15);
    sg.setAlpha(0);
    this.shadowGfx = sg;

    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      for (const light of this.windowLights) scene.lights.removeLight(light);
      this.shadowGfx.destroy();
    });
  }

  setShadowAlpha(alpha: number): void { this.shadowGfx.setAlpha(alpha); }

  updateWindowLights(elevation: number): void {
    const t    = Math.max(0, Math.min(1, (0.3 - elevation) / 0.3));
    if (t < 0.01) return;
    const time = this.scene.time.now / 1000;

    this.windowLights.forEach((light, i) => {
      const flicker = 1 + Math.sin(time * 1.7 + this.lightPhases[i]) * 0.10;
      light.intensity = t * 0.375 * flicker;
    });
    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, t);
    if (this.lampConeGfx) this.lampConeGfx.setAlpha(t * 0.45);
  }

  updateSmoke(t: number): void {
    const now = this.scene.time.now;
    if (now > this.nextSmoke) {
      this.smokeParticles.push({
        x: this.chimneyX + (Math.random() - 0.5) * 2,
        y: this.chimneyTopY,
        alpha: 0,
        dx: 0.02 + Math.random() * 0.015,
        fadeRate: 0.0003 + Math.random() * 0.001,
        radius: 1 + Math.floor(Math.random() * 4),
        maxAlpha: 0,
        color: (() => { const c = 0x7a + Math.floor(Math.random() * 40); return (c << 16) | (c << 8) | c; })(),
        growing: true,
      });
      this.nextSmoke = now + 80 + Math.random() * 80;
    }
    for (const p of this.smokeParticles) {
      p.y -= 0.03; p.x += p.dx;
      if (p.growing) { if (p.maxAlpha === 0) p.maxAlpha = 0.5 - (p.radius - 1) * 0.08; p.alpha += 0.04; if (p.alpha >= p.maxAlpha) { p.alpha = p.maxAlpha; p.growing = false; } }
      else { p.alpha -= p.fadeRate; }
    }
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      if (this.smokeParticles[i].alpha <= 0) this.smokeParticles.splice(i, 1);
    }
    if (this.smokeGfx) {
      this.smokeGfx.clear();
      for (const p of this.smokeParticles) {
        this.smokeGfx.fillStyle(lerpColor(p.color, 0x1a1a2e, t * 0.75), p.alpha);
        this.smokeGfx.fillCircle(Math.round(p.x), Math.round(p.y), p.radius);
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
}
