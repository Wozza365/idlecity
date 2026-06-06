import Phaser from 'phaser';

const BALLOON_W   = 40;
const BALLOON_H   = 50;
const GONDOLA_W   = 8;
const GONDOLA_H   = 6;
const ROPE_LEN    = 8;
const MIN_SPEED   = 15;
const MAX_SPEED   = 25;
const MIN_WAIT_MS = 180_000;
const MAX_WAIT_MS = 360_000;
const FADE_DIST   = 40;   // px to fade in/out near screen edges

const STRIPE_COLORS = [
  [0xff4422, 0xffbb00],
  [0x2244ff, 0xffffff],
  [0x22aa44, 0xffee00],
  [0xcc22aa, 0xffeebb],
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

      // Fade near edges
      const edgeDist = Math.min(this.x, this.sceneWidth - this.x);
      const alpha    = Math.min(1, edgeDist / FADE_DIST);

      if (this.x < -(BALLOON_W + 20) || this.x > this.sceneWidth + BALLOON_W + 20) {
        this.active    = false;
        this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
      } else {
        this.draw(this.x, bobY, alpha);
      }
    } else if (elevation > 0.05) {  // only daytime balloons
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

  private draw(cx: number, cy: number, alpha: number): void {
    const gfx       = this.gfx;
    const [top, bot] = STRIPE_COLORS[this.stripeIdx];
    const rx        = BALLOON_W / 2;
    const ry        = BALLOON_H / 2;
    const bx        = Math.round(cx);
    const by        = Math.round(cy);

    // Balloon envelope — 6 vertical stripes
    const stripes = 6;
    for (let s = 0; s < stripes; s++) {
      const frac  = s / stripes;
      const color = s % 2 === 0 ? top : bot;
      // Approximate stripe as a fillRect clipped to the ellipse shape
      const xLeft  = Math.round(bx - rx + frac * BALLOON_W);
      const sWidth = Math.round(BALLOON_W / stripes);
      // Height at this horizontal position (ellipse formula)
      const normalX = (xLeft + sWidth / 2 - bx) / rx;
      const stripeH = Math.round(ry * 2 * Math.sqrt(Math.max(0, 1 - normalX * normalX)));
      if (stripeH < 2) continue;
      gfx.fillStyle(color, alpha);
      gfx.fillRect(xLeft, by - Math.round(stripeH / 2), sWidth, stripeH);
    }

    // Dark outline at top and bottom curves
    gfx.fillStyle(0x000000, alpha * 0.25);
    for (let col = 0; col < BALLOON_W; col++) {
      const nx  = (col - rx) / rx;
      const hw  = ry * Math.sqrt(Math.max(0, 1 - nx * nx));
      const top2 = Math.round(by - hw);
      const bot2 = Math.round(by + hw);
      gfx.fillRect(bx - rx + col, top2, 1, 2);
      gfx.fillRect(bx - rx + col, bot2 - 2, 1, 2);
    }

    // Ropes from balloon bottom to gondola
    const gondolaY = by + ry + ROPE_LEN;
    gfx.fillStyle(0x886644, alpha * 0.8);
    gfx.fillRect(bx - 3, by + ry - 1, 1, ROPE_LEN + 2);
    gfx.fillRect(bx + 2, by + ry - 1, 1, ROPE_LEN + 2);

    // Gondola
    gfx.fillStyle(0x554422, alpha);
    gfx.fillRect(bx - GONDOLA_W / 2, gondolaY, GONDOLA_W, GONDOLA_H);
    gfx.fillStyle(0x000000, alpha * 0.2);
    gfx.fillRect(bx - GONDOLA_W / 2, gondolaY + GONDOLA_H - 1, GONDOLA_W, 1);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
