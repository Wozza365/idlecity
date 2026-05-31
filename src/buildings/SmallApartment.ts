import Phaser from 'phaser';
import { YARD_H, buildingHeight } from '../constants';
import { type DoorEntrance } from './types';

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((Math.round(ar + (br - ar) * t) << 16) |
          (Math.round(ag + (bg - ag) * t) << 8)  |
           Math.round(ab + (bb - ab) * t));
}

const FOUND_H   = 6;
const PARAPET_H = 12;
const FLOOR_H   = 20;

export class SmallApartment extends Phaser.GameObjects.Container {
  readonly doorEntrances: DoorEntrance[] = [];
  private windowLights:   Phaser.GameObjects.Light[] = [];
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private lampConeGfx:    Phaser.GameObjects.Graphics | null = null;
  private windowRects: Array<{ wx: number; wy: number; ww: number; wh: number }> = [];
  private shadowGfx!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w       = plotWidth;
    const h       = buildingHeight(level);
    const buildGY = groundY - YARD_H;
    const top     = buildGY - h;
    const bodyTop = top + PARAPET_H;
    const bodyBot = buildGY - FOUND_H;
    const bodyH   = bodyBot - bodyTop;

    // ── Body ──────────────────────────────────────────────────────
    const body = scene.add.rectangle(x + w / 2, (bodyTop + bodyBot) / 2, w, bodyH, 0xd4b880);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Foundation plinth ─────────────────────────────────────────
    gfx.fillStyle(0x9a8860, 1);
    gfx.fillRect(x, bodyBot, w, FOUND_H);
    gfx.lineStyle(1, 0x7a6840, 1);
    gfx.moveTo(x, bodyBot).lineTo(x + w, bodyBot).strokePath();

    // ── Parapet ───────────────────────────────────────────────────
    gfx.fillStyle(0xa08860, 1);
    gfx.fillRect(x, top, w, PARAPET_H);
    gfx.fillStyle(0xb89870, 1);
    gfx.fillRect(x, top, w, 2);
    gfx.fillStyle(0x886848, 1);
    gfx.fillRect(x, top + PARAPET_H - 1, w, 1);

    // ── Sidewalk ──────────────────────────────────────────────────
    gfx.fillStyle(0xc0b090, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);

    // ── Brick courses ─────────────────────────────────────────────
    gfx.lineStyle(1, 0xb09050, 0.14);
    for (let by = bodyTop + 4; by < bodyBot; by += 5) {
      gfx.moveTo(x, by).lineTo(x + w, by).strokePath();
    }

    // ── Floors & windows: 3 cols ──────────────────────────────────
    const nFloors  = Math.max(2, Math.floor(bodyH / FLOOR_H));
    const actualFH = Math.round(bodyH / nFloors);
    const cols     = 3;
    const ww       = Math.round(w * 0.16);
    const wh       = Math.round(ww * 1.35);
    const hPad     = Math.round(w / (cols + 1));

    for (let f = 0; f < nFloors; f++) {
      const wy = bodyBot - (f + 1) * actualFH + Math.round((actualFH - wh) / 2);
      if (wy < bodyTop + 2 || wy + wh > bodyBot - 2) continue;

      for (let c = 0; c < cols; c++) {
        const wxx = Math.round(x + hPad * (c + 1) - ww / 2);

        // Lv 52+: decorative brick arch header
        if (level >= 52) {
          gfx.fillStyle(0xb89860, 1);
          gfx.fillRect(wxx - 4, wy - 5, ww + 8, 4);
          gfx.fillRect(wxx + Math.round(ww / 2) - 2, wy - 8, 4, 4);
        }

        // Window frame
        gfx.fillStyle(0xf0e8d8, 1);
        gfx.fillRect(wxx - 2, wy - 2, ww + 4, wh + 4);

        // Lv 47+: flower boxes ground floor
        if (level >= 47 && f === 0) {
          gfx.fillStyle(0x5a3818, 1);
          gfx.fillRect(wxx - 2, wy + wh + 3, ww + 4, 4);
          const flowerCols = [0xee3030, 0xffcc00, 0xff88cc];
          for (let fi = 0; fi < 3; fi++) {
            gfx.fillStyle(flowerCols[fi % 3], 1);
            gfx.fillCircle(wxx + Math.round((ww + 4) * (fi + 0.5) / 3), wy + wh + 1, 2);
          }
        }

        // Lv 51+: window A/C unit on upper floors
        if (level >= 51 && f >= 2) {
          gfx.fillStyle(0x909898, 1);
          gfx.fillRect(wxx, wy + wh - 4, ww, 5);
          gfx.fillStyle(0x788080, 1);
          gfx.fillRect(wxx, wy + wh - 4, ww, 2);
        }

        this.windowRects.push({ wx: wxx, wy, ww, wh });
      }

      // 1 point light per floor
      if (f % 2 === 0) {
        this.windowLights.push(scene.lights.addLight(
          x + w / 2, bodyBot - (f + 1) * actualFH + actualFH / 2, 88, 0xffaa44, 0,
        ));
      }
    }

