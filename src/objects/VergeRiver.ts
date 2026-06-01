import Phaser from 'phaser';
import { ROAD_H, VERGE_H, RIVER_H } from '../constants';
import { SoftSpotLight } from '../lighting/SoftSpotLight';
import type { LightSource } from '../lighting/LightingSystem';

const CYCLE_H = 14;

function treeGeom(level: number) {
  if (level >= 14) return { trunkH: 30, canopyR: 21, spacing: 80 };
  if (level >= 7)  return { trunkH: 24, canopyR: 16, spacing: 80 };
  return               { trunkH: 18, canopyR: 11, spacing: 80 };
}

function getPositions(width: number, start: number, spacing: number): number[] {
  const arr: number[] = [];
  for (let x = start; x < width; x += spacing) arr.push(Math.round(x));
  return arr;
}

const CYCLIST_COLORS = [0x4ecdc4, 0xff6b6b, 0x95e77e, 0xffd93d, 0xc77dff, 0xff9f43];

interface Cyclist { x: number; speed: number; dir: 1 | -1; color: number; }

export class VergeRiver {
  private readonly scene: Phaser.Scene;
  private vergeGfx:   Phaser.GameObjects.Graphics;
  private flowerGfx:  Phaser.GameObjects.Graphics;
  private cyclistGfx: Phaser.GameObjects.Graphics;
  private shadowGfx:  Phaser.GameObjects.Graphics;
  private treeGfx:    Phaser.GameObjects.Graphics;

  private treeXs:    number[]      = [];
  private lampXs:    number[]      = [];
  private cyclists:  Cyclist[]     = [];

  private lampSpots:        SoftSpotLight[]                              = [];
  private lampBulbs:        Array<Extract<LightSource, { type?: 'point' }>> = [];
  private lampLights:       LightSource[]                                = [];
  private lampNativeLights: Phaser.GameObjects.Light[]                  = [];

  private bollardBulbs:        Array<Extract<LightSource, { type?: 'point' }>> = [];
  private bollardLights:       LightSource[]                                = [];
  private bollardNativeLights: Phaser.GameObjects.Light[]                  = [];

  private _level:   number = 0;
  private _width:   number = 0;
  private _groundY: number = 0;
  private _lastLightingElevation = NaN;

  get extraLights(): LightSource[] { return [...this.lampLights, ...this.bollardLights]; }

  constructor(scene: Phaser.Scene) {
    this.scene      = scene;
    this.vergeGfx   = scene.add.graphics().setDepth(6).setLighting(true);
    this.flowerGfx  = scene.add.graphics().setDepth(6.1); // no lighting — preserves true flower colours
    this.cyclistGfx = scene.add.graphics().setDepth(6.5).setLighting(true);
    this.shadowGfx  = scene.add.graphics().setDepth(7.1);
    this.treeGfx    = scene.add.graphics().setDepth(8.5).setLighting(true);
  }

