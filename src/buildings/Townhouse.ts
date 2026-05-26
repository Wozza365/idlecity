import Phaser from 'phaser';
import { YARD_H, buildingHeight } from '../constants';

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((Math.round(ar + (br - ar) * t) << 16) |
          (Math.round(ag + (bg - ag) * t) << 8)  |
           Math.round(ab + (bb - ab) * t));
}

const FOUND_H   = 8;
const PARAPET_H = 10;
const FLOOR_H   = 36;

export class Townhouse extends Phaser.GameObjects.Container {
  private windowLights:   Phaser.GameObjects.Light[] = [];
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private lampConeGfx:    Phaser.GameObjects.Graphics | null = null;
  private windowRects: Array<{ wx: number; wy: number; ww: number; wh: number }> = [];

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w       = plotWidth;
    const h       = buildingHeight(level);
    const bw      = Math.round(w * 0.78);
    const bx      = x + Math.round((w - bw) / 2);
    const buildGY = groundY - YARD_H;
    const top     = buildGY - h;
    const bodyTop = top + PARAPET_H;
    const bodyBot = buildGY - FOUND_H;
    const bodyH   = bodyBot - bodyTop;

    // ── Brick body ────────────────────────────────────────────────
    const body = scene.add.rectangle(bx + bw / 2, (bodyTop + bodyBot) / 2, bw, bodyH, 0xb04030);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Foundation ────────────────────────────────────────────────
    gfx.fillStyle(0x9a8870, 1);
    gfx.fillRect(bx, bodyBot, bw, FOUND_H);
    gfx.lineStyle(1, 0x7a6850, 1);
    gfx.moveTo(bx, bodyBot).lineTo(bx + bw, bodyBot).strokePath();

    // ── Parapet/cornice ───────────────────────────────────────────
    gfx.fillStyle(0x9a8870, 1);
    gfx.fillRect(bx, top, bw, PARAPET_H);
    gfx.fillStyle(0xd0c4b0, 1);
    gfx.fillRect(bx - 1, top, bw + 2, 3);
    gfx.fillStyle(0x7a6850, 1);
    gfx.fillRect(bx, top + PARAPET_H - 1, bw, 1);

