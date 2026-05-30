import Phaser from 'phaser';
import { YARD_H } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { SoftSpotLight } from '../lighting/SoftSpotLight';

export class EmptyPlot extends Phaser.GameObjects.Container {
  private signBulbGfx: Phaser.GameObjects.Graphics | null = null;
  private lampBulbGfx: Phaser.GameObjects.Graphics | null = null;
  private signBulbLights: Phaser.GameObjects.Light[] = [];
  private signRedLight: Phaser.GameObjects.Light | null = null;
  private lampPointLight: Phaser.GameObjects.Light | null = null;
  private signLampSpot: SoftSpotLight | null = null;
  private outlinePoints: Array<{ x: number; y: number }> = [];

  get extraLights(): LightSource[] {
    return this.signLampSpot ? this.signLampSpot.beams : [];
  }

  getOutlinePoints() {
    return this.outlinePoints;
  }

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number) {
    super(scene, 0, 0);

    const gfx     = scene.add.graphics();
    const gy      = groundY;
    const w       = plotWidth;
    const dirtTop = gy - YARD_H;

    // ── Dirt plot ─────────────────────────────────────────────────────────────
    gfx.fillStyle(0x7a5228, 1);
    gfx.fillRect(x, dirtTop, w, YARD_H);
    gfx.fillStyle(0x5c3c18, 1);
    gfx.fillRect(x, dirtTop, w, 2);
    gfx.fillStyle(0x5c3c18, 1);
    for (let i = 0; i < 5; i++) {
      const px = x + Math.round(((i + 0.5) / 5) * w);
      gfx.fillRect(px - 2, dirtTop + 5, 5, 2);
      gfx.fillRect(px + 4, dirtTop + 13, 4, 2);
    }

    // ── Sign layout (half-size board) ──────────────────────────────────────────
    const cx      = x + Math.round(w * 0.5);
    const bW = 24, bH = 13;
    const bX = cx - Math.round(bW / 2);

    // Lamp housing dimensions (positioned above the sign)
    const lampHouseW   = 10;
    const lampHouseH   = 4;
    const lampHouseX   = cx - Math.round(lampHouseW / 2);
    // Sign top is postTop - 9; lamp house sits 8px above that
    // postTop = dirtTop - 24  →  bY = dirtTop - 33  →  lampHouseTop = dirtTop - 41
    const postTop      = dirtTop - 24;
    const bY           = postTop - bH + 4;
    const lampHouseTop = bY - 8;
    const lampLightY   = lampHouseTop + lampHouseH;

    // Shadow occluder — just the sign board (1px border included)
    this.outlinePoints = [
      { x: bX - 1,      y: bY - 1      },
      { x: bX + bW + 1, y: bY - 1      },
      { x: bX + bW + 1, y: bY + bH + 1 },
      { x: bX - 1,      y: bY + bH + 1 },
    ];

    // ── Wooden post (extended to lamp housing) ────────────────────────────────
    gfx.fillStyle(0xb08040, 1);
    gfx.fillRect(cx - 1, lampHouseTop, 3, (dirtTop + 10) - lampHouseTop);
    gfx.fillStyle(0x806028, 1);
    gfx.fillRect(cx + 1, lampHouseTop, 1, (dirtTop + 10) - lampHouseTop);

    // ── Sign board ────────────────────────────────────────────────────────────
    gfx.fillStyle(0x909090, 1);
    gfx.fillRect(bX - 1, bY - 1, bW + 2, bH + 2);

    // Red header bar (5px)
    gfx.fillStyle(0xcc2020, 1);
    gfx.fillRect(bX, bY, bW, 5);

    // White body (8px)
    gfx.fillStyle(0xf8f4ee, 1);
    gfx.fillRect(bX, bY + 5, bW, bH - 5);

    // Header text dots
    gfx.fillStyle(0xffcccc, 1);
    for (const ox of [2, 6, 10, 15, 20]) {
      gfx.fillRect(bX + ox, bY + 2, 3, 2);
    }

    // Body text lines
    gfx.fillStyle(0xcc2020, 1);
    gfx.fillRect(bX + 2,  bY + 7, 4, 1);
    gfx.fillRect(bX + 8,  bY + 7, 3, 1);
    gfx.fillRect(bX + 13, bY + 7, 4, 1);
    gfx.fillRect(bX + 19, bY + 7, 3, 1);
    gfx.fillStyle(0xaaaaaa, 1);
    gfx.fillRect(bX + 2,  bY + 10, 6, 1);
    gfx.fillRect(bX + 10, bY + 10, 5, 1);
    gfx.fillRect(bX + 17, bY + 10, 5, 1);

    // ── Lamp housing above sign ───────────────────────────────────────────────
    gfx.fillStyle(0x444444, 1);
    gfx.fillRect(lampHouseX, lampHouseTop, lampHouseW, lampHouseH);
    // Visor / bottom highlight
    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(lampHouseX - 1, lampHouseTop + lampHouseH - 1, lampHouseW + 2, 1);
    gfx.fillStyle(0x666666, 1);
    gfx.fillRect(lampHouseX + 1, lampHouseTop + 1, lampHouseW - 2, 1);

    this.add(gfx);

    // ── Sign border bulb lights ───────────────────────────────────────────────
    const bulbs: Array<{ px: number; py: number }> = [];
    for (let i = 0; i <= 4; i++) {
      const bx = bX + Math.round((i / 4) * bW);
      bulbs.push({ px: bx, py: bY - 1 });
      bulbs.push({ px: bx, py: bY + bH + 1 });
    }
    const midY = bY + Math.round(bH / 2);
    bulbs.push({ px: bX - 1,      py: midY });
    bulbs.push({ px: bX + bW + 1, py: midY });

    const bulbGfx = scene.add.graphics();
    for (const { px, py } of bulbs) {
      bulbGfx.fillStyle(0xfff8f0, 1);
      bulbGfx.fillCircle(px, py, 1.5);
    }
    bulbGfx.setAlpha(0);
    bulbGfx.setBlendMode(Phaser.BlendModes.ADD);
    this.add(bulbGfx);
    this.signBulbGfx = bulbGfx;

    for (const { px, py } of bulbs) {
      this.signBulbLights.push(scene.lights.addLight(px, py, 10, 0xfff8f0, 0));
    }

    this.signRedLight = scene.lights.addLight(bX + bW / 2, bY + 2, 20, 0xff2020, 0);

    // ── Lamp bulb glow ────────────────────────────────────────────────────────
    const lampBulbGfx = scene.add.graphics();
    lampBulbGfx.fillStyle(0xfff8d0, 1);
    lampBulbGfx.fillCircle(cx, lampLightY, 2);
    lampBulbGfx.setAlpha(0);
    lampBulbGfx.setBlendMode(Phaser.BlendModes.ADD);
    this.add(lampBulbGfx);
    this.lampBulbGfx = lampBulbGfx;

    this.lampPointLight = scene.lights.addLight(cx, lampLightY, 30, 0xffcc66, 0);

    // ── Lamp directional spot (warm, 90° cone, pointing straight down) ────────
    this.signLampSpot = new SoftSpotLight({
      x: cx,
      y: lampLightY,
      radius: 60,
      color: 0xffcc66,
      intensity: 0,
      angle: Math.PI / 2,
      coneAngle: Math.PI / 2 * 0.64,
      noOcclusion: true,
    });

    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      for (const light of this.signBulbLights) {
        scene.lights.removeLight(light);
      }
      if (this.signRedLight) scene.lights.removeLight(this.signRedLight);
      if (this.lampPointLight) scene.lights.removeLight(this.lampPointLight);
    });
  }

  updateWindowLights(elevation: number): void {
    const t = Math.max(0, Math.min(1, (0.3 - elevation) / 0.3));
    if (this.signBulbGfx) this.signBulbGfx.setAlpha(t * 0.7);
    for (const light of this.signBulbLights) {
      light.intensity = t * 0.25;
    }
    if (this.signRedLight) this.signRedLight.intensity = t * 0.15;
    if (this.lampBulbGfx) this.lampBulbGfx.setAlpha(t * 0.9);
    if (this.lampPointLight) this.lampPointLight.intensity = t * 0.8;
    if (this.signLampSpot) this.signLampSpot.setIntensity(t * 2.16);
  }
}
