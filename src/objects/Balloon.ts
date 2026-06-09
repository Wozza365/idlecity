import Phaser from 'phaser';

const BALLOON_W   = 48;
const BALLOON_H   = 64;
const GONDOLA_W   = 10;
const GONDOLA_H   = 8;
const ROPE_LEN    = 10;
const MIN_SPEED   = 15;
const MAX_SPEED   = 25;
const MIN_WAIT_MS = 180_000;
const MAX_WAIT_MS = 360_000;
const FADE_DIST   = 40;

// Pairs of bright, contrasting colours for the 8 alternating envelope gores
const STRIPE_COLORS: [number, number][] = [
  [0xff2200, 0xffdd00],  // Red / Golden yellow
  [0x0044ee, 0xffffff],  // Cobalt blue / White
  [0xcc00cc, 0x00ffee],  // Magenta / Cyan
  [0xff6600, 0x0066ff],  // Orange / Sky blue
  [0x00cc44, 0xffee00],  // Lime green / Yellow
];

export class Balloon {
  private gfx: Phaser.GameObjects.Graphics;
  private active = false;
  private x = 0;
  private y = 0;
  private vx = 0;
  private bobPhase = 0;
  private idleTimer: number;
  private sceneWidth = 800;
  private skyH = 400;
  private stripeIdx = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(1.2);
    this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
  }

  rebuild(sceneWidth: number, groundY: number): void {
    this.sceneWidth = sceneWidth;
    this.skyH       = groundY;
  }

  update(delta: number, elevation: number): void {
    this.gfx.clear();

    if (this.active) {
      this.x        += this.vx * delta / 1000;
      this.bobPhase += delta / 1000 * 0.6;
      const bobY     = this.y + Math.sin(this.bobPhase) * 3;

      const edgeDist = Math.min(this.x, this.sceneWidth - this.x);
      const alpha    = Math.min(1, edgeDist / FADE_DIST);

      if (this.x < -(BALLOON_W + 20) || this.x > this.sceneWidth + BALLOON_W + 20) {
        this.active    = false;
        this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
      } else {
        this.draw(this.x, bobY, alpha);
      }
    } else if (elevation > 0.05) {
      this.idleTimer -= delta;
      if (this.idleTimer <= 0) this.spawn();
    }
  }

  private spawn(): void {
    const fromLeft  = Math.random() < 0.5;
    const speed     = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    this.x          = fromLeft ? -(BALLOON_W + 10) : this.sceneWidth + BALLOON_W + 10;
    this.y          = this.skyH * (0.35 + Math.random() * 0.20);
    this.vx         = fromLeft ? speed : -speed;
    this.bobPhase   = Math.random() * Math.PI * 2;
    this.stripeIdx  = Math.floor(Math.random() * STRIPE_COLORS.length);
    this.active     = true;
  }

  // Spawn immediately at a visible position (for the dev panel button)
  forceSpawn(): void {
    const fromLeft  = Math.random() < 0.5;
    const speed     = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    this.x          = fromLeft ? this.sceneWidth * 0.15 : this.sceneWidth * 0.85;
    this.y          = this.skyH * (0.35 + Math.random() * 0.20);
    this.vx         = fromLeft ? speed : -speed;
    this.bobPhase   = Math.random() * Math.PI * 2;
    // Always pick a different colour scheme when force-spawned
    this.stripeIdx  = (this.stripeIdx + 1 + Math.floor(Math.random() * (STRIPE_COLORS.length - 1))) % STRIPE_COLORS.length;
    this.active     = true;
  }

  private draw(cx: number, cy: number, alpha: number): void {
    const gfx = this.gfx;
    const [col1, col2] = STRIPE_COLORS[this.stripeIdx];
    const rx   = BALLOON_W / 2;
    const bh   = BALLOON_H;
    const bx   = Math.round(cx);
    const by   = Math.round(cy);
    const topY = by - bh / 2;

    // Balloon envelope profile (teardrop shape):
    //   Upper (t=0..0.45): half-width = rx * sin(t/0.45 * π/2)  — dome from point to max
    //   Lower (t=0.45..1): half-width = rx * (0.25 + 0.75 * cos((t-0.45)/0.55 * π/2)) — tapers to neck
    // For each x column, invert to find vertical extent.
    const nStripes  = 8;
    const stripeColW = BALLOON_W / nStripes;

    for (let col = 0; col < BALLOON_W; col++) {
      const nx = Math.abs(col + 0.5 - rx) / rx;  // 0 = centre, 1 = edge
      if (nx >= 1) continue;

      // y extent: top boundary
      const tTop = 0.45 * (2 / Math.PI) * Math.asin(nx);

      // y extent: bottom boundary
      let tBot: number;
      if (nx <= 0.25) {
        tBot = 1.0;  // this column reaches the full bottom neck
      } else {
        tBot = 0.45 + 0.55 * (2 / Math.PI) * Math.acos((nx - 0.25) / 0.75);
      }

      const y1 = Math.round(topY + tTop * bh);
      const y2 = Math.round(topY + tBot * bh);
      const h  = y2 - y1;
      if (h < 1) continue;

      const color = Math.floor(col / stripeColW) % 2 === 0 ? col1 : col2;
      gfx.fillStyle(color, alpha);
      gfx.fillRect(bx - rx + col, y1, 1, h);
    }

    // Dark silhouette outline (top + bottom rim of each column)
    gfx.fillStyle(0x000000, alpha * 0.35);
    for (let col = 0; col < BALLOON_W; col++) {
      const nx = Math.abs(col + 0.5 - rx) / rx;
      if (nx >= 1) continue;
      const tTop = 0.45 * (2 / Math.PI) * Math.asin(nx);
      let tBot: number;
      if (nx <= 0.25) {
        tBot = 1.0;
      } else {
        tBot = 0.45 + 0.55 * (2 / Math.PI) * Math.acos((nx - 0.25) / 0.75);
      }
      const y1 = Math.round(topY + tTop * bh);
      const y2 = Math.round(topY + tBot * bh);
      gfx.fillRect(bx - rx + col, y1, 1, 2);
      gfx.fillRect(bx - rx + col, y2 - 1, 1, 2);
    }

    // Tiny burner glow at the throat (bottom of envelope)
    const envBottomY = by + bh / 2;
    gfx.fillStyle(0xff9900, alpha * 0.75);
    gfx.fillRect(bx - 2, envBottomY - 3, 5, 4);
    gfx.fillStyle(0xffee88, alpha * 0.9);
    gfx.fillRect(bx - 1, envBottomY - 4, 3, 2);

    // Ropes from throat to gondola
    const ropeSpread = Math.round(rx * 0.3);  // slightly spread
    gfx.fillStyle(0x886644, alpha * 0.9);
    gfx.fillRect(bx - ropeSpread, envBottomY,     1, ROPE_LEN + 1);
    gfx.fillRect(bx + ropeSpread, envBottomY,     1, ROPE_LEN + 1);

    // Gondola (wicker basket)
    const gondolaY = envBottomY + ROPE_LEN;
    gfx.fillStyle(0x8B5E3C, alpha);
    gfx.fillRect(bx - GONDOLA_W / 2, gondolaY, GONDOLA_W, GONDOLA_H);
    gfx.fillStyle(0x5C3A1A, alpha);  // darker top rim
    gfx.fillRect(bx - GONDOLA_W / 2, gondolaY, GONDOLA_W, 2);
    gfx.fillStyle(0x000000, alpha * 0.25);
    gfx.fillRect(bx - GONDOLA_W / 2, gondolaY + GONDOLA_H - 1, GONDOLA_W, 1);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
