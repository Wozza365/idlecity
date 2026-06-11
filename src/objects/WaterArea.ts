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
const ROCK_WET   = 0x474D55;
const MOSS_GREEN = 0x6E8B3D;
const MOSS_DARK  = 0x4F6B2A;
const DOCK_WOOD  = 0xA0784A;
const PIER_WOOD  = 0xB8884E;

const BEACH_SHORE_H = 48;  // depth of sandy beach area
const ROCK_SHORE_H  = 22;  // depth of rocky area

// ── Lighthouse tower (baked cone, same technique as Balloon.ts) ────────────────
const LH_TEX_KEY  = 'lighthouse-tower';
const LH_TOWER_H  = 44;  // tower height
const LH_BASE_W   = 14;  // width at the base (bottom)
const LH_TOP_W    = 8;   // width at the top — slight taper
const LH_CT_PAD   = 2;
const LH_CT_W     = LH_BASE_W + LH_CT_PAD * 2;
const LH_CT_H     = LH_TOWER_H + LH_CT_PAD * 2;
const LH_CT_CX    = LH_CT_W / 2;
const LH_CT_TOP   = LH_CT_PAD;

// Per-column (1px) shadow profile for the tapered tower silhouette — for each
// column across the base width, the y (relative to the tower top) at which the
// cone's outline begins to cover that column. Mirrors Balloon.ts's shadowY1s/
// shadowY2s, but the cone's bottom edge is flat so only one array is needed.
const lhShadowTopYs = new Int32Array(LH_BASE_W);
for (let col = 0; col < LH_BASE_W; col++) {
  const dx = Math.abs(col + 0.5 - LH_BASE_W / 2) * 2;
  lhShadowTopYs[col] = dx <= LH_TOP_W
    ? 0
    : Math.round(LH_TOWER_H * (dx - LH_TOP_W) / (LH_BASE_W - LH_TOP_W));
}

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
  private waterGfx:        Phaser.GameObjects.Graphics; // 5.5  – gradient water + coast (static)
  private skyReflectGfx:   Phaser.GameObjects.Graphics; // 5.51 – sky horizon colour tint on water top
  private shadowGfx:       Phaser.GameObjects.Graphics; // 5.65 – structure shadows on water (sun-dep)
  private structGfx:       Phaser.GameObjects.Graphics; // 5.7  – pier, dock, café, hut, lighthouse
  private beachShadowGfx:  Phaser.GameObjects.Graphics; // 5.76 – beach people shadows
  private beachPeopleGfx:  Phaser.GameObjects.Graphics; // 5.78 – moving beach people
  private fxGfx:           Phaser.GameObjects.Graphics; // 5.85 – bonfire, sparkles, buoys (no lighting)
  private islandGfx:       Phaser.GameObjects.Graphics; // 5.86 – lighthouse island (above wave fx)

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
  private _lhTowerImg: Phaser.GameObjects.Image | null = null;
  private _dockSlots: number[] = [];

  // Beach people
  private _people: BeachPerson[] = [];

  // Buoys
  private _buoys: Array<{ x: number; y: number; color: number; phase: number }> = [];

  // Dock glow lights (positions populated in drawDock, rendered in drawFx)
  private _dockGlows: Array<{ x: number; y: number; bright?: boolean }> = [];

  // Sprites from the High Tides asset pack
  private _foamSprites: Phaser.GameObjects.Sprite[] = [];

  // Animation
  private _waveTime        = 0;
  private _waveRise        = 0;
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
    this.skyReflectGfx  = scene.add.graphics().setDepth(5.51);
    this.shadowGfx      = scene.add.graphics().setDepth(5.55);
    this.structGfx      = scene.add.graphics().setDepth(5.7).setLighting(true);
    this.beachShadowGfx = scene.add.graphics().setDepth(5.62);
    this.beachPeopleGfx = scene.add.graphics().setDepth(5.66).setLighting(true);
    this.fxGfx          = scene.add.graphics().setDepth(5.85);
    this.islandGfx      = scene.add.graphics().setDepth(5.86).setLighting(true);
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
    this._lighthouseX    = Math.floor(width * 0.63);
    this._lighthouseTopY = this._waterY + WATER_H * 0.5;

    this.structGfx.clear();
    this.islandGfx.clear();

    this.drawWaterAndCoast();

    if (level >= 3) this.drawPier();
    if (level >= 4) this.drawBeachCafe();
    if (level >= 5) this.drawDock();
    else { this._dockGlows = []; }
    if (level >= 7) { this.drawLifeguardHut(); this.setupBuoys(); }
    else { this._buoys = []; }
    if (level >= 8) { this.drawLighthouseIsland(); this.drawLighthouse(); }
    else { this._lhTowerImg?.setVisible(false); }
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
    const dockW   = dx2 - dx1;
    const deckEnd      = wy + BEACH_SHORE_H;  // wy+48: matches beach height
    const waterBeamEnd = wy + 62;             // where visible wood transitions to shadow
    const beamEnd      = wy + 72;             // bottom of submerged beams

    // Submerged beam section — barely visible, shadow-like
    for (let bx2 = dx1 + 14; bx2 < dx2 - 8; bx2 += 22) {
      gfx.fillStyle(0x2A1806, 0.28);
      gfx.fillRect(bx2 - 2, waterBeamEnd, 4, beamEnd - waterBeamEnd);
    }
    // Right-edge post submerged section
    gfx.fillStyle(0x2A1806, 0.28);
    gfx.fillRect(dx2 - 4, waterBeamEnd, 4, beamEnd - waterBeamEnd);

    // Visible wooden beam section — dark wood, clearly readable as structure
    for (let bx2 = dx1 + 14; bx2 < dx2 - 8; bx2 += 22) {
      gfx.fillStyle(0x5A3810, 0.85);
      gfx.fillRect(bx2 - 2, deckEnd, 4, waterBeamEnd - deckEnd);
    }
    // Right-edge post visible section
    gfx.fillStyle(0x5A3810, 0.85);
    gfx.fillRect(dx2 - 4, deckEnd, 4, waterBeamEnd - deckEnd);

    // Main dock body — starts from land edge (wy) and sticks out into water
    gfx.fillStyle(DOCK_WOOD, 1);
    gfx.fillRect(dx1, wy, dockW, deckEnd - wy);

    // Horizontal plank lines
    gfx.fillStyle(0x000000, 0.08);
    for (let j = 0; j <= 6; j++) {
      const y = wy + Math.round((j / 6) * (deckEnd - wy));
      gfx.fillRect(dx1, y, dockW, 1);
    }

    // Vertical board dividers
    gfx.fillStyle(0x000000, 0.07);
    for (let i = 0; i < dockW; i += 14) {
      gfx.fillRect(dx1 + i, wy, 1, deckEnd - wy);
    }

    // Right-edge wall — slightly darker strip to give the dock a natural side face
    gfx.fillStyle(0x7A5828, 1);
    gfx.fillRect(dx2 - 4, wy, 4, deckEnd - wy);
    // Inner shadow line against the right wall
    gfx.fillStyle(0x000000, 0.15);
    gfx.fillRect(dx2 - 5, wy, 1, deckEnd - wy);

    // Mooring bollards along top edge
    gfx.fillStyle(0x555555, 1);
    for (const x of [dx1 + 14, dx1 + Math.floor(dockW / 2), dx2 - 18]) {
      gfx.fillRect(x - 2, wy - 4, 5, 4);
      gfx.fillRect(x - 4, wy - 5, 9, 2);
    }

    // Front end cap
    gfx.fillStyle(0x7A5828, 1);
    gfx.fillRect(dx1, deckEnd - 3, dockW, 4);

    // Glow light positions (rendered in drawFx with nightFactor)
    this._dockGlows = [];
    const inset = 21;
    const pathY = deckEnd - inset; // U-bottom inset matches side inset
    // Outer edge dots — left wall, right wall, front row
    for (let gy = wy + 8; gy < deckEnd - 6; gy += 11) {
      this._dockGlows.push({ x: dx1 + 2, y: gy });
      this._dockGlows.push({ x: dx2 - 2, y: gy });
    }
    for (let gx = dx1 + 2; gx <= dx2 - 2; gx += 11) {
      this._dockGlows.push({ x: gx, y: deckEnd - 6 });
    }
    // U-shaped path inset — left arm, right arm, front bar (slightly brighter)
    for (let gy = wy + 8; gy <= pathY; gy += 11) {
      this._dockGlows.push({ x: dx1 + inset, y: gy, bright: true });
      this._dockGlows.push({ x: dx2 - inset, y: gy, bright: true });
    }
    for (let gx = dx1 + inset; gx <= dx2 - inset; gx += 11) {
      this._dockGlows.push({ x: gx, y: pathY, bright: true });
    }

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

  // ── Lighthouse rocky island (level 8+) ─────────────────────────────────────

  private drawLighthouseIsland(): void {
    const gfx = this.islandGfx;
    const { _lighthouseX: cx, _lighthouseTopY: topY } = this;
    const baseY = topY + 46;

    // Soft halo in the surrounding water — grounds the island visually
    gfx.fillStyle(0x06223A, 0.25);
    gfx.fillEllipse(cx, topY + 50, 48, 22);

    // ── Submerged rock base — small, rounded, dark wet stone ──
    gfx.fillStyle(ROCK_WET, 1);
    gfx.fillEllipse(cx, topY + 48, 40, 18);
    gfx.fillStyle(dimColor(ROCK_WET, 0.7), 1);
    gfx.fillEllipse(cx, topY + 52, 32, 12);

    // ── Jagged dry peaks rising above the waterline, each lit on the left
    //    face and shaded on the right for a faceted pixel-art look ──
    const peaks: ReadonlyArray<{ x0: number; x1: number; ax: number; ay: number }> = [
      { x0: cx - 18, x1: cx - 2, ax: cx - 11, ay: topY + 30 },
      { x0: cx + 0,  x1: cx + 16, ax: cx + 8, ay: topY + 34 },
    ];
    for (const p of peaks) {
      gfx.fillStyle(ROCK_BASE, 1);
      gfx.fillTriangle(p.x0, baseY, p.x1, baseY, p.ax, p.ay);
      gfx.fillStyle(ROCK_LIGHT, 0.8);
      gfx.fillTriangle(p.x0, baseY, p.ax, p.ay, (p.x0 + p.ax) / 2, baseY);
      gfx.fillStyle(0x404040, 0.55);
      gfx.fillTriangle(p.x1, baseY, p.ax, p.ay, (p.x1 + p.ax) / 2, baseY);
    }

    // ── Strata cracks ──
    gfx.fillStyle(0x333333, 0.6);
    gfx.fillRect(cx - 13, topY + 40, 10, 2);
    gfx.fillRect(cx + 2,  topY + 42, 9, 2);

    // ── Moss patch on the highest peak ──
    gfx.fillStyle(MOSS_DARK, 0.9);
    gfx.fillEllipse(cx - 11, topY + 29, 9, 4);
    gfx.fillStyle(MOSS_GREEN, 0.9);
    gfx.fillEllipse(cx - 12, topY + 28, 6, 2.5);

    // ── Foam where waves break against the rock ──
    gfx.fillStyle(0xFFFFFF, 0.3);
    for (let i = 0; i < 4; i++) {
      const fx = cx - 18 + i * 12;
      const fy = topY + 44 + Math.round(Math.sin(i * 1.7) * 3);
      gfx.fillCircle(fx, fy, 1.5);
    }

    // ── Tiny companion boulder ──
    gfx.fillStyle(ROCK_WET, 1);
    gfx.fillEllipse(cx - 26, topY + 54, 14, 8);
    gfx.fillStyle(ROCK_BASE, 1);
    gfx.fillTriangle(cx - 32, topY + 52, cx - 21, topY + 52, cx - 27, topY + 43);
    gfx.fillStyle(ROCK_LIGHT, 0.8);
    gfx.fillTriangle(cx - 32, topY + 52, cx - 27, topY + 43, cx - 29, topY + 52);
    gfx.fillStyle(0xFFFFFF, 0.3);
    gfx.fillCircle(cx - 33, topY + 56, 1.5);
  }

  // ── Lighthouse (level 8+) ─────────────────────────────────────────────────

  private drawLighthouse(): void {
    // Drawn on islandGfx (above the wave fx layer) so waves don't draw over it.
    const gfx = this.islandGfx;
    const { _lighthouseX: lx, _lighthouseTopY: topY } = this;

    gfx.fillStyle(0x888888, 1);
    gfx.fillRect(lx - 9, topY + LH_TOWER_H, 18, 5);

    // Tower body — baked cone texture (smooth taper, bands clipped to its outline).
    this.bakeLighthouseTower();
    if (!this._lhTowerImg) {
      this._lhTowerImg = this.scene.add.image(lx, topY, LH_TEX_KEY)
        .setOrigin(LH_CT_CX / LH_CT_W, LH_CT_TOP / LH_CT_H)
        .setDepth(5.86);
    } else {
      this._lhTowerImg.setPosition(lx, topY).setVisible(true);
    }

    gfx.fillStyle(0x444444, 1);
    gfx.fillRect(lx - LH_TOP_W / 2 - 3, topY - 1, LH_TOP_W + 6, 2);

    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(lx - 6, topY - 10, 12, 10);
    gfx.fillStyle(0xFFFF88, 0.85);
    gfx.fillRect(lx - 4, topY - 9, 8, 8);
    gfx.fillStyle(0x222222, 1);
    gfx.fillRect(lx - 5, topY - 12, 10, 3);
    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(lx - 1, topY - 15, 2, 4);
  }

  // Bake the tapered tower body once into a CanvasTexture using the same
  // Path2D-clip-and-fill technique as Balloon.ts's bake(): clip to the cone
  // outline, fill the white body and red bands (auto-cropped to the taper),
  // then stroke the outline for a subtle anti-aliased rim.
  private bakeLighthouseTower(): void {
    if (this.scene.textures.exists(LH_TEX_KEY)) return;

    const ct  = this.scene.textures.createCanvas(LH_TEX_KEY, LH_CT_W, LH_CT_H)!;
    const ctx = ct.getContext();

    const path = new Path2D();
    path.moveTo(LH_CT_CX - LH_TOP_W / 2,  LH_CT_TOP);
    path.lineTo(LH_CT_CX + LH_TOP_W / 2,  LH_CT_TOP);
    path.lineTo(LH_CT_CX + LH_BASE_W / 2, LH_CT_TOP + LH_TOWER_H);
    path.lineTo(LH_CT_CX - LH_BASE_W / 2, LH_CT_TOP + LH_TOWER_H);
    path.closePath();

    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = '#EEEEEE';
    ctx.fillRect(0, LH_CT_TOP, LH_CT_W, LH_TOWER_H);
    ctx.fillStyle = '#CC3333';
    ctx.fillRect(0, LH_CT_TOP + 10, LH_CT_W, 6);
    ctx.fillRect(0, LH_CT_TOP + 28, LH_CT_W, 6);
    ctx.restore();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.40)';
    ctx.lineWidth   = 1;
    ctx.stroke(path);

    ct.refresh();
  }

  // ── Buoys ─────────────────────────────────────────────────────────────────

  private setupBuoys(): void {
    const { _width: w, _waterY: wy } = this;
    // Positioned clear of dock (36–60%)
    this._buoys = [
      { x: Math.floor(w * 0.28), y: wy + 58, color: 0xFF3333, phase: 0 },
      { x: Math.floor(w * 0.63), y: wy + 74, color: 0xFF7700, phase: Math.PI * 0.5 },
      { x: Math.floor(w * 0.74), y: wy + 70, color: 0xFF3333, phase: Math.PI },
      { x: Math.floor(w * 0.84), y: wy + 77, color: 0xFF7700, phase: Math.PI * 1.5 },
    ];
  }

  // ── Light sources ─────────────────────────────────────────────────────────

  private rebuildLights(): void {
    for (const nl of this._nativeLights) this.scene.lights.removeLight(nl);
    this._nativeLights = [];

    const { _level: lv, _waterY: wy } = this;

    // Dock uses ambient dot glows only (drawn in drawFx) — no directional spots
    this._dockSpots = [];
    this._dockBulbs = [];

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

    // Lighthouse shadow — a soft offset silhouette of the cone tower, drawn in
    // the same two-pass per-column technique as Balloon.ts's drawShadow().
    if (this._level >= 8) {
      const { _lighthouseX: lx, _lighthouseTopY: topY } = this;
      const shadowX = Math.round(leanX * 4);
      const shadowY = Math.round(2 + (1 - elevation) * 3);
      for (const [frac, a] of [[0.5, alpha], [1.0, alpha * 0.5]] as [number, number][]) {
        const sox = Math.round(shadowX * frac);
        const soy = Math.max(1, Math.round(shadowY * frac));
        gfx.fillStyle(0x000000, a);
        for (let col = 0; col < LH_BASE_W; col++) {
          const h = LH_TOWER_H - lhShadowTopYs[col];
          if (h < 1) continue;
          gfx.fillRect(lx - LH_BASE_W / 2 + col + sox, topY + lhShadowTopYs[col] + soy, 1, h);
        }
      }
    }
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(delta: number, elevation: number, horizonColor = 0x1a5c9e): void {
    if (this._width === 0) return; // not yet rendered
    this.updateSkyReflection(horizonColor);
    const dt = delta / 1000;
    this._waveTime    += dt * 0.3;
    this._waveRise    += dt * 7.5; // 7.5 px/s rise speed
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

    // ── Full-width rising water waves ──
    // Each wave crest is rendered as two overlapping passes of short strokes.
    // Both passes use deterministic per-position y-noise so adjacent strokes land
    // at slightly different y-values — where they meet the edges are ragged and
    // organic, not a clean geometric line.  The two passes have different strides
    // and x-offsets so their stroke boundaries never align, which fills out the
    // crest with irregular overlaps.  Shore-proximity fade is per-stroke.
    {
      const t    = this._waveTime;
      const rise = this._waveRise % WATER_H;
      const nf   = this._nightFactor;
      const dayA = Math.max(0, 1 - nf * 1.1);
      const { _beachEndX: bx, _dockX1: dkx1, _dockX2: dkx2, _transEndX: tx, _level: lv } = this;

      // Shore ceiling at column x — same logic reused by both passes
      const ceilAt = (x: number): number => {
        if (lv < 1) return wy;
        if (x < bx) return wy + BEACH_SHORE_H;
        if (lv >= 5 && x >= dkx1 && x < dkx2) return wy + BEACH_SHORE_H;
        if (x >= tx) return wy + ROCK_SHORE_H;
        const r = (x - bx) / Math.max(1, tx - bx);
        const s = r * r * (3 - 2 * r);
        return wy + Math.round(BEACH_SHORE_H * (1 - s) + ROCK_SHORE_H * s);
      };

      // Lighthouse island "wake" — waves fade into a calm clearing around the
      // island, with a longer tail trailing behind/above it (toward shore) so
      // the gap reads as a natural wake/shadow rather than a hard hole.
      const islandActive = lv >= 8;
      const islandCx = this._lighthouseX;
      const islandCy = this._lighthouseTopY + 48;
      const ISLAND_RX = 26, ISLAND_RY_FRONT = 18, ISLAND_RY_BACK = 32;
      const islandClearAt = (px: number, py: number): number => {
        if (!islandActive) return 0;
        const dx = px - islandCx;
        const dy = py - islandCy;
        const ry = dy < 0 ? ISLAND_RY_BACK : ISLAND_RY_FRONT;
        const nx = dx / ISLAND_RX, ny = dy / ry;
        const t  = Math.sqrt(nx * nx + ny * ny);
        if (t >= 1.5) return 0;
        if (t <= 1)   return 1;
        return (1.5 - t) / 0.5;
      };

      if (dayA > 0.01) {
        const SHORE_FADE = 30;
        const NUM_WAVES  = 14;
        const SPACING    = WATER_H / NUM_WAVES;

        for (let wi = 0; wi < NUM_WAVES; wi++) {
          const rawDepth = ((wi * SPACING - rise) % WATER_H + WATER_H) % WATER_H;
          const topFade  = Math.min(1, rawDepth / 8);
          const botFade  = Math.min(1, (WATER_H - rawDepth) / 8);
          if (topFade < 0.05 || botFade < 0.05) continue;

          const baseAlpha = dayA * 0.2025 * topFade * botFade;
          if (baseAlpha < 0.01) continue;

          // Multi-harmonic smooth envelope — determines the y-centre for each crest
          const f1 = 0.024 + wi * 0.004;
          const a1 = 2.5   - wi * 0.16;
          const s1 = 0.36  + wi * 0.06;
          const ph = wi    * 1.4;
          const envY = (x: number) =>
            wy + rawDepth
            + Math.sin(x * f1       + t * s1       + ph)        * a1
            + Math.sin(x * f1 * 2.3 + t * s1 * 1.7 + ph * 0.8) * (a1 * 0.40)
            + Math.sin(x * f1 * 5.7 + t * s1 * 2.5 + ph * 1.5) * (a1 * 0.18)
            + Math.sin(x * f1 * 0.5 + t * s1 * 2.0 + ph * 1.7) * (a1 * 0.70);

          // Two passes with distinct strides / x-offsets so their stroke-start
          // positions never coincide — this guarantees the overlap zones sit at
          // different y-values and give genuinely ragged edges.
          //   Pass A — primary body:  stride 6, seg 10-13 px,  noise ±1.6 px
          //   Pass B — fringe layer:  stride 9, seg  8-11 px,  noise ±2.3 px, shifted 4 px
          const passes = [
            { stride: 12, segBase: 22, noiseAmp: 1.6, xOff: 0, aScale: 1.00 },
            { stride: 18, segBase: 18, noiseAmp: 2.3, xOff: 7, aScale: 0.58 },
          ] as const;

          for (const pd of passes) {
            for (let sx = 0; sx < w; sx += pd.stride) {
              const x = sx + pd.xOff;
              if (x >= w) continue;

              // Deterministic y-noise: two spatial frequencies, stable over time.
              // These shift each stroke's y by a small unique amount so adjacent
              // strokes meet at different heights — that is the ragged-edge mechanism.
              const noise =
                Math.sin(x * 0.38 + wi * 6.1 + t * 5.0) * pd.noiseAmp
              + Math.sin(x * 1.19 + wi * 2.7 + t * 3.5) * pd.noiseAmp * 0.5;

              const y0    = Math.round(envY(x) + noise);
              const ceilY = ceilAt(x);
              if (y0 < ceilY || y0 >= wy + WATER_H) continue;

              const clear = islandClearAt(x, y0);
              if (clear >= 1) continue;

              const shoreFade = Math.min(1, (y0 - ceilY) / SHORE_FADE);
              const a = baseAlpha * pd.aScale * shoreFade * (1 - clear);
              if (a < 0.005) continue;

              // Segment length varies per position (±2 px around base)
              const lenVar = Math.round(Math.sin(x * 0.77 + wi * 3.9) * 2);
              const segLen = Math.min(pd.segBase + lenVar, w - x);
              if (segLen <= 0) continue;

              // Line width varies — ~30% of strokes are 3 px, rest 2 px
              const lineW = Math.sin(x * 0.91 + wi * 4.7) > 0.45 ? 3 : 2;

              // Subtle colour variation: pale blue-white → pure white
              const colorT    = (Math.sin(x * 0.17 + wi * 4.3 + t * 1.8) + 1) * 0.5;
              const waveColor = lerpColor(0xBED8F5, 0xFFFFFF, colorT);

              // Draw stroke as a curved polyline (5 pts) following the wave envelope
              // so the stroke itself tilts and bends with the wave rather than
              // being a flat horizontal bar.
              gfx.lineStyle(lineW, waveColor, a);
              gfx.beginPath();
              const PTS = 5;
              for (let ci = 0; ci <= PTS; ci++) {
                const px = x + segLen * ci / PTS;
                const pn = Math.sin(px * 0.38 + wi * 6.1 + t * 5.0) * pd.noiseAmp
                         + Math.sin(px * 1.19 + wi * 2.7 + t * 3.5) * pd.noiseAmp * 0.5;
                const py = envY(px) + pn;
                if (ci === 0) { gfx.moveTo(px, py); } else { gfx.lineTo(px, py); }
              }
              gfx.strokePath();

              // Bright crest highlight — short high-alpha segment at stroke start
              if (pd.aScale >= 1.0 && a > 0.05) {
                const px4 = x + 5;
                const pn0 = Math.sin(x   * 0.38 + wi * 6.1 + t * 5.0) * pd.noiseAmp + Math.sin(x   * 1.19 + wi * 2.7 + t * 3.5) * pd.noiseAmp * 0.5;
                const pn4 = Math.sin(px4 * 0.38 + wi * 6.1 + t * 5.0) * pd.noiseAmp + Math.sin(px4 * 1.19 + wi * 2.7 + t * 3.5) * pd.noiseAmp * 0.5;
                gfx.lineStyle(lineW, waveColor, Math.min(1, a * 1.8));
                gfx.beginPath();
                gfx.moveTo(x,   envY(x)   + pn0);
                gfx.lineTo(px4, envY(px4) + pn4);
                gfx.strokePath();
              }
            }
          }
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

    // Dock glow lights — night only, invisible during the day
    const nfGlow = this._nightFactor;
    if (this._level >= 5 && this._dockGlows.length > 0 && nfGlow > 0.02) {
      for (const g of this._dockGlows) {
        const baseA  = g.bright ? nfGlow * 0.75 : nfGlow * 0.60;
        const radius = g.bright ? 2.0 : 1.5;
        gfx.fillStyle(0xFFE090, baseA);
        gfx.fillCircle(g.x, g.y, radius);
        if (nfGlow > 0.2) {
          gfx.fillStyle(0xFFCC60, (nfGlow - 0.2) * (g.bright ? 0.45 : 0.30));
          gfx.fillCircle(g.x, g.y, g.bright ? 4 : 3);
        }
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

    // Lens glow — drawn larger than the lamp window so its halo is visible
    // around the (now in-front) tower rather than hidden entirely behind it.
    gfx.fillStyle(0xFFFF44, nf * 0.55);
    gfx.fillCircle(ox, oy, 8);
  }

  // ── Sky reflection ────────────────────────────────────────────────────────

  private updateSkyReflection(horizonColor: number): void {
    const gfx = this.skyReflectGfx;
    gfx.clear();
    if (this._width === 0) return;

    // Fade out reflection at night (water looks dark, not reflective)
    const alpha = 0.35 * Math.max(0, 1 - this._nightFactor * 2.0);
    if (alpha < 0.01) return;

    // Gradient overlay on the top 40% of the water band, fading to 0 at bottom
    const reflH = Math.floor(WATER_H * 0.40);
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      const frac = s / steps;
      gfx.fillStyle(horizonColor, alpha * (1 - frac));
      const y0 = this._waterY + Math.floor(frac * reflH);
      const y1 = this._waterY + Math.floor((s + 1) / steps * reflH);
      gfx.fillRect(0, y0, this._width, Math.max(1, y1 - y0));
    }
  }

  // ── Lighting updates ──────────────────────────────────────────────────────

  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightElevation) < 0.002) return;
    this._lastLightElevation = elevation;
    this._nightFactor = Math.max(0, Math.min(1, (0.2 - elevation) / 0.3));
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
    this.skyReflectGfx.destroy();
    this.shadowGfx.destroy();
    this.structGfx.destroy();
    this.beachShadowGfx.destroy();
    this.beachPeopleGfx.destroy();
    this.fxGfx.destroy();
    this.islandGfx.destroy();
    this._lhTowerImg?.destroy();
    if (this.scene.textures.exists(LH_TEX_KEY)) this.scene.textures.remove(LH_TEX_KEY);
  }
}
