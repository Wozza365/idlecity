import Phaser from 'phaser';
import { type LightSource } from '../lighting/LightingSystem';
import { SoftSpotLight } from '../lighting/SoftSpotLight';
import { type CarDef } from './CarAssets';

export const CAR_W = 38;

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

  constructor(scene: Phaser.Scene, config: CarConfig) {
    const { def, x, y, speed, direction, sceneWidth, offscreenBuffer } = config;
    this.def = def;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.direction = direction;
    this.sceneWidth = sceneWidth;
    this.offscreenBuffer = offscreenBuffer;

    // Sprites face right by default; flip for leftward traffic
    this.sprite = scene.add.image(x, y, def.key)
      .setFlipX(direction === -1)
      .setDepth(8);

    const hw = def.w / 2;
    const headX = direction === 1 ? x + hw : x - hw;
    const tailX = direction === 1 ? x - hw : x + hw;
    const headAngle = direction === 1 ? 0 : Math.PI;
    const tailAngle = direction === 1 ? Math.PI : 0;

    this.headlight = new SoftSpotLight({
      x: headX, y,
      radius: 90, color: 0xfff2cc, intensity: 4.5,
      angle: headAngle, coneAngle: Math.PI / 5,
      noOcclusion: true,
    });

    // Bright source dot at the headlight position (radius large enough to saturate multiple pixels)
    this.headSpot = { x: headX, y, radius: 10, color: 0xfffae0, intensity: 40, noOcclusion: true };

    this.taillight = new SoftSpotLight({
      x: tailX, y,
      radius: 50, color: 0xff2200, intensity: 2.5,
      angle: tailAngle, coneAngle: Math.PI / 5,
      noOcclusion: true,
    });

    // Bright source dot at the tail light position
    this.tailSpot = { x: tailX, y, radius: 10, color: 0xff0000, intensity: 40, noOcclusion: true };
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

    const hw = this.def.w / 2;
    const headX = this.direction === 1 ? this.x + hw : this.x - hw;
    const tailX = this.direction === 1 ? this.x - hw : this.x + hw;

    this.headlight.update(headX, this.y);
    this.headSpot.x = headX;
    this.headSpot.y = this.y;
    this.taillight.update(tailX, this.y);
    this.tailSpot.x = tailX;
    this.tailSpot.y = this.y;
  }

  // elevation = Math.sin(sunAngle): +1 noon, -1 midnight.
  // Mirrors the window-light convention used by buildings.
  updateLighting(elevation: number): void {
    // nightFactor: 0 at full day (elev ≥ 0.1), 1 at full night (elev ≤ -0.2)
    const nightFactor = Math.max(0, Math.min(1, (0.1 - elevation) / 0.3));

    // Tint the sprite darker at night so the car body dims against the ambient.
    // The ambient stays at intensity 1.0 at night (moonlit sky), so without a tint
    // car sprites appear at ~75% daytime brightness. The tint reduces them to ~20%.
    const v = Math.round(255 * (1 - 0.75 * nightFactor));
    this.sprite.setTint((v << 16) | (v << 8) | v);

    this.headlight.setIntensity(4.5 * nightFactor);
    this.headSpot.intensity  = 40  * nightFactor;
    this.taillight.setIntensity(2.5 * nightFactor);
    this.tailSpot.intensity  = 40  * nightFactor;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
