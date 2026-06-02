import Phaser from 'phaser';
import { type LightSource } from '../lighting/LightingSystem';
import { type BoatDef, drawBoatShape } from './BoatAssets';

export type BoatState = 'moving' | 'docking' | 'docked' | 'departing';

const DOCK_SLOW_DIST = 90;
const OFFSCREEN_BUFFER = 130;

export interface BoatConfig {
  def: BoatDef;
  x: number;
  y: number;
  sceneWidth: number;
  dockX: number | null;
  dockDuration: number; // ms to wait at dock
}

export class Boat {
  private readonly gfx: Phaser.GameObjects.Graphics;
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

  // Navigation lights
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
    this.def = def;
    this.x = x;
    this.y = y;
    this.sceneWidth = sceneWidth;
    this.dockX = dockX;
    this.dockDuration = dockDuration;
    this.baseSpeed = def.speed * (0.9 + Math.random() * 0.2); // ±10% variation
    this.bobPhase = Math.random() * Math.PI * 2;

    this.gfx = scene.add.graphics().setDepth(5.9);

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

    this.redraw();
  }

  private redraw(): void {
    const gfx = this.gfx;
    gfx.clear();
    drawBoatShape(gfx, this.def, this.nightFactor);
    gfx.setPosition(this.x, this.y);
  }

  /** Returns true when the boat has left the right edge and should be removed. */
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
          this.state = 'docked';
          this.dockTimer = this.dockDuration;
          this.x = this.dockX;
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

    // Gentle bob
    this.bobPhase += dt * 1.2;
    const bobY = this.y + Math.sin(this.bobPhase) * 1.2;

    this.gfx.setPosition(this.x, bobY);

    this.portLight.x = this.x;
    this.portLight.y = bobY - this.def.h / 2 + 2;
    this.starboardLight.x = this.x;
    this.starboardLight.y = bobY + this.def.h / 2 - 2;
    if (this.sternLight) {
      this.sternLight.x = this.x - this.def.w / 2;
      this.sternLight.y = bobY;
    }

    return this.x > this.sceneWidth + OFFSCREEN_BUFFER;
  }

  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightingElevation) < 0.002) return;
    this._lastLightingElevation = elevation;
    this.nightFactor = Math.max(0, Math.min(1, (0.15 - elevation) / 0.25));
    this.redraw();

    this.portLight.intensity      = this.nightFactor * 25;
    this.starboardLight.intensity = this.nightFactor * 25;
    if (this.sternLight) this.sternLight.intensity = this.nightFactor * 18;
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
