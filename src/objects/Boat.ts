import Phaser from 'phaser';
import { lerpColor } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { type BoatDef, boatOriginY } from './BoatAssets';

type SmokeParticle = { x: number; y: number; alpha: number; dx: number; fadeRate: number; radius: number; maxAlpha: number; color: number; growing: boolean };

const NIGHT_TINT = 0x5a6680;
const TEX_PAD    = 1;

// Fraction of hull height submerged, ±VARY per boat.
const SUBMERGE_RATIO      = 0.16;
const SUBMERGE_RATIO_VARY = 0.04;

// Water tint on the submerged hull image.
const WATER_TINT = 0x2a5588;

// Visible alpha of the submerged hull:
// top strip (just below waterline) and bottom strip (at hull bottom).
const ALPHA_STRIP_TOP = 0.28;
const ALPHA_STRIP_BOT = 0.10;

export type BoatState = 'moving' | 'docking' | 'docked' | 'departing';

const DOCK_SLOW_DIST   = 90;
const OFFSCREEN_MARGIN = 30;

const SHADOW_LAYERS = [
  { dx: 0, dy: 3, scale: 0.90, alpha: 0.10 },
  { dx: 0, dy: 2, scale: 0.72, alpha: 0.18 },
] as const;

export interface BoatConfig {
  def: BoatDef;
  x: number;
  y: number;
  sceneWidth: number;
  dockX: number | null;
  dockDuration: number;
}

export class Boat {
  private readonly shadows: Phaser.GameObjects.Image[];
  private readonly image: Phaser.GameObjects.Image;
  // Two strips for gradient alpha: top = more visible, bottom = more transparent.
  private readonly subTop: Phaser.GameObjects.Image;
  private readonly subBot: Phaser.GameObjects.Image;
  // Graphics drawn in world space to render the animated wave at the waterline.
  private readonly waveGfx: Phaser.GameObjects.Graphics;
  private readonly def: BoatDef;
  private x: number;
  readonly y: number;
  private readonly sceneWidth: number;
  private readonly dockX: number | null;
  private readonly baseSpeed: number;
  private readonly dockDuration: number;
  private state: BoatState = 'moving';
  private dockTimer = 0;
  private bobPhase: number;
  private nightFactor = 0;
  private _lastLightingElevation = NaN;

  // World-space offset from hull centre (bobY) to the waterline.
  private readonly waterlineOffset: number;
  private readonly hullHalfH: number;
  // Waterline half-width in world space (may be narrower than full hull width).
  private readonly wlHalfW: number;

  private readonly smokeGfx: Phaser.GameObjects.Graphics | null = null;
  private readonly smokeParticles: SmokeParticle[] = [];
  private smokeTimer = 0;
  private nextSmoke = 0;

  private readonly portLight: Extract<LightSource, { type?: 'point' }>;
  private readonly starboardLight: Extract<LightSource, { type?: 'point' }>;
  private readonly sternLight: Extract<LightSource, { type?: 'point' }> | null;

  get lights(): LightSource[] {
    const l: LightSource[] = [this.portLight, this.starboardLight];
    if (this.sternLight) l.push(this.sternLight);
    return l;
  }

  get assignedDockX(): number | null { return this.dockX; }
  get posX(): number { return this.x; }

