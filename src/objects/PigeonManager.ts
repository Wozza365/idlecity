import Phaser from 'phaser';
import { YARD_H } from '../constants';
import { type PlotState } from '../game/GameState';

const PIGEON_COUNT     = 2;
const PIGEON_W         = 7;
const PIGEON_H         = 6;
const WALK_SPEED       = 5;     // px/s while waddling
const WALK_RANGE       = 18;    // max px from current spot when picking a walk target
const PECK_DROP        = 1.5;   // px the head dips during a peck
const PECK_DURATION    = 280;   // ms
const LEG_STEP_FREQ    = 6;     // leg swaps per second while walking
const FLEE_TRIGGER_DIST = 14;   // px — pedestrian within this triggers a flee hop
const FLEE_TRAVEL_DIST  = 36;   // px covered during a flee hop
const FLEE_ARC_H        = 10;   // px height of the flee arc
const FLEE_DURATION     = 480;  // ms
const FLEE_COOLDOWN     = 1200; // ms of "wary" pause after landing before fleeing again
const WING_FLAP_FREQ    = 14;   // flaps per second while fleeing

const BODY_COLOR = 0x9aa3ad;
const WING_COLOR = 0x7b8492;
const HEAD_COLOR = 0xb8bec8;
const NECK_COLOR = 0x4a7a6a;
const BEAK_COLOR = 0xd99a3c;
const LEG_COLOR  = 0xc9703f;
const EYE_COLOR  = 0x1a1a1a;

type PigeonState =
  | { k: 'idle'; peckTimer: number; peckProgress: number; fleeCooldown: number }
  | { k: 'walk'; targetX: number; fleeCooldown: number }
  | { k: 'flee'; startX: number; targetX: number; t: number };

interface Pigeon {
  x: number;
  y: number;
  facing: 1 | -1;
  legPhase: number;
  wingPhase: number;
  state: PigeonState;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function nightBrightness(elevation: number): number {
  if (elevation >= 0.2)  return 1.0;
  if (elevation >= -0.1) return 0.3 + ((elevation + 0.1) / 0.3) * 0.7;
  return 0.3;
}

function dim(color: number, brightness: number): number {
  const r = Math.round(((color >> 16) & 0xff) * brightness);
  const g = Math.round(((color >> 8)  & 0xff) * brightness);
  const b = Math.round(( color        & 0xff) * brightness);
  return (r << 16) | (g << 8) | b;
}

export class PigeonManager {
  private gfx: Phaser.GameObjects.Graphics;
  private pigeons: Pigeon[] = [];
  private plotWidth = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(9.07);
  }

  rebuild(groundY: number, plotWidth: number): void {
    this.plotWidth = plotWidth;
    this.pigeons = [];
    const footTop = groundY - YARD_H;
    for (let i = 0; i < PIGEON_COUNT; i++) {
      this.pigeons.push({
        x: 0, // placed properly on first update once rightBound is known
        y: footTop + Math.random() * YARD_H,
        facing: Math.random() < 0.5 ? 1 : -1,
        legPhase: Math.random() * Math.PI * 2,
        wingPhase: 0,
        state: { k: 'idle', peckTimer: 1000 + Math.random() * 4000, peckProgress: 0, fleeCooldown: 0 },
      });
    }
    this._placed = false;
  }

  private _placed = false;

  update(delta: number, plots: PlotState[], pedestrianXs: number[], sunAngle: number): void {
    const rightBound = this.getRightBound(plots);
    this.gfx.clear();
    if (rightBound <= 0) return;

    if (!this._placed) {
      for (const p of this.pigeons) p.x = Math.random() * rightBound;
      this._placed = true;
    }

    const dt = delta / 1000;
    const elevation = Math.sin(sunAngle);
    const brightness = nightBrightness(elevation);

    for (const p of this.pigeons) {
      this.updatePigeon(p, dt, delta, rightBound, pedestrianXs);
      this.drawPigeon(p, brightness);
    }
  }

  private updatePigeon(p: Pigeon, dt: number, delta: number, rightBound: number, pedestrianXs: number[]): void {
    // Check for nearby pedestrians — flee takes priority over everything else.
    if (p.state.k !== 'flee' && p.state.fleeCooldown <= 0) {
      for (const px of pedestrianXs) {
        if (Math.abs(px - p.x) < FLEE_TRIGGER_DIST) {
          const dir: 1 | -1 = p.x <= px ? -1 : 1;
          const targetX = Math.max(0, Math.min(rightBound, p.x + dir * FLEE_TRAVEL_DIST));
          p.facing = dir;
          p.state = { k: 'flee', startX: p.x, targetX, t: 0 };
          p.wingPhase = 0;
          break;
        }
      }
    }

    if (p.state.k === 'idle') {
      p.state.fleeCooldown = Math.max(0, p.state.fleeCooldown - delta);
      p.state.peckTimer -= delta;
      if (p.state.peckProgress > 0) {
        p.state.peckProgress = Math.min(1, p.state.peckProgress + delta / PECK_DURATION);
        if (p.state.peckProgress >= 1) p.state.peckProgress = 0;
      } else if (p.state.peckTimer <= 0) {
        if (Math.random() < 0.5) {
          p.state.peckProgress = 0.001;
          p.state.peckTimer = 1500 + Math.random() * 4000;
        } else {
          const targetX = Math.max(0, Math.min(rightBound, p.x + (Math.random() * 2 - 1) * WALK_RANGE));
          p.facing = targetX >= p.x ? 1 : -1;
          p.state = { k: 'walk', targetX, fleeCooldown: 0 };
        }
      }
    } else if (p.state.k === 'walk') {
      const dir = p.state.targetX >= p.x ? 1 : -1;
      p.x += dir * WALK_SPEED * dt;
      p.legPhase += dt * LEG_STEP_FREQ * Math.PI * 2;
      if ((dir === 1 && p.x >= p.state.targetX) || (dir === -1 && p.x <= p.state.targetX)) {
        p.x = p.state.targetX;
        p.state = { k: 'idle', peckTimer: 1000 + Math.random() * 3000, peckProgress: 0, fleeCooldown: 0 };
      }
    } else { // flee
      p.state.t = Math.min(1, p.state.t + delta / FLEE_DURATION);
      const t = smoothstep(p.state.t);
      p.x = p.state.startX + (p.state.targetX - p.state.startX) * t;
      p.wingPhase += dt * WING_FLAP_FREQ * Math.PI * 2;
      if (p.state.t >= 1) {
        p.x = p.state.targetX;
        p.state = { k: 'idle', peckTimer: 1500 + Math.random() * 3000, peckProgress: 0, fleeCooldown: FLEE_COOLDOWN };
      }
    }
  }