  render(level: number, width: number, groundY: number): void {
    this._level   = level;
    this._width   = width;
    this._groundY = groundY;

    const vergeY = groundY + ROAD_H;
    const riverY = vergeY + VERGE_H;

    const gfx = this.vergeGfx;
    gfx.clear();
    this.flowerGfx.clear();
    this.drawBase(gfx, level, width, vergeY);

    // River
    gfx.fillStyle(0x1e5a9e, 1);
    gfx.fillRect(0, riverY, width, RIVER_H);
    gfx.fillStyle(0x2a6ab5, 1);
    gfx.fillRect(0, riverY + 3, width, RIVER_H - 3);
    gfx.fillStyle(0x4488cc, 0.3);
    for (let x = 0; x < width; x += 40) gfx.fillRect(x, riverY + 8, 24, 2);

    if (level >= 8)  this.drawCyclePath(gfx, width, vergeY);
    if (level >= 9)  this.drawBollards(gfx, width, vergeY);
    if (level >= 13) this.drawPaving(gfx, width, vergeY);
    // Wildflowers only before flower beds take over (levels 3–4)
    if (level >= 3 && level <= 4) this.drawWildflowers(gfx, level, width, vergeY);
    if (level >= 5)  this.drawFlowerBeds(this.flowerGfx, level, width, vergeY);
    if (level >= 6)  this.drawBenches(gfx, level, width, vergeY);

    this.treeGfx.clear();
    if (level >= 4) {
      const { spacing } = treeGeom(level);
      this.treeXs = getPositions(width, spacing / 2, spacing);
      this.drawTrees(level, vergeY);
    } else {
      this.treeXs = [];
    }

    // Lamps sit between trees: start at one full spacing instead of half
    if (level >= 10) {
      const { spacing } = treeGeom(level);
      this.lampXs = getPositions(width, spacing, spacing);
      this.drawLamps(level, vergeY);
    } else {
      this.lampXs = [];
    }

    // Remove stale native lights before recreating
    for (const l of this.lampNativeLights)    this.scene.lights.removeLight(l);
    for (const l of this.bollardNativeLights) this.scene.lights.removeLight(l);
    this.lampNativeLights    = [];
    this.bollardNativeLights = [];

    // Spot + bulb lights for each lamp (level 11+)
    this.lampSpots  = [];
    this.lampBulbs  = [];
    this.lampLights = [];
    if (level >= 11) {
      // Head sits just above the cycle lane
      const lampHeadY = groundY + ROAD_H + VERGE_H - CYCLE_H - 17;
      for (const lx of this.lampXs) {
        const armX = lx + 8;
        const spot = new SoftSpotLight({
          x: armX, y: lampHeadY,
          radius: 51, color: 0xffcc66, intensity: 0,
          angle: Math.PI / 2,       // pointing straight down
          coneAngle: Math.PI / 3.06, // ~59° cone
          noOcclusion: true,
        });
        const bulb: Extract<LightSource, { type?: 'point' }> = {
          x: lx + 8, y: lampHeadY, radius: 2,
          color: 0xfffae0, intensity: 0, noOcclusion: true,
        };
        this.lampSpots.push(spot);
        this.lampBulbs.push(bulb);
        this.lampLights.push(...spot.beams, bulb);
        // Native Phaser light so .setLighting(true) geometry gets warm tint
        this.lampNativeLights.push(this.scene.lights.addLight(armX, lampHeadY, 60, 0xffcc66, 0));
      }
    }

    // Bollard path lights (level 9+, Boulevard tier) — omni point lights
    this.bollardBulbs  = [];
    this.bollardLights = [];
    if (level >= 9) {
      const bollardHeadY = groundY + ROAD_H + 12;
      const bollardXs    = getPositions(width, 20, 40);
      for (const bx of bollardXs) {
        const point: Extract<LightSource, { type?: 'point' }> = {
          x: bx, y: bollardHeadY, radius: 18,
          color: 0xffcc66, intensity: 0, noOcclusion: true,
        };
        this.bollardBulbs.push(point);
        this.bollardLights.push(point);
        this.bollardNativeLights.push(this.scene.lights.addLight(bx, bollardHeadY, 18, 0xffcc66, 0));
      }
    }

    if (level >= 9) {
      if (this.cyclists.length === 0) this.spawnCyclists(level, width);
    } else {
      this.cyclists = [];
      this.cyclistGfx.clear();
    }
  }

  // ── Base ──────────────────────────────────────────────────────────

