import Phaser from 'phaser';
import { dimColor } from '../../constants';
import { SoftSpotLight } from '../../lighting/SoftSpotLight';
import type { LightSource } from '../../lighting/LightingSystem';
import type { WaterPalette } from '../../theme/ThemeTypes';
import { LIGHTHOUSE_KEY, LIGHTHOUSE_ORIGIN_X, LIGHTHOUSE_ORIGIN_Y } from '../WaterStructureAssets';

// ── Lighthouse tower (pre-rendered sprite — see assets/water-structures/lighthouse.png) ──
const LH_TOWER_H  = 44;  // tower-body height below topY (matches lighthouse.png tex-y 25-69)
const LH_BASE_W   = 16;  // tower-body width at the base (bottom)
const LH_TOP_W    = 12;  // tower-body width at the top — slight taper
const LH_LAMP_DY  = -9;  // lantern-room centre, relative to topY (light/beam origin)

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

const ISLAND_RX = 26, ISLAND_RY_FRONT = 18, ISLAND_RY_BACK = 32;

// Wave-clearing factor around the lighthouse island: 0 = open water (waves draw
// normally), 1 = fully clear, in-between = fading "wake" around the island edge.
// Pure geometry helper shared with WaveFx's island-wake rendering.
export function islandClearAt(px: number, py: number, islandCx: number, islandCy: number, active: boolean): number {
  if (!active) return 0;
  const dx = px - islandCx;
  const dy = py - islandCy;
  const ry = dy < 0 ? ISLAND_RY_BACK : ISLAND_RY_FRONT;
  const nx = dx / ISLAND_RX, ny = dy / ry;
  const t  = Math.sqrt(nx * nx + ny * ny);
  if (t >= 1.5) return 0;
  if (t <= 1)   return 1;
  return (1.5 - t) / 0.5;
}

// Lighthouse + rocky island + sweeping beam, shown at water level 8+. Owns its
// own graphics layers, sprite, light sources, and beam texture/sprite —
// extracted from WaterArea so the latter only needs to call render/update/
// drawShadow/updateLighting/destroy and merge in extraLights.
export class LighthouseFeature {
  private readonly scene: Phaser.Scene;

  private islandGfx: Phaser.GameObjects.Graphics; // 5.86 – rocky island (above wave fx)
  private glowGfx:   Phaser.GameObjects.Graphics; // 5.85 – lens glow (with bonfire/buoys layer)

  private _lhTowerImg: Phaser.GameObjects.Image | null = null;
  private _beamSprite: Phaser.GameObjects.Image | null = null;
  private _lighthouseSpot: SoftSpotLight | null = null;
  private _lighthouseBulb: Extract<LightSource, { type?: 'point' }> | null = null;
  private _nativeLight: Phaser.GameObjects.Light | null = null;

