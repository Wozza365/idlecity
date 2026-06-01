import Phaser from 'phaser';
import { ROAD_H, VERGE_H, WATER_H } from '../constants';
import { SoftSpotLight } from '../lighting/SoftSpotLight';
import type { LightSource } from '../lighting/LightingSystem';

// ── Palette ───────────────────────────────────────────────────────────────────

const WATER_TOP  = 0x1A5C9E;
const WATER_BOT  = 0x3AA0DC;
const SAND_COLOR = 0xD4B483;
const SAND_WET   = 0xB8946A;
const ROCK_BASE  = 0x5A5A5A;
const ROCK_MID   = 0x6E6E6E;
const ROCK_LIGHT = 0x888888;
const DOCK_WOOD  = 0xA0784A;
const PIER_WOOD  = 0xB8884E;

const BEACH_SHORE_H = 48;  // depth of sandy beach area
const ROCK_SHORE_H  = 22;  // depth of rocky area

// People
const PED_COLORS   = [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff, 0xff9f43, 0x00d2d3, 0xff6bcd];
const TOWEL_COLORS = [0xE63946, 0x4CC9F0, 0xF4D35E, 0x3A86FF, 0xFFB347, 0xFF6BBA, 0x06D6A0, 0xB5838D];

// ── Beach person AI ───────────────────────────────────────────────────────────

