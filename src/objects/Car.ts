import Phaser from 'phaser';
import { type LightSource } from '../lighting/LightingSystem';
import { SoftSpotLight } from '../lighting/SoftSpotLight';
import { type CarDef } from './CarAssets';

export const CAR_W = 38;

// ── Default light parameters ───────────────────────────────────────────────
const HEAD_SPOT_DEFAULTS  = { radius: 90,  color: 0xfff2cc, intensity: 4.5, coneAngle: Math.PI / 5 };
const HEAD_POINT_DEFAULTS = { radius: 3,   color: 0xfffae0, intensity: 400 };
const TAIL_SPOT_DEFAULTS  = { radius: 20,  color: 0xff0000, intensity: 4.0, coneAngle: Math.PI / 2 };
const TAIL_POINT_DEFAULTS = { radius: 3,   color: 0xff0000, intensity: 400 };
const HEAD_X_OFFSET_DEFAULT = 0;
const TAIL_X_OFFSET_DEFAULT = 6;

export interface CarConfig {
  def: CarDef;
  x: number;
  y: number;
  speed: number;
  direction: 1 | -1;
  sceneWidth: number;
  offscreenBuffer: number;
}

export class Car {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly def: CarDef;
  private x: number;
  private readonly y: number;
  private speed: number;
  private readonly direction: 1 | -1;
  private readonly sceneWidth: number;
  private readonly offscreenBuffer: number;

  private readonly headlight: SoftSpotLight;
  private readonly headSpot: Extract<LightSource, { type?: 'point' }>;
  private readonly taillight: SoftSpotLight;
  private readonly tailSpot: Extract<LightSource, { type?: 'point' }>;

  // Stored per-vehicle offsets and base intensities for update/updateLighting
  private readonly headXOff: number;
  private readonly tailXOff: number;
  private readonly headLightYOff: number;
  private readonly tailLightYOff: number;
  private readonly headlightIntensity: number;
  private readonly headSpotIntensity: number;
  private readonly taillightIntensity: number;
  private readonly tailSpotIntensity: number;
  private _lastLightingElevation = NaN;

  constructor(scene: Phaser.Scene, config: CarConfig) {
    const { def, x, y, speed, direction, sceneWidth, offscreenBuffer } = config;
    this.def = def;
    this.x = x;
    this.speed = speed;
    this.direction = direction;
    this.sceneWidth = sceneWidth;
    this.offscreenBuffer = offscreenBuffer;

    // Resolve per-vehicle lighting config against defaults
    const lighting  = def.lighting ?? {};
    const headCfg   = lighting.headlight ?? {};
    const tailCfg   = lighting.taillight ?? {};
    const headSpot  = { ...HEAD_SPOT_DEFAULTS,  ...headCfg.spot  };
    const headPoint = { ...HEAD_POINT_DEFAULTS, ...headCfg.point };
    const tailSpot  = { ...TAIL_SPOT_DEFAULTS,  ...tailCfg.spot  };
    const tailPoint = { ...TAIL_POINT_DEFAULTS, ...tailCfg.point };

    this.headXOff         = headCfg.xOffset ?? HEAD_X_OFFSET_DEFAULT;
    this.tailXOff         = tailCfg.xOffset ?? TAIL_X_OFFSET_DEFAULT;
    this.headLightYOff    = headCfg.yOffset ?? 0;
    this.tailLightYOff    = tailCfg.yOffset ?? 0;
    this.headlightIntensity = headSpot.intensity;
    this.headSpotIntensity  = headPoint.intensity;
    this.taillightIntensity = tailSpot.intensity;
    this.tailSpotIntensity  = tailPoint.intensity;

    // Apply whole-vehicle lane y offset
    this.y = y + (lighting.yOffset ?? 0);

    // Sprites face right by default; flip for leftward traffic
    this.sprite = scene.add.image(x, this.y, def.key)
      .setFlipX(direction === -1)
      .setDepth(8);

    const hw = def.w / 2;
    // xOffset convention: positive = inward toward car centre
    // head: inward is against direction of travel → subtract direction * offset
    // tail: inward is toward direction of travel  → add    direction * offset
    const headX  = (direction === 1 ? x + hw : x - hw) - direction * this.headXOff;
    const headY  = this.y + this.headLightYOff;
    const tailX  = (direction === 1 ? x - hw : x + hw) + direction * this.tailXOff;
    const tailY  = this.y + this.tailLightYOff;
    const headAngle = direction === 1 ? 0 : Math.PI;
    const tailAngle = direction === 1 ? Math.PI : 0;

    this.headlight = new SoftSpotLight({
      x: headX, y: headY, ...headSpot, angle: headAngle,
    });
    this.headSpot = { x: headX, y: headY, ...headPoint, noOcclusion: true };

    this.taillight = new SoftSpotLight({
      x: tailX, y: tailY, ...tailSpot, angle: tailAngle,
    });
    this.tailSpot = { x: tailX, y: tailY, ...tailPoint, noOcclusion: true };
  }

  get lights(): LightSource[] {
    return [...this.headlight.beams, this.headSpot, ...this.taillight.beams, this.tailSpot];
  }

  update(delta: number): void {
    this.x += this.direction * this.speed * (delta / 1000);

    const buf = this.offscreenBuffer;
    if (this.direction === 1 && this.x > this.sceneWidth + buf) {
      this.x = -buf;
    } else if (this.direction === -1 && this.x < -buf) {
      this.x = this.sceneWidth + buf;
    }

    this.sprite.setPosition(this.x, this.y);

    const hw    = this.def.w / 2;
    const headX = (this.direction === 1 ? this.x + hw : this.x - hw) - this.direction * this.headXOff;
    const tailX = (this.direction === 1 ? this.x - hw : this.x + hw) + this.direction * this.tailXOff;

    this.headlight.update(headX, this.y + this.headLightYOff);
    this.headSpot.x = headX;
    this.headSpot.y = this.y + this.headLightYOff;
    this.taillight.update(tailX, this.y + this.tailLightYOff);
    this.tailSpot.x = tailX;
    this.tailSpot.y = this.y + this.tailLightYOff;
  }

  // elevation = Math.sin(sunAngle): +1 noon, -1 midnight.
  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightingElevation) < 0.002) return;
    this._lastLightingElevation = elevation;
    // nightFactor: 0 at full day (elev ≥ 0.1), 1 at full night (elev ≤ -0.2)
    const nightFactor = Math.max(0, Math.min(1, (0.1 - elevation) / 0.3));

    // Tint the sprite darker at night so the car body dims against the ambient.
    const v = Math.round(255 * (1 - 0.75 * nightFactor));
    this.sprite.setTint((v << 16) | (v << 8) | v);

    this.headlight.setIntensity(this.headlightIntensity * nightFactor);
    this.headSpot.intensity  = this.headSpotIntensity  * nightFactor;
    this.taillight.setIntensity(this.taillightIntensity * nightFactor);
    this.tailSpot.intensity  = this.tailSpotIntensity  * nightFactor;
  }

  getShadowInfo(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.def.w, h: this.def.h };
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
