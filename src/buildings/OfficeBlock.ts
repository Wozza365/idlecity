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

const FLOOR_H = 14;

export class OfficeBlock extends Phaser.GameObjects.Container {
  readonly doorEntrances: DoorEntrance[] = [];
  private windowLights:   Phaser.GameObjects.Light[] = [];
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private lampConeGfx:    Phaser.GameObjects.Graphics | null = null;
  private windowRects: Array<{ wx: number; wy: number; ww: number; wh: number; bright: boolean }> = [];
  private shadowGfx!: Phaser.GameObjects.Graphics;
  private neonSignGfx: Phaser.GameObjects.Graphics | null = null;
  private _neonX = 0;
  private _neonY = 0;
  private _neonPhase = 0;

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w       = plotWidth;
    const h       = buildingHeight(level);
    const buildGY = groundY - YARD_H;
    this.doorEntrances = [{ x: x + Math.round(w / 2), y: buildGY }];
    const top     = buildGY - h;

    // Lv 82+: upper setback — top 20% slightly narrower
    const setbackFrac  = level >= 82 ? 0.20 : 0;
    const setbackH     = Math.round(h * setbackFrac);
    const setbackBw    = level >= 82 ? Math.round(w * 0.86) : w;
    const setbackBx    = level >= 82 ? x + Math.round((w - setbackBw) / 2) : x;

