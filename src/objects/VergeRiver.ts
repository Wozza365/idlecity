import Phaser from 'phaser';
import { ROAD_H, VERGE_H, RIVER_H } from '../constants';
import type { LightSource } from '../lighting/LightingSystem';

// Cycle path occupies the bottom CYCLE_H pixels of the verge
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
  private vergeGfx:   Phaser.GameObjects.Graphics;
  private cyclistGfx: Phaser.GameObjects.Graphics;
  private shadowGfx:  Phaser.GameObjects.Graphics;
  private treeGfx:    Phaser.GameObjects.Graphics;

  private treeXs:    number[]      = [];
  private lampXs:    number[]      = [];
  private cyclists:  Cyclist[]     = [];
  private lampLights: LightSource[] = [];

  private _level:   number = 0;
  private _width:   number = 0;
  private _groundY: number = 0;

  get extraLights(): LightSource[] { return this.lampLights; }

  constructor(scene: Phaser.Scene) {
    this.vergeGfx   = scene.add.graphics().setDepth(6).setLighting(true);
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

    // ── Base verge ───────────────────────────────────────────────
    const gfx = this.vergeGfx;
    gfx.clear();
    this.drawBase(gfx, level, width, vergeY);

    // ── River ────────────────────────────────────────────────────
    gfx.fillStyle(0x1e5a9e, 1);
    gfx.fillRect(0, riverY, width, RIVER_H);
    gfx.fillStyle(0x2a6ab5, 1);
    gfx.fillRect(0, riverY + 3, width, RIVER_H - 3);
    gfx.fillStyle(0x4488cc, 0.3);
    for (let x = 0; x < width; x += 40) gfx.fillRect(x, riverY + 8, 24, 2);

    // ── Ordered feature layers ───────────────────────────────────
    if (level >= 8)  this.drawCyclePath(gfx, width, vergeY);
    if (level >= 13) this.drawPaving(gfx, width, vergeY);
    if (level >= 3)  this.drawWildflowers(gfx, level, width, vergeY);
    if (level >= 5)  this.drawFlowerBeds(gfx, level, width, vergeY);
    if (level >= 6)  this.drawBenches(gfx, level, width, vergeY);
    if (level >= 12) this.drawGardenBeds(gfx, width, vergeY);

    // ── Trees ────────────────────────────────────────────────────
    this.treeGfx.clear();
    if (level >= 4) {
      const { spacing } = treeGeom(level);
      this.treeXs = getPositions(width, spacing / 2, spacing);
      this.drawTrees(level, vergeY);
    } else {
      this.treeXs = [];
    }

    // ── Lamp posts ───────────────────────────────────────────────
    if (level >= 10) {
      this.lampXs = getPositions(width, 40, 80);
      this.drawLamps(level, vergeY);
    } else {
      this.lampXs = [];
    }

    // ── Street light sources (level 11+) ─────────────────────────
    this.lampLights = [];
    if (level >= 11) {
      const lampHeadY = groundY + ROAD_H - 30;
      for (const lx of this.lampXs) {
        const light: LightSource = {
          type: 'point', x: lx, y: lampHeadY,
          radius: 220, color: 0xffcc66, intensity: 0,
        };
        this.lampLights.push(light);
      }
    }

    // ── Cyclists ─────────────────────────────────────────────────
    if (level >= 9) {
      if (this.cyclists.length === 0) this.spawnCyclists(level, width);
    } else {
      this.cyclists = [];
      this.cyclistGfx.clear();
    }
  }

  // ── Base verge ──────────────────────────────────────────────────

  private drawBase(gfx: Phaser.GameObjects.Graphics, level: number, width: number, vergeY: number): void {
    if (level === 0) {
      gfx.fillStyle(0x8b7050, 1);
      gfx.fillRect(0, vergeY, width, VERGE_H);
      // Dirt texture
      gfx.fillStyle(0x7a5f3e, 0.45);
      for (let x = 0; x < width; x += 22) gfx.fillRect(x, vergeY + 5, 10, 4);
      for (let x = 11; x < width; x += 22) gfx.fillRect(x, vergeY + 18, 8, 3);
      for (let x = 5; x < width; x += 30) gfx.fillRect(x, vergeY + 30, 12, 3);
    } else if (level === 1) {
      gfx.fillStyle(0x8b7050, 1);
      gfx.fillRect(0, vergeY, width, VERGE_H);
      gfx.fillStyle(0x4a8c3a, 1);
      for (let x = 8; x < width; x += 28) {
        gfx.fillRect(x, vergeY + 6, 14, 10);
        if (x + 14 < width) gfx.fillRect(x + 14, vergeY + 22, 10, 8);
      }
    } else {
      const grassColor = level >= 14 ? 0x3d7a2e : 0x4a8c3a;
      gfx.fillStyle(grassColor, 1);
      gfx.fillRect(0, vergeY, width, VERGE_H);
      // Subtle shade at road edge
      gfx.fillStyle(0x000000, 0.06);
      gfx.fillRect(0, vergeY, width, 3);
    }
  }

  // ── Cycle path ──────────────────────────────────────────────────

  private drawCyclePath(gfx: Phaser.GameObjects.Graphics, width: number, vergeY: number): void {
    const cy = vergeY + VERGE_H - CYCLE_H;
    gfx.fillStyle(0xb22820, 0.78);
    gfx.fillRect(0, cy, width, CYCLE_H);
    gfx.fillStyle(0xd03428, 0.9);
    gfx.fillRect(0, cy, width, 1);
    gfx.fillStyle(0x7a1810, 0.9);
    gfx.fillRect(0, cy + CYCLE_H - 1, width, 1);
    // Centre dashes
    gfx.fillStyle(0xffffff, 0.3);
    const mid = cy + Math.floor(CYCLE_H / 2) - 1;
    for (let x = 0; x < width; x += 24) gfx.fillRect(x, mid, 10, 2);
  }

  // ── Wildflowers ──────────────────────────────────────────────────

  private drawWildflowers(gfx: Phaser.GameObjects.Graphics, level: number, width: number, vergeY: number): void {
    const colors = [0xff6b8a, 0xffee44, 0xff9144, 0xc080ff, 0x80deea, 0xffbb44];
    const bottomBand = level >= 8 ? VERGE_H - CYCLE_H : VERGE_H;
    const count = Math.floor(width / 16);
    for (let i = 0; i < count; i++) {
      const fx = ((i * 41 + 17) % Math.max(1, Math.floor(width) - 12)) + 6;
      const fy = vergeY + 10 + ((i * 19 + 7) % Math.max(1, bottomBand - 24));
      gfx.fillStyle(colors[i % colors.length], 0.88);
      gfx.fillCircle(fx, fy, 2);
      gfx.fillStyle(0xffffff, 0.25);
      gfx.fillCircle(fx - 1, fy - 1, 1);
    }
  }

  // ── Flower beds ──────────────────────────────────────────────────

  private drawFlowerBeds(gfx: Phaser.GameObjects.Graphics, level: number, width: number, vergeY: number): void {
    const bedColors = [0xff8fa3, 0xffd700, 0xff7835, 0xa088ff, 0x44e0b0];
    const { spacing } = treeGeom(level);
    const bedY = vergeY + VERGE_H - (level >= 8 ? CYCLE_H + 12 : 14);
    let ci = 0;
    for (let tx = spacing / 2; tx < width; tx += spacing) {
      const gx = Math.round(tx - spacing / 2 + 10);
      const gw = Math.round(spacing - 20);
      if (gw <= 0) continue;
      gfx.fillStyle(bedColors[ci % bedColors.length], 0.82);
      gfx.fillRect(gx, bedY, gw, 8);
      gfx.fillStyle(0xffffff, 0.2);
      for (let bx = gx + 5; bx < gx + gw - 4; bx += 10) gfx.fillCircle(bx, bedY + 4, 2);
      ci++;
    }
  }

  // ── Park benches ─────────────────────────────────────────────────

  private drawBenches(gfx: Phaser.GameObjects.Graphics, level: number, width: number, vergeY: number): void {
    const { spacing } = treeGeom(level);
    for (let tx = spacing; tx < width - spacing * 0.4; tx += spacing) {
      const bx = Math.round(tx);
      const by = vergeY + 20;
      // Seat slats
      gfx.fillStyle(0xc8a46e, 1);
      gfx.fillRect(bx - 9, by, 18, 3);
      gfx.fillRect(bx - 9, by - 4, 18, 2);
      // Back rest
      gfx.fillStyle(0xa8844e, 1);
      gfx.fillRect(bx - 9, by - 9, 18, 3);
      // Cast iron legs
      gfx.fillStyle(0x4a4a4a, 1);
      gfx.fillRect(bx - 7, by + 3, 3, 7);
      gfx.fillRect(bx + 4, by + 3, 3, 7);
    }
  }

  // ── Ornamental garden beds (level 12+) ───────────────────────────

  private drawGardenBeds(gfx: Phaser.GameObjects.Graphics, width: number, vergeY: number): void {
    const edgeColor = 0x8a6a40;
    const soilColor = 0x6b4c2a;
    gfx.fillStyle(soilColor, 0.5);
    gfx.fillRect(0, vergeY + 2, width, 6);
    gfx.fillStyle(edgeColor, 0.6);
    gfx.fillRect(0, vergeY + 2, width, 1);
    gfx.fillRect(0, vergeY + 7, width, 1);
    // Decorative stones
    gfx.fillStyle(0xb0a090, 0.55);
    for (let x = 6; x < width; x += 18) gfx.fillRect(x, vergeY + 3, 8, 4);
  }

  // ── Decorative paving (level 13+) ────────────────────────────────

  private drawPaving(gfx: Phaser.GameObjects.Graphics, width: number, vergeY: number): void {
    // Narrow stone walkway along road edge
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

  // ── Street trees (depth 8.5, above cars) ─────────────────────────

  private drawTrees(level: number, vergeY: number): void {
    const gfx = this.treeGfx;
    const { trunkH, canopyR } = treeGeom(level);
    const trunkBaseY = vergeY + 8;
    const trunkTopY  = trunkBaseY - trunkH;
    const canopyY    = trunkTopY;

    const trunkColor   = 0x5c3a1e;
    const shadowRing   = level >= 14 ? 0x1a3d1a : 0x1e4a1a;
    const canopyDark   = level >= 14 ? 0x2d6a4f : 0x336622;
    const canopyMid    = level >= 14 ? 0x3d8a6f : 0x4a8c32;
    const canopyLight  = level >= 14 ? 0x58b08a : 0x66cc44;

    for (const tx of this.treeXs) {
      // Trunk
      gfx.fillStyle(trunkColor, 1);
      gfx.fillRect(tx - 2, trunkTopY, 4, trunkH);
      // Root flare
      gfx.fillStyle(0x3a2410, 1);
      gfx.fillRect(tx - 3, trunkBaseY - 4, 6, 4);

      // Canopy drop shadow
      gfx.fillStyle(0x000000, 0.18);
      gfx.fillCircle(tx + 3, canopyY + 3, canopyR);

      // Canopy layers
      gfx.fillStyle(shadowRing, 1);
      gfx.fillCircle(tx, canopyY, canopyR);
      gfx.fillStyle(canopyDark, 1);
      gfx.fillCircle(tx - 1, canopyY - 1, Math.round(canopyR * 0.88));
      gfx.fillStyle(canopyMid, 1);
      gfx.fillCircle(tx - 3, canopyY - 3, Math.round(canopyR * 0.72));
      gfx.fillStyle(canopyLight, 0.65);
      gfx.fillCircle(tx - 5, canopyY - 5, Math.round(canopyR * 0.44));
    }
  }

  // ── Street lamp posts (depth 8.5) ────────────────────────────────

  private drawLamps(level: number, vergeY: number): void {
    const gfx = this.treeGfx;
    const poleH     = 38;
    const poleBaseY = vergeY + 8;
    const poleTopY  = poleBaseY - poleH;
    const poleColor = level >= 15 ? 0x6a5040 : 0x44566a;
    const headColor = level >= 15 ? 0xffd060 : 0xd0e0ee;
    const baseColor = level >= 15 ? 0x8a7060 : 0x607080;

    for (const lx of this.lampXs) {
      // Base plate
      gfx.fillStyle(baseColor, 1);
      gfx.fillRect(lx - 3, poleBaseY - 3, 6, 3);
      // Pole
      gfx.fillStyle(poleColor, 1);
      gfx.fillRect(lx - 1, poleTopY, 2, poleH - 3);
      // Arm extending right
      gfx.fillRect(lx, poleTopY + 2, 10, 2);
      // Lamp housing
      gfx.fillStyle(headColor, 1);
      gfx.fillEllipse(lx + 10, poleTopY + 3, 13, 7);
      // Lens highlight
      gfx.fillStyle(0xffffff, 0.4);
      gfx.fillEllipse(lx + 9, poleTopY + 2, 6, 3);
    }
  }

  // ── Cyclists ─────────────────────────────────────────────────────

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

      // Ground shadow
      gfx.fillStyle(0x000000, 0.2);
      gfx.fillEllipse(cx, pathMidY + 2, 10, 4);
      // Wheels
      gfx.fillStyle(0x1a1a2e, 1);
      gfx.fillCircle(cx - 4, pathMidY, 4);
      gfx.fillCircle(cx + 4, pathMidY, 4);
      gfx.fillStyle(0x808080, 0.5);
      gfx.fillCircle(cx - 4, pathMidY, 2);
      gfx.fillCircle(cx + 4, pathMidY, 2);
      // Frame bar
      gfx.fillStyle(0x888888, 1);
      gfx.fillRect(cx - 4, pathMidY - 1, 8, 2);
      // Body (jersey)
      gfx.fillStyle(c.color, 1);
      gfx.fillRect(cx - 2, bodyTop, 5, bh);
      // Helmet
      gfx.fillStyle(0x303040, 1);
      gfx.fillCircle(cx, bodyTop - 3, 4);
      gfx.fillStyle(c.color, 0.65);
      gfx.fillRect(cx - 2, bodyTop - 6, 4, 2);
    }
  }

  // ── Shadows (drawn on road surface at depth 7.1) ──────────────────

  updateShadows(sunAngle: number): void {
    const gfx = this.shadowGfx;
    gfx.clear();

    if (this.treeXs.length === 0 && this.lampXs.length === 0) return;

    const elevation = Math.sin(sunAngle);
    if (elevation <= 0.04) return;

    const vergeY   = this._groundY + ROAD_H;
    const leanRate = Math.cos(sunAngle) / Math.max(0.15, elevation);
    const alpha    = Math.min(0.32, elevation * 0.42);

    gfx.fillStyle(0x000000, alpha);

    const { trunkH, canopyR } = treeGeom(this._level);

    // Tree canopy shadows
    for (const tx of this.treeXs) {
      const trunkBaseY = vergeY + 8;
      const hw = canopyR * 0.7;
      const shadowH = Math.min(VERGE_H * 0.75, (trunkH + canopyR) * Math.pow(1 - Math.min(elevation, 1), 0.5));
      const shadBot = trunkBaseY + shadowH;
      const lean = leanRate * (shadowH + trunkH);
      gfx.fillTriangle(tx - hw, trunkBaseY, tx + hw, trunkBaseY, tx + hw + lean, shadBot);
      gfx.fillTriangle(tx - hw, trunkBaseY, tx + hw + lean, shadBot, tx - hw + lean, shadBot);
    }

    // Lamp post shadows
    if (this._level >= 10) {
      for (const lx of this.lampXs) {
        const poleBaseY = vergeY + 8;
        const poleH     = 38;
        const shadowH   = Math.min(VERGE_H * 0.6, poleH * Math.pow(1 - Math.min(elevation, 1), 0.55));
        const shadBot   = poleBaseY + shadowH;
        const lean      = leanRate * (shadowH + poleH);
        gfx.fillTriangle(lx - 1, poleBaseY, lx + 1, poleBaseY, lx + 1 + lean, shadBot);
        gfx.fillTriangle(lx - 1, poleBaseY, lx + 1 + lean, shadBot, lx - 1 + lean, shadBot);
      }
    }
  }

  // ── Day/night lamp glow ───────────────────────────────────────────

  updateLighting(elevation: number): void {
    if (this.lampLights.length === 0) return;
    const nightFactor = Math.max(0, Math.min(1, -elevation * 4 + 0.3));
    for (const l of this.lampLights) {
      (l as { intensity: number }).intensity = nightFactor * 1.6;
    }
  }

  destroy(): void {
    this.vergeGfx.destroy();
    this.cyclistGfx.destroy();
    this.shadowGfx.destroy();
    this.treeGfx.destroy();
  }
}