interface BeachPerson {
  x: number;
  bottomY: number;
  dir: 1 | -1;
  speed: number;
  color: number;
  towelColor: number;
  w: number;
  h: number;
  phase: 'walk' | 'sit';
  phaseTimer: number;
  alpha: number;
  xMin: number;
  xMax: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lerpColor(a: number, b: number, t: number): number {
  const r  = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g  = Math.round(((a >> 8)  & 0xff) * (1 - t) + ((b >> 8)  & 0xff) * t);
  const bl = Math.round( (a        & 0xff) * (1 - t) +  (b        & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}

function dimColor(c: number, brightness: number): number {
  return lerpColor(0x000000, c, brightness);
}

// ── Main class ────────────────────────────────────────────────────────────────

export class WaterArea {
  private readonly scene: Phaser.Scene;

  // Graphics layers (depth < 6.0 so they render behind verge)
  private waterGfx:       Phaser.GameObjects.Graphics; // 5.5  – gradient water + coast (static)
  private shadowGfx:      Phaser.GameObjects.Graphics; // 5.65 – structure shadows on water (sun-dep)
  private structGfx:      Phaser.GameObjects.Graphics; // 5.7  – pier, dock, café, hut, lighthouse
  private beachShadowGfx: Phaser.GameObjects.Graphics; // 5.76 – beach people shadows
  private beachPeopleGfx: Phaser.GameObjects.Graphics; // 5.78 – moving beach people
  private fxGfx:          Phaser.GameObjects.Graphics; // 5.85 – bonfire, sparkles, buoys (no lighting)

  // Layout
  private _level  = 0;
  private _width  = 0;
  private _waterY = 0;
  private _beachEndX  = 0;
  private _transEndX  = 0; // where rocky area starts (after transition)
  private _pierX      = 0;
  private _dockX1     = 0;
  private _dockX2     = 0;
  private _cafeX      = 16;
  private _bonfireX   = 0;
  private _bonfireY   = 0;
  private _lighthouseX    = 0;
  private _lighthouseTopY = 0;
  private _dockSlots: number[] = [];

  // Beach people
  private _people: BeachPerson[] = [];

  // Buoys
  private _buoys: Array<{ x: number; y: number; color: number; phase: number }> = [];

  // Animation
  private _waveTime        = 0;
  private _bonfireTime     = 0;
  private _lighthouseAngle = 0;
  private _nightFactor     = 0;
  private _lastLightElevation = NaN;

  // Lighting — using SoftSpotLight + bulbs like verge lamps
  private _dockSpots:  SoftSpotLight[] = [];
  private _dockBulbs:  Array<Extract<LightSource, { type?: 'point' }>> = [];
  private _cafeSpot:   SoftSpotLight | null = null;
  private _cafeBulb:   Extract<LightSource, { type?: 'point' }> | null = null;
  private _pierSpot:   SoftSpotLight | null = null;
  private _pierBulb:   Extract<LightSource, { type?: 'point' }> | null = null;
  private _bonfireLight: Extract<LightSource, { type?: 'point' }> | null = null;
  private _lighthouseSpot: SoftSpotLight | null = null;
  private _lighthouseBulb: Extract<LightSource, { type?: 'point' }> | null = null;
  private _buoyBulbs:  Array<Extract<LightSource, { type?: 'point' }>> = [];
  private _nativeLights: Phaser.GameObjects.Light[] = [];

  get extraLights(): LightSource[] {
    const out: LightSource[] = [];
    for (const s of this._dockSpots) out.push(...s.beams);
    for (const b of this._dockBulbs) out.push(b);
    if (this._cafeSpot)   out.push(...this._cafeSpot.beams);
    if (this._cafeBulb)   out.push(this._cafeBulb);
    if (this._pierSpot)   out.push(...this._pierSpot.beams);
    if (this._pierBulb)   out.push(this._pierBulb);
    if (this._bonfireLight) out.push(this._bonfireLight);
    if (this._lighthouseSpot) out.push(...this._lighthouseSpot.beams);
    if (this._lighthouseBulb) out.push(this._lighthouseBulb);
    for (const b of this._buoyBulbs) out.push(b);
    return out;
  }

  getDockSlots(): number[] { return [...this._dockSlots]; }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.waterGfx       = scene.add.graphics().setDepth(5.5).setLighting(true);
    this.shadowGfx      = scene.add.graphics().setDepth(5.65);
    this.structGfx      = scene.add.graphics().setDepth(5.7).setLighting(true);
    this.beachShadowGfx = scene.add.graphics().setDepth(5.76);
    this.beachPeopleGfx = scene.add.graphics().setDepth(5.78).setLighting(true);
    this.fxGfx          = scene.add.graphics().setDepth(5.85);
  }

  render(level: number, width: number, groundY: number): void {
    this._level  = level;
    this._width  = width;
    this._waterY = groundY + ROAD_H + VERGE_H;
    this._dockSlots = [];

    // Layout geometry
    this._beachEndX  = Math.floor(width * 0.36);
    this._transEndX  = Math.floor(width * 0.58); // end of beach→rock transition
    this._pierX      = Math.floor(width * 0.23);
    this._dockX1     = Math.floor(width * 0.42);
    this._dockX2     = Math.floor(width * 0.62);
    this._cafeX      = 16;
    this._bonfireX   = Math.floor(width * 0.17);
    this._bonfireY   = this._waterY + 32;
    this._lighthouseX    = Math.floor(width * 0.88);
    this._lighthouseTopY = this._waterY;

    this.structGfx.clear();

    this.drawWaterAndCoast();

    if (level >= 3) this.drawPier();
    if (level >= 4) this.drawBeachCafe();
    if (level >= 5) this.drawDock();
    if (level >= 7) { this.drawLifeguardHut(); this.setupBuoys(); }
    else { this._buoys = []; }
    if (level >= 8) this.drawLighthouse();
    if (level >= 2) this.initBeachPeople();

    this.rebuildLights();
  }

  // ── Water gradient + coast ────────────────────────────────────────────────

  private drawWaterAndCoast(): void {
    const gfx = this.waterGfx;
    gfx.clear();
    const { _waterY: wy, _width: w, _beachEndX: bx, _transEndX: tx } = this;

    // ── Smooth water gradient (top → bottom = deep → lighter) ──
    const BAND = 4;
    for (let i = 0; i < WATER_H; i += BAND) {
      const t = i / WATER_H;
      gfx.fillStyle(lerpColor(WATER_TOP, WATER_BOT, t), 1);
      gfx.fillRect(0, wy + i, w, Math.min(BAND, WATER_H - i));
    }

    // ── Sandy beach (left) ──
    if (this._level >= 1) {
      gfx.fillStyle(SAND_COLOR, 1);
      gfx.fillRect(0, wy, bx, BEACH_SHORE_H);

      // Wet sand at base of beach (darker, slightly transparent)
      gfx.fillStyle(SAND_WET, 1);
      gfx.fillRect(0, wy + BEACH_SHORE_H - 7, bx, 7);

      // Sand pebble texture
      gfx.fillStyle(0xE8D0A0, 0.45);
      for (let i = 0; i < Math.floor(bx / 9); i++) {
        const px = ((i * 47 + 11) % Math.max(1, bx - 6)) + 3;
        const py = wy + 4 + ((i * 23 + 7) % (BEACH_SHORE_H - 12));
        gfx.fillRect(px, py, 1 + (i % 2), 1 + (i % 2));
      }

      // ── Stepped beach→rock transition (pixel-art style) ──
      const transW = tx - bx;
      const STEPS  = 6;
      for (let s = 0; s < STEPS; s++) {
        const t0 = s / STEPS;
        const t1 = (s + 1) / STEPS;
        const sx = bx + Math.floor(t0 * transW);
        const sw = Math.ceil(t1 * transW) - Math.floor(t0 * transW);
        const sh = Math.round(BEACH_SHORE_H * (1 - t0) + ROCK_SHORE_H * t0);
        const color = lerpColor(SAND_COLOR, ROCK_BASE, t0);
        gfx.fillStyle(color, 1);
        gfx.fillRect(sx, wy, sw, sh);
        // Step highlight top edge
        gfx.fillStyle(lerpColor(0xE8D0A0, ROCK_LIGHT, t0), 0.5);
        gfx.fillRect(sx, wy, sw, 2);
      }

      // ── Rocky coastline (right) — pixel-art layered blocks ──
      // Base fill
      gfx.fillStyle(ROCK_BASE, 1);
      gfx.fillRect(tx, wy, w - tx, ROCK_SHORE_H);

      // Top face highlight (lighter)
      gfx.fillStyle(ROCK_LIGHT, 1);
      gfx.fillRect(tx, wy, w - tx, 3);

      // Horizontal strata cracks
      gfx.fillStyle(0x404040, 1);
      gfx.fillRect(tx, wy + 8,  w - tx, 1);
      gfx.fillRect(tx, wy + 15, w - tx, 1);

      // Individual pixel-art rock blocks (4-6×3-4 rectangles)
      for (let rx = tx + 4; rx < w - 4; rx += 14) {
        const seed = (rx * 13 + 7) | 0;
        const rw   = 9 + (seed % 5);
        const rh   = 2 + (seed % 3);
        const ry2  = wy + 2 + (seed % 6);
        gfx.fillStyle(ROCK_MID, 1);
        gfx.fillRect(rx, ry2, rw, rh);
        // Pixel highlight
        gfx.fillStyle(ROCK_LIGHT, 0.7);
        gfx.fillRect(rx, ry2, rw, 1);
      }

      // Bottom edge of rocky shore (shadow into water)
      gfx.fillStyle(0x000000, 0.2);
      gfx.fillRect(tx, wy + ROCK_SHORE_H - 3, w - tx, 3);
    }

    // ── Static wave-lines on open water ──
    gfx.fillStyle(0xFFFFFF, 0.055);
    for (let x = 0; x < w; x += 42) gfx.fillRect(x, wy + 30, 22, 1);
    for (let x = 14; x < w; x += 56) gfx.fillRect(x, wy + 50, 16, 1);
    for (let x = 6;  x < w; x += 38) gfx.fillRect(x, wy + 72, 18, 1);
  }

  // ── Pier (level 3+) ───────────────────────────────────────────────────────

  private drawPier(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _pierX: px } = this;
    const pierW = 18;
    const pierH = 55;
    const planks = 7;

    // Pier deck
    gfx.fillStyle(PIER_WOOD, 1);
    gfx.fillRect(px - pierW / 2, wy + BEACH_SHORE_H - 10, pierW, pierH);

    // Plank lines
    gfx.fillStyle(0x000000, 0.13);
    for (let i = 0; i <= planks; i++) {
      const py2 = wy + BEACH_SHORE_H - 10 + Math.round((i / planks) * pierH);
      gfx.fillRect(px - pierW / 2, py2, pierW, 1);
    }

    // Side railings
    gfx.fillStyle(0x8A6030, 1);
    gfx.fillRect(px - pierW / 2 - 2, wy + BEACH_SHORE_H - 10, 3, pierH);
    gfx.fillRect(px + pierW / 2 - 1, wy + BEACH_SHORE_H - 10, 3, pierH);

    // Railing posts
    gfx.fillStyle(0x9A7040, 1);
    for (let i = 0; i <= 4; i++) {
      const py2 = wy + BEACH_SHORE_H - 10 + Math.round((i / 4) * pierH);
      gfx.fillRect(px - pierW / 2 - 2, py2 - 1, 3, 2);
      gfx.fillRect(px + pierW / 2 - 1, py2 - 1, 3, 2);
    }

    // Pier end platform + mooring posts
    gfx.fillStyle(PIER_WOOD, 1);
    gfx.fillRect(px - pierW / 2 - 4, wy + BEACH_SHORE_H - 10 + pierH - 5, pierW + 8, 8);
    gfx.fillStyle(0x6A4818, 1);
    gfx.fillRect(px - pierW / 2 - 3, wy + BEACH_SHORE_H - 10 + pierH - 2, 3, 6);
    gfx.fillRect(px + pierW / 2 + 1, wy + BEACH_SHORE_H - 10 + pierH - 2, 3, 6);
  }

  // ── Beach café (level 4+) ─────────────────────────────────────────────────

  private drawBeachCafe(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _cafeX: cx } = this;
    const cafeW = 60;
    const cafeH = 26;
    const cafeY = wy + 2;

    gfx.fillStyle(0xF5E6CC, 1);
    gfx.fillRect(cx, cafeY, cafeW, cafeH);

    // Roof
    gfx.fillStyle(0xB06030, 1);
    gfx.fillRect(cx - 2, cafeY - 5, cafeW + 4, 7);

    // Awning stripes
    const stripeW = 6;
    for (let s = 0; s < Math.ceil(cafeW / stripeW); s++) {
      gfx.fillStyle(s % 2 === 0 ? 0x00CED1 : 0xFF8C00, 1);
      gfx.fillRect(cx + s * stripeW, cafeY + 9, Math.min(stripeW, cafeW - s * stripeW), 5);
    }

    // Windows
    gfx.fillStyle(0x88CCFF, 0.7);
    gfx.fillRect(cx + 4, cafeY + 9, 12, 10);
    gfx.fillRect(cx + 22, cafeY + 9, 12, 10);

    // Door
    gfx.fillStyle(0x7A4010, 1);
    gfx.fillRect(cx + cafeW - 16, cafeY + 11, 10, cafeH - 11);

    // Sign
    gfx.fillStyle(0x4A2C0A, 1);
    gfx.fillRect(cx + 35, cafeY + 4, 18, 7);
    gfx.fillStyle(0xFFEE88, 1);
    gfx.fillRect(cx + 37, cafeY + 5, 14, 5);

    // Outdoor table
    gfx.fillStyle(0x888888, 1);
    gfx.fillRect(cx + cafeW + 4, cafeY + 13, 14, 2);
    gfx.fillRect(cx + cafeW + 9, cafeY + 15, 4, 8);
  }