  private _level = 0;
  private _x     = 0;
  private _topY  = 0;
  private _angle = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.islandGfx = scene.add.graphics().setDepth(5.86).setLighting(true);
    this.glowGfx   = scene.add.graphics().setDepth(5.85);
  }

  get extraLights(): LightSource[] {
    const out: LightSource[] = [];
    if (this._lighthouseSpot) out.push(...this._lighthouseSpot.beams);
    if (this._lighthouseBulb) out.push(this._lighthouseBulb);
    return out;
  }

  render(level: number, x: number, topY: number, palette: WaterPalette): void {
    this._level = level;
    this._x     = x;
    this._topY  = topY;
    this.islandGfx.clear();

    if (this._nativeLight) {
      this.scene.lights.removeLight(this._nativeLight);
      this._nativeLight = null;
    }

    if (level >= 8) {
      this.drawIsland(palette);
      this.drawTower();

      this._lighthouseSpot = new SoftSpotLight({
        x, y: topY + LH_LAMP_DY,
        radius: 180, color: 0xFFFF88, intensity: 0,
        angle: 0, coneAngle: Math.PI / 8,
        noOcclusion: true,
      });
      this._lighthouseBulb = {
        x, y: topY + LH_LAMP_DY, radius: 3, color: 0xFFFF88, intensity: 0, noOcclusion: true,
      };
      this._nativeLight = this.scene.lights.addLight(x, topY + LH_LAMP_DY, 80, 0xFFFF88, 0);
      this.createBeamSprite();
    } else {
      this._lhTowerImg?.setVisible(false);
      this._lighthouseSpot = null;
      this._lighthouseBulb = null;
      this._beamSprite?.destroy();
      this._beamSprite = null;
      this.glowGfx.clear();
    }
  }

  // ── Lighthouse rocky island ───────────────────────────────────────────────

  private drawIsland(palette: WaterPalette): void {
    const gfx = this.islandGfx;
    const { _x: cx, _topY: topY } = this;
    const baseY = topY + 46;

    // Soft halo in the surrounding water — grounds the island visually
    gfx.fillStyle(0x06223A, 0.25);
    gfx.fillEllipse(cx, topY + 50, 48, 22);

    // ── Submerged rock base — small, rounded, dark wet stone ──
    gfx.fillStyle(palette.rockWet, 1);
    gfx.fillEllipse(cx, topY + 48, 40, 18);
    gfx.fillStyle(dimColor(palette.rockWet, 0.7), 1);
    gfx.fillEllipse(cx, topY + 52, 32, 12);

    // ── Jagged dry peaks rising above the waterline, each lit on the left
    //    face and shaded on the right for a faceted pixel-art look ──
    const peaks: ReadonlyArray<{ x0: number; x1: number; ax: number; ay: number }> = [
      { x0: cx - 18, x1: cx - 2, ax: cx - 11, ay: topY + 30 },
      { x0: cx + 0,  x1: cx + 16, ax: cx + 8, ay: topY + 34 },
    ];
    for (const p of peaks) {
      gfx.fillStyle(palette.rockBase, 1);
      gfx.fillTriangle(p.x0, baseY, p.x1, baseY, p.ax, p.ay);
      gfx.fillStyle(palette.rockLight, 0.8);
      gfx.fillTriangle(p.x0, baseY, p.ax, p.ay, (p.x0 + p.ax) / 2, baseY);
      gfx.fillStyle(0x404040, 0.55);
      gfx.fillTriangle(p.x1, baseY, p.ax, p.ay, (p.x1 + p.ax) / 2, baseY);
    }

    // ── Strata cracks ──
    gfx.fillStyle(0x333333, 0.6);
    gfx.fillRect(cx - 13, topY + 40, 10, 2);
    gfx.fillRect(cx + 2,  topY + 42, 9, 2);

    // ── Moss patch on the highest peak ──
    gfx.fillStyle(palette.mossDark, 0.9);
    gfx.fillEllipse(cx - 11, topY + 29, 9, 4);
    gfx.fillStyle(palette.mossGreen, 0.9);
    gfx.fillEllipse(cx - 12, topY + 28, 6, 2.5);

    // ── Foam where waves break against the rock ──
    gfx.fillStyle(0xFFFFFF, 0.3);
    for (let i = 0; i < 4; i++) {
      const fx = cx - 18 + i * 12;
      const fy = topY + 44 + Math.round(Math.sin(i * 1.7) * 3);
      gfx.fillCircle(fx, fy, 1.5);
    }

    // ── Tiny companion boulder ──
    gfx.fillStyle(palette.rockWet, 1);
    gfx.fillEllipse(cx - 26, topY + 54, 14, 8);
    gfx.fillStyle(palette.rockBase, 1);
    gfx.fillTriangle(cx - 32, topY + 52, cx - 21, topY + 52, cx - 27, topY + 43);
    gfx.fillStyle(palette.rockLight, 0.8);
    gfx.fillTriangle(cx - 32, topY + 52, cx - 27, topY + 43, cx - 29, topY + 52);
    gfx.fillStyle(0xFFFFFF, 0.3);
    gfx.fillCircle(cx - 33, topY + 56, 1.5);
  }

  // ── Lighthouse tower sprite ────────────────────────────────────────────────

  private drawTower(): void {
    const { _x: lx, _topY: topY } = this;

    if (!this._lhTowerImg) {
      this._lhTowerImg = this.scene.add.image(lx, topY, LIGHTHOUSE_KEY)
        .setOrigin(LIGHTHOUSE_ORIGIN_X, LIGHTHOUSE_ORIGIN_Y)
        .setDepth(5.86);
    } else {
      this._lhTowerImg.setPosition(lx, topY).setVisible(true);
    }
  }

  // ── Per-frame update — beam rotation + lens glow / beam sprite ──────────────

  update(delta: number, nightFactor: number): void {
    const dt = delta / 1000;
    this._angle = (this._angle + dt * 0.75) % (Math.PI * 2);

    if (this._lighthouseSpot && nightFactor > 0.05) {
      this._lighthouseSpot.beams[0].angle = this._angle;
    }

    this.glowGfx.clear();
    if (this._level >= 8 && nightFactor > 0.08) {
      this.drawBeam(nightFactor);
    } else if (this._beamSprite) {
      this._beamSprite.setAlpha(0);
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
    this._beamSprite = this.scene.add.image(this._x, this._topY + LH_LAMP_DY, texKey)
      .setOrigin(sx / W, 0.5)
      .setDepth(5.69)                   // below structGfx (5.7) so tower overlaps beam
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private drawBeam(nightFactor: number): void {
    const { _x: lx, _topY: ty } = this;
    const ox = lx, oy = ty + LH_LAMP_DY;

    if (this._beamSprite) {
      this._beamSprite.setPosition(ox, oy).setRotation(this._angle).setAlpha(nightFactor);
    }

    // Lens glow — drawn larger than the lamp window so its halo is visible
    // around the (now in-front) tower rather than hidden entirely behind it.
    this.glowGfx.fillStyle(0xFFFF44, nightFactor * 0.55);
    this.glowGfx.fillCircle(ox, oy, 8);
  }

  // ── Shadow on water — soft offset silhouette of the cone tower, drawn in the
  // same two-pass per-column technique as Balloon.ts's drawShadow(). ──────────

  drawShadow(gfx: Phaser.GameObjects.Graphics, leanX: number, alpha: number, elevation: number): void {
    if (this._level < 8) return;
    const { _x: lx, _topY: topY } = this;
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

  // ── Lighting updates ──────────────────────────────────────────────────────

  updateLighting(nf: number, structTint: number): void {
    this._lhTowerImg?.setTint(structTint);
    if (this._lighthouseSpot)  this._lighthouseSpot.setIntensity(nf * 3.5);
    if (this._lighthouseBulb) (this._lighthouseBulb as { intensity: number }).intensity = nf * 180;
    if (this._nativeLight) this._nativeLight.intensity = nf * 1.2;
  }

  destroy(): void {
    if (this._nativeLight) this.scene.lights.removeLight(this._nativeLight);
    this.islandGfx.destroy();
    this.glowGfx.destroy();
    this._lhTowerImg?.destroy();
    this._beamSprite?.destroy();
  }
}
