import Phaser from 'phaser';
import { YARD_H } from '../constants';
import { type PlotState } from '../game/GameState';
import { hasDoorEntrances } from '../buildings/types';
import { type PersonDef, PERSON_DEFS, pickRandomPerson, walkAnimKey } from './PedestrianAssets';

const PED_MIN_H             = 15;
const PED_MAX_H             = 23;
const PED_MIN_SPEED         = 13;
const PED_MAX_SPEED         = 37;
const PED_BASE_SPEED        = (PED_MIN_SPEED + PED_MAX_SPEED) / 2;
const WALK_ANIM_FRAMERATE   = 4;
const TURN_ZONE_FRAC        = 0.05;
const DOOR_SPAWN_RATE_FRAC  = 0.20;
const DOOR_SPAWN_POS_JITTER = 3;
const DESPAWN_ARRIVAL_DIST  = 6;
const DESPAWN_BASE_PER_SEC  = 0.025;
const MAX_PEDS              = 40;

// Depth-sorting: pedestrians lower on the pavement (larger bottomY) draw on top.
const PED_DEPTH_BASE        = 9.10;
const PED_DEPTH_RANGE       = 0.04;

// Character-shaped "halo" shadow — a slightly oversized silhouette of the same
// sprite, solid-filled via tint and drawn just behind/below the character.
const SHAPE_SHADOW_ALPHA    = 0.22;
const SHAPE_SHADOW_PAD      = 2;
const SHAPE_SHADOW_OFFSET_X = 1;
const SHAPE_SHADOW_OFFSET_Y = 1;

// Soft ground-contact shadow: two overlapping ellipses (wide/faint + narrow/denser)
// approximate a blurred shadow without a real blur filter.
const GROUND_SHADOW_OUTER_A = 0.10;
const GROUND_SHADOW_INNER_A = 0.20;

// Pets — a fraction of pedestrians walk a dog at heel.
const PET_CHANCE      = 0.16;
const PET_TRAIL_OFFSET = 0.55; // fraction of pedestrian width, trailing behind owner
const PET_LEG_FREQ    = 5;     // leg-swap cycles per second at PED_BASE_SPEED
const PET_TAIL_FREQ   = 2.4;   // tail wags per second
const PET_WAG_ANGLE   = 0.7;   // radians of tail swing
const PET_COLORS: readonly number[] = [0x8b5e3c, 0xe8ddc8, 0x2b2b2b, 0x9a9a9a, 0xc97a3c];
const PET_EAR_COLOR_SHIFT = 0.7; // brightness multiplier for ears/tail vs body

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function pickPet(): Pet | undefined {
  if (Math.random() >= PET_CHANCE) return undefined;
  return {
    color: PET_COLORS[Math.floor(Math.random() * PET_COLORS.length)],
    legPhase: Math.random() * Math.PI * 2,
    tailPhase: Math.random() * Math.PI * 2,
  };
}

type PedPhase =
  | { k: 'walk' }
  | { k: 'enter'; startY: number; targetY: number; t: number }
  | { k: 'approach'; doorX: number; doorY: number }
  | { k: 'leave'; startY: number; doorY: number; t: number };