    // ── Lv 43+: string courses between floor groups ───────────────
    if (level >= 43) {
      for (let f = 3; f < nFloors; f += 4) {
        const scY = bodyBot - f * actualFH;
        gfx.fillStyle(0xa08860, 1);
        gfx.fillRect(x, scY - 2, w, 3);
        gfx.fillStyle(0xc0a878, 1);
        gfx.fillRect(x, scY - 2, w, 1);
      }
    }

    // ── Lv 44+: corbelled brick cornice ──────────────────────────
    if (level >= 44) {
      gfx.fillStyle(0xa08860, 1);
      gfx.fillRect(x - 1, top + PARAPET_H - 6, w + 2, 5);
      gfx.fillStyle(0xb89870, 1);
      for (let cx = x + 2; cx < x + w - 2; cx += 6) {
        gfx.fillRect(cx, top + PARAPET_H - 9, 4, 4);
      }
    }

    // ── Lv 45+: rooftop water tower ──────────────────────────────
    if (level >= 45) {
      const twX = x + Math.round(w * 0.68);
      const twW = 16, twH = 18;
      gfx.fillStyle(0x8a7060, 1);
      gfx.fillRect(twX, top - twH, twW, twH);
      gfx.fillStyle(0x6a5040, 1);
      gfx.fillRect(twX, top - twH, 3, twH);
      gfx.fillRect(twX + twW - 3, top - twH, 3, twH);
      gfx.fillStyle(0x6a5840, 1);
      gfx.fillTriangle(twX - 2, top - twH, twX + twW + 2, top - twH, twX + Math.round(twW / 2), top - twH - 6);
      // Legs
      gfx.fillStyle(0x7a6858, 1);
      gfx.fillRect(twX + 2,       top, 3, 6);
      gfx.fillRect(twX + twW - 5, top, 3, 6);
    }

    // ── Lv 46+: fire escape right side ───────────────────────────
    if (level >= 46) {
      const feX = x + w - 6;
      gfx.fillStyle(0x606878, 1);
      gfx.fillRect(feX,     top, 2, bodyH);
      gfx.fillRect(feX + 4, top, 2, bodyH);
      for (let f = 0; f < nFloors; f += 2) {
        const fy = bodyBot - f * actualFH - actualFH;
        gfx.fillRect(feX - 2, fy, 8, 2);
      }
    }

    // ── Entrance area ─────────────────────────────────────────────
    const dw = Math.round(w * 0.24);
    const dh = Math.round(actualFH * 0.80);
    const dx = x + Math.round((w - dw) / 2);
    const dy = bodyBot - dh;
    this.doorEntrances = [{ x: dx + Math.round(dw / 2), y: bodyBot }];

    // Lv 48+: entrance awning
    if (level >= 48) {
      gfx.fillStyle(0x7a6848, 1);
      gfx.fillRect(dx - 10, dy - 8, dw + 20, 5);
      gfx.lineStyle(2, 0x8a7858, 0.6);
      for (let ax = dx - 8; ax < dx + dw + 10; ax += 8) {
        gfx.moveTo(ax, dy - 8).lineTo(ax + 4, dy - 3).strokePath();
      }
    }

    // Lv 42+: door surround
    if (level >= 42) {
      gfx.fillStyle(0xa08860, 1);
      gfx.fillRect(dx - 5, dy - 2, dw + 10, dh + 2);
    }

    // Lv 49+: ground floor retail glazing
    if (level >= 49) {
      gfx.fillStyle(0x4a7088, 0.45);
      gfx.fillRect(x + 2,    dy - 4, dx - x - 6, dh + 4);
      gfx.fillRect(dx + dw + 4, dy - 4, x + w - dx - dw - 6, dh + 4);
      gfx.lineStyle(1, 0x6a9090, 0.7);
      for (let gx = x + 12; gx < x + w - 4; gx += 12) {
        if (gx >= dx - 6 && gx <= dx + dw + 6) continue;
        gfx.moveTo(gx, dy - 4).lineTo(gx, bodyBot).strokePath();
      }
    }

