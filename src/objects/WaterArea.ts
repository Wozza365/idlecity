import Phaser from 'phaser';
import { ROAD_H, VERGE_H, WATER_H } from '../constants';
import { SoftSpotLight } from '../lighting/SoftSpotLight';
import type { LightSource } from '../lighting/LightingSystem';

interface BeachPerson {
  x: number;
  y: number;
  towelColor: number;
  bodyColor: number;
  lying: boolean;
}

const TOWEL_COLORS  = [0xE63946, 0x4CC9F0, 0xF4D35E, 0x3A86FF, 0xFFB347, 0xFF6BBA, 0x06D6A0];
const BODY_COLORS   = [0xD4A574, 0xC68642, 0x8D5524, 0xF1C27D, 0xE0AC69, 0xA0522D, 0xFFDEAD];
const SAND_COLOR    = 0xD4B483;
const ROCK_COLORS   = [0x7A7A7A, 0x6A6A6A, 0x8A8A8A, 0x585858, 0x9A9A9A];
const WATER_DEEP    = 0x1A5C9E;
const WATER_MID     = 0x2070B8;
const WATER_NEAR    = 0x2A7EC8;
const WATER_SURF    = 0x3A8ED4;
const DOCK_WOOD     = 0xA0784A;
const PIER_WOOD     = 0xB8884E;

export class WaterArea {
  private readonly scene: Phaser.Scene;

  // Static background: water, beach, rocks (redrawn on render)
  private waterBgGfx: Phaser.GameObjects.Graphics;
  // Structures: pier, dock, café, hut (redrawn on render)
  private structGfx: Phaser.GameObjects.Graphics;
  // Beach people (redrawn on lighting change)
  private peopleGfx: Phaser.GameObjects.Graphics;
  // Animated FX: bonfire, sparkles, buoy bobs (redrawn every frame)
  private fxGfx: Phaser.GameObjects.Graphics;

  private _level  = 0;
  private _width  = 0;
  private _waterY = 0;

  // Computed geometry (set in render)
  private _beachEndX  = 0;
  private _rockyX     = 0;
  private _bonfireX   = 0;
  private _bonfireY   = 0;
  private _lighthouseX   = 0;
  private _lighthouseTopY = 0;
  private _pierX  = 0;
  private _dockX1 = 0;
  private _dockX2 = 0;
  private _cafeX  = 0;
  private _dockSlots: number[] = [];

  // Beach people data
  private _beachPeople: BeachPerson[] = [];

  // Buoy positions {x, y, color, phase}
  private _buoys: Array<{ x: number; y: number; color: number; phase: number }> = [];

  // Animation state
  private _waveTime       = 0;
  private _bonfireTime    = 0;
  private _lighthouseAngle = 0;
  private _nightFactor    = 0;
  private _lastLightingElevation = NaN;

  // Light sources
  private _dockLights:        Array<Extract<LightSource, { type?: 'point' }>> = [];
  private _buoyLights:        Array<Extract<LightSource, { type?: 'point' }>> = [];
  private _bonfireLight:      Extract<LightSource, { type?: 'point' }> | null = null;
  private _cafeLight:         Extract<LightSource, { type?: 'point' }> | null = null;
  private _pierLight:         Extract<LightSource, { type?: 'point' }> | null = null;
  private _lighthouseSpot:    SoftSpotLight | null = null;
  private _lighthouseGlow:    Extract<LightSource, { type?: 'point' }> | null = null;
  private _nativeLights:      Phaser.GameObjects.Light[] = [];

  get extraLights(): LightSource[] {
    const out: LightSource[] = [
      ...this._dockLights,
      ...this._buoyLights,
    ];
    if (this._bonfireLight) out.push(this._bonfireLight);
    if (this._cafeLight)    out.push(this._cafeLight);
    if (this._pierLight)    out.push(this._pierLight);
    if (this._lighthouseSpot) out.push(...this._lighthouseSpot.beams);
    if (this._lighthouseGlow) out.push(this._lighthouseGlow);
    return out;
  }

