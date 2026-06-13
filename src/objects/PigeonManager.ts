import Phaser from 'phaser';
import { YARD_H, lerpColor } from '../constants';
import { type PlotState } from '../game/GameState';
import {
  PIGEON_KEY, PIGEON_ORIGIN_X, PIGEON_ORIGIN_Y,
  PIGEON_FRAME_IDLE, PIGEON_FRAME_PECK, PIGEON_FRAME_WALK_A, PIGEON_FRAME_WALK_B,
  PIGEON_FRAME_FLEE_A, PIGEON_FRAME_FLEE_B,
} from './PigeonAssets';

const NIGHT_TINT = 0x5a6680;

const PIGEON_COUNT     = 2;
const PIGEON_W         = 7;
const WALK_SPEED       = 5;     // px/s while waddling
const WALK_RANGE       = 18;    // max px from current spot when picking a walk target
const PECK_DURATION    = 280;   // ms
const LEG_STEP_FREQ    = 6;     // leg swaps per second while walking
const FLEE_TRIGGER_DIST = 14;   // px — pedestrian within this triggers a flee hop
const FLEE_TRAVEL_DIST  = 36;   // px covered during a flee hop
const FLEE_ARC_H        = 10;   // px height of the flee arc
const FLEE_DURATION     = 480;  // ms
const FLEE_COOLDOWN     = 1200; // ms of "wary" pause after landing before fleeing again
const WING_FLAP_FREQ    = 14;   // flaps per second while fleeing

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
  sprite: Phaser.GameObjects.Sprite;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export class PigeonManager {
  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private pigeons: Pigeon[] = [];
  private plotWidth = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(9.069);
  }

  rebuild(groundY: number, plotWidth: number): void {
    this.plotWidth = plotWidth;
    for (const p of this.pigeons) p.sprite.destroy();
    this.pigeons = [];
    const footTop = groundY - YARD_H;
    for (let i = 0; i < PIGEON_COUNT; i++) {
      const sprite = this.scene.add.sprite(0, 0, PIGEON_KEY, PIGEON_FRAME_IDLE)
        .setOrigin(PIGEON_ORIGIN_X, PIGEON_ORIGIN_Y)
        .setDepth(9.07)
        .setVisible(false);
      this.pigeons.push({
        x: 0, // placed properly on first update once rightBound is known
        y: footTop + Math.random() * YARD_H,
        facing: Math.random() < 0.5 ? 1 : -1,
        legPhase: Math.random() * Math.PI * 2,
        wingPhase: 0,
        state: { k: 'idle', peckTimer: 1000 + Math.random() * 4000, peckProgress: 0, fleeCooldown: 0 },
        sprite,
      });
    }
    this._placed = false;
  }

  private _placed = false;

  update(delta: number, plots: PlotState[], pedestrianXs: number[], sunAngle: number): void {
    const rightBound = this.getRightBound(plots);
    this.gfx.clear();
    if (rightBound <= 0) {
      for (const p of this.pigeons) p.sprite.setVisible(false);
      return;
    }

    if (!this._placed) {
      for (const p of this.pigeons) p.x = Math.random() * rightBound;
      this._placed = true;
    }

    const dt = delta / 1000;
    const elevation = Math.sin(sunAngle);
    const nightFactor = Math.max(0, Math.min(1, (0.2 - elevation) / 0.3));
    const tint = lerpColor(0xffffff, NIGHT_TINT, nightFactor);

    for (const p of this.pigeons) {
      p.sprite.setVisible(true);
      this.updatePigeon(p, dt, delta, rightBound, pedestrianXs);
      this.drawPigeon(p, tint);
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

  private drawPigeon(p: Pigeon, tint: number): void {
    let liftY = 0;
    let frame = PIGEON_FRAME_IDLE;

    if (p.state.k === 'flee') {
      liftY = -FLEE_ARC_H * Math.sin(p.state.t * Math.PI);
      frame = Math.abs(Math.sin(p.wingPhase)) > 0.5 ? PIGEON_FRAME_FLEE_B : PIGEON_FRAME_FLEE_A;
    } else if (p.state.k === 'walk') {
      frame = Math.sin(p.legPhase) >= 0 ? PIGEON_FRAME_WALK_A : PIGEON_FRAME_WALK_B;
    } else if (p.state.peckProgress > 0) {
      frame = Math.sin(p.state.peckProgress * Math.PI) > 0.5 ? PIGEON_FRAME_PECK : PIGEON_FRAME_IDLE;
    }

    const cx = Math.round(p.x);
    const cy = Math.round(p.y + liftY);

    p.sprite.setPosition(cx, cy);
    p.sprite.setFlipX(p.facing === -1);
    p.sprite.setFrame(frame);
    p.sprite.setTint(tint);

    // Ground contact shadow (fades while airborne)
    const shadowA = 0.18 * (1 - Math.min(1, -liftY / FLEE_ARC_H));
    if (shadowA > 0.01) {
      this.gfx.fillStyle(0x000000, shadowA);
      this.gfx.fillEllipse(cx, p.y + 1, PIGEON_W, 2);
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
    for (const p of this.pigeons) p.sprite.destroy();
  }
}
