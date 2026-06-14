import Phaser from 'phaser';
import { lerpColor } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { type BoatDef, boatOriginY } from './BoatAssets';

const NIGHT_TINT = 0x5a6680;

export type BoatState = 'moving' | 'docking' | 'docked' | 'departing';

const DOCK_SLOW_DIST   = 90;
const OFFSCREEN_MARGIN = 30;

// Two-layer upward shadow: outer halo + tighter core
const SHADOW_LAYERS = [
  { offsetY: -6, scale: 0.95, alpha: 0.07 },
  { offsetY: -3, scale: 0.80, alpha: 0.17 },
] as const;

// Waterline strip drawn over the hull at depth 5.857
const WATERLINE_COLOR = 0x2A89CB;
const WATERLINE_FOAM  = 0x88CCEE;

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
  private readonly waterlineGfx: Phaser.GameObjects.Graphics;
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
  private waterPhase: number;
  private nightFactor = 0;
  private _lastLightingElevation = NaN;

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
    this.waterPhase   = Math.random() * Math.PI * 2;

    const originY = boatOriginY(def);

    // Soft upward shadow — two layers so edges fade gradually
    this.shadows = SHADOW_LAYERS.map(layer =>
      scene.add.image(x, y + layer.offsetY, def.key)
        .setOrigin(0.5, originY)
        .setDepth(5.854)
        .setTint(0x000000)
        .setScale(layer.scale)
        .setAlpha(layer.alpha),
    );

    // Above wave fx (5.85), below lighthouse island (5.86)
    this.image = scene.add.image(x, y, def.key)
      .setOrigin(0.5, originY)
      .setDepth(5.855);

    // Waterline strip renders over the boat to simulate hull meeting water surface
    this.waterlineGfx = scene.add.graphics().setDepth(5.857);

    // Port (top/city-side) = red
    this.portLight = {
      x, y: y - def.h / 2 + 2,
      radius: 6, color: 0xff2222, intensity: 0, noOcclusion: true,
    };
    // Starboard (bottom/sea-side) = green
    this.starboardLight = {
      x, y: y + def.h / 2 - 2,
      radius: 6, color: 0x22ff55, intensity: 0, noOcclusion: true,
    };
    // Stern white light for larger vessels
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
          this.state    = 'docked';
          this.dockTimer = this.dockDuration;
          this.x        = this.dockX;
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

    this.bobPhase   += dt * 1.2;
    this.waterPhase += dt * 1.5;
    const bobY = this.y + Math.sin(this.bobPhase) * 1.2;

    this.image.setPosition(this.x, bobY);

    for (let i = 0; i < this.shadows.length; i++) {
      this.shadows[i].setPosition(this.x, bobY + SHADOW_LAYERS[i].offsetY);
    }

    // Waterline: slight independent wave offset so it washes back and forth
    const waveOff = Math.sin(this.waterPhase) * 1.4 + Math.sin(this.waterPhase * 1.73) * 0.6;
    const lineW   = Math.round(this.def.w * 0.84);
    const lineX   = Math.round(this.x - lineW / 2);
    // Waterline sits at 15% below hull centre — approximately where hull meets water
    const lineY   = Math.round(bobY + this.def.h * 0.15 + waveOff);

    this.waterlineGfx.clear();
    // Foam highlight just above the waterline
    this.waterlineGfx.fillStyle(WATERLINE_FOAM, 0.40);
    this.waterlineGfx.fillRect(lineX, lineY - 2, lineW, 1);
    // Main water surface band
    this.waterlineGfx.fillStyle(WATERLINE_COLOR, 0.58);
    this.waterlineGfx.fillRect(lineX, lineY - 1, lineW, 3);

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
    this.waterlineGfx.destroy();
    this.image.destroy();
  }
}
