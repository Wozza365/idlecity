import Phaser from 'phaser';
import { lerpColor } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { type BoatDef, boatOriginY } from './BoatAssets';

const NIGHT_TINT = 0x5a6680;

// Mirrors the TEX_PAD value in BoatAssets.
const TEX_PAD = 1;

// Fraction of hull height that sits below the waterline, ±VARY per boat.
const SUBMERGE_RATIO      = 0.16;
const SUBMERGE_RATIO_VARY = 0.04;

// Water tint on the submerged strip.
const WATER_TINT = 0x2a5588;

// Target visible alpha: 0.30 just below the waterline, 0.10 at the hull bottom.
// The submerged image is set to ALPHA_TOP; the FilterMask scales it down to
// ALPHA_BOT by drawing the bottom bands with alpha = ALPHA_BOT / ALPHA_TOP.
const ALPHA_TOP      = 0.30;
const ALPHA_BOT      = 0.10;
const MASK_ALPHA_BOT = ALPHA_BOT / ALPHA_TOP; // ≈ 0.333

// Number of horizontal gradient bands in the wave mask.
const MASK_BANDS = 8;

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
  private readonly submergedImage: Phaser.GameObjects.Image;
  // Off-display-list graphics used solely as a FilterMask source.
  private readonly waveMaskGfx: Phaser.GameObjects.Graphics;
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

  // World-space offsets from hull centre (bobY): waterline is below centre,
  // hull bottom is at +hullHalfH.
  private readonly waterlineOffset: number;
  private readonly hullHalfH: number;

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
    // world Y of waterline = bobY + waterlineOffset
    this.waterlineOffset = def.h * (0.5 - submergeRatio);

    const originY      = boatOriginY(def);
    const texH_padded  = def.texH + 2 * TEX_PAD;
    const texW_padded  = def.w   + 2 * TEX_PAD;
    const extraTop     = def.texH - def.h;
    const hullBottomPx = TEX_PAD + extraTop + def.h;
    const submergeH    = Math.round(def.h * submergeRatio);
    const waterlinePx  = hullBottomPx - submergeH;

    this.shadows = SHADOW_LAYERS.map(l =>
      scene.add.image(x, y + l.dy, def.key)
        .setOrigin(0.5, originY)
        .setDepth(5.854)
        .setTint(0x000000)
        .setScale(l.scale)
        .setAlpha(l.alpha),
    );

    // Above-waterline hull. Depth encodes hull-bottom Y for painter's-algorithm
    // ordering among boats (higher Y = further into the scene = higher depth).
    this.image = scene.add.image(x, y, def.key)
      .setOrigin(0.5, originY)
      .setDepth(5.855 + (y + this.hullHalfH) * 0.000001)
      .setCrop(0, 0, texW_padded, waterlinePx);

    // Wave mask Graphics — never in the display list, used only by FilterMask.
    this.waveMaskGfx = scene.make.graphics({}, false);

    // Submerged hull rendered inside the water body.
    // setCrop limits it to the below-waterline strip.
    // FilterMask applies the wavy top edge + gradient alpha (ALPHA_TOP → ALPHA_BOT).
    this.submergedImage = scene.add.image(x, y, def.key)
      .setOrigin(0.5, originY)
      .setDepth(5.52)
      .setCrop(0, waterlinePx, texW_padded, texH_padded - waterlinePx)
      .setTint(WATER_TINT)
      .setAlpha(ALPHA_TOP)
      .enableFilters();

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.submergedImage.filters!.internal.addMask(this.waveMaskGfx).autoUpdate = true;

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
    this.submergedImage.setPosition(this.x, bobY);

    // Keep painter depth current through the bob.
    this.image.setDepth(5.855 + (bobY + this.hullHalfH) * 0.000001);

    for (let i = 0; i < this.shadows.length; i++) {
      this.shadows[i].setPosition(this.x + SHADOW_LAYERS[i].dx, bobY + SHADOW_LAYERS[i].dy);
    }

    // Redraw the wave mask for this frame.
    this.updateWaveMask(bobY);

    this.portLight.x = this.x;
    this.portLight.y = bobY - this.def.h / 2 + 2;
    this.starboardLight.x = this.x;
    this.starboardLight.y = bobY + this.def.h / 2 - 2;
    if (this.sternLight) {
      this.sternLight.x = this.x - this.def.w / 2;
      this.sternLight.y = bobY;
    }

    return this.x - this.def.w / 2 > this.sceneWidth + OFFSCREEN_MARGIN;
  }

  private updateWaveMask(bobY: number): void {
    const gfx         = this.waveMaskGfx;
    const left        = this.x - this.def.w / 2 - 1;
    const right       = this.x + this.def.w / 2 + 1;
    const waterlineY  = bobY + this.waterlineOffset;
    const hullBottomY = bobY + this.hullHalfH;
    const totalH      = hullBottomY - waterlineY;
    if (totalH <= 0) { gfx.clear(); return; }

    gfx.clear();
    const t    = this.bobPhase / 1.2; // ≈ elapsed seconds
    const step = Math.max(3, Math.ceil(this.def.w / 20));

    for (let b = 0; b < MASK_BANDS; b++) {
      const f0        = b / MASK_BANDS;
      const f1        = (b + 1) / MASK_BANDS;
      // Mask alpha: 1.0 at waterline band → MASK_ALPHA_BOT at bottom band.
      const bandAlpha = 1.0 - f0 * (1.0 - MASK_ALPHA_BOT);
      const bandTopY  = waterlineY + f0 * totalH;
      const bandBotY  = waterlineY + f1 * totalH;

      gfx.fillStyle(0xffffff, bandAlpha);

      if (b === 0) {
        // Top band: polygon with a wavy upper edge.
        gfx.beginPath();
        gfx.moveTo(left,  bandBotY);
        gfx.lineTo(right, bandBotY);
        for (let px = right; px >= left; px -= step) {
          gfx.lineTo(px, bandTopY + this.waveAt(px, t));
        }
        gfx.closePath();
        gfx.fillPath();
      } else {
        gfx.fillRect(left, bandTopY, right - left, bandBotY - bandTopY + 1);
      }
    }
  }

  // Two-frequency sine wave that animates the waterline edge in real time.
  private waveAt(worldX: number, t: number): number {
    return Math.sin(worldX * 0.12 + t * 1.9) * 2.2
         + Math.sin(worldX * 0.22 + t * 1.2 + 1.5) * 0.9;
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
    this.submergedImage.destroy();
    this.waveMaskGfx.destroy();
  }
}