    // ── Dark glass body ───────────────────────────────────────────
    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0x1e2e3e);
    body.setLighting(true);
    this.add(body);

    // Setback upper section (slightly different shade)
    if (setbackH > 0) {
      const sb = scene.add.rectangle(setbackBx + setbackBw / 2, top + setbackH / 2, setbackBw, setbackH, 0x243848);
      sb.setLighting(true);
      this.add(sb);
    }

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Roof cap ──────────────────────────────────────────────────
    gfx.fillStyle(0x2a3a4a, 1);
    gfx.fillRect(x, top, w, 3);

    // ── Lv 85+: architectural crown ──────────────────────────────
    if (level >= 85) {
      gfx.fillStyle(0x344454, 1);
      gfx.fillRect(x - 2, top - 4, w + 4, 5);
      gfx.fillStyle(0x445464, 1);
      gfx.fillRect(x - 2, top - 4, w + 4, 1);
    }

    // ── Vertical structural frame columns ────────────────────────
    gfx.fillStyle(0x384858, 1);
    gfx.fillRect(x,                    top, 4, h);
    gfx.fillRect(x + Math.round(w / 2) - 2, top, 4, h);
    gfx.fillRect(x + w - 4,            top, 4, h);

    // ── Lv 74+: corner LED accent strips ─────────────────────────
    if (level >= 74) {
      gfx.fillStyle(0x4488bb, 0.6);
      gfx.fillRect(x,         top, 2, h);
      gfx.fillRect(x + w - 2, top, 2, h);
    }

    // ── Sidewalk / plaza ──────────────────────────────────────────
    gfx.fillStyle(0xa8a090, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    // Lv 81+: plaza paving pattern
    if (level >= 81) {
      gfx.lineStyle(1, 0x989080, 0.6);
      for (let px = x + 20; px < x + w; px += 20) {
        gfx.moveTo(px, buildGY).lineTo(px, groundY).strokePath();
      }
      gfx.moveTo(x, buildGY + 8).lineTo(x + w, buildGY + 8).strokePath();
    }

    // ── Floors & curtain glazing: 4 cols ──────────────────────────
    const nFloors  = Math.floor(h / FLOOR_H);
    const cols     = 4;
    const ww       = Math.round(w * 0.165);
    const wh       = Math.round(FLOOR_H * 0.72);
    const hPad     = Math.round(w / (cols + 1));

    // Sky lobby floor at ~50%
    const skyLobbyFloor = level >= 78 ? Math.round(nFloors * 0.50) : -1;

    for (let f = 0; f < nFloors; f++) {
      const fy = top + f * FLOOR_H;

      // Spandrel band
      gfx.fillStyle(0x141e28, 1);
      gfx.fillRect(x + 4, fy, w - 8, 2);

      // Sky lobby accent
      if (f === skyLobbyFloor) {
        gfx.fillStyle(0x2a4858, 1);
        gfx.fillRect(x, fy, w, FLOOR_H);
      }

      const wy = fy + Math.round((FLOOR_H - wh) / 2);
      if (wy + wh > buildGY - 2) continue;

      // Lv 77+: structural fin between col 2 and 3
      if (level >= 77) {
        gfx.fillStyle(0x384858, 1);
        gfx.fillRect(x + Math.round(w * 0.48), fy, 3, FLOOR_H);
      }

      for (let c = 0; c < cols; c++) {
        const wxx = Math.round(x + hPad * (c + 1) - ww / 2);
        const isBright = (f % 4 === 0);

        gfx.fillStyle(isBright ? 0x3a5a72 : 0x1e3448, 1);
        gfx.fillRect(wxx, wy, ww, wh);

        this.windowRects.push({ wx: wxx, wy, ww, wh, bright: isBright });
      }

      // 1 light per 4 floors
      if (f % 4 === 1) {
        this.windowLights.push(scene.lights.addLight(
          x + w / 2, fy + FLOOR_H * 2, 100, 0x88ccff, 0,
        ));
      }
    }

    // ── Ground floor lobby ────────────────────────────────────────
    const lobbyH = FLOOR_H * 2;
    gfx.fillStyle(0x3a5a72, 0.55);
    gfx.fillRect(x, buildGY - lobbyH, w, lobbyH);
    gfx.lineStyle(1, 0x4a6a82, 0.8);
    for (let lx = x + 14; lx < x + w - 4; lx += 14) {
      gfx.moveTo(lx, buildGY - lobbyH).lineTo(lx, buildGY).strokePath();
    }
    gfx.fillStyle(0x2a4858, 0.4);
    gfx.fillRect(x, buildGY - lobbyH, w, 2);

    // ── Lv 72+: entrance portico ──────────────────────────────────
    if (level >= 72) {
      gfx.fillStyle(0x2a3a4a, 1);
      gfx.fillRect(x + Math.round(w * 0.1), buildGY - lobbyH - 6, Math.round(w * 0.8), 6);
      gfx.fillStyle(0x384858, 1);
      gfx.fillRect(x + Math.round(w * 0.1), buildGY - lobbyH - 6, Math.round(w * 0.8), 1);
    }

    // ── Lv 73+: rooftop equipment room ───────────────────────────
    if (level >= 73) {
      const prW = Math.round(w * 0.5);
      const prH = 12;
      gfx.fillStyle(0x2a3a4a, 1);
      gfx.fillRect(x + Math.round((w - prW) / 2), top - prH, prW, prH);
      gfx.fillStyle(0x384858, 1);
      gfx.fillRect(x + Math.round((w - prW) / 2), top - prH, prW, 2);
    }

    // ── Lv 75+: revolving door detail ────────────────────────────
    if (level >= 75) {
      const cx2 = x + Math.round(w / 2);
      const ry = buildGY - 8;
      gfx.fillStyle(0x4a6a82, 0.5);
      gfx.fillCircle(cx2, ry, 7);
      gfx.lineStyle(1, 0x6a8a9a, 0.8);
      gfx.moveTo(cx2 - 7, ry).lineTo(cx2 + 7, ry).strokePath();
      gfx.moveTo(cx2, ry - 7).lineTo(cx2, ry + 7).strokePath();
    }

    // ── Lv 76+: solar panel array on roof ────────────────────────
    if (level >= 76) {
      const spX = x + 6, spW = w - 12, spH = 6;
      gfx.fillStyle(0x1a2a3a, 1);
      gfx.fillRect(spX, top - spH - 1, spW, spH);
      gfx.lineStyle(1, 0x2a3a4a, 1);
      for (let sx = spX + 8; sx < spX + spW; sx += 8) {
        gfx.moveTo(sx, top - spH - 1).lineTo(sx, top - 1).strokePath();
      }
      gfx.fillStyle(0x1e3448, 0.4);
      gfx.fillRect(spX, top - spH - 1, spW, 1);
    }

    // ── Lv 79+: antenna mast ─────────────────────────────────────
    if (level >= 79) {
      const antX = x + Math.round(w * 0.4);
      gfx.fillStyle(0x8899aa, 1);
      gfx.fillRect(antX, top - 28, 2, 28);
      gfx.fillRect(antX - 5, top - 22, 12, 1);
      gfx.fillRect(antX - 3, top - 14, 8, 1);
    }

    // ── Lv 80+: green wall feature ────────────────────────────────
    if (level >= 80) {
      const gwTop  = top + Math.round(h * 0.3);
      const gwBot  = top + Math.round(h * 0.55);
      const gwH    = gwBot - gwTop;
      gfx.fillStyle(0x2a4818, 0.5);
      gfx.fillRect(x + w - 10, gwTop, 10, gwH);
      gfx.lineStyle(1, 0x3a6020, 0.4);
      for (let gy = gwTop + 4; gy < gwBot; gy += 4) {
        gfx.moveTo(x + w - 10, gy).lineTo(x + w, gy).strokePath();
      }
    }

    // ── Lv 83+: illuminated building name ────────────────────────
    let signLightPos: { cx: number; cy: number } | null = null;
    if (level >= 83) {
      const snY = buildGY - lobbyH - 14;
      gfx.fillStyle(0xe8e0d0, 1);
      for (let si = 0; si < 6; si++) {
        gfx.fillRect(x + 8 + si * 14, snY + 2, 10, 6);
      }
      signLightPos = { cx: x + Math.round(w / 2), cy: snY + 5 };
    }

    // ── Lv 84+: helipad marker ────────────────────────────────────
    if (level >= 84) {
      const hpX = x + Math.round(w / 2), hpY = top - 3;
      gfx.lineStyle(2, 0xe0d840, 0.8);
      gfx.strokeCircle(hpX, hpY - 8, 10);
      gfx.fillStyle(0xe0d840, 0.8);
      gfx.fillRect(hpX - 5, hpY - 10, 10, 2);
      gfx.fillRect(hpX - 1, hpY - 14, 2, 10);
    }

    this.add(gfx);

    // ── Neon sign (ADD blend, purple) ─────────────────────────────
    {
      const neonSignGfx = scene.add.graphics();
      neonSignGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.add(neonSignGfx);
      this.neonSignGfx = neonSignGfx;
      this._neonX     = x + 8;
      this._neonY     = buildGY - lobbyH + 8;
      this._neonPhase = Math.random() * Math.PI * 2;
    }

    // ── Lamp cone ─────────────────────────────────────────────────
    const lampConeGfx = scene.add.graphics();
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    if (signLightPos) {
      lampConeGfx.fillStyle(0xeeeedd, 1);
      lampConeGfx.fillRect(signLightPos.cx - 28, signLightPos.cy - 3, 56, 6);
      this.windowLights.push(scene.lights.addLight(signLightPos.cx, signLightPos.cy, 70, 0xddddcc, 0));
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
    if (level >= 79) {
      const antX = x + Math.round(w * 0.4);
      sg.fillRect(antX, top - 28, 2, 28);
      sg.fillRect(antX - 5, top - 22, 12, 1);
      sg.fillRect(antX - 3, top - 14, 8, 1);
    }
    sg.setDepth(9.15);
    sg.setAlpha(0);
    this.shadowGfx = sg;

    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      for (const light of this.windowLights) scene.lights.removeLight(light);
      this.shadowGfx.destroy();
      this.neonSignGfx?.destroy();
    });
  }

  setShadowAlpha(alpha: number): void { this.shadowGfx.setAlpha(alpha); }

  updateWindowLights(elevation: number, time = 0): void {
    const t = Math.max(0, Math.min(1, (0.4 - elevation) / 0.3));
    if (t < 0.01) return;
    const now = time || this.scene.time.now / 1000;
    for (const light of this.windowLights) light.intensity = t * 0.25;
    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, t);
    if (this.lampConeGfx) this.lampConeGfx.setAlpha(t * 0.55);
    if (this.neonSignGfx) {
      const nPulse = 0.6 + 0.4 * Math.abs(Math.sin(now * 2.1 + this._neonPhase));
      this.neonSignGfx.clear();
      if (t > 0.05) {
        this.neonSignGfx.fillStyle(0x6633ff, t * nPulse);
        this.neonSignGfx.fillRect(this._neonX, this._neonY, 20, 4);
        this.neonSignGfx.fillRect(this._neonX + 3, this._neonY - 4, 14, 4);
      }
      this.neonSignGfx.setAlpha(1);
    }
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number): void {
    gfx.clear();
    for (const { wx, wy, ww, wh, bright } of this.windowRects) {
      const dayCol = bright ? 0x4a6a88 : 0x203040;
      gfx.fillStyle(lerpColor(dayCol, bright ? 0xffcc88 : 0xffaa44, t), 1);
      gfx.fillRect(wx, wy, ww, wh);
    }
  }
}
