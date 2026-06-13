import Phaser from 'phaser';
import { lerpColor } from '../constants';
import {
  BIRD_KEY,
  BIRD_ORIGIN_X, BIRD_ORIGIN_Y,
  BIRD_FRAME_SPREAD, BIRD_FRAME_TUCKED,
} from './BirdAssets';

const NIGHT_TINT = 0x5a6680;

const MIN_BIRDS   = 5;
const MAX_BIRDS   = 9;
const CROSS_MIN_S = 8;    // seconds to cross the screen
const CROSS_MAX_S = 14;
const MIN_WAIT_MS = 45_000;
const MAX_WAIT_MS = 90_000;
const WINGSPAN    = 6;    // half-span of each bird's silhouette
const FADE_DIST   = 50;   // px to fade in/out at edges
const BIRD_SCALE  = 0.7;

interface Bird {
  offsetX: number;   // formation offset from leader
  offsetY: number;
  phase: number;     // sine phase for wing wobble
  sprite: Phaser.GameObjects.Sprite;
}

export class BirdFlock {
  private pool: Phaser.GameObjects.Sprite[] = [];
  private active = false;
  private leaderX = 0;
  private leaderY = 0;
  private speed   = 0;
  private dir     = 1;
  private birds:  Bird[] = [];
  private time    = 0;
  private idleTimer: number;
  private sceneWidth = 800;
  private skyH = 400;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_BIRDS; i++) {
      this.pool.push(
        scene.add.sprite(0, 0, BIRD_KEY, BIRD_FRAME_SPREAD)
          .setOrigin(BIRD_ORIGIN_X, BIRD_ORIGIN_Y)
          .setDepth(1.3)
          .setScale(BIRD_SCALE)
          .setVisible(false),
      );
    }
    this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
  }

  rebuild(sceneWidth: number, groundY: number): void {
    this.sceneWidth = sceneWidth;
    this.skyH       = groundY;
  }

  update(delta: number, elevation: number): void {
    if (this.active) {
      this.time      += delta / 1000;
      this.leaderX   += this.speed * this.dir * delta / 1000;

      const edgeDist  = Math.min(this.leaderX, this.sceneWidth - this.leaderX);
      const alpha     = Math.min(1, edgeDist / FADE_DIST);

      if (this.leaderX < -(WINGSPAN + 40) || this.leaderX > this.sceneWidth + WINGSPAN + 40) {
        this.active    = false;
        this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
        for (const sprite of this.pool) sprite.setVisible(false);
      } else {
        this.drawFlock(alpha, elevation);
      }
    } else if (elevation > 0.08) {  // only daytime flocks
      this.idleTimer -= delta;
      if (this.idleTimer <= 0) this.spawn();
    }
  }

  private spawn(): void {
    const count     = MIN_BIRDS + Math.floor(Math.random() * (MAX_BIRDS - MIN_BIRDS + 1));
    const crossTime = CROSS_MIN_S + Math.random() * (CROSS_MAX_S - CROSS_MIN_S);
    const fromLeft  = Math.random() < 0.5;

    this.dir      = fromLeft ? 1 : -1;
    this.speed    = this.sceneWidth / crossTime;
    this.leaderX  = fromLeft ? -20 : this.sceneWidth + 20;
    this.leaderY  = this.skyH * (0.10 + Math.random() * 0.25);
    this.time     = 0;

    // Build V-formation: leader at (0,0), others spread back in V
    this.birds = [];
    for (let i = 0; i < count; i++) {
      const sprite = this.pool[i];
      if (i === 0) {
        this.birds.push({ offsetX: 0, offsetY: 0, phase: 0, sprite });
      } else {
        const row = Math.ceil(i / 2);
        this.birds.push({
          offsetX: -row * 12 * this.dir,
          offsetY:  row * 6,
          phase:    (i * 1.2) % (Math.PI * 2),
          sprite,
        });
      }
    }
    for (let i = count; i < MAX_BIRDS; i++) this.pool[i].setVisible(false);

    this.active = true;
  }

  private drawFlock(alpha: number, elevation: number): void {
    const nightFactor = Math.max(0, Math.min(1, (0.2 - elevation) / 0.3));
    const tint        = lerpColor(0xffffff, NIGHT_TINT, nightFactor);

    for (const b of this.birds) {
      const wobble = Math.sin(this.time * 4.5 + b.phase);
      const bx     = this.leaderX + b.offsetX;
      const by     = this.leaderY + b.offsetY + wobble * 2;

      // Tip (head) leads in the direction of flight; the sprite's origin
      // sits at this tip, with wings sweeping back toward bx.
      const tipX  = bx + WINGSPAN * this.dir;
      const frame = wobble >= 0 ? BIRD_FRAME_SPREAD : BIRD_FRAME_TUCKED;

      b.sprite
        .setPosition(tipX, by)
        .setFlipX(this.dir === -1)
        .setFrame(frame)
        .setTint(tint)
        .setAlpha(alpha * 0.85)
        .setVisible(true);
    }
  }

  destroy(): void {
    for (const sprite of this.pool) sprite.destroy();
  }
}
