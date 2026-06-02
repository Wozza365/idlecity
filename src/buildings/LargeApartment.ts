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

const FLOOR_H = 16;

export class LargeApartment extends Phaser.GameObjects.Container {
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
    this.doorEntrances = [{ x: x + Math.round(w / 2), y: buildGY }];
    const top     = buildGY - h;

    // Lv 68+: penthouse setback — top 2 floors are slightly inset
    const pentFloors  = level >= 68 ? 2 : 0;
    const pentH       = pentFloors * FLOOR_H;
    const pentBw      = level >= 68 ? Math.round(w * 0.88) : w;
    const pentBx      = level >= 68 ? x + Math.round((w - pentBw) / 2) : x;

    // ── Concrete body ─────────────────────────────────────────────
    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0xb0a490);
    body.setLighting(true);
    this.add(body);

    // Penthouse overlay (lighter concrete)
    if (pentFloors > 0) {
      const pent = scene.add.rectangle(pentBx + pentBw / 2, top + pentH / 2, pentBw, pentH, 0xc0b49e);
      pent.setLighting(true);
      this.add(pent);
    }

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Roof cap ──────────────────────────────────────────────────
    gfx.fillStyle(0x8a7e6e, 1);
    gfx.fillRect(x, top, w, 4);
    gfx.fillStyle(0xa89888, 1);
    gfx.fillRect(x, top, w, 1);

    // ── Sidewalk ──────────────────────────────────────────────────
    gfx.fillStyle(0xb8b0a0, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    gfx.lineStyle(1, 0xa8a090, 0.5);
    for (let px = x + 24; px < x + w; px += 24) {
      gfx.moveTo(px, buildGY).lineTo(px, groundY).strokePath();
    }

    // ── Floors & windows: 4 cols ──────────────────────────────────
    const nFloors  = Math.floor(h / FLOOR_H);
    const cols     = 4;
    const ww       = Math.round(w * 0.13);
    const wh       = Math.round(FLOOR_H * 0.62);
    const hPad     = Math.round(w / (cols + 1));

    // Lv 62+: mid-building horizontal accent band
    const midBandFloor = level >= 62 ? Math.round(nFloors * 0.5) : -1;

    // Lv 65+: architectural fins (vertical elements between cols)
    const finsFrom = level >= 65 ? Math.round(nFloors * 0.6) : nFloors + 1;

    for (let f = 0; f < nFloors; f++) {
      const fy = top + f * FLOOR_H;

      // Horizontal floor band
      gfx.fillStyle(0x9a8e7e, 0.5);
      gfx.fillRect(x, fy, w, 1);

      // Balcony slab every 3rd floor
      if (f % 3 === 0 && f > 0 && fy + FLOOR_H < buildGY) {
        gfx.fillStyle(0x9a8e7e, 1);
        gfx.fillRect(x - 3, fy + FLOOR_H - 2, w + 6, 3);

        // Lv 58+: balcony railings
        if (level >= 58) {
          gfx.fillStyle(0xc0b8a8, 0.6);
          gfx.fillRect(x - 3, fy + 4, w + 6, 1);
        }
      }

      // Mid-band accent
      if (f === midBandFloor) {
        gfx.fillStyle(0x786e5e, 1);
        gfx.fillRect(x, fy, w, 4);
        gfx.fillStyle(0x988e7e, 1);
        gfx.fillRect(x, fy, w, 1);
      }

      const wy = fy + Math.round((FLOOR_H - wh) / 2);
      if (wy + wh > buildGY - 2) continue;

      for (let c = 0; c < cols; c++) {
        const wxx = Math.round(x + hPad * (c + 1) - ww / 2);

        // Lv 64+: vertical fin between windows (from above fins threshold)
        if (level >= 64 && f >= finsFrom && c < cols - 1) {
          gfx.fillStyle(0x9a9080, 1);
          gfx.fillRect(wxx + ww + 2, wy, 3, wh);
        }

        // Window pane
        gfx.fillStyle(0xd8d0c8, 1);
        gfx.fillRect(wxx - 1, wy - 1, ww + 2, wh + 2);

        this.windowRects.push({ wx: wxx, wy, ww, wh });
      }

      // 1 light per 3 floors
      if (f % 3 === 1) {
        this.windowLights.push(scene.lights.addLight(
          x + w / 2, fy + FLOOR_H * 1.5, 96, 0xffaa44, 0,
        ));
      }
    }

    // ── Lv 57+: entrance lobby ────────────────────────────────────
    const lobbyH = FLOOR_H * 2;
    const lobbyTop = buildGY - lobbyH;
    if (level >= 57) {
      gfx.fillStyle(0x4a6878, 0.6);
      gfx.fillRect(x, lobbyTop, w, lobbyH);
      gfx.lineStyle(1, 0x6a8898, 0.8);
      for (let lx = x + 16; lx < x + w - 4; lx += 16) {
        gfx.moveTo(lx, lobbyTop).lineTo(lx, buildGY).strokePath();
      }
      gfx.fillStyle(0x3a5868, 0.4);
      gfx.fillRect(x, buildGY - lobbyH, w, 2);
    }

    // ── Lv 59+: rooftop plant room ────────────────────────────────
    if (level >= 59) {
      const prW = Math.round(w * 0.45);
      const prH = 14;
      gfx.fillStyle(0x8a7e70, 1);
      gfx.fillRect(x + Math.round((w - prW) / 2), top - prH, prW, prH);
      gfx.fillStyle(0x7a6e60, 1);
      gfx.fillRect(x + Math.round((w - prW) / 2), top - prH, prW, 2);
    }

    // ── Lv 60+: corner accent panels ─────────────────────────────
    if (level >= 60) {
      gfx.fillStyle(0x9e9080, 1);
      gfx.fillRect(x,          top, 8, h);
      gfx.fillRect(x + w - 8,  top, 8, h);
    }

    // ── Lv 61+: entrance canopy ───────────────────────────────────
    if (level >= 61) {
      gfx.fillStyle(0x888070, 1);
      gfx.fillRect(x + 8, buildGY - FLOOR_H * 2 - 5, w - 16, 5);
      gfx.fillStyle(0x9a9282, 1);
      gfx.fillRect(x + 8, buildGY - FLOOR_H * 2 - 5, w - 16, 1);
    }

    // ── Lv 63+: rooftop HVAC cluster ─────────────────────────────
    if (level >= 63) {
      for (let ai = 0; ai < 4; ai++) {
        const aX = x + Math.round(w * (ai * 0.22 + 0.05));
        gfx.fillStyle(0x888890, 1);
        gfx.fillRect(aX, top - 8, 11, 8);
        gfx.fillStyle(0x707080, 1);
        gfx.fillRect(aX, top - 8, 11, 2);
      }
    }

    // ── Lv 66+: entrance signage ──────────────────────────────────
    let signLightPos: { cx: number; cy: number } | null = null;
    if (level >= 66) {
      const sx = x + Math.round(w * 0.15);
      const sY = buildGY - FLOOR_H * 2 - 12;
      gfx.fillStyle(0x1a1a1a, 1);
      gfx.fillRect(sx, sY, Math.round(w * 0.7), 8);
      gfx.fillStyle(0xe0d8c8, 1);
      for (let si = 0; si < 5; si++) {
        gfx.fillRect(sx + 4 + si * 12, sY + 2, 8, 4);
      }
      signLightPos = { cx: x + Math.round(w / 2), cy: sY + 4 };
    }

    // ── Lv 67+: rooftop planter boxes ────────────────────────────
    if (level >= 67) {
      for (const px of [x + 5, x + w - 15]) {
        gfx.fillStyle(0x3a4820, 1);
        gfx.fillRect(px, top - 2, 10, 6);
        gfx.fillStyle(0x3a8020, 1);
        gfx.fillCircle(px + 5, top - 2, 4);
        gfx.fillStyle(0x4a9428, 1);
        gfx.fillCircle(px + 3, top - 4, 2);
      }
    }

    // ── Lv 69+: secondary antenna mast ───────────────────────────
    if (level >= 69) {
      const antX = x + Math.round(w * 0.6);
      gfx.fillStyle(0x8898a8, 1);
      gfx.fillRect(antX, top - 22, 2, 22);
      gfx.fillRect(antX - 5, top - 17, 12, 1);
    }

    // ── Lv 70+: building number + lit entrance ────────────────────
    if (level >= 70) {
      gfx.fillStyle(0x1a1a1a, 1);
      gfx.fillRect(x + w - 18, buildGY - 10, 14, 8);
      gfx.fillStyle(0xe0d8c8, 1);
      gfx.fillRect(x + w - 16, buildGY - 9, 4, 6);
      gfx.fillRect(x + w - 10, buildGY - 9, 4, 6);
    }

    this.add(gfx);

    // ── Lamp cone ─────────────────────────────────────────────────
    const lampConeGfx = scene.add.graphics();
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    if (signLightPos) {
      lampConeGfx.fillStyle(0xffeebb, 1);
      lampConeGfx.fillRect(signLightPos.cx - 20, signLightPos.cy - 2, 40, 4);
      this.windowLights.push(scene.lights.addLight(signLightPos.cx, signLightPos.cy, 60, 0xffddaa, 0));
    }
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
    sg.fillRect(x, top, w, h);  // building body only — yard drawn by SunMoon at depth 9.5
    if (level >= 69) {
      const antX = x + Math.round(w * 0.6);
      sg.fillRect(antX, top - 22, 2, 22);
      sg.fillRect(antX - 5, top - 17, 12, 1);
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
    const t = Math.max(0, Math.min(1, (0.4 - elevation) / 0.3));
    if (t < 0.01) return;
    for (const light of this.windowLights) light.intensity = t * 0.28;
    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, t);
    if (this.lampConeGfx) this.lampConeGfx.setAlpha(t * 0.5);
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number): void {
    gfx.clear();
    for (const { wx, wy, ww, wh } of this.windowRects) {
      gfx.fillStyle(lerpColor(0x88b0c4, 0xffcc66, t), 1);
      gfx.fillRect(wx, wy, ww, wh);
      gfx.fillStyle(0xd8d0c8, 0.6);
      gfx.fillRect(wx, wy + Math.round(wh / 2) - 1, ww, 1);
    }
  }
}
