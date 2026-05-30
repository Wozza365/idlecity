import Phaser from 'phaser';
import { YARD_H } from '../constants';
import { type PlotState } from '../game/GameState';
import { hasDoorEntrances } from '../buildings/types';

const COLORS = [
  0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff,
  0xff9f43, 0x00d2d3, 0xff6bcd, 0xa29bfe, 0xfdcb6e,
  0x55efc4, 0xfd79a8,
];

const PED_MIN_H              = 8;
const PED_MAX_H              = 13;
const PED_MIN_W              = 3;
const PED_MAX_W              = 5;
const PED_MIN_SPEED          = 22;
const PED_MAX_SPEED          = 62;
const TURN_ZONE_FRAC         = 0.05;
const TURN_RATE              = 0.9;
const DOOR_SPAWN_RATE_FRAC   = 0.20;
const DOOR_SPAWN_POS_JITTER  = 3;
const DOOR_VERT_SPEED        = 40;
const DESPAWN_ARRIVAL_DIST   = 6;
const DESPAWN_LEAVE_DURATION = 0.45;
const DESPAWN_BASE_PER_SEC   = 0.025;

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
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
}

interface DoorEntry { x: number; y: number; level: number; }

export class PedestrianManager {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private pedestrians: Pedestrian[] = [];
  private groundY: number;
  private plotWidth: number;
  private offscreenTimer: number;
  private doorTimer: number;
  private elevation = 1.0;

  constructor(scene: Phaser.Scene, groundY: number, plotWidth: number) {
    this.groundY        = groundY;
    this.plotWidth      = plotWidth;
    this.gfx            = scene.add.graphics().setDepth(9.1);
    this.offscreenTimer = 1000 + Math.random() * 2000;
    this.doorTimer      = 3000 + Math.random() * 2000;
  }

  rebuild(groundY: number, plotWidth: number): void {
    this.groundY        = groundY;
    this.plotWidth      = plotWidth;
    this.pedestrians    = [];
    this.offscreenTimer = 800 + Math.random() * 1500;
    this.doorTimer      = 2000 + Math.random() * 2000;
  }

  update(
    delta: number,
    plots: PlotState[],
    containers: Phaser.GameObjects.Container[],
    sunAngle: number,
  ): void {
    this.elevation = Math.sin(sunAngle);

    const rightBound = this.getRightBound(plots);
    if (rightBound <= 0) { this.gfx.clear(); return; }

    const dt        = delta / 1000;
    const turnZoneX = rightBound * (1 - TURN_ZONE_FRAC);
    const doors     = this.getAllDoors(plots, containers);

    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const p  = this.pedestrians[i];
      const ph = p.phase;

      if (ph.k === 'enter') {
        const dist = ph.targetY - ph.startY;
        ph.t       = Math.min(1, ph.t + (DOOR_VERT_SPEED * dt) / Math.max(1, Math.abs(dist)));
        p.bottomY  = ph.startY + dist * smoothstep(ph.t);
        p.alpha    = smoothstep(ph.t);
        // Horizontal speed ramps up with progress (axis transition)
        p.x       += p.speed * p.dir * smoothstep(ph.t) * dt;
        if (ph.t >= 1) {
          p.bottomY = ph.targetY;
          p.alpha   = 1;
          p.phase   = { k: 'walk' };
        }
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
        continue;
      }

      if (ph.k === 'leave') {
        ph.t      = Math.min(1, ph.t + dt / DESPAWN_LEAVE_DURATION);
        const dist = ph.doorY - ph.startY;
        p.bottomY  = ph.startY + dist * smoothstep(ph.t);
        p.alpha    = 1 - smoothstep(ph.t);
        if (ph.t >= 1) {
          this.pedestrians.splice(i, 1);
        }
        continue;
      }

      // 'walk' phase
      p.x += p.speed * p.dir * dt;

      if (p.dir === 1 && p.x >= turnZoneX) {
        if (Math.random() < TURN_RATE * dt) p.dir = -1;
      }
      if (p.x + p.w > rightBound) { p.x = rightBound - p.w; p.dir = -1; }
      if (p.x + p.w < -40) { this.pedestrians.splice(i, 1); continue; }

      if (doors.length > 0 && Math.random() < DESPAWN_BASE_PER_SEC * dt) {
        const door = this.pickDespawnDoor(p, doors);
        if (door) p.phase = { k: 'approach', doorX: door.x, doorY: door.y };
      }
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

    this.draw();
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
    });
  }

  private spawnOffscreen(): void {
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
    });
  }

  private pickDespawnDoor(p: Pedestrian, doors: DoorEntry[]): DoorEntry | null {
    const nearby = doors.filter(d => Math.abs(d.x - p.x) < this.plotWidth * 2);
    const pool   = nearby.length > 0 ? nearby : doors;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  private draw(): void {
    const gfx = this.gfx;
    gfx.clear();
    for (const p of this.pedestrians) {
      const top = p.bottomY - p.h;
      gfx.fillStyle(0x000000, 0.22 * p.alpha);
      gfx.fillEllipse(p.x + p.w / 2, p.bottomY + 2, p.w + 3, 3);
      gfx.fillStyle(p.color, p.alpha);
      gfx.fillRect(p.x, top, p.w, p.h);
    }
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
    if (e >  0.3)  return 1.0;
    if (e >  0)    return 0.4 + (e / 0.3) * 0.6;
    if (e > -0.3)  return 0.05 + ((e + 0.3) / 0.3) * 0.35;
    return 0.05;
  }

  private calcOffscreenDelay(plots: PlotState[]): number {
    const totalLevel = plots.reduce((s, p) => s + (p.unlocked ? p.level : 0), 0);
    if (totalLevel === 0) return 8000;
    const factor   = this.dayNightFactor();
    const baseMs   = Math.max(300, 10000 / totalLevel);
    const adjusted = baseMs / Math.max(0.02, factor);
    return adjusted * (0.65 + Math.random() * 0.70);
  }

  private calcDoorDelay(plots: PlotState[]): number {
    return this.calcOffscreenDelay(plots) / DOOR_SPAWN_RATE_FRAC;
  }

  destroy(): void {
    this.gfx.destroy();
    this.pedestrians = [];
  }
}
