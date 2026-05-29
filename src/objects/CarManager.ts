import Phaser from 'phaser';
import { ROAD_H, ROAD_DIVIDER_H } from '../constants';
import { Car, CAR_W } from './Car';
import { type LightSource } from '../lighting/LightingSystem';
import { LightingSystem } from '../lighting/LightingSystem';

const OFFSCREEN_BUFFER = 200; // px — large enough that lights never visibly pop

interface LaneConfig {
  y: number;
  direction: 1 | -1;
  speedMultiplier: number;
}

// Returns lane centre Y values and directions for a given road level.
// Cars are positioned at 75% down each lane for a convincing side-on look.
function getLanes(level: number, groundY: number): LaneConfig[] {
  const midY     = groundY + ROAD_H / 2;
  const halfDiv  = ROAD_DIVIDER_H / 2;

  if (level >= 10) {
    // 2 lanes each direction; divider spans midY ± halfDiv
    const topH     = ROAD_H / 2 - halfDiv;  // 22 px per half
    const laneH    = topH / 2;               // 11 px per lane
    const botStart = midY + halfDiv;
    return [
      { y: groundY + laneH * 0.75,             direction:  1, speedMultiplier: 1.0 }, // outer right (slow)
      { y: groundY + laneH + laneH * 0.75,     direction:  1, speedMultiplier: 1.4 }, // inner right (fast)
      { y: botStart + laneH * 0.75,            direction: -1, speedMultiplier: 1.4 }, // inner left  (fast)
      { y: botStart + laneH + laneH * 0.75,    direction: -1, speedMultiplier: 1.0 }, // outer left  (slow)
    ];
  }

  if (level >= 8) {
    // 1 lane each direction with divider
    const topH     = ROAD_H / 2 - halfDiv;  // 22 px
    const botStart = midY + halfDiv;
    return [
      { y: groundY + topH * 0.75,    direction:  1, speedMultiplier: 1.0 },
      { y: botStart + topH * 0.75,   direction: -1, speedMultiplier: 1.0 },
    ];
  }

  // Level 1–7: 1 lane each direction, no divider
  const laneH = ROAD_H / 2; // 24 px
  return [
    { y: groundY + laneH * 0.75,          direction:  1, speedMultiplier: 1.0 },
    { y: groundY + laneH + laneH * 0.75,  direction: -1, speedMultiplier: 1.0 },
  ];
}

function carsPerLane(level: number): number {
  if (level <= 2) return 1;
  if (level <= 4) return 2;
  if (level <= 6) return 3;
  return 4;
}

function baseSpeed(level: number): number {
  return 50 + level * 14; // 64 px/s at level 1 → 190 px/s at level 10
}

export class CarManager {
  private readonly scene: Phaser.Scene;
  private cars: Car[] = [];
  private _lights: LightSource[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  rebuild(level: number, groundY: number): void {
    for (const car of this.cars) car.destroy();
    this.cars = [];
    this._lights = [];

    if (level === 0) return;

    const { width } = this.scene.scale;
    const lanes     = getLanes(level, groundY);
    const numCars   = carsPerLane(level);
    const speed     = baseSpeed(level);
    const totalRange = width + 2 * OFFSCREEN_BUFFER;
    const spacing   = totalRange / numCars;

    for (const { y, direction, speedMultiplier } of lanes) {
      const laneSpeed  = speed * speedMultiplier;
      // Random phase so cars don't all line up across lanes
      const groupPhase = Math.random() * spacing;

      for (let i = 0; i < numCars; i++) {
        const offset = (groupPhase + i * spacing) % totalRange;
        const startX = direction === 1
          ? -OFFSCREEN_BUFFER + offset
          : width + OFFSCREEN_BUFFER - offset;

        const car = new Car(this.scene, {
          x: startX,
          y,
          speed: laneSpeed,
          direction,
          sceneWidth: width,
          offscreenBuffer: OFFSCREEN_BUFFER,
        });

        this.cars.push(car);
        for (const l of car.lights) this._lights.push(l);
      }
    }
  }

  get lights(): LightSource[] {
    return this._lights;
  }

  attachLights(system: LightingSystem): void {
    for (const l of this._lights) system.addLight(l);
  }

  detachLights(system: LightingSystem): void {
    for (const l of this._lights) system.removeLight(l);
  }

  update(delta: number): void {
    for (const car of this.cars) car.update(delta);
  }

  destroy(): void {
    for (const car of this.cars) car.destroy();
    this.cars = [];
    this._lights = [];
  }
}

// Re-export CAR_W so consumers don't need to import Car directly
export { CAR_W };
