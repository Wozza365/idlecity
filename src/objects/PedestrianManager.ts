import Phaser from 'phaser';
import { YARD_H } from '../constants';
import { type PlotState } from '../game/GameState';
import { hasDoorEntrances } from '../buildings/types';

const COLORS = [
  0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff,
  0xff9f43, 0x00d2d3, 0xff6bcd, 0xa29bfe, 0xfdcb6e,
  0x55efc4, 0xfd79a8,
];

const PED_MIN_H             = 8;
const PED_MAX_H             = 13;
const PED_MIN_W             = 3;
const PED_MAX_W             = 5;
const PED_MIN_SPEED         = 13;
const PED_MAX_SPEED         = 37;
const TURN_ZONE_FRAC        = 0.05;
const DOOR_SPAWN_RATE_FRAC  = 0.20;
const DOOR_SPAWN_POS_JITTER = 3;
const DESPAWN_ARRIVAL_DIST  = 6;
const DESPAWN_BASE_PER_SEC  = 0.025;
const MAX_PEDS              = 60;

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function darkenColor(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8)  & 0xff) * factor);
  const b = Math.round((color & 0xff)          * factor);
  return (r << 16) | (g << 8) | b;
}

type PedPhase =
  | { k: 'walk' }
  | { k: 'enter'; startY: number; targetY: number; t: number }
  | { k: 'approach'; doorX: number; doorY: number }
  | { k: 'leave'; startY: number; doorY: number; t: number };

interface Pedestrian {
  x: number;
  bottomY: number;
  speed: number;
  color: number;
  w: number;
  h: number;
  dir: 1 | -1;
  alpha: number;
  phase: PedPhase;
  turnAtX: number | null;
}

interface DoorEntry { x: number; y: number; level: number; }

export class PedestrianManager {
  private pedestrians: Pedestrian[] = [];
  private groundY:    number;
  private plotWidth:  number;
  private offscreenTimer: number;
  private doorTimer:  number;
  private elevation = 1.0;
  weatherIntensity = 0;
  gameHour = 12;

  // Both Graphics so depth-sort composites correctly with shadow overlays (also Graphics).
  // Rectangle objects in Phaser 4 render in a separate pipeline pass that ignores depth
  // ordering relative to Graphics, which is why Rectangle pedestrians were never darkened.
  private bodyGfx:      Phaser.GameObjects.Graphics;
  private pedShadowGfx: Phaser.GameObjects.Graphics;
  private _hadPedsLastFrame = false;

  constructor(scene: Phaser.Scene, groundY: number, plotWidth: number) {
    this.groundY    = groundY;
    this.plotWidth  = plotWidth;
    this.bodyGfx      = scene.add.graphics().setDepth(9.1);
    this.pedShadowGfx = scene.add.graphics().setDepth(9.09);
    this.offscreenTimer = 1000 + Math.random() * 2000;
    this.doorTimer      = 3000 + Math.random() * 2000;
  }

  rebuild(groundY: number, plotWidth: number): void {
    this.groundY    = groundY;
    this.plotWidth  = plotWidth;
    this.pedestrians    = [];
    this.offscreenTimer = 800  + Math.random() * 1500;
    this.doorTimer      = 2000 + Math.random() * 2000;
  }

