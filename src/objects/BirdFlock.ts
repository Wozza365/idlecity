import Phaser from 'phaser';

const MIN_BIRDS   = 5;
const MAX_BIRDS   = 9;
const CROSS_MIN_S = 8;    // seconds to cross the screen
const CROSS_MAX_S = 14;
const MIN_WAIT_MS = 45_000;
const MAX_WAIT_MS = 90_000;
const WINGSPAN    = 6;    // half-span of each bird's ">" shape
const FADE_DIST   = 50;   // px to fade in/out at edges

interface Bird {
  offsetX: number;   // formation offset from leader
  offsetY: number;
  phase: number;     // sine phase for wing wobble
}

export class BirdFlock {
  private gfx: Phaser.GameObjects.Graphics;
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
    this.gfx = scene.add.graphics().setDepth(1.3);
    this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
  }

  rebuild(sceneWidth: number, groundY: number): void {
    this.sceneWidth = sceneWidth;
    this.skyH       = groundY;
  }

  update(delta: number, elevation: number): void {
    this.gfx.clear();
    if (this.active) {
      this.time      += delta / 1000;
      this.leaderX   += this.speed * this.dir * delta / 1000;

      const edgeDist  = Math.min(this.leaderX, this.sceneWidth - this.leaderX);
      const alpha     = Math.min(1, edgeDist / FADE_DIST);

      if (this.leaderX < -(WINGSPAN + 40) || this.leaderX > this.sceneWidth + WINGSPAN + 40) {
        this.active    = false;
        this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
      } else {
        this.drawFlock(alpha);
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
      if (i === 0) {
        this.birds.push({ offsetX: 0, offsetY: 0, phase: 0 });
      } else {
        const row = Math.ceil(i / 2);
        this.birds.push({
          offsetX: -row * 12 * this.dir,
          offsetY:  row * 6,
          phase:    (i * 1.2) % (Math.PI * 2),
        });
      }
    }
  }

  private drawFlock(alpha: number): void {
    const gfx = this.gfx;
    gfx.lineStyle(1, 0x444444, alpha * 0.85);

    for (const b of this.birds) {
      const wobble = Math.sin(this.time * 4.5 + b.phase) * 2;
      const bx     = Math.round(this.leaderX + b.offsetX);
      const by     = Math.round(this.leaderY + b.offsetY + wobble);

      // Each bird is a simple ">" or "<" shape: two lines meeting at tip
      // When flying right: tip on right, wings open to the left (>)
      // When flying left: tip on left, wings open to the right (<)
      const tipX  = bx + WINGSPAN * this.dir;
      const wUp   = by - Math.round(WINGSPAN * 0.7);
      const wDown = by + Math.round(WINGSPAN * 0.7);

      gfx.beginPath();
      gfx.moveTo(bx, wUp);
      gfx.lineTo(tipX, by);
      gfx.lineTo(bx, wDown);
      gfx.strokePath();
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
