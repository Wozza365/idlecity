import Phaser from 'phaser';
import { dimColor } from '../../constants';
import { SoftSpotLight } from '../../lighting/SoftSpotLight';
import type { LightSource } from '../../lighting/LightingSystem';
import {
  PIER_KEY, PIER_ORIGIN_X, PIER_ORIGIN_Y,
  CAFE_KEY, CAFE_ORIGIN_X, CAFE_ORIGIN_Y,
  HUT_KEY, HUT_ORIGIN_X, HUT_ORIGIN_Y,
  DOCK_PLANK_KEY,
  DOCK_POST_KEY, DOCK_POST_ORIGIN_X, DOCK_POST_ORIGIN_Y,
  DOCK_BOLLARD_KEY, DOCK_BOLLARD_ORIGIN_X, DOCK_BOLLARD_ORIGIN_Y,
  BUOY_RED_KEY, BUOY_ORANGE_KEY, BUOY_ORIGIN_X, BUOY_ORIGIN_Y,
} from '../WaterStructureAssets';

const BEACH_SHORE_H = 48;  // depth of sandy beach area — matches WaterArea's

// Pier (level 3+), beach café (level 4+), dock/harbour (level 5+), lifeguard
// hut + buoys (level 7+) — shared structures + their lights/shadows/glows.
// Extracted from WaterArea so the latter only needs to call render/update/
// updateShadows/updateLighting/drawFx/getDockSlots/destroy and merge in
// extraLights.
export class PierAndStructures {
  private readonly scene: Phaser.Scene;

  private structGfx: Phaser.GameObjects.Graphics; // 5.7 – pier, dock, café, hut

  private _level   = 0;
  private _width   = 0;
  private _waterY  = 0;
  private _pierX   = 0;
  private _cafeX   = 16;
  private _dockX1  = 0;
  private _dockX2  = 0;

  private _pierImg: Phaser.GameObjects.Image | null = null;
  private _cafeImg: Phaser.GameObjects.Image | null = null;
  private _hutImg: Phaser.GameObjects.Image | null = null;
  private _dockSlots: number[] = [];
  private _dockDeckTile: Phaser.GameObjects.TileSprite | null = null;
  private _dockPostImgs: Phaser.GameObjects.Image[] = [];
  private _dockBollardImgs: Phaser.GameObjects.Image[] = [];

  // Dock glow lights (positions populated in drawDock, rendered in drawFx)
  private _dockGlows: Array<{ x: number; y: number; bright?: boolean }> = [];

  // Buoys
  private _buoys: Array<{ x: number; y: number; color: number; phase: number }> = [];
  private _buoyImgs: Phaser.GameObjects.Image[] = [];

  // Lighting — using SoftSpotLight + bulbs like verge lamps
  private _dockSpots:  SoftSpotLight[] = [];
  private _dockBulbs:  Array<Extract<LightSource, { type?: 'point' }>> = [];
  private _cafeSpot:   SoftSpotLight | null = null;
  private _cafeBulb:   Extract<LightSource, { type?: 'point' }> | null = null;
  private _pierSpot:   SoftSpotLight | null = null;
  private _pierBulb:   Extract<LightSource, { type?: 'point' }> | null = null;
  private _buoyBulbs:  Array<Extract<LightSource, { type?: 'point' }>> = [];
  private _nativeLights: Phaser.GameObjects.Light[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.structGfx = scene.add.graphics().setDepth(5.7).setLighting(true);
  }

  get extraLights(): LightSource[] {
    const out: LightSource[] = [];
    for (const s of this._dockSpots) out.push(...s.beams);
    for (const b of this._dockBulbs) out.push(b);
    if (this._cafeSpot) out.push(...this._cafeSpot.beams);
    if (this._cafeBulb) out.push(this._cafeBulb);
    if (this._pierSpot) out.push(...this._pierSpot.beams);
    if (this._pierBulb) out.push(this._pierBulb);
    for (const b of this._buoyBulbs) out.push(b);
    return out;
  }

  getDockSlots(): number[] { return [...this._dockSlots]; }