  // ── Dock / harbour (level 5+) ─────────────────────────────────────────────

  private drawDock(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _dockX1: dx1, _dockX2: dx2 } = this;
    const dockW = dx2 - dx1;
    const armH  = 50;
    const armY  = wy + 4;

    // Main arm
    gfx.fillStyle(DOCK_WOOD, 1);
    gfx.fillRect(dx1, armY, dockW, 8);
    gfx.fillStyle(0x000000, 0.10);
    for (let i = 0; i < dockW; i += 14) gfx.fillRect(dx1 + i, armY, 1, 8);

    // Float platform
    gfx.fillStyle(0x9A7040, 1);
    gfx.fillRect(dx1 + 6, armY + 8, dockW - 12, armH);
    gfx.fillStyle(0x000000, 0.07);
    for (let j = 0; j < armH; j += 10) gfx.fillRect(dx1 + 6, armY + 8 + j, dockW - 12, 1);

    // Mooring bollards
    gfx.fillStyle(0x555555, 1);
    for (const x of [dx1 + 14, dx1 + Math.floor(dockW / 2), dx2 - 18]) {
      gfx.fillRect(x - 2, armY - 4, 5, 4);
      gfx.fillRect(x - 4, armY - 5, 9, 2);
    }

    // Support posts
    gfx.fillStyle(0x7A5828, 1);
    for (let x = dx1 + 16; x < dx2; x += 24) {
      gfx.fillRect(x - 2, armY + 8, 4, armH);
      gfx.fillStyle(0xFFFFFF, 0.07);
      gfx.fillCircle(x, armY + 8 + armH, 4);
      gfx.fillStyle(0x7A5828, 1);
    }