  private drawBase(gfx: Phaser.GameObjects.Graphics, level: number, width: number, vergeY: number): void {
    if (level === 0) {
      // Earthy base — mirrors road dirt style, spanning full verge height
      gfx.fillStyle(0x7a5a35, 1);
      gfx.fillRect(0, vergeY, width, VERGE_H);
      const dc = [0x9a7050, 0xb08060, 0x7a5530, 0xc89060, 0x4a3018, 0x8a6040, 0xd0a870];
      const rowCount = Math.ceil(VERGE_H / 7);
      for (let row = 0; row < rowCount; row++) {
        const baseY = vergeY + 3 + row * 7;
        let px = Math.imul(row, 127) % 23;
        while (px < width) {
          const h = (Math.imul(px, 374761393) ^ Math.imul(row, 668265261)) >>> 0;
          const a = h & 0xff;
          const b = (h >> 8) & 0xff;
          gfx.fillStyle(dc[a % dc.length], 1);
          const size = 1 + a % 3;
          if (b & 1) gfx.fillCircle(px, baseY + (b % 5) - 2, size);
          else gfx.fillRect(px - 1, baseY + (b % 5) - 2, size + 1, size);
          px += 14 + (b >> 2) % 16;
        }
      }
    } else if (level === 1) {
      // Patchy grass: soil base with organic grass patches spanning full height
      gfx.fillStyle(0x7a5a35, 1);
      gfx.fillRect(0, vergeY, width, VERGE_H);
      // Large irregular grass patches at varying Y positions
      gfx.fillStyle(0x4a8c3a, 1);
      const patchCount = Math.floor(width / 14);
      for (let i = 0; i < patchCount; i++) {
        const px = ((i * 41 + 17) % Math.max(1, Math.floor(width) - 16)) + 8;
        const py = vergeY + 3 + ((i * 23 + 7) % (VERGE_H - 10));
        const pw = 8 + (i * 11) % 10;
        const ph = 5 + (i * 7) % 7;
        gfx.fillRect(px, py, pw, ph);
      }
      // Darker secondary patches for depth
      gfx.fillStyle(0x3a7a2a, 1);
      const darkCount = Math.floor(width / 22);
      for (let i = 0; i < darkCount; i++) {
        const px = ((i * 67 + 31) % Math.max(1, Math.floor(width) - 14)) + 7;
        const py = vergeY + 5 + ((i * 37 + 11) % (VERGE_H - 12));
        gfx.fillRect(px, py, 5 + (i * 9) % 7, 3);
      }
      // Sparse soil-showing cracks between patches
      gfx.fillStyle(0x5a4025, 0.45);
      for (let i = 0; i < Math.floor(width / 40); i++) {
        const px = ((i * 89 + 13) % Math.max(1, Math.floor(width) - 8)) + 4;
        const py = vergeY + 6 + ((i * 53) % (VERGE_H - 14));
        gfx.fillRect(px, py, 1 + (i % 3), 3 + (i % 5));
      }
    } else {
      const grassColor = level >= 14 ? 0x3d7a2e : 0x4a8c3a;
      gfx.fillStyle(grassColor, 1);
      gfx.fillRect(0, vergeY, width, VERGE_H);
      gfx.fillStyle(0x000000, 0.06);
      gfx.fillRect(0, vergeY, width, 3);
    }
  }

  // ── Cycle path ────────────────────────────────────────────────────

  private drawCyclePath(gfx: Phaser.GameObjects.Graphics, width: number, vergeY: number): void {
    const cy = vergeY + VERGE_H - CYCLE_H;
    gfx.fillStyle(0xb22820, 0.78);
    gfx.fillRect(0, cy, width, CYCLE_H);
    gfx.fillStyle(0xd03428, 0.9);
    gfx.fillRect(0, cy, width, 1);
    gfx.fillStyle(0x7a1810, 0.9);
    gfx.fillRect(0, cy + CYCLE_H - 1, width, 1);
    gfx.fillStyle(0xffffff, 0.3);
    const mid = cy + Math.floor(CYCLE_H / 2) - 1;
    for (let x = 0; x < width; x += 24) gfx.fillRect(x, mid, 10, 2);
  }

  // ── Boulevard bollards (level 9+) ────────────────────────────────

  private drawBollards(gfx: Phaser.GameObjects.Graphics, width: number, vergeY: number): void {
    // Sit on the paved boulevard strip (vergeY+10, height 9)
    const pathBaseY = vergeY + 19;
    const poleH     = 3;
    const capH      = 2;
    const poleTopY  = pathBaseY - poleH - capH;

    for (let bx = 20; bx < width; bx += 40) {
      // Pole
      gfx.fillStyle(0x111111, 1);
      gfx.fillRect(bx - 1, poleTopY + capH, 2, poleH);
      // Cap housing
      gfx.fillStyle(0x1e1e1e, 1);
      gfx.fillRect(bx - 2, poleTopY, 4, capH);
      // Tiny warm lens dot
      gfx.fillStyle(0xfff0b0, 0.7);
      gfx.fillRect(bx, poleTopY, 1, 1);
    }
  }

  // ── Wildflowers ───────────────────────────────────────────────────

  private drawWildflowers(gfx: Phaser.GameObjects.Graphics, level: number, width: number, vergeY: number): void {
    const petalColors = [0xff6b8a, 0xffee44, 0xff9144, 0xcc88ff, 0x80deea, 0xffcc44, 0xff88bb, 0xaaee66];
    const bottomBand  = level >= 8 ? VERGE_H - CYCLE_H : VERGE_H;
    const count       = Math.floor(width / 14);
    for (let i = 0; i < count; i++) {
      const fx = ((i * 41 + 17) % Math.max(1, Math.floor(width) - 10)) + 5;
      const fy = vergeY + 12 + ((i * 19 + 7) % Math.max(1, bottomBand - 26));
      // Stem
      gfx.fillStyle(0x3a7a2a, 0.7);
      gfx.fillRect(fx, fy + 2, 1, 5);
      // Outer petals ring
      const petal = petalColors[i % petalColors.length];
      gfx.fillStyle(petal, 0.85);
      gfx.fillCircle(fx, fy, 3);
      // Centre dot
      gfx.fillStyle(0xffee88, 0.9);
      gfx.fillCircle(fx, fy, 1);
    }
  }