interface Pet {
  color: number;
  legPhase: number;
  tailPhase: number;
}

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
  shadowSprite: Phaser.GameObjects.Sprite;
  pet?: Pet;
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
  // Pets render between the ground shadow (9.09) and pedestrian sprites (9.10+),
  // so dogs sit behind their owner but in front of the shadow layer.
  private petGfx: Phaser.GameObjects.Graphics;
  private _hadPedsLastFrame = false;
  private _speedMultiplier = 1;

  constructor(scene: Phaser.Scene, groundY: number, plotWidth: number, speedMultiplier = 1) {
    this.scene      = scene;
    this.groundY    = groundY;
    this.plotWidth  = plotWidth;
    this._speedMultiplier = speedMultiplier;
    this.pedShadowGfx = scene.add.graphics().setDepth(9.09);
    this.petGfx       = scene.add.graphics().setDepth(9.095);
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

  rebuild(groundY: number, plotWidth: number, speedMultiplier = 1): void {
    this.groundY    = groundY;
    this.plotWidth  = plotWidth;
    this._speedMultiplier = speedMultiplier;
    for (const p of this.pedestrians) { p.sprite.destroy(); p.shadowSprite.destroy(); }
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
      this.petGfx.clear();
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

      if (p.pet) {
        p.pet.legPhase  += dt * (p.speed / PED_BASE_SPEED) * PET_LEG_FREQ  * Math.PI * 2;
        p.pet.tailPhase += dt * PET_TAIL_FREQ * Math.PI * 2;
      }

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
          p.shadowSprite.destroy();
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
          p.shadowSprite.destroy();
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
        p.shadowSprite.destroy();
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

  // Depth increases with how far down the pavement (yard) a pedestrian stands,
  // so those nearer the viewer (lower on screen) draw over those further back.
  private pedDepth(bottomY: number): number {
    const frac = (bottomY - (this.groundY - YARD_H)) / YARD_H;
    return PED_DEPTH_BASE + Math.max(0, Math.min(1, frac)) * PED_DEPTH_RANGE;
  }

  private drawGroundShadow(p: Pedestrian): void {
    const cx = p.x + p.w / 2;
    const cy = p.bottomY + 1;
    this.pedShadowGfx.fillStyle(0x000000, GROUND_SHADOW_OUTER_A * p.alpha);
    this.pedShadowGfx.fillEllipse(cx, cy, p.w * 1.3, p.h * 0.22);
    this.pedShadowGfx.fillStyle(0x000000, GROUND_SHADOW_INNER_A * p.alpha);
    this.pedShadowGfx.fillEllipse(cx, cy, p.w * 0.8, p.h * 0.13);
  }

  private syncGO(p: Pedestrian): void {
    const brightness = this.nightBrightness();
    const v = Math.round(255 * brightness);
    const tint  = (v << 16) | (v << 8) | v;
    const depth = this.pedDepth(p.bottomY);
    const cx    = Math.round(p.x + p.w / 2);
    const cy    = Math.round(p.bottomY);

    p.sprite.setPosition(cx, cy);
    p.sprite.setAlpha(p.alpha);
    p.sprite.setFlipX(p.dir === -1);
    p.sprite.setTint(tint);
    p.sprite.setDepth(depth);

    // Shape shadow mirrors the main sprite's current frame, slightly enlarged
    // and offset, solid-filled black — a soft silhouette to separate overlaps.
    p.shadowSprite.setPosition(cx + SHAPE_SHADOW_OFFSET_X, cy + SHAPE_SHADOW_OFFSET_Y);
    p.shadowSprite.setFlipX(p.dir === -1);
    p.shadowSprite.setFrame(p.sprite.frame.name);
    p.shadowSprite.setAlpha(p.alpha * SHAPE_SHADOW_ALPHA);
    p.shadowSprite.setDepth(depth);

    this.drawGroundShadow(p);
    if (p.pet) this.drawPet(p, p.pet, brightness);
  }

  private drawPet(p: Pedestrian, pet: Pet, brightness: number): void {
    const gfx = this.petGfx;
    const v = Math.round(255 * brightness);
    const dim = (c: number, mult: number): number => {
      const r = Math.round(((c >> 16) & 0xff) * mult * (v / 255));
      const g = Math.round(((c >> 8)  & 0xff) * mult * (v / 255));
      const b = Math.round(( c        & 0xff) * mult * (v / 255));
      return (r << 16) | (g << 8) | b;
    };

    const bodyLen = p.h * 0.55;
    const bodyH   = p.h * 0.32;
    const cx = p.x + p.w / 2 - p.dir * (p.w * PET_TRAIL_OFFSET);
    const cy = p.bottomY;
    const bodyCx = cx;
    const bodyCy = cy - bodyH / 2;

    // Ground contact shadow
    gfx.fillStyle(0x000000, GROUND_SHADOW_OUTER_A * p.alpha);
    gfx.fillEllipse(bodyCx, cy + 1, bodyLen * 1.1, bodyH * 0.4);

    const bodyColor = dim(pet.color, 1);
    const accentColor = dim(pet.color, PET_EAR_COLOR_SHIFT);

    // Tail — wags behind the body, opposite the facing direction
    const tailBaseX = bodyCx - p.dir * bodyLen * 0.5;
    const wag = Math.sin(pet.tailPhase) * PET_WAG_ANGLE;
    const tailLen = bodyH * 1.1;
    const tailTipX = tailBaseX - p.dir * Math.cos(wag) * tailLen;
    const tailTipY = bodyCy - Math.sin(wag + 0.6) * tailLen;
    gfx.fillStyle(accentColor, p.alpha);
    gfx.fillTriangle(
      tailBaseX, bodyCy - bodyH * 0.2,
      tailBaseX, bodyCy + bodyH * 0.2,
      tailTipX, tailTipY,
    );

    // Legs — two visible legs, alternating stride
    const legSwing = Math.sin(pet.legPhase) * bodyLen * 0.18;
    gfx.fillStyle(accentColor, p.alpha);
    gfx.fillRect(Math.round(bodyCx - bodyLen * 0.25 + legSwing), Math.round(cy - 1), 1, 2);
    gfx.fillRect(Math.round(bodyCx + bodyLen * 0.2 - legSwing), Math.round(cy - 1), 1, 2);

    // Body
    gfx.fillStyle(bodyColor, p.alpha);
    gfx.fillEllipse(bodyCx, bodyCy, bodyLen, bodyH);

    // Head — at the front, in the direction of travel
    const headCx = bodyCx + p.dir * bodyLen * 0.48;
    const headCy = bodyCy - bodyH * 0.15;
    const headR  = bodyH * 0.6;
    gfx.fillStyle(bodyColor, p.alpha);
    gfx.fillCircle(headCx, headCy, headR);

    // Ear — small triangle on top of the head
    gfx.fillStyle(accentColor, p.alpha);
    gfx.fillTriangle(
      headCx - p.dir * headR * 0.3, headCy - headR * 0.7,
      headCx + p.dir * headR * 0.5, headCy - headR * 0.7,
      headCx + p.dir * headR * 0.1, headCy - headR * 1.6,
    );

    // Snout
    gfx.fillStyle(accentColor, p.alpha);
    gfx.fillRect(
      Math.round(headCx + p.dir * headR * 0.6),
      Math.round(headCy - 0.5),
      Math.round(headR * 0.6) || 1,
      1,
    );
  }

  /** Returns the centre x of every pedestrian currently in the 'walk' phase. */
  getXPositions(): number[] {
    const out: number[] = [];
    for (const p of this.pedestrians) {
      if (p.phase.k === 'walk') out.push(p.x + p.w / 2);
    }
    return out;
  }

  private makePedSprites(
    x: number, bottomY: number, w: number, h: number, dir: 1 | -1, def: PersonDef,
  ): { sprite: Phaser.GameObjects.Sprite; shadowSprite: Phaser.GameObjects.Sprite } {
    // Added first so it sits behind the main sprite at equal depth (stable sort).
    const shadowSprite = this.scene.add.sprite(x + w / 2, bottomY, def.key)
      .setOrigin(0.5, 1)
      .setDisplaySize(w + SHAPE_SHADOW_PAD, h + SHAPE_SHADOW_PAD)
      .setFlipX(dir === -1)
      .setTint(0x000000)
      .setTintMode(Phaser.TintModes.FILL);

    const sprite = this.scene.add.sprite(x + w / 2, bottomY, def.key)
      .setOrigin(0.5, 1)
      .setDisplaySize(w, h)
      .setFlipX(dir === -1);

    if (this.scene.anims.exists(walkAnimKey(def.key))) {
      sprite.play(walkAnimKey(def.key));
      sprite.anims.setProgress(Math.random());
      shadowSprite.setFrame(sprite.frame.name);
    }
    return { sprite, shadowSprite };
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
    const speed   = (PED_MIN_SPEED + Math.random() * (PED_MAX_SPEED - PED_MIN_SPEED)) * this._speedMultiplier;
    const x       = door.x + jitter - w / 2;

    const { sprite, shadowSprite } = this.makePedSprites(x, door.y, w, h, dir, def);
    sprite.anims.timeScale = speed / PED_BASE_SPEED;
    sprite.setAlpha(0);
    shadowSprite.setAlpha(0);

    const p: Pedestrian = {
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
      shadowSprite,
      pet: pickPet(),
    };
    this.pedestrians.push(p);
    this.syncGO(p);
  }

  private spawnOffscreen(): void {
    if (this.pedestrians.length >= MAX_PEDS) return;

    const def     = pickRandomPerson();
    const h       = PED_MIN_H + Math.random() * (PED_MAX_H - PED_MIN_H);
    const w       = h * (def.frameWidth / def.frameHeight);
    const footTop = this.groundY - YARD_H;
    const bottomY = footTop + Math.random() * YARD_H;
    const x       = -(w + 2);
    const speed   = (PED_MIN_SPEED + Math.random() * (PED_MAX_SPEED - PED_MIN_SPEED)) * this._speedMultiplier;

    const { sprite, shadowSprite } = this.makePedSprites(x, bottomY, w, h, 1, def);
    sprite.anims.timeScale = speed / PED_BASE_SPEED;

    const p: Pedestrian = {
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
      shadowSprite,
      pet: pickPet(),
    };
    this.pedestrians.push(p);
    this.syncGO(p);
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
    const baseMs   = Math.max(300, 10000 / totalLevel) / 0.50;
    const adjusted = baseMs / Math.max(0.02, factor);
    return adjusted * (0.65 + Math.random() * 0.70);
  }

  private calcDoorDelay(plots: PlotState[]): number {
    return this.calcOffscreenDelay(plots) / DOOR_SPAWN_RATE_FRAC;
  }

  destroy(): void {
    for (const p of this.pedestrians) { p.sprite.destroy(); p.shadowSprite.destroy(); }
    this.pedShadowGfx.destroy();
    this.petGfx.destroy();
    this.pedestrians = [];
  }
}
