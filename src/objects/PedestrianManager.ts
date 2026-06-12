import Phaser from 'phaser';
import { YARD_H } from '../constants';
import { type PlotState } from '../game/GameState';
import { hasDoorEntrances } from '../buildings/types';
import { type PersonDef, PERSON_DEFS, pickRandomPerson, walkAnimKey } from './PedestrianAssets';

const PED_MIN_H             = 12;
const PED_MAX_H             = 18;
const PED_MIN_SPEED         = 13;
const PED_MAX_SPEED         = 37;
const PED_BASE_SPEED        = (PED_MIN_SPEED + PED_MAX_SPEED) / 2;
const WALK_ANIM_FRAMERATE   = 7;
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

type PedPhase =
  | { k: 'walk' }
  | { k: 'enter'; startY: number; targetY: number; t: number }
  | { k: 'approach'; doorX: number; doorY: number }
  | { k: 'leave'; startY: number; doorY: number; t: number };

interface Pedestrian {
  x: number;
  bottomY: number;
  speed: number;
  w: number;
  h: number;
  dir: 1 | -1;
  alpha: number;
  phase: PedPhase;
  turnAtX: number | null;
  sprite: Phaser.GameObjects.Sprite;
}

interface DoorEntry { x: number; y: number; level: number; }

export class PedestrianManager {
  private readonly scene: Phaser.Scene;
  private pedestrians: Pedestrian[] = [];
  private groundY:    number;
  private plotWidth:  number;
  private offscreenTimer: number;
  private doorTimer:  number;
  private elevation = 1.0;
  weatherIntensity = 0;
  gameHour = 12;

  // Shadow is Graphics so it depth-sorts correctly with other shadow overlays
  // (also Graphics) — Rectangle objects render in a pass that ignores depth
  // ordering relative to Graphics.
  private pedShadowGfx: Phaser.GameObjects.Graphics;
  private _hadPedsLastFrame = false;

  constructor(scene: Phaser.Scene, groundY: number, plotWidth: number) {
    this.scene      = scene;
    this.groundY    = groundY;
    this.plotWidth  = plotWidth;
    this.pedShadowGfx = scene.add.graphics().setDepth(9.09);
    this.offscreenTimer = 1000 + Math.random() * 2000;
    this.doorTimer      = 3000 + Math.random() * 2000;
    this.setupAnimations();
  }

  private setupAnimations(): void {
    for (const def of PERSON_DEFS) {
      const key = walkAnimKey(def.key);
      if (this.scene.anims.exists(key)) continue;
      if (!this.scene.textures.exists(def.key)) continue;
      this.scene.anims.create({
        key,
        frames: this.scene.anims.generateFrameNumbers(def.key, { start: 0, end: def.frameCount - 1 }),
        frameRate: WALK_ANIM_FRAMERATE,
        repeat: -1,
      });
    }
  }

  rebuild(groundY: number, plotWidth: number): void {
    this.groundY    = groundY;
    this.plotWidth  = plotWidth;
    for (const p of this.pedestrians) p.sprite.destroy();
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
          p.sprite.destroy();
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
          p.sprite.destroy();
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
      if (p.x + p.w < -40) {
        p.sprite.destroy();
        this.pedestrians.splice(i, 1);
        continue;
      }

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
    const brightness = this.nightBrightness();
    const v = Math.round(255 * brightness);

    p.sprite.setPosition(Math.round(p.x + p.w / 2), Math.round(p.bottomY));
    p.sprite.setAlpha(p.alpha);
    p.sprite.setFlipX(p.dir === -1);
    p.sprite.setTint((v << 16) | (v << 8) | v);

    this.pedShadowGfx.fillStyle(0x000000, 0.22 * p.alpha);
    this.pedShadowGfx.fillRect(Math.round(p.x), Math.round(p.bottomY) + 1, Math.round(p.w), 2);
  }

  private makeSprite(x: number, bottomY: number, w: number, h: number, dir: 1 | -1, def: PersonDef): Phaser.GameObjects.Sprite {
    const sprite = this.scene.add.sprite(x + w / 2, bottomY, def.key)
      .setOrigin(0.5, 1)
      .setDepth(9.1)
      .setDisplaySize(w, h)
      .setFlipX(dir === -1);

    if (this.scene.anims.exists(walkAnimKey(def.key))) {
      sprite.play(walkAnimKey(def.key));
      sprite.anims.setProgress(Math.random());
    }
    return sprite;
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

    const def     = pickRandomPerson();
    const h       = PED_MIN_H + Math.random() * (PED_MAX_H - PED_MIN_H);
    const w       = h * (def.frameWidth / def.frameHeight);
    const footTop = this.groundY - YARD_H;
    const targetY = footTop + Math.random() * YARD_H;
    const jitter  = (Math.random() * 2 - 1) * DOOR_SPAWN_POS_JITTER;
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const speed   = PED_MIN_SPEED + Math.random() * (PED_MAX_SPEED - PED_MIN_SPEED);
    const x       = door.x + jitter - w / 2;

    const sprite = this.makeSprite(x, door.y, w, h, dir, def);
    sprite.anims.timeScale = speed / PED_BASE_SPEED;
    sprite.setAlpha(0);

    this.pedestrians.push({
      x,
      bottomY: door.y,
      speed,
      w,
      h,
      dir,
      alpha:   0,
      phase:   { k: 'enter', startY: door.y, targetY, t: 0 },
      turnAtX: null,
      sprite,
    });
  }

  private spawnOffscreen(): void {
    if (this.pedestrians.length >= MAX_PEDS) return;

    const def     = pickRandomPerson();
    const h       = PED_MIN_H + Math.random() * (PED_MAX_H - PED_MIN_H);
    const w       = h * (def.frameWidth / def.frameHeight);
    const footTop = this.groundY - YARD_H;
    const bottomY = footTop + Math.random() * YARD_H;
    const x       = -(w + 2);
    const speed   = PED_MIN_SPEED + Math.random() * (PED_MAX_SPEED - PED_MIN_SPEED);

    const sprite = this.makeSprite(x, bottomY, w, h, 1, def);
    sprite.anims.timeScale = speed / PED_BASE_SPEED;

    this.pedestrians.push({
      x,
      bottomY,
      speed,
      w,
      h,
      dir:     1,
      alpha:   1,
      phase:   { k: 'walk' },
      turnAtX: null,
      sprite,
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
    const baseMs   = Math.max(300, 10000 / totalLevel) / 0.75;
    const adjusted = baseMs / Math.max(0.02, factor);
    return adjusted * (0.65 + Math.random() * 0.70);
  }

  private calcDoorDelay(plots: PlotState[]): number {
    return this.calcOffscreenDelay(plots) / DOOR_SPAWN_RATE_FRAC;
  }

  destroy(): void {
    for (const p of this.pedestrians) p.sprite.destroy();
    this.pedShadowGfx.destroy();
    this.pedestrians = [];
  }
}