    // Edge railings
    gfx.fillStyle(0x8A6030, 1);
    gfx.fillRect(dx1, armY, 3, armH + 8);
    gfx.fillRect(dx2 - 3, armY, 3, armH + 8);

    // Dock slots for BoatManager (at the water-level edge of dock)
    this._dockSlots = [
      dx1 + Math.floor(dockW * 0.22),
      dx1 + Math.floor(dockW * 0.52),
      dx1 + Math.floor(dockW * 0.78),
    ];
  }

  // ── Lifeguard hut (level 7+) ──────────────────────────────────────────────

  private drawLifeguardHut(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _beachEndX: bx } = this;
    const hx  = Math.floor(bx * 0.42);
    const hutH = 20;
    const hutW = 26;
    const hutY = wy + 5;

    gfx.fillStyle(0x8B6914, 1);
    gfx.fillRect(hx + 3, hutY + hutH, 4, 8);
    gfx.fillRect(hx + hutW - 7, hutY + hutH, 4, 8);

    gfx.fillStyle(0xF0F0F0, 1);
    gfx.fillRect(hx, hutY, hutW, hutH);

    for (let i = 0; i < 4; i++) {
      gfx.fillStyle(i % 2 === 0 ? 0xDD2222 : 0xFFFFFF, 1);
      gfx.fillRect(hx - 1 + i * 7, hutY - 4, 7, 6);
    }
    gfx.fillStyle(0xDD2222, 1);
    gfx.fillRect(hx - 1, hutY - 4, hutW + 2, 1);

    gfx.fillStyle(0x88CCFF, 0.7);
    gfx.fillRect(hx + 3, hutY + 3, 9, 8);
    gfx.fillStyle(0xBB5500, 1);
    gfx.fillRect(hx + hutW - 12, hutY + 8, 8, hutH - 8);

    gfx.fillStyle(0xFF2222, 1);
    gfx.fillRect(hx + hutW + 1, hutY - 10, 12, 8);
    gfx.fillStyle(0xFFFFFF, 1);
    gfx.fillRect(hx + hutW + 4, hutY - 8, 5, 4);
    gfx.fillStyle(0x888888, 1);
    gfx.fillRect(hx + hutW + 1, hutY - 14, 2, hutH + 14);
  }

  // ── Lighthouse (level 8+) ─────────────────────────────────────────────────

  private drawLighthouse(): void {
    const gfx = this.structGfx;
    const { _lighthouseX: lx, _lighthouseTopY: topY } = this;
    const towerH = 44;
    const towerW = 10;

    gfx.fillStyle(0x888888, 1);
    gfx.fillRect(lx - 9, topY + towerH, 18, 5);

    gfx.fillStyle(0xEEEEEE, 1);
    gfx.fillRect(lx - towerW / 2, topY, towerW, towerH);
    gfx.fillStyle(0xCC3333, 1);
    gfx.fillRect(lx - towerW / 2, topY + 10, towerW, 6);
    gfx.fillRect(lx - towerW / 2, topY + 28, towerW, 6);

    gfx.fillStyle(0x444444, 1);
    gfx.fillRect(lx - towerW / 2 - 3, topY - 1, towerW + 6, 2);

    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(lx - 6, topY - 10, 12, 10);
    gfx.fillStyle(0xFFFF88, 0.85);
    gfx.fillRect(lx - 4, topY - 9, 8, 8);
    gfx.fillStyle(0x222222, 1);
    gfx.fillRect(lx - 5, topY - 12, 10, 3);
    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(lx - 1, topY - 15, 2, 4);
  }

  // ── Buoys ─────────────────────────────────────────────────────────────────

  private setupBuoys(): void {
    const { _width: w, _waterY: wy } = this;
    this._buoys = [
      { x: Math.floor(w * 0.28), y: wy + 58, color: 0xFF3333, phase: 0 },
      { x: Math.floor(w * 0.43), y: wy + 70, color: 0xFF7700, phase: Math.PI * 0.5 },
      { x: Math.floor(w * 0.57), y: wy + 62, color: 0xFF3333, phase: Math.PI },
      { x: Math.floor(w * 0.74), y: wy + 75, color: 0xFF7700, phase: Math.PI * 1.5 },
    ];
  }

  // ── Light sources ─────────────────────────────────────────────────────────

  private rebuildLights(): void {
    for (const nl of this._nativeLights) this.scene.lights.removeLight(nl);
    this._nativeLights = [];

    const { _level: lv, _waterY: wy } = this;

    // ── Dock post lights — SoftSpotLight pointing down (level 5+) ──
    this._dockSpots = [];
    this._dockBulbs = [];
    if (lv >= 5) {
      const lampY = wy + 3;
      for (const sx of this._dockSlots) {
        const spot = new SoftSpotLight({
          x: sx, y: lampY,
          radius: 48, color: 0xFFCC66, intensity: 0,
          angle: Math.PI / 2, coneAngle: Math.PI / 2.8,
          noOcclusion: true,
        });
        const bulb: Extract<LightSource, { type?: 'point' }> = {
          x: sx, y: lampY, radius: 2, color: 0xFFFAE0, intensity: 0, noOcclusion: true,
        };
        this._dockSpots.push(spot);
        this._dockBulbs.push(bulb);
        this._nativeLights.push(this.scene.lights.addLight(sx, lampY, 55, 0xFFCC66, 0));
      }
    }

    // ── Café exterior light — downward spot (level 4+) ──
    const cafeLampX = this._cafeX + 30;
    const cafeLampY = wy + 8;
    if (lv >= 4) {
      this._cafeSpot = new SoftSpotLight({
        x: cafeLampX, y: cafeLampY,
        radius: 55, color: 0xFFDD88, intensity: 0,
        angle: Math.PI / 2, coneAngle: Math.PI / 2.2,
        noOcclusion: true,
      });
      this._cafeBulb = {
        x: cafeLampX, y: cafeLampY, radius: 2, color: 0xFFFAE0, intensity: 0, noOcclusion: true,
      };
      this._nativeLights.push(this.scene.lights.addLight(cafeLampX, cafeLampY, 60, 0xFFDD88, 0));
    } else {
      this._cafeSpot = null;
      this._cafeBulb = null;
    }

    // ── Pier end lamp — downward spot (level 6+) ──
    const pierEndX = this._pierX;
    const pierEndY = wy + BEACH_SHORE_H + 35;
    if (lv >= 6) {
      this._pierSpot = new SoftSpotLight({
        x: pierEndX, y: pierEndY,
        radius: 40, color: 0xFFDD88, intensity: 0,
        angle: Math.PI / 2, coneAngle: Math.PI / 2.5,
        noOcclusion: true,
      });
      this._pierBulb = {
        x: pierEndX, y: pierEndY, radius: 2, color: 0xFFFAE0, intensity: 0, noOcclusion: true,
      };
      this._nativeLights.push(this.scene.lights.addLight(pierEndX, pierEndY, 45, 0xFFDD88, 0));
    } else {
      this._pierSpot = null;
      this._pierBulb = null;
    }

    // ── Bonfire point light (level 9+, no spot — omnidirectional glow) ──
    this._bonfireLight = lv >= 9 ? {
      x: this._bonfireX, y: this._bonfireY - 8,
      radius: 30, color: 0xFF7700, intensity: 0, noOcclusion: true,
    } : null;

    // ── Lighthouse sweeping SoftSpotLight (level 8+) ──
    if (lv >= 8) {
      this._lighthouseSpot = new SoftSpotLight({
        x: this._lighthouseX, y: this._lighthouseTopY - 5,
        radius: 180, color: 0xFFFF88, intensity: 0,
        angle: 0, coneAngle: Math.PI / 12,
        noOcclusion: true,
      });
      this._lighthouseBulb = {
        x: this._lighthouseX, y: this._lighthouseTopY - 5,
        radius: 3, color: 0xFFFF88, intensity: 0, noOcclusion: true,
      };
      this._nativeLights.push(this.scene.lights.addLight(this._lighthouseX, this._lighthouseTopY - 5, 80, 0xFFFF88, 0));
    } else {
      this._lighthouseSpot = null;
      this._lighthouseBulb = null;
    }

    // ── Buoy lights — small warm points (level 7+) ──
    this._buoyBulbs = this._buoys.map(b => ({
      x: b.x, y: b.y, radius: 4, color: b.color, intensity: 0, noOcclusion: true,
    } as Extract<LightSource, { type?: 'point' }>));
  }

  // ── Beach people AI ───────────────────────────────────────────────────────

  private initBeachPeople(): void {
    const { _level: lv, _beachEndX: bx, _waterY: wy } = this;
    const count = Math.min(3 + Math.floor(lv * 0.55), 8);
    this._people = [];

    const xMin = 8;
    const xMax = bx - 14;
    const yMin = wy + 10;
    const yMax = wy + BEACH_SHORE_H - 6;

    for (let i = 0; i < count; i++) {
      const x       = xMin + ((i * 67 + 13) % Math.max(1, xMax - xMin));
      const bottomY = yMin + ((i * 41 + 7)  % Math.max(1, yMax - yMin));
      const isSit   = i % 3 === 0;
      this._people.push({
        x,
        bottomY,
        dir:        i % 2 === 0 ? 1 : -1,
        speed:      4 + (i % 5) * 2.5,
        color:      PED_COLORS[i % PED_COLORS.length],
        towelColor: TOWEL_COLORS[i % TOWEL_COLORS.length],
        w:          3 + (i % 3),
        h:          8 + (i % 5),
        phase:      isSit ? 'sit' : 'walk',
        phaseTimer: isSit ? 8000 + (i * 3000) % 12000 : 4000 + (i * 2500) % 8000,
        alpha:      1,
        xMin,
        xMax,
      });
    }
  }

  private updateBeachPeople(delta: number, elevation: number): void {
    if (this._level < 2 || this._people.length === 0) {
      this.beachPeopleGfx.clear();
      this.beachShadowGfx.clear();
      return;
    }

    const targetAlpha = Math.max(0, Math.min(1, (elevation + 0.1) / 0.4));
    const dt = delta / 1000;

    const brightness = Math.max(0.25, Math.min(1, (elevation + 0.2) / 0.4));

    for (const p of this._people) {
      p.alpha += (targetAlpha - p.alpha) * Math.min(1, dt * 1.5);

      if (p.phase === 'walk') {
        p.x += p.speed * p.dir * dt;
        if (p.x <= p.xMin) { p.x = p.xMin; p.dir = 1; }
        if (p.x >= p.xMax) { p.x = p.xMax; p.dir = -1; }
        p.phaseTimer -= delta;
        if (p.phaseTimer <= 0) {
          p.phase = 'sit';
          p.phaseTimer = 7000 + Math.random() * 12000;
        }
      } else {
        // sit phase
        p.phaseTimer -= delta;
        if (p.phaseTimer <= 0) {
          p.phase = 'walk';
          p.phaseTimer = 3000 + Math.random() * 7000;
          p.dir = Math.random() < 0.5 ? 1 : -1;
        }
      }
    }

    // Draw people
    const pgfx = this.beachPeopleGfx;
    const sgfx = this.beachShadowGfx;
    pgfx.clear();
    sgfx.clear();

    for (const p of this._people) {
      if (p.alpha < 0.01) continue;
      const drawColor = dimColor(p.color, brightness);
      const top = Math.round(p.bottomY - p.h);
      const x   = Math.round(p.x);

      if (p.phase === 'sit') {
        // Draw towel first
        pgfx.fillStyle(p.towelColor, p.alpha * 0.9);
        pgfx.fillRect(x - 4, Math.round(p.bottomY) - 3, p.w + 6, 4);
      }

      // Shadow
      sgfx.fillStyle(0x000000, 0.2 * p.alpha);
      sgfx.fillRect(x, Math.round(p.bottomY) + 1, p.w + 3, 3);

      // Body
      pgfx.fillStyle(drawColor, p.alpha);
      pgfx.fillRect(x, top, p.w, Math.round(p.h));
    }
  }

  // ── Structure shadows on water ────────────────────────────────────────────

  updateShadows(sunAngle: number): void {
    const gfx = this.shadowGfx;
    gfx.clear();

    const elevation = Math.sin(sunAngle);
    if (elevation <= 0.04 || this._level === 0) return;

    const { _waterY: wy } = this;
    const alpha = Math.min(0.22, elevation * 0.28);
    const leanX = Math.cos(sunAngle) / Math.max(0.15, elevation);

    gfx.fillStyle(0x000000, alpha);

    // Pier shadow
    if (this._level >= 3) {
      const px = this._pierX + leanX * 8;
      gfx.fillEllipse(px, wy + BEACH_SHORE_H + 30, 14 + Math.abs(leanX) * 6, 10);
    }

    // Dock shadow
    if (this._level >= 5) {
      const dockCx  = (this._dockX1 + this._dockX2) / 2;
      const dockW   = this._dockX2 - this._dockX1;
      const sx = dockCx + leanX * 10;
      const sy = wy + 30;
      gfx.fillEllipse(sx, sy, dockW * 0.7, 14 + Math.abs(leanX) * 4);
    }

    // Café shadow (on beach/water)
    if (this._level >= 4) {
      const cafeCx = this._cafeX + 30;
      gfx.fillEllipse(cafeCx + leanX * 6, wy + BEACH_SHORE_H - 2, 40, 8);
    }

    // Lighthouse shadow (long, thin)
    if (this._level >= 8) {
      const lx = this._lighthouseX + leanX * 22;
      gfx.fillRect(lx - 3, wy + ROCK_SHORE_H, 6, 12);
      gfx.fillEllipse(lx, wy + ROCK_SHORE_H + 12, 10 + Math.abs(leanX) * 8, 5);
    }
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(delta: number, elevation: number): void {
    if (this._level === 0) return;
    const dt = delta / 1000;
    this._waveTime        += dt * 0.12; // much slower
    this._bonfireTime     += dt;
    this._lighthouseAngle  = (this._lighthouseAngle + dt * 0.75) % (Math.PI * 2);

    // Rotate lighthouse beam
    if (this._lighthouseSpot && this._nightFactor > 0.05) {
      this._lighthouseSpot.beams[0].angle = this._lighthouseAngle;
    }

    // Buoy gentle bob
    for (let i = 0; i < this._buoys.length; i++) {
      this._buoys[i].phase += dt * 0.8;
      if (this._buoyBulbs[i]) {
        this._buoyBulbs[i].y = this._buoys[i].y + Math.sin(this._buoys[i].phase) * 1.5;
      }
    }

    // Bonfire light flicker
    if (this._bonfireLight && this._nightFactor > 0.05) {
      const flicker = 0.65 + 0.35 * Math.sin(this._bonfireTime * 8.3)
                    + 0.12 * Math.sin(this._bonfireTime * 17.1);
      (this._bonfireLight as { intensity: number }).intensity = this._nightFactor * 90 * flicker;
    }

    this.updateBeachPeople(delta, elevation);
    this.drawFx();
  }

  // ── Animated FX layer ─────────────────────────────────────────────────────

  private drawFx(): void {
    const gfx = this.fxGfx;
    gfx.clear();

    const { _width: w, _waterY: wy } = this;

    // Slow wave sparkles (daytime only)
    if (this._nightFactor < 0.85) {
      const dt = 1 - this._nightFactor;
      const t  = this._waveTime;
      for (let i = 0; i < 7; i++) {
        const phase = Math.sin(t * 1.8 + i * 1.3);
        const sx    = ((i * 137 + Math.floor(t * 3) * 53) % (w - 30)) + 15;
        const sy    = wy + 30 + ((i * 29) % 50);
        gfx.fillStyle(0xFFFFFF, 0.07 * dt * Math.max(0, phase));
        gfx.fillRect(sx, sy, 8 + (i % 4) * 3, 1);
      }
    }

    // Buoys
    for (const b of this._buoys) {
      const bobY = b.y + Math.sin(b.phase) * 1.5;
      gfx.fillStyle(b.color, 1);
      gfx.fillRect(b.x - 4, bobY - 5, 8, 8);
      gfx.fillStyle(0x000000, 0.25);
      gfx.fillRect(b.x - 3, bobY - 4, 6, 6);
      gfx.fillStyle(b.color, 1);
      gfx.fillRect(b.x - 3, bobY - 4, 6, 6);
      // Top cone marker
      gfx.fillStyle(0xFFFFFF, 0.9);
      gfx.fillRect(b.x - 1, bobY - 7, 2, 3);
      // Night glow
      if (this._nightFactor > 0.15) {
        gfx.fillStyle(b.color, this._nightFactor * 0.6);
        gfx.fillRect(b.x - 6, bobY - 7, 12, 12);
      }
    }

    if (this._level >= 9)                             this.drawBonfire();
    if (this._level >= 8 && this._nightFactor > 0.08) this.drawLighthouseBeam();
  }

  private drawBonfire(): void {
    const gfx = this.fxGfx;
    const { _bonfireX: bx, _bonfireY: by } = this;
    const t  = this._bonfireTime;
    const nf = this._nightFactor;

    // Logs (always visible)
    gfx.fillStyle(0x3A2010, 1);
    gfx.fillRect(bx - 9, by + 2, 18, 4);
    gfx.fillRect(bx - 6, by + 4, 12, 3);

    if (nf < 0.08) return;
    const alpha = Math.min(1, nf * 1.6);

    gfx.fillStyle(0xFF4400, alpha * 0.85);
    gfx.fillRect(bx - 7, by - 1, 14, 4);

    const f1 = 0.6 + 0.4 * Math.sin(t * 7.8);
    const f2 = 0.65 + 0.35 * Math.sin(t * 5.3 + 1.1);
    const f3 = 0.55 + 0.45 * Math.sin(t * 10.2 + 0.6);

    const h1 = Math.round(10 * f1);
    gfx.fillStyle(0xFF2200, alpha * 0.9);
    gfx.fillRect(bx - 7, by - h1, 14, h1);

    const h2 = Math.round(15 * f2);
    gfx.fillStyle(0xFF6600, alpha * 0.85);
    gfx.fillRect(bx - 5, by - h2, 10, h2);

    const h3 = Math.round(20 * f3);
    gfx.fillStyle(0xFFAA00, alpha * 0.75);
    gfx.fillRect(bx - 3, by - h3, 6, h3);

    gfx.fillStyle(0xFFEE22, alpha * 0.55);
    gfx.fillRect(bx - 1, by - h3 - 4, 3, 5);

    gfx.fillStyle(0xFFFF44, alpha * 0.65);
    for (let i = 0; i < 5; i++) {
      const sx = bx + Math.round(Math.sin(t * 3.7 + i * 1.57) * 8);
      const sy = by - 10 - Math.round(Math.abs(Math.sin(t * 2.3 + i * 2.1)) * 12);
      gfx.fillRect(sx, sy, 1, 1);
    }
  }

  private drawLighthouseBeam(): void {
    const gfx = this.fxGfx;
    const { _lighthouseX: lx, _lighthouseTopY: ty } = this;
    const nf    = this._nightFactor;
    const angle = this._lighthouseAngle;
    const len   = 150;
    const spread = Math.PI / 16;
    const a1 = angle - spread;
    const a2 = angle + spread;

    gfx.fillStyle(0xFFFF88, nf * 0.14);
    gfx.fillTriangle(
      lx, ty - 5,
      lx + Math.cos(a1) * len, ty - 5 + Math.sin(a1) * len,
      lx + Math.cos(a2) * len, ty - 5 + Math.sin(a2) * len,
    );
    gfx.fillStyle(0xFFFF88, nf * 0.22);
    gfx.fillTriangle(
      lx, ty - 5,
      lx + Math.cos(a1) * len * 0.4, ty - 5 + Math.sin(a1) * len * 0.4,
      lx + Math.cos(a2) * len * 0.4, ty - 5 + Math.sin(a2) * len * 0.4,
    );
    gfx.fillStyle(0xFFFF44, nf * 0.45);
    gfx.fillCircle(lx, ty - 5, 5);
  }

  // ── Lighting updates ──────────────────────────────────────────────────────

  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightElevation) < 0.002) return;
    this._lastLightElevation = elevation;
    this._nightFactor = Math.max(0, Math.min(1, (0.1 - elevation) / 0.3));
    const nf = this._nightFactor;

    // Dock spots
    for (const s of this._dockSpots) s.setIntensity(nf * 3.0);
    for (const b of this._dockBulbs) (b as { intensity: number }).intensity = nf * 220;

    // Café spot
    if (this._cafeSpot) this._cafeSpot.setIntensity(nf * 2.5);
    if (this._cafeBulb) (this._cafeBulb as { intensity: number }).intensity = nf * 200;

    // Pier spot
    if (this._pierSpot) this._pierSpot.setIntensity(nf * 2.2);
    if (this._pierBulb) (this._pierBulb as { intensity: number }).intensity = nf * 180;

    // Bonfire (flicker handled in update)
    if (this._bonfireLight && nf < 0.05) {
      (this._bonfireLight as { intensity: number }).intensity = 0;
    }

    // Lighthouse
    if (this._lighthouseSpot)  this._lighthouseSpot.setIntensity(nf * 3.5);
    if (this._lighthouseBulb) (this._lighthouseBulb as { intensity: number }).intensity = nf * 180;

    // Buoys — tiny glow
    for (const b of this._buoyBulbs) (b as { intensity: number }).intensity = nf * 50;

    // Native lights
    for (const nl of this._nativeLights) nl.intensity = nf * 1.2;
  }

  // ── Destroy ───────────────────────────────────────────────────────────────

  destroy(): void {
    for (const nl of this._nativeLights) this.scene.lights.removeLight(nl);
    this._nativeLights = [];
    this.waterGfx.destroy();
    this.shadowGfx.destroy();
    this.structGfx.destroy();
    this.beachShadowGfx.destroy();
    this.beachPeopleGfx.destroy();
    this.fxGfx.destroy();
  }
}