  render(level: number, width: number, waterY: number, pierX: number, cafeX: number, dockX1: number, dockX2: number): void {
    this._level  = level;
    this._width  = width;
    this._waterY = waterY;
    this._pierX  = pierX;
    this._cafeX  = cafeX;
    this._dockX1 = dockX1;
    this._dockX2 = dockX2;
    this._dockSlots = [];

    this.structGfx.clear();

    if (level >= 3) this.drawPier(); else this._pierImg?.setVisible(false);
    if (level >= 4) this.drawBeachCafe(); else this._cafeImg?.setVisible(false);
    if (level >= 5) this.drawDock();
    else {
      this._dockGlows = [];
      this._dockDeckTile?.setVisible(false);
      for (const img of this._dockPostImgs) img.destroy();
      this._dockPostImgs = [];
      for (const img of this._dockBollardImgs) img.destroy();
      this._dockBollardImgs = [];
    }
    if (level >= 7) { this.drawLifeguardHut(); this.setupBuoys(); }
    else {
      this._buoys = [];
      this._hutImg?.setVisible(false);
      for (const img of this._buoyImgs) img.destroy();
      this._buoyImgs = [];
    }

    this.rebuildLights();
  }

  // ── Pier (level 3+) ───────────────────────────────────────────────────────

  private drawPier(): void {
    const { _waterY: wy, _pierX: px } = this;

    if (!this._pierImg) {
      this._pierImg = this.scene.add.image(px, wy, PIER_KEY)
        .setOrigin(PIER_ORIGIN_X, PIER_ORIGIN_Y)
        .setDepth(5.7);
    } else {
      this._pierImg.setPosition(px, wy).setVisible(true);
    }
  }

  // ── Beach café (level 4+) ─────────────────────────────────────────────────

  private drawBeachCafe(): void {
    const { _waterY: wy, _cafeX: cx } = this;

    if (!this._cafeImg) {
      this._cafeImg = this.scene.add.image(cx, wy, CAFE_KEY)
        .setOrigin(CAFE_ORIGIN_X, CAFE_ORIGIN_Y)
        .setDepth(5.7);
    } else {
      this._cafeImg.setPosition(cx, wy).setVisible(true);
    }
  }

  // ── Dock / harbour (level 5+) ─────────────────────────────────────────────