  // ── Flower beds ───────────────────────────────────────────────────

  private drawFlowerBeds(gfx: Phaser.GameObjects.Graphics, level: number, width: number, vergeY: number): void {
    const allColors = [
      0xff1155, 0xff4488, 0xff77aa,  // roses
      0x00ccff, 0x33bbff, 0x0099ff,  // sky blue
      0xffcc00, 0xffaa00, 0xffee22,  // sunflowers
      0x00ffcc, 0x00ddbb, 0x44ffdd,  // teal
      0xff5500, 0xff7700, 0xff9922,  // marigolds
      0x88ff00, 0xaaff33, 0x66ee00,  // lime green
      0xff00bb, 0xff33cc, 0xff66dd,  // magenta
      0xaa33ff, 0xcc66ff, 0x8811ee,  // purple
    ];
    const { spacing } = treeGeom(level);
    const bottomBand = level >= 8 ? CYCLE_H + 14 : 14;
    const bedTop = vergeY + VERGE_H - bottomBand - 18;
    const bedH   = 16;

    for (let tx = spacing / 2; tx < width; tx += spacing * 2) {
      const gx = Math.round(tx - spacing / 2 + 14);
      const gw = Math.round(spacing - 28);
      if (gw <= 0) continue;

      // Soil base
      gfx.fillStyle(0x4a3010, 0.72);
      gfx.fillRect(gx, bedTop, gw, bedH);
      gfx.fillStyle(0x7a5828, 0.35);
      gfx.fillRect(gx, bedTop, gw, 1);

      const rows = [
        { y: bedTop + 4,  r: 3, step: 6, offset: 0 },
        { y: bedTop + 9,  r: 3, step: 6, offset: 3 },
        { y: bedTop + 13, r: 3, step: 6, offset: 0 },
      ];

      for (const row of rows) {
        for (let fx = gx + row.offset + 3; fx < gx + gw - 3; fx += row.step) {
          const h = (Math.imul(fx | 0, 374761393) ^ Math.imul(row.y | 0, 668265261)) >>> 0;
          gfx.fillStyle(allColors[h % allColors.length], 0.77);
          gfx.fillCircle(fx, row.y, row.r);
          gfx.fillStyle(0xffffff, 0.4);
          gfx.fillCircle(fx - 1, row.y - 1, 1);
        }
      }

      // Edging border
      gfx.fillStyle(0x6a4818, 0.75);
      gfx.fillRect(gx, bedTop + bedH - 1, gw, 1);
    }
  }

  // ── Park benches ──────────────────────────────────────────────────

  private drawBenches(gfx: Phaser.GameObjects.Graphics, level: number, width: number, vergeY: number): void {
    const { spacing } = treeGeom(level);
    for (let tx = spacing * 1.5; tx < width - spacing * 0.4; tx += spacing * 2) {
      const bx = Math.round(tx);
      const by = vergeY + 22;

      // Seat (30 px wide, 4 px tall)
      gfx.fillStyle(0xc8a46e, 1);
      gfx.fillRect(bx - 15, by, 30, 4);
      // Seat slat lines
      gfx.fillStyle(0x8a6030, 0.35);
      gfx.fillRect(bx - 5, by, 1, 4);
      gfx.fillRect(bx + 4, by, 1, 4);

      // Back rest (same width, 3 px tall, 5 px above seat)
      gfx.fillStyle(0xb08848, 1);
      gfx.fillRect(bx - 15, by - 6, 30, 3);

      // Cast-iron legs (2 each side)
      gfx.fillStyle(0x4a4a4a, 1);
      gfx.fillRect(bx - 13, by + 4, 3, 5);
      gfx.fillRect(bx + 10, by + 4, 3, 5);
    }
  }

  // ── Decorative paving (level 13+) ─────────────────────────────────

  private drawPaving(gfx: Phaser.GameObjects.Graphics, width: number, vergeY: number): void {
    const pathY = vergeY + 10;
    const pathH = 9;
    gfx.fillStyle(0xbcb0a0, 0.55);
    gfx.fillRect(0, pathY, width, pathH);
    gfx.fillStyle(0x706050, 0.3);
    for (let x = 0; x < width; x += 18) gfx.fillRect(x, pathY, 1, pathH);
    gfx.fillRect(0, pathY + 4, width, 1);
    gfx.fillRect(0, pathY, width, 1);
    gfx.fillRect(0, pathY + pathH - 1, width, 1);
  }

