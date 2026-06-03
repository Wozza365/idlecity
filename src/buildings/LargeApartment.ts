import Phaser from 'phaser';
import { YARD_H, buildingHeight } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { SoftSpotLight } from '../lighting/SoftSpotLight';
import { type DoorEntrance } from './types';

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((Math.round(ar + (br - ar) * t) << 16) |
          (Math.round(ag + (bg - ag) * t) << 8)  |
           Math.round(ab + (bb - ab) * t));
}

const FOUND_H   = 10;
const LOBBY_H   = 34;
const FLOOR_H   = 18;
const PARAPET_H = 10;

// Hotel flag: two-tone colors [dark, light] per flag slot
const FLAG_COLORS: [number, number][] = [
  [0xcc2222, 0xee4444],
  [0x2244cc, 0x3366ee],
  [0x228822, 0x44aa44],
];

export class LargeApartment extends Phaser.GameObjects.Container {
  readonly doorEntrances: DoorEntrance[] = [];
  private windowLights:   Phaser.GameObjects.Light[] = [];
  private signLight:      Phaser.GameObjects.Light | null = null;
  private signSpot:       SoftSpotLight | null = null;
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private accentGfx:      Phaser.GameObjects.Graphics | null = null; // lv 62 LED band
  private flagGfx:        Phaser.GameObjects.Graphics | null = null; // rooftop flag
  private flagLight:      Phaser.GameObjects.Light | null = null;
  private flagPoleX = 0;
  private flagTop   = 0;
  private hotelFlagGfx:    Phaser.GameObjects.Graphics | null = null;
  private hotelFlags: Array<{ poleX: number; poleY: number; dir: 1 | -1; colorIdx: number }> = [];
  private hotelFlagPhases: number[] = [];
  private lightPhases:   number[] = [];
  private windowRects:   Array<{ wx: number; wy: number; ww: number; wh: number }> = [];
  private shadowGfx!:   Phaser.GameObjects.Graphics;

  get extraLights(): LightSource[] {
    return this.signSpot ? [...this.signSpot.beams] : [];
  }

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w       = plotWidth;
    const h       = buildingHeight(level);
    const bw      = Math.round(w * 0.90);
    const bx      = x + Math.round((w - bw) / 2);
    const buildGY = groundY - YARD_H;
    const top     = buildGY - h;
    const bodyTop = top + PARAPET_H;
    const bodyBot = buildGY - FOUND_H;
    const lobbyTop = bodyBot - LOBBY_H;

    // ── Lv 68+: penthouse setback ─────────────────────────────────
    const pentFloors = level >= 68 ? 2 : 0;
    const pentH      = pentFloors * FLOOR_H;
    const pentBw     = level >= 68 ? Math.round(bw * 0.86) : bw;
    const pentBx     = level >= 68 ? bx + Math.round((bw - pentBw) / 2) : bx;

    // ── Cream concrete body ───────────────────────────────────────
    const body = scene.add.rectangle(bx + bw / 2, (bodyTop + bodyBot) / 2, bw, bodyBot - bodyTop, 0xe0d8c8);
    body.setLighting(true);
    this.add(body);

    // Penthouse (lighter cream, slightly inset)
    if (pentFloors > 0) {
      const pent = scene.add.rectangle(pentBx + pentBw / 2, bodyTop + pentH / 2, pentBw, pentH, 0xf0eade);
      pent.setLighting(true);
      this.add(pent);
    }

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Foundation plinth ─────────────────────────────────────────
    gfx.fillStyle(0x888880, 1);
    gfx.fillRect(bx, bodyBot, bw, FOUND_H);
    gfx.fillStyle(0x686860, 1);
    gfx.fillRect(bx, bodyBot, bw, 1);

    // ── Parapet cap ───────────────────────────────────────────────
    gfx.fillStyle(0xd0c8b8, 1);
    gfx.fillRect(bx, top, bw, PARAPET_H);
    gfx.fillStyle(0xe8e0d0, 1);
    gfx.fillRect(bx - 2, top, bw + 4, 3);
    gfx.fillStyle(0xb0a890, 1);
    gfx.fillRect(bx - 2, top + 3, bw + 4, 1);