  private drawDock(): void {
    const gfx = this.structGfx;
    const { _waterY: wy, _dockX1: dx1, _dockX2: dx2 } = this;
    const dockW   = dx2 - dx1;
    const deckEnd = wy + BEACH_SHORE_H;  // wy+48: matches beach height

    // Wood-plank deck, tiled across the dock width
    if (!this._dockDeckTile) {
      this._dockDeckTile = this.scene.add.tileSprite(dx1, wy, dockW, BEACH_SHORE_H, DOCK_PLANK_KEY)
        .setOrigin(0, 0)
        .setDepth(5.699);
    } else {
      this._dockDeckTile.setPosition(dx1, wy).setSize(dockW, BEACH_SHORE_H).setVisible(true);
    }

    // Posts/pilings — visible wood above the waterline, fading into shadow below
    for (const img of this._dockPostImgs) img.destroy();
    this._dockPostImgs = [];
    const postXs: number[] = [];
    for (let bx2 = dx1 + 14; bx2 < dx2 - 8; bx2 += 22) postXs.push(bx2);
    postXs.push(dx2 - 4); // right-edge post
    for (const px of postXs) {
      this._dockPostImgs.push(
        this.scene.add.image(px, deckEnd, DOCK_POST_KEY)
          .setOrigin(DOCK_POST_ORIGIN_X, DOCK_POST_ORIGIN_Y)
          .setDepth(5.699),
      );
    }

    // Right-edge wall — slightly darker strip to give the dock a natural side face
    gfx.fillStyle(0x7A5828, 1);
    gfx.fillRect(dx2 - 4, wy, 4, deckEnd - wy);
    // Inner shadow line against the right wall
    gfx.fillStyle(0x000000, 0.15);
    gfx.fillRect(dx2 - 5, wy, 1, deckEnd - wy);

    // Mooring bollards along top edge
    for (const img of this._dockBollardImgs) img.destroy();
    this._dockBollardImgs = [];
    for (const x of [dx1 + 14, dx1 + Math.floor(dockW / 2), dx2 - 18]) {
      this._dockBollardImgs.push(
        this.scene.add.image(x, wy, DOCK_BOLLARD_KEY)
          .setOrigin(DOCK_BOLLARD_ORIGIN_X, DOCK_BOLLARD_ORIGIN_Y)
          .setDepth(5.701),
      );
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
    const { _waterY: wy, _dockX1: bx } = this; // dockX1 === beachEndX
    const hx = Math.floor(bx * 0.42);

    if (!this._hutImg) {
      this._hutImg = this.scene.add.image(hx, wy, HUT_KEY)
        .setOrigin(HUT_ORIGIN_X, HUT_ORIGIN_Y)
        .setDepth(5.7);
    } else {
      this._hutImg.setPosition(hx, wy).setVisible(true);
    }
  }

  // ── Buoys ─────────────────────────────────────────────────────────────────

  private setupBuoys(): void {
    const { _width: w, _waterY: wy } = this;
    // Two pairs, clear of the dock (36–60%) and the lighthouse island (~59–65%):
    // one pair bobbing off the beach, one pair out past the lighthouse.
    this._buoys = [
      { x: Math.floor(w * 0.18), y: wy + 60, color: 0xFF3333, phase: 0 },
      { x: Math.floor(w * 0.31), y: wy + 70, color: 0xFF7700, phase: Math.PI * 0.6 },
      { x: Math.floor(w * 0.71), y: wy + 58, color: 0xFF7700, phase: Math.PI * 1.2 },
      { x: Math.floor(w * 0.88), y: wy + 74, color: 0xFF3333, phase: Math.PI * 1.8 },
    ];

    for (const img of this._buoyImgs) img.destroy();
    this._buoyImgs = this._buoys.map(b =>
      this.scene.add.image(b.x, b.y, b.color === 0xFF3333 ? BUOY_RED_KEY : BUOY_ORANGE_KEY)
        .setOrigin(BUOY_ORIGIN_X, BUOY_ORIGIN_Y)
        .setDepth(5.85),
    );
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

    // ── Buoy lights — small warm points at the lantern, above the float (level 7+) ──
    this._buoyBulbs = this._buoys.map(b => ({
      x: b.x, y: b.y - 9, radius: 4, color: b.color, intensity: 0, noOcclusion: true,
    } as Extract<LightSource, { type?: 'point' }>));
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(delta: number): void {
    const dt = delta / 1000;

    // Buoy gentle bob
    for (let i = 0; i < this._buoys.length; i++) {
      this._buoys[i].phase += dt * 0.8;
      if (this._buoyBulbs[i]) {
        this._buoyBulbs[i].y = this._buoys[i].y - 9 + Math.sin(this._buoys[i].phase) * 1.5;
      }
    }
  }

  // ── Structure shadows on water ────────────────────────────────────────────

  updateShadows(gfx: Phaser.GameObjects.Graphics, leanX: number, alpha: number, waterY: number): void {
    gfx.fillStyle(0x000000, alpha);

    // Pier shadow
    if (this._level >= 3) {
      const px = this._pierX + leanX * 8;
      gfx.fillEllipse(px, waterY + BEACH_SHORE_H + 30, 14 + Math.abs(leanX) * 6, 10);
    }

    // Dock shadow
    if (this._level >= 5) {
      const dockCx  = (this._dockX1 + this._dockX2) / 2;
      const dockW   = this._dockX2 - this._dockX1;
      const sx = dockCx + leanX * 10;
      const sy = waterY + 30;
      gfx.fillEllipse(sx, sy, dockW * 0.7, 14 + Math.abs(leanX) * 4);
    }

    // Café shadow (on beach/water)
    if (this._level >= 4) {
      const cafeCx = this._cafeX + 30;
      gfx.fillEllipse(cafeCx + leanX * 6, waterY + BEACH_SHORE_H - 2, 40, 8);
    }
  }

  // ── Animated FX layer (buoys + dock glow lights) ──────────────────────────

  drawFx(gfx: Phaser.GameObjects.Graphics, nightFactor: number): void {
    // Buoys — pre-rendered conical channel-marker sprites, dimmed by elevation
    // so they match day/night lighting.
    const buoyBrightness = Math.max(0.35, Math.min(1.0, (1 - nightFactor * 0.7)));
    for (let i = 0; i < this._buoys.length; i++) {
      const b  = this._buoys[i];
      const bx = b.x;
      const by = Math.round(b.y + Math.sin(b.phase) * 1.5);

      const img = this._buoyImgs[i];
      if (img) img.setPosition(bx, by).setTint(dimColor(0xFFFFFF, buoyBrightness));

      // Ripple shadow where the buoy sits in the water
      gfx.fillStyle(0x0A2A40, 0.30);
      gfx.fillEllipse(bx, by + 5, 11, 3);

      // Soft circular night glow around the lantern
      if (nightFactor > 0.1) {
        gfx.fillStyle(b.color, nightFactor * 0.12);
        gfx.fillCircle(bx, by - 9, 8);
        gfx.fillStyle(b.color, nightFactor * 0.25);
        gfx.fillCircle(bx, by - 9, 4);
        gfx.fillStyle(b.color, Math.min(1, nightFactor * 0.7));
        gfx.fillCircle(bx, by - 9, 1.5);
      }
    }

    // Dock glow lights — night only, invisible during the day
    if (this._level >= 5 && this._dockGlows.length > 0 && nightFactor > 0.02) {
      for (const g of this._dockGlows) {
        const baseA  = g.bright ? nightFactor * 0.75 : nightFactor * 0.60;
        const radius = g.bright ? 2.0 : 1.5;
        gfx.fillStyle(0xFFE090, baseA);
        gfx.fillCircle(g.x, g.y, radius);
        if (nightFactor > 0.2) {
          gfx.fillStyle(0xFFCC60, (nightFactor - 0.2) * (g.bright ? 0.45 : 0.30));
          gfx.fillCircle(g.x, g.y, g.bright ? 4 : 3);
        }
      }
    }
  }

  // ── Lighting updates ──────────────────────────────────────────────────────

  updateLighting(nf: number, structTint: number): void {
    // Pier / café / lifeguard hut / dock — manual night tint (these images
    // skip the Light2D pipeline, same as cyclist/furniture sprites).
    this._pierImg?.setTint(structTint);
    this._cafeImg?.setTint(structTint);
    this._hutImg?.setTint(structTint);
    this._dockDeckTile?.setTint(structTint);
    for (const img of this._dockPostImgs) img.setTint(structTint);
    for (const img of this._dockBollardImgs) img.setTint(structTint);

    // Dock spots
    for (const s of this._dockSpots) s.setIntensity(nf * 3.0);
    for (const b of this._dockBulbs) (b as { intensity: number }).intensity = nf * 220;

    // Café spot
    if (this._cafeSpot) this._cafeSpot.setIntensity(nf * 2.5);
    if (this._cafeBulb) (this._cafeBulb as { intensity: number }).intensity = nf * 200;

    // Pier spot
    if (this._pierSpot) this._pierSpot.setIntensity(nf * 2.2);
    if (this._pierBulb) (this._pierBulb as { intensity: number }).intensity = nf * 180;

    // Buoys — tiny glow
    for (const b of this._buoyBulbs) (b as { intensity: number }).intensity = nf * 50;

    // Native lights
    for (const nl of this._nativeLights) nl.intensity = nf * 1.2;
  }

  destroy(): void {
    for (const nl of this._nativeLights) this.scene.lights.removeLight(nl);
    this.structGfx.destroy();
    this._pierImg?.destroy();
    this._cafeImg?.destroy();
    this._hutImg?.destroy();
    this._dockDeckTile?.destroy();
    for (const img of this._dockPostImgs) img.destroy();
    for (const img of this._dockBollardImgs) img.destroy();
    for (const img of this._buoyImgs) img.destroy();
  }
}