  // ── Street trees (depth 8.5) ──────────────────────────────────────

  private drawTrees(level: number, vergeY: number): void {
    const gfx = this.treeGfx;
    const { trunkH, canopyR } = treeGeom(level);
    const trunkBaseY = vergeY + 8;
    const trunkTopY  = trunkBaseY - trunkH;
    const canopyY    = trunkTopY;

    const trunkColor  = 0x5c3a1e;
    const shadowRing  = level >= 14 ? 0x152808 : 0x1e4a1a;
    const canopyDark  = level >= 14 ? 0x234e10 : 0x336622;
    const canopyMid   = level >= 14 ? 0x347020 : 0x4a8c32;
    const canopyLight = level >= 14 ? 0x4ea030 : 0x66cc44;

    for (const tx of this.treeXs) {
      gfx.fillStyle(trunkColor, 1);
      gfx.fillRect(tx - 2, trunkTopY, 4, trunkH);
      gfx.fillStyle(0x3a2410, 1);
      gfx.fillRect(tx - 3, trunkBaseY - 4, 6, 4);

      gfx.fillStyle(0x000000, 0.18);
      gfx.fillCircle(tx + 3, canopyY + 3, canopyR);

      gfx.fillStyle(shadowRing, 1);
      gfx.fillCircle(tx, canopyY, canopyR);
      gfx.fillStyle(canopyDark, 1);
      gfx.fillCircle(tx - 1, canopyY - 1, Math.round(canopyR * 0.88));
      gfx.fillStyle(canopyMid, 1);
      gfx.fillCircle(tx - 3, canopyY - 3, Math.round(canopyR * 0.72));
      gfx.fillStyle(canopyLight, 0.65);
      gfx.fillCircle(tx - 5, canopyY - 5, Math.round(canopyR * 0.44));

      // Mature trees: extra secondary clusters for a fuller, irregular crown
      if (level >= 14) {
        gfx.fillStyle(canopyDark, 0.85);
        gfx.fillCircle(tx - Math.round(canopyR * 0.65), canopyY + Math.round(canopyR * 0.35), Math.round(canopyR * 0.42));
        gfx.fillCircle(tx + Math.round(canopyR * 0.58), canopyY + Math.round(canopyR * 0.28), Math.round(canopyR * 0.38));
        gfx.fillStyle(canopyMid, 0.7);
        gfx.fillCircle(tx + Math.round(canopyR * 0.45), canopyY - Math.round(canopyR * 0.4), Math.round(canopyR * 0.32));
      }
    }
  }

  // ── Lamp posts (depth 8.5) ────────────────────────────────────────

  private drawLamps(level: number, vergeY: number): void {
    const gfx = this.treeGfx;
    // Short cycle-lane bollard: base at cycle lane edge, head just above it
    const cycleTopY = vergeY + VERGE_H - CYCLE_H;
    const poleH     = 19;
    const poleBaseY = cycleTopY;
    const poleTopY  = poleBaseY - poleH;
    const armLen    = 8;
    const poleColor = level >= 15 ? 0x5c4a38 : 0x555555;
    const headColor = level >= 15 ? 0x6a5a40 : 0x444444;
    const baseColor = level >= 15 ? 0x7a6a50 : 0x3a3a3a;

    for (const lx of this.lampXs) {
      // Base plate
      gfx.fillStyle(baseColor, 1);
      gfx.fillRect(lx - 2, poleBaseY - 2, 4, 2);
      // Pole
      gfx.fillStyle(poleColor, 1);
      gfx.fillRect(lx - 1, poleTopY, 2, poleH - 2);
      // Arm
      gfx.fillRect(lx, poleTopY + 1, armLen, 2);
      // Lamp head housing (mirrors for-sale sign lamp style)
      const hx = lx + armLen - 3;
      gfx.fillStyle(headColor, 1);
      gfx.fillRect(hx, poleTopY, 7, 4);
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(hx - 1, poleTopY + 3, 9, 1);
      gfx.fillStyle(0x666666, 1);
      gfx.fillRect(hx + 1, poleTopY + 1, 5, 1);
    }
  }

  // ── Cyclists ──────────────────────────────────────────────────────

