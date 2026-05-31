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

const FLOOR_H    = 12;
const ANTENNA_H  = 36;

export class Tier4Skyscraper extends Phaser.GameObjects.Container {
  readonly doorEntrances: DoorEntrance[] = [];
  private windowLights:   Phaser.GameObjects.Light[] = [];
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private lampConeGfx:    Phaser.GameObjects.Graphics | null = null;
  private windowRects: Array<{ wx: number; wy: number; ww: number; wh: number; accent: boolean }> = [];
  private shadowGfx!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w       = plotWidth;
    const h       = buildingHeight(level);
    const buildGY = groundY - YARD_H;
    const top     = buildGY - h;
    this.doorEntrances = [{ x: x + Math.round(w / 2), y: buildGY }];

    // Lv 88+: setback at 75% height — upper section narrower
    const setbackFrac = level >= 88 ? 0.25 : 0;
    const setbackH    = Math.round(h * setbackFrac);
    const upperBw     = level >= 88 ? Math.round(w * 0.82) : w;
    const upperBx     = level >= 88 ? x + Math.round((w - upperBw) / 2) : x;

    // ── Main glass body ───────────────────────────────────────────
    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0x0e1824);
    body.setLighting(true);
    this.add(body);

    // Upper setback section (fractionally lighter)
    if (setbackH > 0) {
      const upper = scene.add.rectangle(
        upperBx + upperBw / 2, top + setbackH / 2, upperBw, setbackH, 0x162030,
      );
      upper.setLighting(true);
      this.add(upper);
    }

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Roof cap ──────────────────────────────────────────────────
    gfx.fillStyle(0x1c2c3c, 1);
    gfx.fillRect(x, top, w, 3);

    // ── Lv 91+: observation crown ring ───────────────────────────
    if (level >= 91) {
      gfx.fillStyle(0x2c4c6c, 1);
      gfx.fillRect(x - 3, top - 6, w + 6, 7);
      gfx.fillStyle(0x3c5c7c, 1);
      gfx.fillRect(x - 3, top - 6, w + 6, 2);
    }

    // ── Sidewalk / plaza ──────────────────────────────────────────
    gfx.fillStyle(0x989088, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    // Lv 98+: illuminated plaza tiles
    if (level >= 98) {
      gfx.fillStyle(0xa8a098, 1);
      gfx.fillRect(x, buildGY, w, YARD_H);
      gfx.lineStyle(1, 0x889098, 0.5);
      for (let px = x + 16; px < x + w; px += 16) {
        gfx.moveTo(px, buildGY).lineTo(px, groundY).strokePath();
      }
      gfx.moveTo(x, buildGY + 10).lineTo(x + w, buildGY + 10).strokePath();
    }

    // ── Lv 90+: corner LED strips ─────────────────────────────────
    if (level >= 90) {
      gfx.fillStyle(0x44aaff, 0.5);
      gfx.fillRect(x,         top, 2, h);
      gfx.fillRect(x + w - 2, top, 2, h);
    }

    // ── Floors & windows: 5 narrow cols ──────────────────────────
    const nFloors  = Math.floor(h / FLOOR_H);
    const cols     = 5;
    const ww       = Math.round(w * 0.10);
    const wh       = Math.round(FLOOR_H * 0.68);
    const hGap     = Math.round(w / (cols + 1));

    // Sky lobby band at ~55% height
    const skyLobbyFloor = level >= 89 ? Math.round(nFloors * 0.55) : -1;

    // Observation floor band at ~85% (lv93+)
    const obsDeckFloor = level >= 93 ? Math.round(nFloors * 0.85) : -1;

    for (let f = 0; f < nFloors; f++) {
      const fy = top + f * FLOOR_H;

      // Horizontal spandrel strip
      gfx.fillStyle(0x1c2c3c, 0.7);
      gfx.fillRect(x, fy, w, 1);

      // Sky lobby
      if (f === skyLobbyFloor) {
        gfx.fillStyle(0x1e3a54, 1);
        gfx.fillRect(x, fy, w, FLOOR_H * 2);
      }

      // Observation deck
      if (f === obsDeckFloor) {
        gfx.fillStyle(0x243a50, 1);
        gfx.fillRect(x - 2, fy, w + 4, FLOOR_H);
        gfx.fillStyle(0x344a60, 1);
        gfx.fillRect(x - 2, fy, w + 4, 1);
      }

      const wy = fy + Math.round((FLOOR_H - wh) / 2);
      if (wy + wh > buildGY - 2) continue;

      const isAccent = (f % 4 === 0) || f === skyLobbyFloor || f === obsDeckFloor;

      for (let c = 0; c < cols; c++) {
        const wxx = Math.round(x + hGap * (c + 1) - ww / 2);
        gfx.fillStyle(isAccent ? 0x2c5880 : 0x0e2030, 1);
        gfx.fillRect(wxx, wy, ww, wh);
        this.windowRects.push({ wx: wxx, wy, ww, wh, accent: isAccent });
      }

      // 1 light per 5 floors
      if (f % 5 === 2) {
        this.windowLights.push(scene.lights.addLight(
          x + w / 2, fy + FLOOR_H * 2.5, 110, 0x88ccff, 0,
        ));
      }
    }

    // ── Ground floor atrium ───────────────────────────────────────
    const atrH = FLOOR_H * 3;
    // Lv 87+: double-height glass atrium
    if (level >= 87) {
      gfx.fillStyle(0x2c5070, 0.6);
      gfx.fillRect(x, buildGY - atrH, w, atrH);
      gfx.lineStyle(1, 0x4c708a, 0.8);
      for (let lx = x + 12; lx < x + w - 4; lx += 12) {
        gfx.moveTo(lx, buildGY - atrH).lineTo(lx, buildGY).strokePath();
      }
      gfx.fillStyle(0x1c3c54, 0.4);
      gfx.fillRect(x, buildGY - atrH, w, 2);
    } else {
      gfx.fillStyle(0x1e3448, 0.5);
      gfx.fillRect(x, buildGY - atrH, w, atrH);
    }

    // ── Antenna / spire ───────────────────────────────────────────
    // Lv 87+: main spire
    if (level >= 87) {
      const antX = x + Math.round(w / 2);
      gfx.fillStyle(0x8899aa, 1);
      gfx.fillRect(antX - 1, top - ANTENNA_H, 3, ANTENNA_H);
      gfx.fillRect(antX - 5, top - ANTENNA_H + 8, 12, 1);
      gfx.fillRect(antX - 3, top - ANTENNA_H + 16, 8, 1);
      gfx.fillStyle(0xff4444, 1);
      gfx.fillCircle(antX, top - ANTENNA_H, 2);
    }

    // ── Lv 92+: secondary mast (offset) ──────────────────────────
    if (level >= 92) {
      const m2X = x + Math.round(w * 0.68);
      gfx.fillStyle(0x8899aa, 1);
      gfx.fillRect(m2X, top - 20, 2, 20);
      gfx.fillRect(m2X - 3, top - 14, 8, 1);
    }

    // ── Lv 94+: broadcast array ───────────────────────────────────
    if (level >= 94) {
      const baX = x + Math.round(w * 0.3);
      gfx.fillStyle(0x9aaabc, 1);
      gfx.fillRect(baX - 8, top - 10, 16, 2);
      gfx.fillRect(baX - 5, top - 16, 10, 2);
      gfx.fillRect(baX - 2, top - 22, 4, 2);
    }

    // ── Lv 96+: wind turbine hint ─────────────────────────────────
    if (level >= 96) {
      const wtX = x + Math.round(w * 0.8), wtY = top - 8;
      gfx.fillStyle(0x9aacbc, 1);
      gfx.fillRect(wtX - 1, wtY, 2, 12);
      gfx.fillRect(wtX - 6, wtY + 2, 12, 2);
    }

    // ── Lv 99+: corporate geometric symbol ───────────────────────
    if (level >= 99) {
      const symY = buildGY - FLOOR_H * 3 - 14;
      const symX = x + Math.round(w * 0.2);
      gfx.fillStyle(0x4488bb, 0.7);
      gfx.fillRect(symX,     symY,     8, 8);
      gfx.fillRect(symX + 9, symY,     8, 8);
      gfx.fillRect(symX,     symY + 9, 8, 8);
      gfx.fillRect(symX + 9, symY + 9, 8, 8);
    }

    // ── Lv 93+: rooftop terrace garden ───────────────────────────
    if (level >= 93) {
      for (let gi = 0; gi < 4; gi++) {
        const gX = x + Math.round(w * (gi * 0.22 + 0.04));
        gfx.fillStyle(0x2a4820, 1);
        gfx.fillRect(gX, top - 3, 8, 3);
        gfx.fillStyle(0x3a6828, 1);
        gfx.fillCircle(gX + 4, top - 3, 3);
      }
    }

    // ── Lv 97+: illuminated building sign ────────────────────────
    let signLightPos: { cx: number; cy: number } | null = null;
    if (level >= 97) {
      const snY = buildGY - FLOOR_H * 3 - 10;
      gfx.fillStyle(0x4488bb, 0.7);
      for (let si = 0; si < 7; si++) {
        gfx.fillRect(x + 6 + si * 12, snY + 2, 8, 5);
      }
      signLightPos = { cx: x + Math.round(w / 2), cy: snY + 4 };
    }

    this.add(gfx);

    // ── Lamp cone / LED crown ─────────────────────────────────────
    const lampConeGfx = scene.add.graphics();
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

    // Lv 95+: crown illumination pulses along LED strips
    if (level >= 95) {
      lampConeGfx.fillStyle(0x44aaff, 0.8);
      lampConeGfx.fillRect(x, top, 2, 20);
      lampConeGfx.fillRect(x + w - 2, top, 2, 20);
    }

    if (signLightPos) {
      lampConeGfx.fillStyle(0x88ccff, 1);
      lampConeGfx.fillRect(signLightPos.cx - 36, signLightPos.cy - 3, 72, 6);
      this.windowLights.push(scene.lights.addLight(signLightPos.cx, signLightPos.cy, 80, 0x88ccff, 0));
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
    if (level >= 87) {
      const antX = x + Math.round(w / 2);
      sg.fillRect(antX - 1, top - ANTENNA_H, 3, ANTENNA_H);
      sg.fillRect(antX - 5, top - ANTENNA_H + 8, 12, 1);
      sg.fillRect(antX - 3, top - ANTENNA_H + 16, 8, 1);
      sg.fillCircle(antX, top - ANTENNA_H, 2);
    }
    if (level >= 92) {
      const m2X = x + Math.round(w * 0.68);
      sg.fillRect(m2X, top - 20, 2, 20);
      sg.fillRect(m2X - 3, top - 14, 8, 1);
    }
    if (level >= 94) {
      const baX = x + Math.round(w * 0.3);
      sg.fillRect(baX - 8, top - 10, 16, 2);
      sg.fillRect(baX - 5, top - 16, 10, 2);
      sg.fillRect(baX - 2, top - 22, 4, 2);
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
    for (const light of this.windowLights) light.intensity = t * 0.22;
    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, t);
    if (this.lampConeGfx) this.lampConeGfx.setAlpha(t * 0.6);
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number): void {
    gfx.clear();
    for (const { wx, wy, ww, wh, accent } of this.windowRects) {
      const dayCol = accent ? 0x3a6890 : 0x0c1e2e;
      gfx.fillStyle(lerpColor(dayCol, accent ? 0xffcc88 : 0xffaa44, t), 1);
      gfx.fillRect(wx, wy, ww, wh);
    }
  }
}
