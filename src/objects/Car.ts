import Phaser from 'phaser';
import { type LightSource } from '../lighting/LightingSystem';
import { SoftSpotLight } from '../lighting/SoftSpotLight';

export const CAR_W = 38;
const CAR_H = 14;

export interface CarConfig {
  x: number;
  y: number;
  speed: number;
  direction: 1 | -1;
  sceneWidth: number;
  offscreenBuffer: number;
}

export class Car {
  private readonly rect: Phaser.GameObjects.Rectangle;
  private x: number;
  private readonly y: number;
  private readonly speed: number;
  private readonly direction: 1 | -1;
  private readonly sceneWidth: number;
  private readonly offscreenBuffer: number;

  private readonly headlight: SoftSpotLight;
  private readonly tailGlow: LightSource;
  private readonly tailBeam: Extract<LightSource, { type: 'spot' }>;

  constructor(scene: Phaser.Scene, config: CarConfig) {
    const { x, y, speed, direction, sceneWidth, offscreenBuffer } = config;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.direction = direction;
    this.sceneWidth = sceneWidth;
    this.offscreenBuffer = offscreenBuffer;

    const bodyColor = direction === 1 ? 0x778899 : 0x887766;
    this.rect = scene.add.rectangle(x, y, CAR_W, CAR_H, bodyColor).setDepth(8);

    const headX = direction === 1 ? x + CAR_W / 2 : x - CAR_W / 2;
    const headAngle = direction === 1 ? 0 : Math.PI;
    this.headlight = new SoftSpotLight({
      x: headX,
      y,
      radius: 90,
      color: 0xfff2cc,
      intensity: 4.5,
      angle: headAngle,
      coneAngle: Math.PI / 5,
      noOcclusion: true,
    });

    const tailX = direction === 1 ? x - CAR_W / 2 : x + CAR_W / 2;
    const tailAngle = direction === 1 ? Math.PI : 0;
    this.tailGlow = { x: tailX, y, radius: 22, color: 0xff1100, intensity: 2.5 };
    this.tailBeam = {
      type: 'spot',
      x: tailX,
      y,
      radius: 45,
      color: 0xff2200,
      intensity: 2.0,
      angle: tailAngle,
      coneAngle: Math.PI / 4,
    };
  }

  get lights(): LightSource[] {
    return [...this.headlight.beams, this.tailGlow, this.tailBeam];
  }

  update(delta: number): void {
    this.x += this.direction * this.speed * (delta / 1000);

    if (this.direction === 1 && this.x > this.sceneWidth + this.offscreenBuffer) {
      this.x = -this.offscreenBuffer;
    } else if (this.direction === -1 && this.x < -this.offscreenBuffer) {
      this.x = this.sceneWidth + this.offscreenBuffer;
    }

    this.rect.setPosition(this.x, this.y);

    const headX = this.direction === 1 ? this.x + CAR_W / 2 : this.x - CAR_W / 2;
    const tailX = this.direction === 1 ? this.x - CAR_W / 2 : this.x + CAR_W / 2;

    this.headlight.update(headX, this.y);
    this.tailGlow.x = tailX;
    this.tailGlow.y = this.y;
    this.tailBeam.x = tailX;
    this.tailBeam.y = this.y;
  }

  destroy(): void {
    this.rect.destroy();
  }
}