  private spawnCyclists(level: number, width: number): void {
    const count = Math.min(2 + Math.floor(level / 4), 6);
    this.cyclists = [];
    for (let i = 0; i < count; i++) {
      this.cyclists.push({
        x: (width * (i + 1)) / (count + 1),
        speed: 32 + (i % 3) * 15,
        dir: i % 2 === 0 ? 1 : -1,
        color: CYCLIST_COLORS[i % CYCLIST_COLORS.length],
      });
    }
  }

  updateCyclists(delta: number): void {
    if (this._level < 9 || this.cyclists.length === 0) {
      this.cyclistGfx.clear();
      return;
    }

    const vergeY   = this._groundY + ROAD_H;
    const pathTopY = vergeY + VERGE_H - CYCLE_H;
    const pathMidY = pathTopY + Math.floor(CYCLE_H / 2);
    const dt       = delta / 1000;

    for (const c of this.cyclists) {
      c.x += c.speed * c.dir * dt;
      if (c.x > this._width + 60) c.x = -60;
      if (c.x < -60)              c.x = this._width + 60;
    }

    const gfx = this.cyclistGfx;
    gfx.clear();

    for (const c of this.cyclists) {
      const cx = c.x;
      const bh = 9;
      const bodyTop = pathMidY - bh;

      gfx.fillStyle(0x000000, 0.2);
      gfx.fillEllipse(cx, pathMidY + 2, 10, 4);
      gfx.fillStyle(0x1a1a2e, 1);
      gfx.fillCircle(cx - 4, pathMidY, 4);
      gfx.fillCircle(cx + 4, pathMidY, 4);
      gfx.fillStyle(0x808080, 0.5);
      gfx.fillCircle(cx - 4, pathMidY, 2);
      gfx.fillCircle(cx + 4, pathMidY, 2);
      gfx.fillStyle(0x888888, 1);
      gfx.fillRect(cx - 4, pathMidY - 1, 8, 2);
      gfx.fillStyle(c.color, 1);
      gfx.fillRect(cx - 2, bodyTop, 5, bh);
      gfx.fillStyle(0x303040, 1);
      gfx.fillCircle(cx, bodyTop - 3, 4);
      gfx.fillStyle(c.color, 0.65);
      gfx.fillRect(cx - 2, bodyTop - 6, 4, 2);
    }
  }

  // ── Shadows (depth 7.1) ───────────────────────────────────────────

  updateShadows(sunAngle: number): void {
    const gfx = this.shadowGfx;
    gfx.clear();

    if (this.treeXs.length === 0) return;

    const elevation = Math.sin(sunAngle);
    if (elevation <= 0.04) return;

    const vergeY   = this._groundY + ROAD_H;
    const leanRate = Math.cos(sunAngle) / Math.max(0.15, elevation);
    const alpha    = Math.min(0.32, elevation * 0.42);

    gfx.fillStyle(0x000000, alpha);

    const { canopyR } = treeGeom(this._level);
    for (const tx of this.treeXs) {
      const trunkBaseY = vergeY + 10;
      // Ellipse stretched slightly in the direction of the sun
      const shadowW = canopyR * 1.8 + Math.abs(leanRate) * 4;
      const offsetX = leanRate * 3;
      gfx.fillEllipse(tx + offsetX, trunkBaseY, shadowW, canopyR * 0.55);
    }

  }

  // ── Day/night lamp glow ───────────────────────────────────────────

  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightingElevation) < 0.002) return;
    this._lastLightingElevation = elevation;
    const nightFactor = Math.max(0, Math.min(1, (0.1 - elevation) / 0.3));

    for (const spot of this.lampSpots) spot.setIntensity(nightFactor * 3.5);
    for (const bulb of this.lampBulbs)    (bulb as { intensity: number }).intensity = nightFactor * 300;
    for (const l    of this.lampNativeLights) l.intensity = nightFactor * 1.4;

    for (const bulb of this.bollardBulbs) (bulb as { intensity: number }).intensity = nightFactor * 2.0;
    for (const l    of this.bollardNativeLights) l.intensity = nightFactor * 0.7;

    // flowerGfx skips the Light2D pipeline so manually darken it to match the verge
    this.flowerGfx.setAlpha(1.0 - nightFactor * 0.78);
  }

  destroy(): void {
    for (const l of this.lampNativeLights)    this.scene.lights.removeLight(l);
    for (const l of this.bollardNativeLights) this.scene.lights.removeLight(l);
    this.vergeGfx.destroy();
    this.flowerGfx.destroy();
    this.cyclistGfx.destroy();
    this.shadowGfx.destroy();
    this.treeGfx.destroy();
  }
}