  update(
    delta: number,
    plots: PlotState[],
    containers: Phaser.GameObjects.Container[],
    sunAngle: number,
  ): void {
    this.elevation = Math.sin(sunAngle);

    const hasPeds = this.pedestrians.length > 0;
    if (hasPeds || this._hadPedsLastFrame) {
      this.bodyGfx.clear();
      this.pedShadowGfx.clear();
    }
    this._hadPedsLastFrame = hasPeds;

    const rightBound = this.getRightBound(plots);
    if (rightBound <= 0) return;

    const dt        = delta / 1000;
    const turnZoneX = rightBound * (1 - TURN_ZONE_FRAC);
    const doors     = this.getAllDoors(plots, containers);

    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const p  = this.pedestrians[i];
      const ph = p.phase;

      if (ph.k === 'enter') {
        const dist = ph.targetY - ph.startY;
        ph.t       = Math.min(1, ph.t + (p.speed * dt) / Math.max(1, Math.abs(dist)));
        p.bottomY  = ph.startY + dist * smoothstep(ph.t);
        p.alpha    = smoothstep(ph.t);
        p.x       += p.speed * p.dir * smoothstep(ph.t) * dt;
        if (ph.t >= 1) {
          p.bottomY = ph.targetY;
          p.alpha   = 1;
          p.phase   = { k: 'walk' };
        }
        this.syncGO(p);
        continue;
      }

      if (ph.k === 'approach') {
        const toRight = ph.doorX > p.x + p.w / 2;
        p.dir = toRight ? 1 : -1;
        p.x  += p.speed * p.dir * dt;
        if (p.x + p.w < -40 || p.x > rightBound + 40) {
          this.pedestrians.splice(i, 1);
          continue;
        }
        if (Math.abs(p.x + p.w / 2 - ph.doorX) < DESPAWN_ARRIVAL_DIST) {
          p.phase = { k: 'leave', startY: p.bottomY, doorY: ph.doorY, t: 0 };
        }
        this.syncGO(p);
        continue;
      }

      if (ph.k === 'leave') {
        const dist     = ph.doorY - ph.startY;
        const duration = Math.abs(dist) / Math.max(1, p.speed);
        ph.t      = Math.min(1, ph.t + dt / duration);
        p.bottomY = ph.startY + dist * smoothstep(ph.t);
        p.alpha   = 1 - smoothstep(ph.t);
        if (ph.t >= 1) {
          this.pedestrians.splice(i, 1);
          continue;
        }
        this.syncGO(p);
        continue;
      }

      // 'walk' phase
      p.x += p.speed * p.dir * dt;

      if (p.dir === 1 && p.x >= turnZoneX && p.turnAtX === null) {
        p.turnAtX = turnZoneX + Math.random() * (rightBound - turnZoneX - p.w);
      }
      if (p.dir === 1 && p.turnAtX !== null && p.x >= p.turnAtX) {
        p.dir     = -1;
        p.turnAtX = null;
      }
      if (p.x + p.w > rightBound) { p.x = rightBound - p.w; p.dir = -1; p.turnAtX = null; }
      if (p.x + p.w < -40) { this.pedestrians.splice(i, 1); continue; }

      if (doors.length > 0 && Math.random() < DESPAWN_BASE_PER_SEC * dt) {
        const door = this.pickDespawnDoor(p, doors);
        if (door) p.phase = { k: 'approach', doorX: door.x, doorY: door.y };
      }

      this.syncGO(p);
    }

    this.offscreenTimer -= delta;
    if (this.offscreenTimer <= 0) {
      this.spawnOffscreen();
      this.offscreenTimer = this.calcOffscreenDelay(plots);
    }

