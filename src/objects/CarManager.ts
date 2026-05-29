import Phaser from 'phaser';
import { ROAD_H, ROAD_DIVIDER_H } from '../constants';
import { Car, CAR_W } from './Car';
import { type LightSource } from '../lighting/LightingSystem';
import { LightingSystem } from '../lighting/LightingSystem';

const OFFSCREEN_BUFFER = 600;
const CAR_Y_OFFSET = -7;

interface LaneConfig {
  y: number;
  direction: 1 | -1;
  speedMultiplier: number;
}

// Cars within the same band share identical lane Y positions and directions.
function getLaneBand(level: number): number {
  if (level >= 10) return 3;
  if (level >= 8)  return 2;
  return 1;
}

function getLanes(level: number, groundY: number): LaneConfig[] {
  const midY    = groundY + ROAD_H / 2;
  const halfDiv = ROAD_DIVIDER_H / 2;

  if (level >= 10) {
    const topH     = ROAD_H / 2 - halfDiv;
    const laneH    = topH / 2;
    const botStart = midY + halfDiv;
    return [
      { y: groundY + laneH * 0.75,          direction:  1, speedMultiplier: 1.0 }, // outer right (slow)
      { y: groundY + laneH + laneH * 0.75,  direction:  1, speedMultiplier: 1.4 }, // inner right (fast)
      { y: botStart + laneH * 0.75,         direction: -1, speedMultiplier: 1.4 }, // inner left  (fast)
      { y: botStart + laneH + laneH * 0.75, direction: -1, speedMultiplier: 1.0 }, // outer left  (slow)
    ];
  }

  if (level >= 8) {
    const topH     = ROAD_H / 2 - halfDiv;
    const botStart = midY + halfDiv;
    return [
      { y: groundY + topH * 0.75,  direction:  1, speedMultiplier: 1.0 },
      { y: botStart + topH * 0.75, direction: -1, speedMultiplier: 1.0 },
    ];
  }

  const laneH = ROAD_H / 2;
  return [
    { y: groundY + laneH * 0.75,         direction:  1, speedMultiplier: 1.0 },
    { y: groundY + laneH + laneH * 0.75, direction: -1, speedMultiplier: 1.0 },
  ];
}

function carsPerLane(level: number): number {
  if (level <= 2) return 1;
  if (level <= 4) return 2;
  if (level <= 6) return 3;
  return 4;
}

function baseSpeed(level: number): number {
  return 50 + level * 14;
}

export class CarManager {
  private readonly scene: Phaser.Scene;
  private laneCars: Car[][] = [];
  private lanes: LaneConfig[] = [];
  private currentLevel: number = 0;
  private _lights: LightSource[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private get allCars(): Car[] {
    return this.laneCars.flat();
  }

  private makeCar(lane: LaneConfig, x: number, speed: number): Car {
    const { width } = this.scene.scale;
    return new Car(this.scene, {
      x,
      y: lane.y + CAR_Y_OFFSET,
      speed,
      direction: lane.direction,
      sceneWidth: width,
      offscreenBuffer: OFFSCREEN_BUFFER,
    });
  }

  // True when upgrading to newLevel requires a full rebuild (lane layout changes).
  needsRebuild(newLevel: number): boolean {
    if (this.currentLevel === 0) return true;
    return getLaneBand(newLevel) !== getLaneBand(this.currentLevel);
  }

  rebuild(level: number, groundY: number): void {
    for (const car of this.allCars) car.destroy();
    this.laneCars = [];
    this.lanes    = [];
    this._lights  = [];
    this.currentLevel = 0;

    if (level === 0) return;

    const { width } = this.scene.scale;
    this.lanes       = getLanes(level, groundY);
    const numCars    = carsPerLane(level);
    const speed      = baseSpeed(level);
    const totalRange = width + 2 * OFFSCREEN_BUFFER;
    const spacing    = totalRange / numCars;

    for (const lane of this.lanes) {
      const laneSpeed  = speed * lane.speedMultiplier;
      const groupPhase = Math.random() * spacing;
      const carsInLane: Car[] = [];

      for (let i = 0; i < numCars; i++) {
        const offset = (groupPhase + i * spacing) % totalRange;
        const startX = lane.direction === 1
          ? -OFFSCREEN_BUFFER + offset
          : width + OFFSCREEN_BUFFER - offset;

        const car = this.makeCar(lane, startX, laneSpeed);
        for (const l of car.lights) this._lights.push(l);
        carsInLane.push(car);
      }

      this.laneCars.push(carsInLane);
    }

    this.currentLevel = level;
  }

  // Update speed and add extra cars if the car count grew, without
  // resetting existing car positions. Returns any newly created light sources
  // that the caller must register with the lighting system.
  upgradeInPlace(newLevel: number, _groundY: number): LightSource[] {
    const oldCarCount = carsPerLane(this.currentLevel);
    const newCarCount = carsPerLane(newLevel);
    const newBase     = baseSpeed(newLevel);
    const newLights: LightSource[] = [];
    const { width }   = this.scene.scale;

    for (let i = 0; i < this.lanes.length; i++) {
      const lane      = this.lanes[i];
      const laneSpeed = newBase * lane.speedMultiplier;

      for (const car of this.laneCars[i]) car.setSpeed(laneSpeed);

      if (newCarCount > oldCarCount) {
        // Spawn one additional car off-screen per lane per level step
        const startX = lane.direction === 1
          ? -OFFSCREEN_BUFFER
          : width + OFFSCREEN_BUFFER;

        const car = this.makeCar(lane, startX, laneSpeed);
        this.laneCars[i].push(car);
        for (const l of car.lights) {
          this._lights.push(l);
          newLights.push(l);
        }
      }
    }

    this.currentLevel = newLevel;
    return newLights;
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
    for (const car of this.allCars) car.update(delta);
  }

  destroy(): void {
    for (const car of this.allCars) car.destroy();
    this.laneCars = [];
    this.lanes    = [];
    this._lights  = [];
    this.currentLevel = 0;
  }
}

export { CAR_W };