  getDockSlots(): number[] { return [...this._dockSlots]; }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Water area depths are all below the verge (6.0) so they render behind it
    this.waterBgGfx = scene.add.graphics().setDepth(5.5).setLighting(true);
    this.structGfx  = scene.add.graphics().setDepth(5.7).setLighting(true);
    this.peopleGfx  = scene.add.graphics().setDepth(5.75).setLighting(true);
    this.fxGfx      = scene.add.graphics().setDepth(5.85); // no lighting — preserve fx colours
  }

  render(level: number, width: number, groundY: number): void {
    this._level  = level;
    this._width  = width;
    this._waterY = groundY + ROAD_H + VERGE_H;

    // Reset dock slots (set by drawDock if level >= 5)
    this._dockSlots = [];

    // Compute layout geometry
    this._beachEndX  = Math.floor(width * 0.38);
    this._rockyX     = Math.floor(width * 0.63);
    this._pierX      = Math.floor(width * 0.22);
    this._dockX1     = Math.floor(width * 0.50);
    this._dockX2     = Math.floor(width * 0.73);
    this._cafeX      = 16;
    this._bonfireX   = Math.floor(width * 0.17);
    this._bonfireY   = this._waterY + 26;
    this._lighthouseX    = Math.floor(width * 0.87);
    this._lighthouseTopY = this._waterY - 2; // starts near waterY top edge

    this.drawBackground();
    if (level >= 1) this.drawCoastline();
    if (level >= 3) this.drawPier();
    if (level >= 4) this.drawBeachCafe();
    if (level >= 5) this.drawDock();
    if (level >= 7) {
      this.drawLifeguardHut();
      this.setupBuoys();
    } else {
      this._buoys = [];
    }
    if (level >= 8) this.drawLighthouse();
    if (level >= 2) this.setupBeachPeople();

    this.rebuildLights();
    this.drawPeople(this._nightFactor);
  }

  // ── Water background ──────────────────────────────────────────────────────

  private drawBackground(): void {
    const gfx = this.waterBgGfx;
    gfx.clear();
    const { _waterY: wy, _width: w } = this;

    // Layered water depth gradient (top = farther / deeper blue, bottom = nearer / lighter)
    gfx.fillStyle(WATER_DEEP, 1);
    gfx.fillRect(0, wy, w, WATER_H);
    gfx.fillStyle(WATER_MID, 1);
    gfx.fillRect(0, wy + 18, w, WATER_H - 18);
    gfx.fillStyle(WATER_NEAR, 1);
    gfx.fillRect(0, wy + 55, w, WATER_H - 55);
    gfx.fillStyle(WATER_SURF, 0.4);
    gfx.fillRect(0, wy + 80, w, WATER_H - 80);

    // Static wave marks
    gfx.fillStyle(0xFFFFFF, 0.06);
    for (let x = 0; x < w; x += 38) gfx.fillRect(x, wy + 28, 18, 1);
    for (let x = 12; x < w; x += 52) gfx.fillRect(x, wy + 46, 22, 1);
    for (let x = 5;  x < w; x += 44) gfx.fillRect(x, wy + 68, 14, 1);
  }

  // ── Coastline: beach + rocks ──────────────────────────────────────────────

  private drawCoastline(): void {
    const gfx = this.waterBgGfx;
    const { _waterY: wy, _width: w, _beachEndX: bx, _rockyX: rx } = this;
    const shoreH = 32;

    // Sandy beach (left portion)
    gfx.fillStyle(SAND_COLOR, 1);
    gfx.fillRect(0, wy, bx, shoreH);
    // Beach gradient toward water — slightly darker wet sand
    gfx.fillStyle(0xC4A060, 0.5);
    gfx.fillRect(0, wy + shoreH - 6, bx, 6);
    // Sand texture — light pebble scatter
    gfx.fillStyle(0xE8C890, 0.4);
    for (let i = 0; i < Math.floor(bx / 9); i++) {
      const px = ((i * 47 + 11) % (bx - 6)) + 3;
      const py = wy + 4 + ((i * 23 + 7) % (shoreH - 10));
      gfx.fillCircle(px, py, 1 + (i % 2));
    }

    // Transition beach → water (smooth curve)
    gfx.fillStyle(WATER_DEEP, 0.35);
    gfx.fillRect(bx - 12, wy, 20, shoreH);

    // Rocky coastline (right portion)
    const rockShoreH = 26;
    gfx.fillStyle(0x606060, 1);
    gfx.fillRect(rx, wy, w - rx, rockShoreH);

    // Rocks with varied colours and sizes
    for (let i = 0; i < Math.floor((w - rx) / 14); i++) {
      const rox = rx + ((i * 53 + 7) % (w - rx - 8)) + 4;
      const roy = wy + 2 + ((i * 19 + 3) % (rockShoreH - 8));
      const rc  = ROCK_COLORS[i % ROCK_COLORS.length];
      const rr  = 4 + (i % 3) * 3;
      gfx.fillStyle(rc, 1);
      gfx.fillEllipse(rox, roy, rr * 2, Math.round(rr * 0.7));
      // Rock highlight
      gfx.fillStyle(0xFFFFFF, 0.12);
      gfx.fillCircle(rox - 1, roy - 1, Math.max(1, rr - 2));
    }

    // Transition beach-midwater zone
    gfx.fillStyle(0x88B8D8, 0.22);
    gfx.fillRect(bx, wy, rx - bx, 18);
  }

  // ── Pier (level 3+) ───────────────────────────────────────────────────────

  private drawPier(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _pierX: px } = this;
    const pierW = 18;
    const pierH = 58;
    const planks = 7;

    // Pier deck
    gfx.fillStyle(PIER_WOOD, 1);
    gfx.fillRect(px - pierW / 2, wy + 10, pierW, pierH);

    // Plank lines
    gfx.fillStyle(0x000000, 0.12);
    for (let i = 0; i <= planks; i++) {
      const py2 = wy + 10 + Math.round((i / planks) * pierH);
      gfx.fillRect(px - pierW / 2, py2, pierW, 1);
    }

    // Side railings
    gfx.fillStyle(0x8A6030, 1);
    gfx.fillRect(px - pierW / 2 - 2, wy + 10, 3, pierH);
    gfx.fillRect(px + pierW / 2 - 1, wy + 10, 3, pierH);

    // Railing posts
    gfx.fillStyle(0x9A7040, 1);
    for (let i = 0; i <= 4; i++) {
      const py2 = wy + 10 + Math.round((i / 4) * pierH);
      gfx.fillRect(px - pierW / 2 - 2, py2 - 1, 3, 2);
      gfx.fillRect(px + pierW / 2 - 1, py2 - 1, 3, 2);
    }

    // Pier end platform
    gfx.fillStyle(PIER_WOOD, 1);
    gfx.fillRect(px - pierW / 2 - 4, wy + 10 + pierH - 6, pierW + 8, 8);

    // Mooring posts at end
    gfx.fillStyle(0x6A4818, 1);
    gfx.fillRect(px - pierW / 2 - 3, wy + 10 + pierH - 3, 3, 6);
    gfx.fillRect(px + pierW / 2 + 1, wy + 10 + pierH - 3, 3, 6);

    // Shadow under pier
    gfx.fillStyle(0x000000, 0.15);
    gfx.fillRect(px - pierW / 2 + 2, wy + 10, pierW - 2, pierH);
  }

  // ── Beach café (level 4+) ─────────────────────────────────────────────────

  private drawBeachCafe(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _cafeX: cx } = this;
    const cafeW = 58;
    const cafeH = 25;
    const cafeY = wy + 3;

    // Building walls
    gfx.fillStyle(0xF5E6CC, 1);
    gfx.fillRect(cx, cafeY, cafeW, cafeH);

    // Roof
    gfx.fillStyle(0xB06030, 1);
    gfx.fillRect(cx - 2, cafeY - 5, cafeW + 4, 7);

    // Awning (teal + orange stripes)
    const awningH = 5;
    const awningY = cafeY + 8;
    const stripeW = 6;
    for (let s = 0; s < Math.ceil(cafeW / stripeW); s++) {
      gfx.fillStyle(s % 2 === 0 ? 0x00CED1 : 0xFF8C00, 1);
      gfx.fillRect(cx + s * stripeW, awningY, Math.min(stripeW, cafeW - s * stripeW), awningH);
    }

    // Windows
    gfx.fillStyle(0x88CCFF, 0.7);
    gfx.fillRect(cx + 4, cafeY + 8, 12, 10);
    gfx.fillRect(cx + 22, cafeY + 8, 12, 10);

    // Door
    gfx.fillStyle(0x7A4010, 1);
    gfx.fillRect(cx + cafeW - 16, cafeY + 10, 10, cafeH - 10);

    // Sign board
    gfx.fillStyle(0x4A2C0A, 1);
    gfx.fillRect(cx + 34, cafeY + 3, 18, 7);
    gfx.fillStyle(0xFFEE88, 1);
    gfx.fillRect(cx + 36, cafeY + 4, 14, 5);

    // Outdoor table (small)
    gfx.fillStyle(0x888888, 1);
    gfx.fillRect(cx + cafeW + 4, cafeY + 12, 14, 2);
    gfx.fillRect(cx + cafeW + 9, cafeY + 14, 4, 8);
  }

  // ── Dock / harbour (level 5+) ─────────────────────────────────────────────

  private drawDock(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _dockX1: dx1, _dockX2: dx2 } = this;
    const dockW = dx2 - dx1;
    const armH  = 48;
    const armY  = wy + 6;

    // Main dock arm (top horizontal)
    gfx.fillStyle(DOCK_WOOD, 1);
    gfx.fillRect(dx1, armY, dockW, 8);

    // Plank pattern
    gfx.fillStyle(0x000000, 0.10);
    for (let i = 0; i < dockW; i += 14) gfx.fillRect(dx1 + i, armY, 1, 8);

    // Float (lower extension, where boats berth)
    gfx.fillStyle(0x9A7040, 1);
    gfx.fillRect(dx1 + 6, armY + 8, dockW - 12, armH);

    // Float planks
    gfx.fillStyle(0x000000, 0.08);
    for (let j = 0; j < armH; j += 10) gfx.fillRect(dx1 + 6, armY + 8 + j, dockW - 12, 1);

    // Mooring cleats / bollards along dock
    gfx.fillStyle(0x555555, 1);
    const bx = [dx1 + 12, dx1 + Math.floor(dockW / 2), dx2 - 16];
    for (const x of bx) {
      gfx.fillRect(x - 2, armY - 4, 5, 4);
      gfx.fillRect(x - 4, armY - 5, 9, 2);
    }

    // Dock supports (vertical posts into water)
    gfx.fillStyle(0x7A5828, 1);
    for (let x = dx1 + 14; x < dx2; x += 22) {
      gfx.fillRect(x - 2, armY + 8, 4, armH);
      // Water ripple ring around post
      gfx.fillStyle(0xFFFFFF, 0.08);
      gfx.fillCircle(x, armY + 8 + armH, 5);
      gfx.fillStyle(0x7A5828, 1);
    }

    // Side railing along dock edge
    gfx.fillStyle(0x8A6030, 1);
    gfx.fillRect(dx1, armY, 3, armH + 8);
    gfx.fillRect(dx2 - 3, armY, 3, armH + 8);

    // Store dock slots for BoatManager
    this._dockSlots = [
      dx1 + Math.floor(dockW * 0.25),
      dx1 + Math.floor(dockW * 0.55),
      dx1 + Math.floor(dockW * 0.80),
    ];
  }

  // ── Lifeguard hut (level 7+) ──────────────────────────────────────────────

  private drawLifeguardHut(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _beachEndX: bx } = this;
    const hx  = Math.floor(bx * 0.45);
    const hutW = 26;
    const hutH = 20;
    const hutY = wy + 4;

    // Platform legs
    gfx.fillStyle(0x8B6914, 1);
    gfx.fillRect(hx + 3, hutY + hutH, 4, 8);
    gfx.fillRect(hx + hutW - 7, hutY + hutH, 4, 8);

    // Hut body
    gfx.fillStyle(0xF0F0F0, 1);
    gfx.fillRect(hx, hutY, hutW, hutH);

    // Roof (red + white stripes)
    for (let i = 0; i < 4; i++) {
      gfx.fillStyle(i % 2 === 0 ? 0xDD2222 : 0xFFFFFF, 1);
      gfx.fillRect(hx - 1 + i * 7, hutY - 4, 7, 6);
    }
    gfx.fillStyle(0xDD2222, 1);
    gfx.fillRect(hx - 1, hutY - 4, hutW + 2, 1);

    // Window and door
    gfx.fillStyle(0x88CCFF, 0.7);
    gfx.fillRect(hx + 3, hutY + 3, 9, 8);
    gfx.fillStyle(0xBB5500, 1);
    gfx.fillRect(hx + hutW - 12, hutY + 8, 8, hutH - 8);

    // Lifeguard flag
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
    const towerH = 45;
    const towerW = 10;

    // Foundation
    gfx.fillStyle(0x888888, 1);
    gfx.fillRect(lx - 9, topY + towerH, 18, 5);

    // Tower (tapered — wider at base)
    gfx.fillStyle(0xEEEEEE, 1);
    gfx.fillRect(lx - towerW / 2, topY, towerW, towerH);
    gfx.fillStyle(0xCC3333, 1);
    // Red bands
    gfx.fillRect(lx - towerW / 2, topY + 10, towerW, 6);
    gfx.fillRect(lx - towerW / 2, topY + 28, towerW, 6);

    // Balcony rail
    gfx.fillStyle(0x444444, 1);
    gfx.fillRect(lx - towerW / 2 - 3, topY - 1, towerW + 6, 2);

    // Lantern housing
    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(lx - 6, topY - 10, 12, 10);
    // Glass
    gfx.fillStyle(0xFFFF88, 0.85);
    gfx.fillRect(lx - 4, topY - 9, 8, 8);
    // Dome top
    gfx.fillStyle(0x222222, 1);
    gfx.fillRect(lx - 5, topY - 12, 10, 3);
    // Tip
    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(lx - 1, topY - 15, 2, 4);

    // Store light position
    this._lighthouseGlow = {
      x: lx, y: topY - 5,
      radius: 60, color: 0xFFFF88, intensity: 0, noOcclusion: true,
    };
  }

  // ── Beach people ──────────────────────────────────────────────────────────

  private setupBeachPeople(): void {
    const { _level: lv, _beachEndX: bx, _waterY: wy } = this;
    const count = 3 + Math.min(5, Math.floor(lv * 0.7));
    this._beachPeople = [];
    for (let i = 0; i < count; i++) {
      const px = 12 + ((i * 53 + 17) % (bx - 30));
      const py = wy + 6 + ((i * 37 + 5) % 20);
      this._beachPeople.push({
        x: px,
        y: py,
        towelColor: TOWEL_COLORS[i % TOWEL_COLORS.length],
        bodyColor:  BODY_COLORS[i % BODY_COLORS.length],
        lying: i % 3 !== 2,
      });
    }
  }

  private drawPeople(nightFactor: number): void {
    const gfx = this.peopleGfx;
    gfx.clear();
    if (this._level < 2 || this._beachPeople.length === 0) return;

    const alpha = Math.max(0, 1 - nightFactor * 1.4);
    if (alpha < 0.02) return;

    for (const p of this._beachPeople) {
      const { x, y, towelColor, bodyColor, lying } = p;

      // Towel
      gfx.fillStyle(towelColor, alpha);
      if (lying) {
        gfx.fillRect(x - 5, y, 13, 5);
      } else {
        gfx.fillRect(x - 3, y + 2, 8, 5);
      }

      // Body
      gfx.fillStyle(bodyColor, alpha);
      if (lying) {
        // Lying down
        gfx.fillRect(x - 3, y + 1, 9, 3);
        // Head
        gfx.fillCircle(x + 5, y + 2, 3);
      } else {
        // Sitting
        gfx.fillRect(x - 2, y - 5, 5, 8);
        // Head
        gfx.fillCircle(x, y - 7, 3);
      }
    }
  }

  // ── Buoys ─────────────────────────────────────────────────────────────────

  private setupBuoys(): void {
    const { _width: w, _waterY: wy } = this;
    const xPositions = [
      Math.floor(w * 0.30),
      Math.floor(w * 0.44),
      Math.floor(w * 0.58),
      Math.floor(w * 0.76),
    ];
    const colors = [0xFF3333, 0xFF7700, 0xFF3333, 0xFF7700];
    this._buoys = xPositions.map((x, i) => ({
      x,
      y: wy + 52 + (i % 2) * 12,
      color: colors[i],
      phase: (i * Math.PI) / 2,
    }));
  }

  // ── Lights rebuild ────────────────────────────────────────────────────────

  private rebuildLights(): void {
    // Remove old native lights
    for (const l of this._nativeLights) this.scene.lights.removeLight(l);
    this._nativeLights = [];

    const { _level: lv, _waterY: wy } = this;

    // Dock post lights (level 5+)
    this._dockLights = [];
    if (lv >= 5) {
      for (const sx of this._dockSlots) {
        const pt: Extract<LightSource, { type?: 'point' }> = {
          x: sx, y: wy + 10, radius: 28, color: 0xFFCC66, intensity: 0, noOcclusion: true,
        };
        this._dockLights.push(pt);
        this._nativeLights.push(this.scene.lights.addLight(sx, wy + 10, 30, 0xFFCC66, 0));
      }
    }

    // Pier lamp (level 6+)
    this._pierLight = lv >= 6 ? {
      x: this._pierX, y: this._waterY + 12,
      radius: 30, color: 0xFFDD88, intensity: 0, noOcclusion: true,
    } : null;

    // Café light (level 4+)
    this._cafeLight = lv >= 4 ? {
      x: this._cafeX + 29, y: wy + 15,
      radius: 40, color: 0xFFEEAA, intensity: 0, noOcclusion: true,
    } : null;

    // Bonfire light (level 9+)
    this._bonfireLight = lv >= 9 ? {
      x: this._bonfireX, y: this._bonfireY,
      radius: 60, color: 0xFF7700, intensity: 0, noOcclusion: true,
    } : null;

    // Lighthouse (level 8+)
    if (lv >= 8) {
      this._lighthouseSpot = new SoftSpotLight({
        x: this._lighthouseX, y: this._lighthouseTopY - 5,
        radius: 160, color: 0xFFFF88, intensity: 0,
        angle: 0, coneAngle: Math.PI / 10, noOcclusion: true,
      });
    } else {
      this._lighthouseSpot = null;
    }

    // Buoy lights (level 7+)
    this._buoyLights = this._buoys.map(b => ({
      x: b.x, y: b.y,
      radius: 16, color: b.color, intensity: 0, noOcclusion: true,
    } as Extract<LightSource, { type?: 'point' }>));
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(delta: number): void {
    if (this._level === 0) return;
    const dt = delta / 1000;
    this._waveTime    += dt;
    this._bonfireTime += dt;
    this._lighthouseAngle = (this._lighthouseAngle + dt * 0.9) % (Math.PI * 2);

    // Rotate lighthouse spot beam
    if (this._lighthouseSpot && this._nightFactor > 0.05) {
      this._lighthouseSpot.beams[0].angle = this._lighthouseAngle;
    }

    // Update buoy positions (gentle bob)
    for (let i = 0; i < this._buoys.length; i++) {
      this._buoys[i].phase += dt * 1.5;
      if (this._buoyLights[i]) {
        this._buoyLights[i].y = this._buoys[i].y + Math.sin(this._buoys[i].phase) * 2;
      }
    }

    // Update bonfire light flicker
    if (this._bonfireLight && this._nightFactor > 0.05) {
      const flicker = 0.7 + 0.3 * Math.sin(this._bonfireTime * 8.3)
                    + 0.1 * Math.sin(this._bonfireTime * 17.1);
      this._bonfireLight.intensity = this._nightFactor * 280 * flicker;
    }

    this.drawFx();
  }

  private drawFx(): void {
    const gfx = this.fxGfx;
    gfx.clear();

    const { _width: w, _waterY: wy } = this;

    // Wave sparkles on water
    if (this._nightFactor < 0.8) {
      const daytime = 1 - this._nightFactor;
      gfx.fillStyle(0xFFFFFF, 0.12 * daytime);
      const t = this._waveTime;
      for (let i = 0; i < 8; i++) {
        const sx = ((i * 137 + Math.floor(t * 15) * 31) % (w - 20)) + 10;
        const sy = wy + 28 + ((i * 29 + Math.floor(t * 8)) % 55);
        const alpha2 = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.4);
        gfx.fillStyle(0xFFFFFF, 0.1 * daytime * alpha2);
        gfx.fillRect(sx, sy, 6 + (i % 3) * 2, 1);
      }
    }

    // Buoys
    for (const b of this._buoys) {
      const bobY = b.y + Math.sin(b.phase) * 2;
      gfx.fillStyle(b.color, 1);
      gfx.fillCircle(b.x, bobY, 5);
      gfx.fillStyle(0x000000, 0.3);
      gfx.fillCircle(b.x + 1, bobY + 1, 4);
      gfx.fillStyle(b.color, 1);
      gfx.fillCircle(b.x, bobY, 4);
      // Top marker
      gfx.fillStyle(0xFFFFFF, 0.8);
      gfx.fillCircle(b.x, bobY - 3, 2);
      // Night light
      if (this._nightFactor > 0.2) {
        gfx.fillStyle(b.color, this._nightFactor * 0.9);
        gfx.fillCircle(b.x, bobY, 7);
      }
    }

    // Bonfire (level 9+, night)
    if (this._level >= 9) {
      this.drawBonfire();
    }

    // Lighthouse beam sweep (level 8+, night)
    if (this._level >= 8 && this._nightFactor > 0.1) {
      this.drawLighthouseBeam();
    }
  }

  private drawBonfire(): void {
    const gfx = this.fxGfx;
    const { _bonfireX: bx, _bonfireY: by } = this;
    const t = this._bonfireTime;
    const nf = this._nightFactor;

    // Logs (always visible)
    gfx.fillStyle(0x3A2010, 1);
    gfx.fillRect(bx - 9, by + 2, 18, 4);
    gfx.fillRect(bx - 6, by + 4, 12, 3);

    if (nf < 0.1) return;

    const alpha = Math.min(1, nf * 1.5);

    // Ember glow
    gfx.fillStyle(0xFF4400, alpha * 0.85);
    gfx.fillRect(bx - 7, by - 1, 14, 4);

    // Flame layers
    const f1 = 0.6 + 0.4 * Math.sin(t * 7.8);
    const f2 = 0.65 + 0.35 * Math.sin(t * 5.3 + 1.1);
    const f3 = 0.55 + 0.45 * Math.sin(t * 10.2 + 0.6);

    // Base (red-orange, wide)
    const h1 = Math.round(10 * f1);
    gfx.fillStyle(0xFF2200, alpha * 0.9);
    gfx.fillRect(bx - 7, by - h1, 14, h1);

    // Middle (orange)
    const h2 = Math.round(15 * f2);
    gfx.fillStyle(0xFF6600, alpha * 0.85);
    gfx.fillRect(bx - 5, by - h2, 10, h2);

    // Core (yellow-orange)
    const h3 = Math.round(20 * f3);
    gfx.fillStyle(0xFFAA00, alpha * 0.75);
    gfx.fillRect(bx - 3, by - h3, 6, h3);

    // Tip (bright yellow)
    gfx.fillStyle(0xFFEE22, alpha * 0.6);
    gfx.fillRect(bx - 1, by - h3 - 4, 3, 5);

    // Sparks
    gfx.fillStyle(0xFFFF44, alpha * 0.7);
    for (let i = 0; i < 5; i++) {
      const sx = bx + Math.round(Math.sin(t * 3.7 + i * 1.57) * 9);
      const sy = by - 10 - Math.round(Math.abs(Math.sin(t * 2.3 + i * 2.1)) * 14);
      gfx.fillRect(sx, sy, 1, 1);
    }
  }

  private drawLighthouseBeam(): void {
    const gfx = this.fxGfx;
    const { _lighthouseX: lx, _lighthouseTopY: ty } = this;
    const nf = this._nightFactor;
    const beamAlpha = nf * 0.18;
    const angle = this._lighthouseAngle;

    // Draw a simple triangle beam sweep on the fx layer
    const beamLen = 140;
    const spreadAngle = Math.PI / 14;
    const a1 = angle - spreadAngle;
    const a2 = angle + spreadAngle;

    gfx.fillStyle(0xFFFF88, beamAlpha);
    gfx.fillTriangle(
      lx, ty - 5,
      lx + Math.cos(a1) * beamLen, ty - 5 + Math.sin(a1) * beamLen,
      lx + Math.cos(a2) * beamLen, ty - 5 + Math.sin(a2) * beamLen,
    );

    // Inner brighter core
    gfx.fillStyle(0xFFFF88, beamAlpha * 1.5);
    gfx.fillTriangle(
      lx, ty - 5,
      lx + Math.cos(a1) * beamLen * 0.5, ty - 5 + Math.sin(a1) * beamLen * 0.5,
      lx + Math.cos(a2) * beamLen * 0.5, ty - 5 + Math.sin(a2) * beamLen * 0.5,
    );

    // Lighthouse glow circle
    gfx.fillStyle(0xFFFF44, nf * 0.5);
    gfx.fillCircle(lx, ty - 5, 6);
  }

  // ── Lighting updates ──────────────────────────────────────────────────────

  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightingElevation) < 0.002) return;
    this._lastLightingElevation = elevation;
    this._nightFactor = Math.max(0, Math.min(1, (0.1 - elevation) / 0.3));
    const nf = this._nightFactor;

    for (const l of this._dockLights) {
      (l as { intensity: number }).intensity = nf * 180;
    }
    for (const nl of this._nativeLights) nl.intensity = nf * 0.9;

    if (this._pierLight)  (this._pierLight as { intensity: number }).intensity  = nf * 120;
    if (this._cafeLight)  (this._cafeLight as { intensity: number }).intensity  = nf * 150;

    // Bonfire flicker is handled in update() — just enable/disable here
    if (this._bonfireLight && nf < 0.05) {
      (this._bonfireLight as { intensity: number }).intensity = 0;
    }

    // Lighthouse
    if (this._lighthouseSpot) this._lighthouseSpot.setIntensity(nf * 4.0);
    if (this._lighthouseGlow) (this._lighthouseGlow as { intensity: number }).intensity = nf * 200;

    // Buoy lights
    for (const l of this._buoyLights) {
      (l as { intensity: number }).intensity = nf * 70;
    }

    // Redraw people with new day/night alpha
    this.drawPeople(nf);
  }

  // ── Destroy ───────────────────────────────────────────────────────────────

  destroy(): void {
    for (const nl of this._nativeLights) this.scene.lights.removeLight(nl);
    this._nativeLights = [];
    this.waterBgGfx.destroy();
    this.structGfx.destroy();
    this.peopleGfx.destroy();
    this.fxGfx.destroy();
  }
}
