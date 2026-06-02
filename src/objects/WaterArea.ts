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

  // Sprites from the High Tides asset pack
  private _foamSprites: Phaser.GameObjects.Sprite[] = [];

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
  private _bonFireLights: Array<Extract<LightSource, { type?: 'point' }>> = [];
  private _lighthouseSpot: SoftSpotLight | null = null;
  private _lighthouseBulb: Extract<LightSource, { type?: 'point' }> | null = null;
  private _beamSprite: Phaser.GameObjects.Image | null = null;
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
    for (const b of this._bonFireLights) out.push(b);
    if (this._lighthouseSpot) out.push(...this._lighthouseSpot.beams);
    if (this._lighthouseBulb) out.push(this._lighthouseBulb);
    for (const b of this._buoyBulbs) out.push(b);
    return out;
  }

  getDockSlots(): number[] { return [...this._dockSlots]; }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.waterGfx       = scene.add.graphics().setDepth(5.5).setLighting(true);
    this.shadowGfx      = scene.add.graphics().setDepth(5.55);
    this.structGfx      = scene.add.graphics().setDepth(5.7).setLighting(true);
    this.beachShadowGfx = scene.add.graphics().setDepth(5.62);
    this.beachPeopleGfx = scene.add.graphics().setDepth(5.66).setLighting(true);
    this.fxGfx          = scene.add.graphics().setDepth(5.85);
  }

  render(level: number, width: number, groundY: number): void {
    this._level  = level;
    this._width  = width;
    this._waterY = groundY + ROAD_H + VERGE_H;
    this._dockSlots = [];

    // Layout geometry
    this._beachEndX  = Math.floor(width * 0.36);
    this._transEndX  = Math.floor(width * 0.60); // end of beach→rock transition
    this._pierX      = Math.floor(width * 0.23);
    this._dockX1     = this._beachEndX;           // dock replaces transition zone
    this._dockX2     = this._transEndX;
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
    if (level >= 2) { this.initBeachPeople(); this.initFoamSprites(); }
    else { this.destroyFoamSprites(); }

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

      // Wet sand — gently curved bottom edge using thin horizontal strips
      for (let col = 0; col < bx; col += 2) {
        const t  = col / bx;
        // Gentle sinusoidal variation: center dips slightly further into water
        const dip = Math.round(Math.sin(t * Math.PI) * 4);
        const wh  = 7 + dip;
        gfx.fillStyle(SAND_WET, 1);
        gfx.fillRect(col, wy + BEACH_SHORE_H - wh, 2, wh);
      }
      // White foam strip at water's edge
      gfx.fillStyle(0xFFFFFF, 0.22);
      for (let col = 0; col < bx; col += 2) {
        const t  = col / bx;
        const dip = Math.round(Math.sin(t * Math.PI) * 4);
        gfx.fillRect(col, wy + BEACH_SHORE_H - (7 + dip), 2, 2);
      }

      // Sand pebble texture
      gfx.fillStyle(0xE8D0A0, 0.45);
      for (let i = 0; i < Math.floor(bx / 9); i++) {
        const px = ((i * 47 + 11) % Math.max(1, bx - 6)) + 3;
        const py = wy + 4 + ((i * 23 + 7) % (BEACH_SHORE_H - 12));
        gfx.fillRect(px, py, 1 + (i % 2), 1 + (i % 2));
      }

      // ── Smooth beach→rock transition (per-pixel width, smoothstep curve) ──
      const transW = tx - bx;
      const STEPS  = Math.max(1, Math.floor(transW / 3)); // ~3px each strip
      for (let s = 0; s < STEPS; s++) {
        const t0 = s / STEPS;
        const t1 = (s + 1) / STEPS;
        const tSmooth = t0 * t0 * (3 - 2 * t0); // smoothstep
        const sx = bx + Math.floor(t0 * transW);
        const sw = Math.max(1, Math.ceil(t1 * transW) - Math.floor(t0 * transW));
        const sh = Math.round(BEACH_SHORE_H * (1 - tSmooth) + ROCK_SHORE_H * tSmooth);
        const color = lerpColor(SAND_COLOR, ROCK_BASE, tSmooth);
        gfx.fillStyle(color, 1);
        gfx.fillRect(sx, wy, sw, sh);
        // Top edge highlight
        gfx.fillStyle(lerpColor(0xE8D0A0, ROCK_LIGHT, tSmooth), 0.4);
        gfx.fillRect(sx, wy, sw, 1);
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
    const pierH = 30; // ends at wy+68, well above boat lane (wy+75)
    const planks = 5;

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

    // ── Bonfire — four small overlapping point lights at varied positions/colors.
    // Using multiple smaller lights instead of one big circle produces an organic,
    // flickering warmth rather than a uniform disc.
    if (lv >= 9) {
      const bx = this._bonfireX, by = this._bonfireY;
      this._bonFireLights = [
        { x: bx,     y: by - 12, radius: 38, color: 0xFF6600, intensity: 0, noOcclusion: true },
        { x: bx - 5, y: by - 6,  radius: 32, color: 0xFF8800, intensity: 0, noOcclusion: true },
        { x: bx + 6, y: by - 4,  radius: 26, color: 0xFFAA00, intensity: 0, noOcclusion: true },
        { x: bx + 1, y: by - 9,  radius: 20, color: 0xFFCC00, intensity: 0, noOcclusion: true },
      ];
    } else {
      this._bonFireLights = [];
    }

    // ── Lighthouse sweeping SoftSpotLight (level 8+) ──
    if (lv >= 8) {
      this._lighthouseSpot = new SoftSpotLight({
        x: this._lighthouseX, y: this._lighthouseTopY - 5,
        radius: 180, color: 0xFFFF88, intensity: 0,
        angle: 0, coneAngle: Math.PI / 8,
        noOcclusion: true,
      });
      this._lighthouseBulb = {
        x: this._lighthouseX, y: this._lighthouseTopY - 5,
        radius: 3, color: 0xFFFF88, intensity: 0, noOcclusion: true,
      };
      this._nativeLights.push(this.scene.lights.addLight(this._lighthouseX, this._lighthouseTopY - 5, 80, 0xFFFF88, 0));
      this.createBeamSprite();
    } else {
      this._lighthouseSpot = null;
      this._lighthouseBulb = null;
      this._beamSprite?.destroy();
      this._beamSprite = null;
    }

    // ── Buoy lights — small warm points (level 7+) ──
    this._buoyBulbs = this._buoys.map(b => ({
      x: b.x, y: b.y, radius: 4, color: b.color, intensity: 0, noOcclusion: true,
    } as Extract<LightSource, { type?: 'point' }>));
  }

  // ── Beach people AI ───────────────────────────────────────────────────────

  private setupFoamAnimation(): void {
    if (this.scene.textures.exists('ht-water-particles') && !this.scene.anims.exists('ht-foam')) {
      this.scene.anims.create({
        key: 'ht-foam',
        frames: this.scene.anims.generateFrameNumbers('ht-water-particles', { start: 6, end: 12 }),
        frameRate: 3,
        repeat: -1,
      });
    }
  }

  private destroyFoamSprites(): void {
    for (const s of this._foamSprites) s.destroy();
    this._foamSprites = [];
  }

  private initFoamSprites(): void {
    this.destroyFoamSprites();
    this.setupFoamAnimation();
    if (!this.scene.textures.exists('ht-water-particles')) return;

    const bx = this._beachEndX;
    const wy = this._waterY;
    const foamY = wy + BEACH_SHORE_H - 5;
    const count = 5;

    for (let i = 0; i < count; i++) {
      const x = Math.floor((i + 0.3) * (bx / count));
      const sprite = this.scene.add.sprite(x, foamY, 'ht-water-particles')
        .setScale(0.42)
        .setDepth(5.84)
        .setOrigin(0.5, 0.7)
        .setAlpha(0.55);
      if (this.scene.anims.exists('ht-foam')) sprite.play({ key: 'ht-foam', startFrame: (i * 3) % 7 });
      this._foamSprites.push(sprite);
    }
  }

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
        p.phaseTimer -= delta;
        if (p.phaseTimer <= 0) {
          p.phase = 'walk';
          p.phaseTimer = 3000 + Math.random() * 7000;
          p.dir = Math.random() < 0.5 ? 1 : -1;
        }
      }
    }

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
        pgfx.fillStyle(p.towelColor, p.alpha * 0.9);
        pgfx.fillRect(x - 4, Math.round(p.bottomY) - 3, p.w + 6, 4);
      }

      sgfx.fillStyle(0x000000, 0.2 * p.alpha);
      sgfx.fillRect(x, Math.round(p.bottomY) + 1, p.w + 3, 3);

      pgfx.fillStyle(drawColor, p.alpha);
      pgfx.fillRect(x, top, p.w, Math.round(p.h));
    }

    // Fade foam sprites with daylight
    for (const fs of this._foamSprites) {
      fs.setAlpha(Math.max(0, 0.55 * brightness));
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
    this._waveTime    += dt * 0.12;
    this._bonfireTime += dt * 0.55; // slowed for more organic feel
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

    // Bonfire light flicker — four lights with independent phases/frequencies
    if (this._nightFactor > 0.05 && this._bonFireLights.length > 0) {
      const t  = this._bonfireTime;
      const nf = this._nightFactor;
      const phases = [0,    0.8,  1.5,  2.3];
      const freqs  = [4.1,  3.3,  5.7,  2.9];
      const bases  = [0.65, 0.70, 0.68, 0.72];
      const amps   = [0.28, 0.22, 0.25, 0.20];
      const intens = [4.0,  3.2,  2.8,  2.2];
      for (let i = 0; i < this._bonFireLights.length; i++) {
        const f = bases[i] + amps[i] * Math.sin(t * freqs[i] + phases[i])
                           + 0.10   * Math.sin(t * freqs[i] * 2.3 + phases[i]);
        (this._bonFireLights[i] as { intensity: number }).intensity = nf * intens[i] * f;
      }
    }

    this.updateBeachPeople(delta, elevation);
    this.drawFx();
  }

  // ── Animated FX layer ─────────────────────────────────────────────────────

  private drawFx(): void {
    const gfx = this.fxGfx;
    gfx.clear();

    const { _width: w, _waterY: wy } = this;

    // Animated water surface — undulating sine-wave highlights
    // Only drawn over open water (x >= _beachEndX, y > shore height for beach columns)
    {
      const t     = this._waveTime;
      const nf    = this._nightFactor;
      const bx    = this._beachEndX;
      const dayA  = Math.max(0, 1 - nf * 1.1);

      // 4 wave bands at different depths, each a gentle sine curve
      const WAVES = [
        { baseY: wy + 18, amp: 2.5, freq: 0.055, speed: 0.55, len: 18, gap: 54, alpha: 0.10 },
        { baseY: wy + 36, amp: 2.0, freq: 0.040, speed: 0.40, len: 22, gap: 66, alpha: 0.08 },
        { baseY: wy + 56, amp: 1.5, freq: 0.065, speed: 0.65, len: 14, gap: 48, alpha: 0.07 },
        { baseY: wy + 76, amp: 1.0, freq: 0.035, speed: 0.30, len: 20, gap: 60, alpha: 0.06 },
      ];

      for (const wv of WAVES) {
        const a = (wv.alpha + 0.03 * Math.sin(t * 0.7)) * dayA;
        if (a < 0.005) continue;
        for (let x = bx + 4; x < w - 4; x += wv.gap) {
          // Sine curve gives each dash its own Y offset
          const y = Math.round(wv.baseY + wv.amp * Math.sin(wv.freq * x + t * wv.speed));
          if (y < wy || y >= wy + WATER_H) continue;
          gfx.fillStyle(0xFFFFFF, a);
          gfx.fillRect(x, y, wv.len, 1);
          // Brighter leading edge
          gfx.fillStyle(0xFFFFFF, a * 1.8);
          gfx.fillRect(x, y, 4, 1);
        }
      }

      // Foam at beach waterline (where sand meets water)
      if (dayA > 0.05) {
        for (let x = 4; x < bx - 4; x += 5) {
          const foamA = (0.18 + 0.14 * Math.sin(t * 2.2 + x * 0.18)) * dayA;
          const foamY = wy + BEACH_SHORE_H - 3
                      + Math.round(Math.sin(t * 1.8 + x * 0.09) * 2);
          gfx.fillStyle(0xFFFFFF, foamA);
          gfx.fillRect(x, foamY, 4, 1);
        }
      }

      // Moonlight shimmer — single moving glint streak
      if (nf > 0.25) {
        const moonA  = (nf - 0.25) * 0.18;
        const moonX  = Math.round(w * (0.35 + 0.2 * Math.sin(t * 0.18)));
        const moonW  = Math.round(w * 0.12);
        for (let row = 0; row < 3; row++) {
          const my = wy + 20 + row * 22;
          const mx = moonX + row * 8;
          gfx.fillStyle(0xCCEEFF, moonA * (1 - row * 0.25));
          gfx.fillRect(mx, my, moonW - row * 10, 1);
        }
      }
    }

    // Buoys — dim by elevation so they match day/night lighting
    const buoyBrightness = Math.max(0.35, Math.min(1.0, (1 - this._nightFactor * 0.7)));
    for (const b of this._buoys) {
      const bobY  = b.y + Math.sin(b.phase) * 1.5;
      const bCol  = dimColor(b.color, buoyBrightness);
      gfx.fillStyle(bCol, 1);
      gfx.fillRect(b.x - 4, Math.round(bobY) - 5, 8, 8);
      gfx.fillStyle(0x000000, 0.25);
      gfx.fillRect(b.x - 3, Math.round(bobY) - 4, 6, 6);
      gfx.fillStyle(bCol, 1);
      gfx.fillRect(b.x - 3, Math.round(bobY) - 4, 6, 6);
      // Top marker pole
      gfx.fillStyle(dimColor(0xFFFFFF, buoyBrightness * 0.9), 0.9);
      gfx.fillRect(b.x - 1, Math.round(bobY) - 7, 2, 3);
      // Night glow halo
      if (this._nightFactor > 0.15) {
        gfx.fillStyle(b.color, this._nightFactor * 0.45);
        gfx.fillRect(b.x - 5, Math.round(bobY) - 6, 10, 10);
      }
    }

    if (this._level >= 9)                             this.drawBonfire();
    if (this._level >= 8 && this._nightFactor > 0.08) {
      this.drawLighthouseBeam();
    } else if (this._beamSprite) {
      this._beamSprite.setAlpha(0);
    }
  }

  private drawBonfire(): void {
    const gfx = this.fxGfx;
    const { _bonfireX: bx, _bonfireY: by } = this;
    const t  = this._bonfireTime; // already slowed in update()
    const nf = this._nightFactor;

    // Logs (always visible, with glowing embers)
    gfx.fillStyle(0x2A1508, 1);
    gfx.fillRect(bx - 10, by + 2, 20, 4);
    gfx.fillRect(bx - 7, by + 4, 14, 3);
    // Ember glow on logs
    if (nf > 0.05) {
      const emberA = nf * (0.4 + 0.3 * Math.sin(t * 3.1));
      gfx.fillStyle(0xFF5500, emberA);
      gfx.fillRect(bx - 8, by + 2, 16, 3);
    }

    if (nf < 0.06) return;
    const alpha = Math.min(1, nf * 1.8);

    // Base glow (wide, low, hot orange)
    gfx.fillStyle(0xFF3300, alpha * 0.7);
    gfx.fillRect(bx - 8, by - 2, 16, 5);

    // Outer flame — slow wobble
    const f1 = 0.55 + 0.45 * Math.sin(t * 3.2);
    const h1  = Math.round(12 * f1);
    gfx.fillStyle(0xDD1100, alpha * 0.85);
    gfx.fillRect(bx - 8, by - h1, 16, h1 + 2);

    // Mid flame — slightly offset
    const f2  = 0.6 + 0.4 * Math.sin(t * 2.7 + 0.8);
    const h2  = Math.round(18 * f2);
    const ox2 = Math.round(Math.sin(t * 1.9) * 2);
    gfx.fillStyle(0xFF5500, alpha * 0.82);
    gfx.fillRect(bx - 6 + ox2, by - h2, 12, h2 + 1);

    // Inner flame — hot orange-yellow
    const f3  = 0.65 + 0.35 * Math.sin(t * 3.8 + 1.4);
    const h3  = Math.round(22 * f3);
    const ox3 = Math.round(Math.sin(t * 2.4 + 0.5) * 1.5);
    gfx.fillStyle(0xFF8800, alpha * 0.78);
    gfx.fillRect(bx - 4 + ox3, by - h3, 8, h3);

    // Core — yellow-white hot
    const f4  = 0.7 + 0.3 * Math.sin(t * 4.6 + 0.2);
    const h4  = Math.round(14 * f4);
    gfx.fillStyle(0xFFCC00, alpha * 0.7);
    gfx.fillRect(bx - 2, by - h4 - 4, 4, h4);
    gfx.fillStyle(0xFFEE44, alpha * 0.55);
    gfx.fillRect(bx - 1, by - h4 - 8, 2, 6);

    // Sparks — rise and drift
    gfx.fillStyle(0xFFFF88, alpha * 0.8);
    for (let i = 0; i < 7; i++) {
      const phase  = t * (1.8 + i * 0.4) + i * 1.3;
      const rise   = (phase % (Math.PI * 2)) / (Math.PI * 2);
      const drift  = Math.sin(t * 2.1 + i * 0.9) * 9;
      const sx     = bx + Math.round(drift);
      const sy     = by - 8 - Math.round(rise * 22);
      const fade   = 1 - rise;
      if (fade > 0.1) {
        gfx.fillStyle(i % 3 === 0 ? 0xFFAA22 : 0xFFFF44, alpha * fade * 0.75);
        gfx.fillRect(sx, sy, 1 + (i % 2), 1 + (i % 2));
      }
    }

    // Smoke puffs — grey dots drifting up slowly (day-visible)
    const smokeA = Math.max(0, 0.25 - nf * 0.1);
    if (smokeA > 0.01) {
      for (let i = 0; i < 4; i++) {
        const sp    = t * 0.4 + i * 0.7;
        const rise2 = (sp % (Math.PI * 2)) / (Math.PI * 2);
        const driftS = Math.sin(t * 0.8 + i * 1.1) * 7;
        gfx.fillStyle(0x888888, smokeA * (1 - rise2) * 0.8);
        gfx.fillCircle(bx + Math.round(driftS), by - 14 - Math.round(rise2 * 18), 3 + i % 3);
      }
    }
  }

  // Pre-render a lighthouse beam into a CanvasTexture using a proper radial gradient
  // (smooth radial falloff) + CSS blur (smooth angular edge falloff). The texture is
  // created once and reused; only the sprite rotation changes each frame.
  private createBeamSprite(): void {
    const texKey = '__lh_beam__';
    const len    = 160;
    const spread = Math.PI / 14;   // half-angle of the cone
    const blurPx = 10;             // blur radius for angular edge softness

    // Canvas dimensions: extra space on all sides so blur doesn't clip.
    const W    = len + blurPx * 2 + 4;
    const half = Math.ceil(len * Math.tan(spread)) + blurPx + 4;
    const H    = half * 2;
    const sx   = blurPx + 2;      // source x on canvas (lighthouse lens)
    const sy   = H / 2;           // source y on canvas (vertically centred)

    // Draw the raw cone with a radial gradient on an off-screen DOM canvas
    // so the sharp edges can be blurred smoothly onto the Phaser texture.
    const off = document.createElement('canvas');
    off.width  = W;
    off.height = H;
    const oct  = off.getContext('2d')!;

    oct.beginPath();
    oct.moveTo(sx, sy);
    oct.lineTo(W, sy - (W - sx) * Math.tan(spread));
    oct.lineTo(W, sy + (W - sx) * Math.tan(spread));
    oct.closePath();

    const grad = oct.createRadialGradient(sx, sy, 0, sx, sy, len);
    grad.addColorStop(0,    'rgba(255,255,200,0.55)');
    grad.addColorStop(0.25, 'rgba(255,255,170,0.30)');
    grad.addColorStop(0.60, 'rgba(255,255,140,0.10)');
    grad.addColorStop(1,    'rgba(255,255,120,0)');
    oct.fillStyle = grad;
    oct.fill();

    // Composite the blurred cone onto the Phaser CanvasTexture.
    // CSS blur is applied as a context filter before drawing — this gives
    // a true per-pixel Gaussian falloff at the angular edges, not polygon steps.
    if (this.scene.textures.exists(texKey)) this.scene.textures.remove(texKey);
    const ct  = this.scene.textures.createCanvas(texKey, W, H) as Phaser.Textures.CanvasTexture;
    const ctx = ct.context;
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(off, 0, 0);
    ctx.filter = 'none';
    ct.refresh();

    // Create (or replace) the sprite. Origin is set so the "source" pixel on the
    // texture aligns with the lighthouse position; rotation sweeps the beam.
    this._beamSprite?.destroy();
    this._beamSprite = this.scene.add.image(
      this._lighthouseX, this._lighthouseTopY - 5, texKey,
    )
      .setOrigin(sx / W, 0.5)
      .setDepth(5.69)                   // below structGfx (5.7) so tower overlaps beam
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private drawLighthouseBeam(): void {
    const gfx = this.fxGfx;
    const { _lighthouseX: lx, _lighthouseTopY: ty } = this;
    const nf    = this._nightFactor;
    const angle = this._lighthouseAngle;
    const ox = lx, oy = ty - 5;

    if (this._beamSprite) {
      this._beamSprite.setPosition(ox, oy).setRotation(angle).setAlpha(nf);
    }

    // Lens glow
    gfx.fillStyle(0xFFFF44, nf * 0.55);
    gfx.fillCircle(ox, oy, 4);
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
    if (nf < 0.05) {
      for (const b of this._bonFireLights) (b as { intensity: number }).intensity = 0;
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
    this.destroyFoamSprites();
    this.waterGfx.destroy();
    this.shadowGfx.destroy();
    this.structGfx.destroy();
    this.beachShadowGfx.destroy();
    this.beachPeopleGfx.destroy();
    this.fxGfx.destroy();
  }
}