    // Double door
    gfx.fillStyle(0x1a1408, 1);
    gfx.fillRect(dx, dy, Math.round(dw / 2) - 1, dh);
    gfx.fillRect(dx + Math.round(dw / 2) + 1, dy, Math.round(dw / 2) - 1, dh);
    gfx.fillStyle(0x4a7088, 0.5);
    gfx.fillRect(dx + 2, dy + 2, Math.round(dw / 2) - 5, dh - 4);
    gfx.fillRect(dx + Math.round(dw / 2) + 3, dy + 2, Math.round(dw / 2) - 5, dh - 4);

    // ── Lv 50+: rooftop A/C units ─────────────────────────────────
    if (level >= 50) {
      for (let ai = 0; ai < 3; ai++) {
        const aX = x + Math.round(w * (ai * 0.25 + 0.12));
        gfx.fillStyle(0x888890, 1);
        gfx.fillRect(aX, top - 7, 12, 7);
        gfx.fillStyle(0x707080, 1);
        gfx.fillRect(aX, top - 7, 12, 2);
      }
    }

    // ── Lv 53+: rooftop antenna ───────────────────────────────────
    if (level >= 53) {
      const antX = x + Math.round(w * 0.3);
      gfx.fillStyle(0x808898, 1);
      gfx.fillRect(antX, top - 20, 2, 20);
      gfx.fillRect(antX - 4, top - 15, 10, 1);
      gfx.fillRect(antX - 2, top - 10, 6, 1);
    }

    // ── Lv 54+: pavement planters ─────────────────────────────────
    if (level >= 54) {
      for (const pX of [x + 6, x + w - 16]) {
        gfx.fillStyle(0x404828, 1);
        gfx.fillRect(pX, buildGY + 3, 10, 7);
        gfx.fillStyle(0x307020, 1);
        gfx.fillCircle(pX + 5, buildGY + 3, 5);
        gfx.fillStyle(0x40902c, 1);
        gfx.fillCircle(pX + 3, buildGY + 1, 3);
      }
    }

    // ── Lv 55+: entrance portico columns ─────────────────────────
    if (level >= 55) {
      const portW = dw + 28;
      const portX = dx - 14;
      gfx.fillStyle(0x9a8860, 1);
      gfx.fillRect(portX,           dy - 10, 6, dh + 10);
      gfx.fillRect(portX + portW - 6, dy - 10, 6, dh + 10);
      gfx.fillRect(portX, dy - 10, portW, 4);
      gfx.fillStyle(0xb0a070, 1);
      gfx.fillRect(portX, dy - 10, portW, 1);
    }

    this.add(gfx);

    // ── Lamp cone (placeholder, no exterior lamps at base level) ──
    const lampConeGfx = scene.add.graphics();
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.add(lampConeGfx);
    this.lampConeGfx = lampConeGfx;

    // ── Window glass overlay ──────────────────────────────────────
    const windowGlassGfx = scene.add.graphics();
    windowGlassGfx.setLighting(true);
    this.drawWindowGlass(windowGlassGfx, 0);
    this.add(windowGlassGfx);
    this.windowGlassGfx = windowGlassGfx;

    const sg = scene.add.graphics();
    sg.fillStyle(0x000022, 1);
    sg.fillRect(x, top, w, h);  // full building silhouette
    if (level >= 53) {
      const antX = x + Math.round(w * 0.3);
      sg.fillRect(antX, top - 20, 2, 20);
      sg.fillRect(antX - 4, top - 15, 10, 1);
      sg.fillRect(antX - 2, top - 10, 6, 1);
    }
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
    const t = Math.max(0, Math.min(1, (0.3 - elevation) / 0.3));
    for (const light of this.windowLights) light.intensity = t * 0.3;
    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, t);
    if (this.lampConeGfx) this.lampConeGfx.setAlpha(t * 0.4);
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number): void {
    gfx.clear();
    for (const { wx, wy, ww, wh } of this.windowRects) {
      gfx.fillStyle(lerpColor(0x9ac0d4, 0xffcc66, t), 1);
      gfx.fillRect(wx, wy, ww, wh);
      gfx.fillStyle(0xf0e8d8, 0.7);
      gfx.fillRect(wx + Math.round(ww / 2) - 1, wy, 2, wh);
      gfx.fillRect(wx, wy + Math.round(wh / 2) - 1, ww, 2);
    }
  }
}