  constructor(scene: Phaser.Scene, config: BoatConfig) {
    const { def, x, y, sceneWidth, dockX, dockDuration } = config;
    this.def          = def;
    this.x            = x;
    this.y            = y;
    this.sceneWidth   = sceneWidth;
    this.dockX        = dockX;
    this.dockDuration = dockDuration;
    this.baseSpeed    = def.speed * (0.975 + Math.random() * 0.05);
    this.bobPhase     = Math.random() * Math.PI * 2;
    this.hullHalfH    = def.h / 2;

    const submergeRatio  = SUBMERGE_RATIO + (Math.random() * 2 - 1) * SUBMERGE_RATIO_VARY;
    this.waterlineOffset = def.h * (0.5 - submergeRatio); // bobY + this = waterline world Y
    this.wlHalfW         = (def.wlW ?? def.w) / 2;

    const originY      = boatOriginY(def);
    const texH_padded  = def.texH + 2 * TEX_PAD;
    const texW_padded  = def.w   + 2 * TEX_PAD;
    const extraTop     = def.texH - def.h;
    const hullBottomPx = TEX_PAD + extraTop + def.h;
    const submergeH    = Math.round(def.h * submergeRatio);
    const waterlinePx  = hullBottomPx - submergeH;
    const midPx        = waterlinePx + Math.floor(submergeH / 2);

    this.shadows = SHADOW_LAYERS.map(l =>
      scene.add.image(x, y + l.dy, def.key)
        .setOrigin(0.5, originY)
        .setDepth(5.854)
        .setTint(0x000000)
        .setScale(l.scale)
        .setAlpha(l.alpha),
    );

    // Above-waterline hull, depth-sorted by hull-bottom Y for painter's order.
    this.image = scene.add.image(x, y, def.key)
      .setOrigin(0.5, originY)
      .setDepth(5.855 + (y + this.hullHalfH) * 0.000001)
      .setCrop(0, 0, texW_padded, waterlinePx);

    // Submerged hull — two strips for gradient alpha, rendered inside the water body.
    // Horizontal crop limited to wlW so they don't overextend past the waterline footprint.
    this.subTop = scene.add.image(x, y, def.key)
      .setOrigin(0.5, originY)
      .setDepth(5.52)
      .setCrop(0, waterlinePx, texW_padded, Math.ceil(submergeH / 2))
      .setTint(WATER_TINT)
      .setAlpha(ALPHA_STRIP_TOP);

    this.subBot = scene.add.image(x, y, def.key)
      .setOrigin(0.5, originY)
      .setDepth(5.52)
      .setCrop(0, midPx, texW_padded, texH_padded - midPx)
      .setTint(WATER_TINT)
      .setAlpha(ALPHA_STRIP_BOT);

    // Wave Graphics drawn directly in world space at the waterline boundary.
    // Depth 5.855 puts it level with the hull so the wave reads as foam at the join.
    this.waveGfx = scene.add.graphics().setDepth(5.855);

    if (def.smokeOffsets?.length) {
      this.smokeGfx = scene.add.graphics().setDepth(50);
    }

    this.portLight = {
      x, y: y - def.h / 2 + 2,
      radius: 6, color: 0xff2222, intensity: 0, noOcclusion: true,
    };
    this.starboardLight = {
      x, y: y + def.h / 2 - 2,
      radius: 6, color: 0x22ff55, intensity: 0, noOcclusion: true,
    };
    this.sternLight = def.w >= 36 ? {
      x: x - def.w / 2, y,
      radius: 9, color: 0xffffff, intensity: 0, noOcclusion: true,
    } : null;
  }

  update(delta: number): boolean {
    const dt = delta / 1000;

    if (this.state === 'moving') {
      let speed = this.baseSpeed;
      if (this.dockX !== null) {
        const dist = this.dockX - this.x;
        if (dist > 0 && dist < DOCK_SLOW_DIST) {
          speed = this.baseSpeed * Math.max(0.08, dist / DOCK_SLOW_DIST);
        }
        if (dist <= 1 && dist > -10) {
          this.state     = 'docked';
          this.dockTimer = this.dockDuration;
          this.x         = this.dockX;
        } else {
          this.x += speed * dt;
        }
      } else {
        this.x += speed * dt;
      }
    } else if (this.state === 'docked') {
      this.dockTimer -= delta;
      if (this.dockTimer <= 0) this.state = 'departing';
    } else if (this.state === 'departing') {
      this.x += this.baseSpeed * 1.15 * dt;
    }

    this.bobPhase += dt * 1.2;
    const bobY = this.y + Math.sin(this.bobPhase) * 1.2;

    this.image.setPosition(this.x, bobY);
    this.subTop.setPosition(this.x, bobY);
    this.subBot.setPosition(this.x, bobY);

    // Keep painter depth current through the bob.
    this.image.setDepth(5.855 + (bobY + this.hullHalfH) * 0.000001);

    for (let i = 0; i < this.shadows.length; i++) {
      this.shadows[i].setPosition(this.x + SHADOW_LAYERS[i].dx, bobY + SHADOW_LAYERS[i].dy);
    }

    this.drawWaterline(bobY);

    this.portLight.x = this.x;
    this.portLight.y = bobY - this.def.h / 2 + 2;
    this.starboardLight.x = this.x;
    this.starboardLight.y = bobY + this.def.h / 2 - 2;
    if (this.sternLight) {
      this.sternLight.x = this.x - this.def.w / 2;
      this.sternLight.y = bobY;
    }

    this.smokeTimer += delta;
    if (this.smokeGfx) this.tickSmoke(bobY);

    return this.x - this.def.w / 2 > this.sceneWidth + OFFSCREEN_MARGIN;
  }