    this.doorTimer -= delta;
    if (this.doorTimer <= 0 && doors.length > 0) {
      this.spawnFromDoor(doors);
      this.doorTimer = this.calcDoorDelay(plots);
    }
  }

  private nightBrightness(): number {
    const e = this.elevation;
    if (e >= 0.2)  return 1.0;
    if (e >= -0.1) return 0.3 + ((e + 0.1) / 0.3) * 0.7;
    return 0.3;
  }

  private syncGO(p: Pedestrian): void {
    const top        = p.bottomY - p.h;
    const brightness = this.nightBrightness();
    const drawColor  = darkenColor(p.color, brightness);

    this.pedShadowGfx.fillStyle(0x000000, 0.22 * p.alpha);
    this.pedShadowGfx.fillRect(Math.round(p.x), Math.round(p.bottomY) + 2, p.w + 3, 3);

    this.bodyGfx.fillStyle(drawColor, p.alpha);
    this.bodyGfx.fillRect(Math.round(p.x), Math.round(top), p.w, Math.round(p.h));
  }

  private getAllDoors(plots: PlotState[], containers: Phaser.GameObjects.Container[]): DoorEntry[] {
    const result: DoorEntry[] = [];
    for (let i = 0; i < containers.length && i < plots.length; i++) {
      if (!plots[i].unlocked) continue;
      const c = containers[i];
      if (!hasDoorEntrances(c)) continue;
      for (const d of c.doorEntrances) {
        result.push({ x: d.x, y: d.y, level: plots[i].level });
      }
    }
    return result;
  }

  private spawnFromDoor(doors: DoorEntry[]): void {
    if (this.pedestrians.length >= MAX_PEDS) return;

    const totalWeight = doors.reduce((s, d) => s + d.level, 0);
    if (totalWeight === 0) return;
    let pick = Math.random() * totalWeight;
    let door = doors[0];
    for (const d of doors) { pick -= d.level; if (pick <= 0) { door = d; break; } }

    const w       = PED_MIN_W + Math.floor(Math.random() * (PED_MAX_W - PED_MIN_W + 1));
    const h       = PED_MIN_H + Math.random() * (PED_MAX_H - PED_MIN_H);
    const footTop = this.groundY - YARD_H;
    const targetY = footTop + Math.random() * YARD_H;
    const jitter  = (Math.random() * 2 - 1) * DOOR_SPAWN_POS_JITTER;

    this.pedestrians.push({
      x:       door.x + jitter - w / 2,
      bottomY: door.y,
      speed:   PED_MIN_SPEED + Math.random() * (PED_MAX_SPEED - PED_MIN_SPEED),
      color:   COLORS[Math.floor(Math.random() * COLORS.length)],
      w,
      h,
      dir:     Math.random() < 0.5 ? 1 : -1,
      alpha:   0,
      phase:   { k: 'enter', startY: door.y, targetY, t: 0 },
      turnAtX: null,
    });
  }

  private spawnOffscreen(): void {
    if (this.pedestrians.length >= MAX_PEDS) return;

    const w       = PED_MIN_W + Math.floor(Math.random() * (PED_MAX_W - PED_MIN_W + 1));
    const h       = PED_MIN_H + Math.random() * (PED_MAX_H - PED_MIN_H);
    const footTop = this.groundY - YARD_H;
    const bottomY = footTop + Math.random() * YARD_H;

    this.pedestrians.push({
      x:       -(w + 2),
      bottomY,
      speed:   PED_MIN_SPEED + Math.random() * (PED_MAX_SPEED - PED_MIN_SPEED),
      color:   COLORS[Math.floor(Math.random() * COLORS.length)],
      w,
      h,
      dir:     1,
      alpha:   1,
      phase:   { k: 'walk' },
      turnAtX: null,
    });
  }

  private pickDespawnDoor(p: Pedestrian, doors: DoorEntry[]): DoorEntry | null {
    const nearby = doors.filter(d => Math.abs(d.x - p.x) < this.plotWidth * 2);
    const pool   = nearby.length > 0 ? nearby : doors;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  private getRightBound(plots: PlotState[]): number {
    let rightmost = -1;
    for (let i = 0; i < plots.length; i++) {
      if (plots[i].unlocked) rightmost = i;
    }
    return rightmost < 0 ? 0 : (rightmost + 1) * this.plotWidth;
  }

  private dayNightFactor(): number {
    const e = this.elevation;
    let base: number;
    if (e >  0.3)  base = 1.0;
    else if (e >  0)    base = 0.4 + (e / 0.3) * 0.6;
    else if (e > -0.3)  base = 0.05 + ((e + 0.3) / 0.3) * 0.35;
    else base = 0.05;

    const h = this.gameHour;
    let rushFactor: number;
    if      ((h >= 8  && h < 9)  || (h >= 17 && h < 18)) rushFactor = 1.5;
    else if  (h >= 2  && h < 5)                           rushFactor = 0.15;
    else                                                  rushFactor = 1.0;

    return base * rushFactor;
  }

  private calcOffscreenDelay(plots: PlotState[]): number {
    const totalLevel = plots.reduce((s, p) => s + (p.unlocked ? p.level : 0), 0);
    if (totalLevel === 0) return 8000;
    const factor   = this.dayNightFactor() * (1 - 0.80 * this.weatherIntensity);
    const baseMs   = Math.max(300, 10000 / totalLevel);
    const adjusted = baseMs / Math.max(0.02, factor);
    return adjusted * (0.65 + Math.random() * 0.70);
  }

  private calcDoorDelay(plots: PlotState[]): number {
    return this.calcOffscreenDelay(plots) / DOOR_SPAWN_RATE_FRAC;
  }

  destroy(): void {
    this.bodyGfx.destroy();
    this.pedShadowGfx.destroy();
    this.pedestrians = [];
  }
}
