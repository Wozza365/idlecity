import Phaser from 'phaser';
import { lerpColor } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { type BoatDef, boatOriginY } from './BoatAssets';

const NIGHT_TINT = 0x5a6680;

export type BoatState = 'moving' | 'docking' | 'docked' | 'departing';

const DOCK_SLOW_DIST   = 90;
const OFFSCREEN_MARGIN = 30;

// Shadow: smaller copy rendered below and slightly behind, fading out at edges
// via two offset layers — one wide & faint, one tight & darker.
const SHADOW_LAYERS = [
  { dx:  0, dy: 3, scale: 0.90, alpha: 0.10 },
  { dx:  0, dy: 2, scale: 0.72, alpha: 0.18 },
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

    const originY = boatOriginY(def);

    this.shadows = SHADOW_LAYERS.map(l =>
      scene.add.image(x, y + l.dy, def.key)
        .setOrigin(0.5, originY)
        .setDepth(5.854)
        .setTint(0x000000)
        .setScale(l.scale)
        .setAlpha(l.alpha),
    );

    // Above wave fx (5.85), below lighthouse island (5.86)
    this.image = scene.add.image(x, y, def.key)
      .setOrigin(0.5, originY)
      .setDepth(5.855);

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
    for (let i = 0; i < this.shadows.length; i++) {
      this.shadows[i].setPosition(this.x + SHADOW_LAYERS[i].dx, bobY + SHADOW_LAYERS[i].dy);
    }

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
    this.image.destroy();
  }
}