  // Draws a thin wavy stroke at the waterline to suggest foam / surface contact.
  private drawWaterline(bobY: number): void {
    const gfx        = this.waveGfx;
    const left       = this.x - this.wlHalfW + 2;
    const right      = this.x + this.wlHalfW - 2;
    const wlY        = bobY + this.waterlineOffset;
    const t          = this.bobPhase / 1.2;
    const step       = Math.max(2, Math.ceil(this.def.w / 30));

    gfx.clear();
    gfx.lineStyle(1, 0xb8d8f0, 0.45);
    gfx.beginPath();
    gfx.moveTo(left, wlY + this.waveAt(left, t));
    for (let px = left + step; px <= right; px += step) {
      gfx.lineTo(px, wlY + this.waveAt(px, t));
    }
    gfx.strokePath();
  }

  private waveAt(worldX: number, t: number): number {
    return Math.sin(worldX * 0.12 + t * 1.9) * 2.2
         + Math.sin(worldX * 0.22 + t * 1.2 + 1.5) * 0.9;
  }

  private tickSmoke(bobY: number): void {
    if (this.smokeTimer >= this.nextSmoke) {
      for (const off of this.def.smokeOffsets!) {
        const c = 0x88 + Math.floor(Math.random() * 40);
        this.smokeParticles.push({
          x: this.x + off.dx + (Math.random() - 0.5) * 4,
          y: bobY + off.dy,
          alpha: 0,
          dx: -(0.02 + Math.random() * 0.025),
          fadeRate: 0.0008 + Math.random() * 0.0006,
          radius: 4 + Math.floor(Math.random() * 5),
          maxAlpha: 0,
          color: (c << 16) | (c << 8) | c,
          growing: true,
        });
      }
      this.nextSmoke = 120 + Math.random() * 100;
      this.smokeTimer = 0;
    }

    for (const p of this.smokeParticles) {
      p.y -= 0.08;
      p.x += p.dx;
      if (p.growing) {
        if (p.maxAlpha === 0) p.maxAlpha = 0.55 - (p.radius - 4) * 0.05;
        p.alpha += 0.035;
        if (p.alpha >= p.maxAlpha) { p.alpha = p.maxAlpha; p.growing = false; }
      } else {
        p.alpha -= p.fadeRate;
      }
    }

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      if (this.smokeParticles[i].alpha <= 0) this.smokeParticles.splice(i, 1);
    }

    const gfx = this.smokeGfx!;
    gfx.clear();
    for (const p of this.smokeParticles) {
      gfx.fillStyle(lerpColor(p.color, 0x1a1a2e, this.nightFactor * 0.75), p.alpha);
      gfx.fillCircle(Math.round(p.x), Math.round(p.y), p.radius);
    }
  }

  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightingElevation) < 0.002) return;
    this._lastLightingElevation = elevation;
    this.nightFactor = Math.max(0, Math.min(1, (0.15 - elevation) / 0.25));
    this.image.setTint(lerpColor(0xffffff, NIGHT_TINT, this.nightFactor));

    this.portLight.intensity      = this.nightFactor * 25;
    this.starboardLight.intensity = this.nightFactor * 25;
    if (this.sternLight) this.sternLight.intensity = this.nightFactor * 18;
  }

  destroy(): void {
    for (const s of this.shadows) s.destroy();
    this.image.destroy();
    this.subTop.destroy();
    this.subBot.destroy();
    this.waveGfx.destroy();
    this.smokeGfx?.destroy();
  }
}