  private drawPigeon(p: Pigeon, brightness: number): void {
    const gfx = this.gfx;
    const f = p.facing;

    let liftY = 0;
    let wingSpread = 0;
    if (p.state.k === 'flee') {
      liftY = -FLEE_ARC_H * Math.sin(p.state.t * Math.PI);
      wingSpread = 2 + Math.abs(Math.sin(p.wingPhase)) * 3;
    }

    let headDrop = 0;
    if (p.state.k === 'idle' && p.state.peckProgress > 0) {
      headDrop = Math.sin(p.state.peckProgress * Math.PI) * PECK_DROP;
    }

    const cx = Math.round(p.x);
    const cy = Math.round(p.y + liftY);
    const bodyTop = cy - PIGEON_H;

    // Ground contact shadow (fades while airborne)
    const shadowA = 0.18 * (1 - Math.min(1, -liftY / FLEE_ARC_H));
    if (shadowA > 0.01) {
      gfx.fillStyle(0x000000, shadowA);
      gfx.fillEllipse(cx, p.y + 1, PIGEON_W, 2);
    }

    // Tail — small triangle at the rear, angled up slightly
    const tailX = cx - f * (PIGEON_W * 0.45);
    gfx.fillStyle(dim(WING_COLOR, brightness), 1);
    gfx.fillTriangle(
      tailX, bodyTop + 1,
      tailX - f * 4, bodyTop - 1,
      tailX - f * 4, bodyTop + 3,
    );

    // Wings (only visible while fleeing)
    if (wingSpread > 0) {
      gfx.fillStyle(dim(WING_COLOR, brightness), 0.95);
      gfx.fillTriangle(
        cx, bodyTop,
        cx - f * 2, bodyTop - wingSpread - 2,
        cx + f * 2, bodyTop - 1,
      );
    }

    // Body
    gfx.fillStyle(dim(BODY_COLOR, brightness), 1);
    gfx.fillEllipse(cx, bodyTop + PIGEON_H * 0.5, PIGEON_W, PIGEON_H * 0.85);

    // Iridescent neck patch
    gfx.fillStyle(dim(NECK_COLOR, brightness), 0.6);
    gfx.fillEllipse(cx + f * (PIGEON_W * 0.25), bodyTop + PIGEON_H * 0.35, PIGEON_W * 0.35, PIGEON_H * 0.35);

    // Head + beak
    const headX = cx + f * (PIGEON_W * 0.45);
    const headY = bodyTop - 0.5 + headDrop;
    gfx.fillStyle(dim(HEAD_COLOR, brightness), 1);
    gfx.fillCircle(headX, headY, 2.1);
    gfx.fillStyle(dim(BEAK_COLOR, brightness), 1);
    gfx.fillTriangle(
      headX + f * 1.6, headY,
      headX + f * 3.2, headY - 0.4,
      headX + f * 1.6, headY + 0.9,
    );
    gfx.fillStyle(EYE_COLOR, 1);
    gfx.fillRect(headX + f * 0.3, headY - 1, 1, 1);

    // Legs — alternate stride while walking, tucked while airborne
    gfx.fillStyle(dim(LEG_COLOR, brightness), 1);
    if (p.state.k === 'flee') {
      gfx.fillRect(cx - 1, bodyTop + PIGEON_H - 1, 1, 2);
      gfx.fillRect(cx + 1, bodyTop + PIGEON_H - 1, 1, 2);
    } else {
      const swing = p.state.k === 'walk' ? Math.sin(p.legPhase) * 1.4 : 0;
      gfx.fillRect(Math.round(cx - 1 + swing), bodyTop + PIGEON_H - 1, 1, 3);
      gfx.fillRect(Math.round(cx + 1 - swing), bodyTop + PIGEON_H - 1, 1, 3);
    }
  }

  private getRightBound(plots: PlotState[]): number {
    let rightmost = -1;
    for (let i = 0; i < plots.length; i++) {
      if (plots[i].unlocked) rightmost = i;
    }
    return rightmost < 0 ? 0 : (rightmost + 1) * this.plotWidth;
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