    // ── Sidewalk ──────────────────────────────────────────────────
    gfx.fillStyle(0xc8b898, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    gfx.lineStyle(1, 0xb0a080, 0.4);
    for (let px = x + 30; px < x + w; px += 30) {
      gfx.moveTo(px, buildGY).lineTo(px, groundY).strokePath();
    }

    // ── Brick mortar courses ──────────────────────────────────────
    gfx.lineStyle(1, 0x8a2818, 0.18);
    for (let by = bodyTop + 4; by < bodyBot; by += 5) {
      gfx.moveTo(bx, by).lineTo(bx + bw, by).strokePath();
    }

    // ── Floor dividers ────────────────────────────────────────────
    const nFloors  = Math.max(2, Math.floor(bodyH / FLOOR_H));
    const actualFH = Math.round(bodyH / nFloors);
    for (let f = 1; f < nFloors; f++) {
      const fy = bodyBot - f * actualFH;
      gfx.fillStyle(0x9a8870, 1);
      gfx.fillRect(bx, fy - 1, bw, 3);
      gfx.fillStyle(0xc8bc9e, 1);
      gfx.fillRect(bx, fy - 1, bw, 1);
    }

    // ── Windows: 2 per floor ──────────────────────────────────────
    const ww    = Math.round(bw * 0.18);
    const wh    = Math.round(ww * 1.35);
    const wx1   = bx + Math.round(bw * 0.18);
    const wx2   = bx + Math.round(bw * 0.60);
    const sw    = Math.round(ww * 0.35);
    const sashH = Math.round(wh / 2) - 1;

    for (let f = 0; f < nFloors; f++) {
      const wy = bodyBot - (f + 1) * actualFH + Math.round((actualFH - wh) / 2);
      if (wy < bodyTop + 2 || wy + wh > bodyBot - 2) continue;

      for (const wxx of [wx1, wx2]) {
        // Lv 27+: shutters
        if (level >= 27) {
          gfx.fillStyle(0x285020, 1);
          gfx.fillRect(wxx - sw - 2, wy, sw, wh);
          gfx.fillRect(wxx + ww + 2, wy, sw, wh);
          gfx.lineStyle(1, 0x1a3010, 0.5);
          for (let sl = 3; sl < wh; sl += 4) {
            gfx.moveTo(wxx - sw - 2, wy + sl).lineTo(wxx - 2, wy + sl).strokePath();
            gfx.moveTo(wxx + ww + 2, wy + sl).lineTo(wxx + ww + 2 + sw, wy + sl).strokePath();
          }
        }

        // Lv 34+: stone keystone
        if (level >= 34) {
          gfx.fillStyle(0xd0c4b0, 1);
          gfx.fillRect(wxx - 2, wy - 5, ww + 4, 4);
          gfx.fillRect(wxx + Math.round(ww / 2) - 2, wy - 8, 4, 4);
        }

        // White surround
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(wxx - 2, wy - 2, ww + 4, wh + 4);

        // Lv 28+: stone sill
        if (level >= 28) {
          gfx.fillStyle(0xd0c4b0, 1);
          gfx.fillRect(wxx - 3, wy + wh + 2, ww + 6, 3);
          gfx.fillStyle(0xb0a080, 1);
          gfx.fillRect(wxx - 3, wy + wh + 5, ww + 6, 1);
        }

        this.windowRects.push({ wx: wxx, wy, ww, wh });
        this.windowLights.push(
          scene.lights.addLight(wxx + ww / 2, wy + sashH / 2,           44, 0xffaa44, 0),
          scene.lights.addLight(wxx + ww / 2, wy + sashH + (wh - sashH) / 2, 44, 0xffaa44, 0),
        );
      }
    }

    // ── Door ─────────────────────────────────────────────────────
    const dw = Math.round(bw * 0.20);
    const dh = Math.round(actualFH * 0.82);
    const dx = bx + Math.round((bw - dw) / 2);
    const dy = bodyBot - dh;

    // Lv 29+: triangular door pediment
    if (level >= 29) {
      const portW = dw + 14;
      const portX = dx - 7;
      gfx.fillStyle(0xd0c4b0, 1);
      gfx.fillRect(portX, dy - 7, portW, 5);
      gfx.fillStyle(0xe0d8c4, 1);
      gfx.fillTriangle(portX, dy - 7, portX + portW, dy - 7, portX + Math.round(portW / 2), dy - 14);
      gfx.lineStyle(1, 0xb0a080, 1);
      gfx.moveTo(portX, dy - 7).lineTo(portX + Math.round(portW / 2), dy - 14).lineTo(portX + portW, dy - 7).strokePath();
    }

    // Lv 38+: fanlight
    if (level >= 38) {
      const flH = 8;
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(dx - 2, dy - flH, dw + 4, flH + 1);
      gfx.fillStyle(0x8ab4cc, 1);
      gfx.fillRect(dx - 1, dy - flH + 1, dw + 2, flH - 1);
      gfx.lineStyle(1, 0xffffff, 1);
      const fMid = dx + Math.round(dw / 2);
      for (let fi = 1; fi < 4; fi++) {
        gfx.moveTo(fMid, dy).lineTo(dx + Math.round(dw * fi / 4), dy - flH + 1).strokePath();
      }
    }

    // Lv 37+: door sidelights
    if (level >= 37) {
      const slW = Math.round(dw * 0.22);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(dx - 3 - slW, dy + 2, slW, dh - 4);
      gfx.fillRect(dx + dw + 3, dy + 2, slW, dh - 4);
      gfx.fillStyle(0x8ab4cc, 1);
      gfx.fillRect(dx - 2 - slW, dy + 3, slW - 2, dh - 6);
      gfx.fillRect(dx + dw + 4, dy + 3, slW - 2, dh - 6);
    }

    // Door surround + body
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRect(dx - 3, dy, dw + 6, dh);
    gfx.fillStyle(0x0a0a08, 1);
    gfx.fillRect(dx, dy, dw, dh);
    const pI = Math.round(dw * 0.15);
    const ph = Math.round(dh * 0.28);
    gfx.fillStyle(0x1a1410, 1);
    gfx.fillRect(dx + pI, dy + 5,       dw - pI * 2, ph);
    gfx.fillRect(dx + pI, dy + ph + 10, dw - pI * 2, ph);
    gfx.fillStyle(0xd4a820, 1);
    gfx.fillCircle(dx + dw - 5, dy + Math.round(dh * 0.48), 2);

    // Stoop steps
    gfx.fillStyle(0x9a8870, 1);
    gfx.fillRect(dx - 5, buildGY - 4, dw + 10, 4);
    gfx.fillRect(dx - 2, buildGY,     dw + 4,  3);

    // ── Lv 30+: string course ─────────────────────────────────────
    if (level >= 30) {
      const scY = bodyBot - Math.round(bodyH * 0.38);
      gfx.fillStyle(0x9a8870, 1);
      gfx.fillRect(bx - 2, scY, bw + 4, 4);
      gfx.fillStyle(0xd0c4b0, 1);
      gfx.fillRect(bx - 2, scY, bw + 4, 1);
    }

    // ── Lv 31+: left topiary pot ─────────────────────────────────
    if (level >= 31) {
      const pX = bx + 5, pY = buildGY - 1;
      gfx.fillStyle(0x7a5830, 1);
      gfx.fillRect(pX - 3, pY - 5, 7, 5);
      gfx.fillStyle(0x4a2808, 1);
      gfx.fillRect(pX - 1, pY - 10, 3, 6);
      gfx.fillStyle(0x2a7018, 1);
      gfx.fillCircle(pX, pY - 13, 6);
      gfx.fillStyle(0x3a8820, 1);
      gfx.fillCircle(pX - 1, pY - 16, 3);
    }

    // ── Lv 32+: right topiary pot ────────────────────────────────
    if (level >= 32) {
      const pX = bx + bw - 5, pY = buildGY - 1;
      gfx.fillStyle(0x7a5830, 1);
      gfx.fillRect(pX - 3, pY - 5, 7, 5);
      gfx.fillStyle(0x4a2808, 1);
      gfx.fillRect(pX - 1, pY - 10, 3, 6);
      gfx.fillStyle(0x2a7018, 1);
      gfx.fillCircle(pX, pY - 13, 6);
      gfx.fillStyle(0x3a8820, 1);
      gfx.fillCircle(pX + 1, pY - 16, 3);
    }

    // ── Lv 33+: iron area railings ───────────────────────────────
    if (level >= 33) {
      const rY = buildGY - 1;
      gfx.fillStyle(0x222222, 1);
      gfx.fillRect(bx, rY - 8, bw, 2);
      gfx.fillRect(bx, rY,     bw, 2);
      for (let rpx = bx + 3; rpx < bx + bw - 3; rpx += 5) {
        gfx.fillRect(rpx, rY - 8, 2, 10);
      }
    }

    // ── Lv 35+: dentil frieze ────────────────────────────────────
    if (level >= 35) {
      gfx.fillStyle(0xd0c4b0, 1);
      for (let ddx = bx + 2; ddx < bx + bw - 2; ddx += 5) {
        gfx.fillRect(ddx, top + PARAPET_H - 5, 3, 5);
      }
    }

    // ── Lv 36+: corner pilasters ─────────────────────────────────
    if (level >= 36) {
      gfx.fillStyle(0xc8bc9e, 1);
      gfx.fillRect(bx,          bodyTop, 6, bodyH);
      gfx.fillRect(bx + bw - 6, bodyTop, 6, bodyH);
      gfx.fillStyle(0xd8ccae, 1);
      gfx.fillRect(bx, bodyTop, 6, 3);
      gfx.fillRect(bx + bw - 6, bodyTop, 6, 3);
    }

    // ── Lv 39+: street lamp ──────────────────────────────────────
    let lampPos: { cx: number; cy: number } | null = null;
    if (level >= 39) {
      const lx = bx - 10, ly = buildGY - 24;
      gfx.fillStyle(0x404040, 1);
      gfx.fillRect(lx - 1, ly, 3, 24);
      gfx.fillRect(lx - 1, ly, 10, 2);
      gfx.fillStyle(0xffe080, 1);
      gfx.fillCircle(lx + 9, ly + 1, 3);
      lampPos = { cx: lx + 9, cy: ly + 1 };
    }

    // ── Lv 40+: ornate iron gate ─────────────────────────────────
    if (level >= 40) {
      gfx.fillStyle(0x1c1c1c, 1);
      gfx.fillRect(x,         groundY - 12, 4, 12);
      gfx.fillRect(x + w - 4, groundY - 12, 4, 12);
      gfx.fillRect(x,         groundY - 12, w, 2);
      for (let gpx = x + 4; gpx < x + w - 4; gpx += 5) {
        gfx.fillRect(gpx, groundY - 12, 2, 12);
        gfx.fillTriangle(gpx, groundY - 12, gpx + 2, groundY - 12, gpx + 1, groundY - 14);
      }
    }

    this.add(gfx);

    // ── Lamp cone ─────────────────────────────────────────────────
    const lampConeGfx = scene.add.graphics();
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    if (lampPos) {
      lampConeGfx.fillStyle(0xffe080, 1);
      lampConeGfx.fillCircle(lampPos.cx, lampPos.cy, 3);
      this.windowLights.push(scene.lights.addLight(lampPos.cx, lampPos.cy, 44, 0xffcc44, 0));
    }
    this.add(lampConeGfx);
    this.lampConeGfx = lampConeGfx;

    // ── Window glass overlay ──────────────────────────────────────
    const windowGlassGfx = scene.add.graphics();
    windowGlassGfx.setLighting(true);
    this.drawWindowGlass(windowGlassGfx, 0);
    this.add(windowGlassGfx);
    this.windowGlassGfx = windowGlassGfx;

    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      for (const light of this.windowLights) scene.lights.removeLight(light);
    });
  }

  updateWindowLights(elevation: number): void {
    const t = Math.max(0, Math.min(1, (0.3 - elevation) / 0.3));
    for (const light of this.windowLights) light.intensity = t * 0.375;
    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, t);
    if (this.lampConeGfx) this.lampConeGfx.setAlpha(t * 0.45);
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number): void {
    gfx.clear();
    for (const { wx, wy, ww, wh } of this.windowRects) {
      const sashH = Math.round(wh / 2) - 1;
      gfx.fillStyle(lerpColor(0x8ab4cc, 0xffcc66, t), 1);
      gfx.fillRect(wx, wy, ww, sashH);
      gfx.fillStyle(lerpColor(0x9ec2d8, 0xffcc66, t), 1);
      gfx.fillRect(wx, wy + sashH + 2, ww, wh - sashH - 2);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(wx, wy + sashH, ww, 2);
      gfx.fillRect(wx + Math.round(ww / 2) - 1, wy, 2, wh);
    }
  }
}