    // ── Sidewalk ──────────────────────────────────────────────────
    gfx.fillStyle(0xb8b0a0, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    gfx.lineStyle(1, 0xa0988a, 0.4);
    for (let px = x + 30; px < x + w; px += 30) {
      gfx.moveTo(px, buildGY).lineTo(px, groundY).strokePath();
    }

    // ── Dark structural grid lines ────────────────────────────────
    // 3 vertical columns dividing building into 4 bays
    const nCols    = 4;
    const colW     = Math.max(5, Math.round(bw * 0.045));
    const bayW     = Math.round((bw - colW * (nCols - 1)) / nCols);
    // Horizontal floor lines
    const upperH   = lobbyTop - bodyTop;
    const nFloors  = Math.max(2, Math.floor(upperH / FLOOR_H));
    const actualFH = Math.round(upperH / nFloors);

    gfx.lineStyle(1, 0xc0b8a8, 0.35);
    for (let f = 1; f < nFloors; f++) {
      const fy = lobbyTop - f * actualFH;
      gfx.moveTo(bx, fy).lineTo(bx + bw, fy).strokePath();
    }

    // Vertical structural column dividers
    gfx.fillStyle(0x4a5058, 0.18);
    for (let c = 1; c < nCols; c++) {
      const cx_ = bx + c * (bayW + colW) - colW;
      gfx.fillRect(cx_, bodyTop, colW, upperH);
    }

    // ── Lv 62+: mid-building accent band ─────────────────────────
    const midBandFloor = level >= 62 ? Math.round(nFloors * 0.5) : -1;
    if (midBandFloor > 0) {
      const mby = lobbyTop - midBandFloor * actualFH;
      gfx.fillStyle(0x4a5058, 0.55);
      gfx.fillRect(bx, mby, bw, 4);
      gfx.fillStyle(0x6878a0, 0.25);
      gfx.fillRect(bx, mby + 1, bw, 2);
    }

    // ── Lv 64+: vertical fin accents (upper half) ─────────────────
    const finsFrom = level >= 64 ? Math.round(nFloors * 0.55) : nFloors + 1;

    // ── Floor windows (4 bays) ────────────────────────────────────
    const wh     = Math.round(actualFH * 0.68);
    const panelW = Math.round(bayW * 0.80);

    for (let f = 0; f < nFloors; f++) {
      const floorBot = lobbyTop - f * actualFH;
      const panelY   = floorBot - Math.round((actualFH + wh) / 2);

      if (panelY < bodyTop + 2 || panelY + wh > floorBot - 1) continue;

      // Balcony slab: lv 58+, every 3rd floor
      if (level >= 58 && f % 3 === 0 && f > 0) {
        gfx.fillStyle(0xb0a898, 1);
        gfx.fillRect(bx - 3, floorBot - 2, bw + 6, 3);
        gfx.fillStyle(0x8898b0, 0.5);
        gfx.fillRect(bx - 3, floorBot - 5, bw + 6, 1);
      }

      for (let c = 0; c < nCols; c++) {
        const panelX = bx + c * (bayW + colW) + Math.round((bayW - panelW) / 2);

        // Lv 64+: vertical fins between bays (upper floors)
        if (level >= 64 && f >= finsFrom && c < nCols - 1) {
          const finX = bx + (c + 1) * (bayW + colW) - colW;
          gfx.fillStyle(0x38404a, 0.65);
          gfx.fillRect(finX - 1, panelY, colW + 2, wh);
        }

        this.windowRects.push({ wx: panelX, wy: panelY, ww: panelW, wh });
      }

      // One light per bay per floor
      for (let c = 0; c < nCols; c++) {
        const panelX = bx + c * (bayW + colW) + Math.round((bayW - panelW) / 2);
        this.windowLights.push(scene.lights.addLight(
          panelX + Math.round(panelW / 2), floorBot - Math.round(actualFH / 2), 80, 0xffaa44, 0,
        ));
      }
    }

    // ── Hotel lobby entrance ──────────────────────────────────────
    gfx.fillStyle(0x1a2a38, 1);
    gfx.fillRect(bx, lobbyTop, bw, LOBBY_H);
    // Lobby glass pane dividers
    gfx.lineStyle(1, 0x3a5a78, 0.9);
    for (let lx = bx + 20; lx < bx + bw - 4; lx += 20) {
      gfx.moveTo(lx, lobbyTop).lineTo(lx, bodyBot).strokePath();
    }
    // Lobby cap bar
    gfx.fillStyle(0x2a3840, 1);
    gfx.fillRect(bx, lobbyTop, bw, 3);
    gfx.fillStyle(0x4a6878, 0.5);
    gfx.fillRect(bx, lobbyTop + 1, bw, 1);

    // Two symmetrical doors
    const doorW = Math.round(bw * 0.14);
    const doorH = Math.round(LOBBY_H * 0.82);
    const door1X = bx + Math.round(bw * 0.25) - Math.round(doorW / 2);
    const door2X = bx + Math.round(bw * 0.75) - Math.round(doorW / 2);
    for (const doorX of [door1X, door2X]) {
      gfx.fillStyle(0x0a1520, 1);
      gfx.fillRect(doorX, bodyBot - doorH, doorW, doorH);
      gfx.fillStyle(0x2a4a62, 0.6);
      gfx.fillRect(doorX + 2, bodyBot - doorH + 2, doorW - 4, doorH - 4);
      gfx.fillStyle(0x3a5a78, 0.8);
      gfx.fillRect(doorX + Math.round(doorW / 2) - 1, bodyBot - doorH, 2, doorH);
      // Handle
      gfx.fillStyle(0xd0c870, 1);
      gfx.fillRect(doorX + doorW - 5, bodyBot - Math.round(doorH * 0.48), 3, 2);
      this.doorEntrances.push({ x: doorX + Math.round(doorW / 2), y: bodyBot });
    }

    // ── Lv 60+: corner glass accent strips ───────────────────────
    if (level >= 60) {
      gfx.fillStyle(0x3a4858, 0.55);
      gfx.fillRect(bx,           bodyTop, 7, upperH);
      gfx.fillRect(bx + bw - 7,  bodyTop, 7, upperH);
      gfx.fillStyle(0x5a7898, 0.25);
      gfx.fillRect(bx + 2,       bodyTop, 3, upperH);
      gfx.fillRect(bx + bw - 5,  bodyTop, 3, upperH);
    }

    // ── Lv 61+: entrance canopy with angled supports ──────────────
    if (level >= 61) {
      const cW = Math.round(bw * 0.55);
      const cX = bx + Math.round((bw - cW) / 2);
      const cY = lobbyTop - 10;
      gfx.fillStyle(0x3a4050, 1);
      gfx.fillRect(cX, cY, cW, 5);
      gfx.fillStyle(0x5a6070, 1);
      gfx.fillRect(cX, cY, cW, 1);
      // Angled support brackets
      gfx.lineStyle(2, 0x4a5060, 1);
      gfx.moveTo(cX + 6,      cY + 5).lineTo(cX + 6,      lobbyTop).strokePath();
      gfx.moveTo(cX + cW - 6, cY + 5).lineTo(cX + cW - 6, lobbyTop).strokePath();
      // Shadow below canopy
      gfx.fillStyle(0x000000, 0.18);
      gfx.fillRect(cX + 2, cY + 5, cW, 5);
    }

    // ── Lv 63+: rooftop HVAC cluster ─────────────────────────────
    if (level >= 63) {
      for (let ai = 0; ai < 5; ai++) {
        const aX = bx + Math.round(bw * (ai * 0.18 + 0.04));
        const aW = ai % 2 === 0 ? 13 : 10;
        const aH = ai % 2 === 0 ? 9 : 7;
        gfx.fillStyle(0x8888a0, 1);
        gfx.fillRect(aX, top - aH, aW, aH);
        gfx.fillStyle(0x686880, 1);
        gfx.fillRect(aX, top - aH, aW, 2);
        gfx.fillStyle(0xa0a0b8, 0.4);
        gfx.fillRect(aX + 1, top - aH + 3, aW - 2, 2);
      }
    }

    // ── Lv 65+: illuminated hotel signage ────────────────────────
    let signPos: { cx: number; cy: number } | null = null;
    if (level >= 65) {
      const sW = Math.round(bw * 0.55);
      const sX = bx + Math.round((bw - sW) / 2);
      const sY = lobbyTop - 22;
      gfx.fillStyle(0x0a0a10, 1);
      gfx.fillRect(sX, sY, sW, 10);
      gfx.fillStyle(0xe8e0d0, 1);
      // Sign letter dots (hotel name)
      for (let si = 0; si < 7; si++) {
        gfx.fillRect(sX + 6 + si * 14, sY + 3, 9, 5);
      }
      signPos = { cx: bx + Math.round(bw / 2), cy: sY + 5 };
    }

    // ── Lv 67+: street trees / planters ──────────────────────────
    if (level >= 67) {
      for (const [tX, isLeft] of [[x + 4, true], [x + w - 14, false]] as [number, boolean][]) {
        gfx.fillStyle(0x3a4430, 1);
        gfx.fillRect(tX, buildGY + 2, 10, 8);
        gfx.fillStyle(0x5a3820, 1);
        gfx.fillRect(tX + 4, buildGY - 5, 2, 7);
        gfx.fillStyle(0x2a6818, 1);
        gfx.fillCircle(tX + 5, buildGY - 9, 7);
        gfx.fillStyle(0x388a22, 1);
        gfx.fillCircle(tX + (isLeft ? 3 : 7), buildGY - 13, 4);
      }
    }

    // ── Lv 59+: rooftop plant room ────────────────────────────────
    if (level >= 59) {
      const prW = Math.round(bw * 0.40);
      const prH = 14;
      gfx.fillStyle(0xc8c0b0, 1);
      gfx.fillRect(bx + Math.round((bw - prW) / 2), top - prH, prW, prH);
      gfx.fillStyle(0xb0a898, 1);
      gfx.fillRect(bx + Math.round((bw - prW) / 2), top - prH, prW, 2);
    }

    // ── Lv 69+: antenna mast ─────────────────────────────────────
    if (level >= 69) {
      const antX = bx + Math.round(bw * 0.58);
      gfx.fillStyle(0x8898a8, 1);
      gfx.fillRect(antX, top - 26, 2, 26);
      gfx.fillRect(antX - 6, top - 20, 14, 1);
      gfx.fillRect(antX - 4, top - 14, 10, 1);
    }

    // ── Lv 70+: rooftop terrace silhouettes ──────────────────────
    if (level >= 70) {
      // Table + chairs
      const tX = bx + Math.round(bw * 0.35);
      gfx.fillStyle(0x8890a0, 1);
      gfx.fillRect(tX, top - 5, 14, 2);
      gfx.fillRect(tX + 2, top - 3, 2, 3);
      gfx.fillRect(tX + 10, top - 3, 2, 3);
      // Chairs
      gfx.fillRect(tX - 4, top - 4, 3, 4);
      gfx.fillRect(tX + 15, top - 4, 3, 4);
      // Parasol
      gfx.fillStyle(0x9a7858, 1);
      gfx.fillRect(tX + 6, top - 12, 2, 8);
      gfx.fillRect(tX + 2, top - 12, 10, 2);
    }

    this.add(gfx);

    // ── Lv 57+: diagonal hotel flags ─────────────────────────────
    if (level >= 57) {
      const hotelFlagGfx = scene.add.graphics();
      hotelFlagGfx.setLighting(true);
      this.add(hotelFlagGfx);
      this.hotelFlagGfx = hotelFlagGfx;

      // 3 flags, evenly spaced, alternating left/right lean
      const nFlags = 3;
      for (let fi = 0; fi < nFlags; fi++) {
        const t_     = (fi + 1) / (nFlags + 1);
        const poleX  = bx + Math.round(bw * t_);
        const dir    = fi % 2 === 0 ? 1 : -1; // 1 = leans right, -1 = leans left
        this.hotelFlags.push({ poleX, poleY: lobbyTop, dir: dir as 1 | -1, colorIdx: fi % FLAG_COLORS.length });
        this.hotelFlagPhases.push(Math.random() * Math.PI * 2);
      }
    }

    // ── Lv 66+: rooftop flagpole ──────────────────────────────────
    if (level >= 66) {
      const fpX    = bx + Math.round(bw * 0.22);
      const fpTop_ = top - 30;
      const poleGfx = scene.add.graphics();
      poleGfx.setLighting(true);
      poleGfx.fillStyle(0xa0a0a8, 1);
      poleGfx.fillRect(fpX - 1, fpTop_, 2, 30);
      poleGfx.fillStyle(0xd0d0d8, 1);
      poleGfx.fillRect(fpX - 1, fpTop_, 2, 2);
      this.add(poleGfx);

      const flagGfx = scene.add.graphics();
      flagGfx.setLighting(true);
      this.add(flagGfx);
      this.flagGfx   = flagGfx;
      this.flagPoleX = fpX;
      this.flagTop   = fpTop_;
      this.flagLight = scene.lights.addLight(fpX + 9, fpTop_ + 5, 40, 0xfff0cc, 0);
    }

    // ── Lv 65+: sign glow and spot (ADD blend) ────────────────────
    const lampConeGfx = scene.add.graphics();
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    if (signPos) {
      lampConeGfx.fillStyle(0xfff0e0, 1);
      lampConeGfx.fillRect(signPos.cx - 30, signPos.cy - 2, 60, 6);
      this.signLight = scene.lights.addLight(signPos.cx, signPos.cy, 80, 0xfff0cc, 0);
      this.signSpot  = new SoftSpotLight({
        x:           signPos.cx,
        y:           signPos.cy + 5,
        radius:      70,
        color:       0xfff0cc,
        intensity:   0,
        angle:       Math.PI / 2,
        coneAngle:   Math.PI / 2 * 0.60,
        noOcclusion: true,
      });
    }
    this.add(lampConeGfx);

    // ── Lv 62+: LED accent band glow (ADD, animated) ──────────────
    if (level >= 62) {
      const accentGfx = scene.add.graphics();
      accentGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      const mby = lobbyTop - midBandFloor * actualFH;
      accentGfx.fillStyle(0x4466ff, 1);
      for (let ax = bx + 4; ax < bx + bw - 4; ax += 6) {
        accentGfx.fillCircle(ax, mby + 2, 2);
      }
      this.add(accentGfx);
      this.accentGfx = accentGfx;
    }

    // ── Window glass overlay ──────────────────────────────────────
    const windowGlassGfx = scene.add.graphics();
    windowGlassGfx.setLighting(true);
    this.drawWindowGlass(windowGlassGfx, 0);
    this.add(windowGlassGfx);
    this.windowGlassGfx = windowGlassGfx;

    this.lightPhases = this.windowLights.map(() => Math.random() * Math.PI * 2);

    // ── Shadow overlay ────────────────────────────────────────────
    const sg = scene.add.graphics();
    sg.fillStyle(0x000022, 1);
    sg.fillRect(bx - 2, top, bw + 4, bodyBot - top);
    if (level >= 59) {
      const prW = Math.round(bw * 0.40);
      sg.fillRect(bx + Math.round((bw - prW) / 2), top - 14, prW, 14);
    }
    if (level >= 66) {
      const fpX = bx + Math.round(bw * 0.22);
      sg.fillRect(fpX - 1, top - 30, 2, 21);
    }
    if (level >= 69) {
      const antX = bx + Math.round(bw * 0.58);
      sg.fillRect(antX, top - 26, 2, 26);
      sg.fillRect(antX - 6, top - 20, 14, 1);
    }
    sg.setDepth(9.15);
    sg.setAlpha(0);
    this.shadowGfx = sg;

    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      for (const light of this.windowLights) scene.lights.removeLight(light);
      if (this.signLight) scene.lights.removeLight(this.signLight);
      if (this.flagLight) scene.lights.removeLight(this.flagLight);
      this.shadowGfx.destroy();
    });
  }

  setShadowAlpha(alpha: number): void { this.shadowGfx.setAlpha(alpha); }

  updateWindowLights(elevation: number): void {
    const t = Math.max(0, Math.min(1, (0.4 - elevation) / 0.3));
    if (t < 0.01 && this.windowLights.every(l => l.intensity < 0.01)) return;

    const ambientIntensity = elevation >= 0.3 ? 1.0
      : elevation >= 0 ? 0.5 + (elevation / 0.3) * 0.5
      : 0.5;
    const tNorm = t * (0.5 / ambientIntensity);
    const time  = this.scene.time.now / 1000;

    this.windowLights.forEach((light, i) => {
      const flicker = 1 + Math.sin(time * 1.7 + this.lightPhases[i]) * 0.08;
      light.intensity = tNorm * 0.36 * flicker;
    });

    if (this.signLight)   this.signLight.intensity = tNorm * 1.2;
    if (this.signSpot)    this.signSpot.setIntensity(tNorm * 2.8);
    if (this.flagLight)   this.flagLight.intensity = tNorm * 0.6;

    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, tNorm);
    if (this.accentGfx)      this.accentGfx.setAlpha(Math.min(1, tNorm * 0.9));
  }

  updateFlag(): void {
    const time = this.scene.time.now / 1000;
    if (this.flagGfx) this.drawRooftopFlag(this.flagGfx, time);
    if (this.hotelFlagGfx) this.drawHotelFlags(this.hotelFlagGfx, time);
  }

  private drawRooftopFlag(gfx: Phaser.GameObjects.Graphics, time: number): void {
    gfx.clear();
    const fx   = this.flagPoleX + 1;
    const fy   = this.flagTop;
    const fw = 16, fh = 10;
    const wave = Math.sin(time * 4) * 2;
    const mid  = Math.sin(time * 4 + 1) * 1.2;
    const mcx  = fx + Math.round(fw / 2);
    gfx.fillStyle(0xcc2222, 1);
    gfx.fillTriangle(fx, fy, fx, fy + fh, mcx, fy + fh + mid);
    gfx.fillTriangle(fx, fy, mcx, fy + fh + mid, mcx, fy + mid);
    gfx.fillStyle(0xee4444, 1);
    gfx.fillTriangle(mcx, fy + mid, mcx, fy + fh + mid, fx + fw, fy + fh + wave);
    gfx.fillTriangle(mcx, fy + mid, fx + fw, fy + fh + wave, fx + fw, fy + wave);
  }

  private drawHotelFlags(gfx: Phaser.GameObjects.Graphics, time: number): void {
    gfx.clear();
    const fw = 16, fh = 10;
    const poleLen = 14; // diagonal pole length in pixels

    for (let i = 0; i < this.hotelFlags.length; i++) {
      const { poleX, poleY, dir, colorIdx } = this.hotelFlags[i];
      const phase = this.hotelFlagPhases[i];
      const [colorDark, colorLight] = FLAG_COLORS[colorIdx];

      // Diagonal pole: attaches at (poleX, poleY), tip goes up+dir*poleLen
      const tipX = poleX + dir * poleLen;
      const tipY = poleY - poleLen;

      // Draw pole as a thin diagonal line
      gfx.lineStyle(1, 0xa0a8b0, 1);
      gfx.moveTo(poleX, poleY).lineTo(tipX, tipY).strokePath();
      // Pole tip cap
      gfx.fillStyle(0xd0d8e0, 1);
      gfx.fillCircle(tipX, tipY, 1.5);

      // Flag hangs from tip, waves horizontally
      // fx = tip, flag extends in the opposite horizontal direction to dir
      const fx   = tipX;
      const fy   = tipY;
      const wave = Math.sin(time * 3.8 + phase) * 2;
      const mid  = Math.sin(time * 3.8 + phase + 1) * 1.2;
      // Flag extends away from pole attachment (so flag waves freely)
      const fEndX = fx - dir * fw;
      const mcx   = fx - dir * Math.round(fw / 2);
      const fWave  = dir > 0 ? -wave : wave;
      const fMid   = dir > 0 ? -mid  : mid;

      gfx.fillStyle(colorDark, 1);
      gfx.fillTriangle(fx, fy, fx, fy + fh, mcx, fy + fh + fMid);
      gfx.fillTriangle(fx, fy, mcx, fy + fh + fMid, mcx, fy + fMid);
      gfx.fillStyle(colorLight, 1);
      gfx.fillTriangle(mcx, fy + fMid, mcx, fy + fh + fMid, fEndX, fy + fh + fWave);
      gfx.fillTriangle(mcx, fy + fMid, fEndX, fy + fh + fWave, fEndX, fy + fWave);
    }
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number): void {
    gfx.clear();
    for (const { wx, wy, ww, wh } of this.windowRects) {
      gfx.fillStyle(lerpColor(0x4a7a9a, 0xffcc66, t), 1);
      gfx.fillRect(wx, wy, ww, wh);
      gfx.fillStyle(0xffffff, 0.16);
      gfx.fillRect(wx, wy + Math.round(wh / 2), ww, 1);
    }
  }
}
