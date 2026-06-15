import Phaser from 'phaser';

// Occasional distant airplane: a blinking dot crossing the sky, drawn as a
// white body pixel with a periodically-blinking red position light.
const IDLE_MIN_MS  = 70_000;
const IDLE_MAX_MS  = 50_000; // range added to IDLE_MIN_MS
const SPEED_MIN    = 65;
const SPEED_MAX    = 25; // range added to SPEED_MIN

interface Plane {
  x: number;
  y: number;
  vx: number;
  blinkTimer: number;
  blinkOn: boolean;
}

export class Airplane {
  private gfx: Phaser.GameObjects.Graphics;
  private plane: Plane | null = null;
  private idleTimer = IDLE_MIN_MS + Math.random() * IDLE_MAX_MS;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(1.5);
  }

  update(delta: number, width: number, groundY: number): void {
    this.gfx.clear();

    if (this.plane) {
      const p = this.plane;
      p.x += p.vx * delta / 1000;
      p.blinkTimer -= delta;
      if (p.blinkTimer <= 0) {
        p.blinkOn    = !p.blinkOn;
        p.blinkTimer = p.blinkOn ? 600 : 400;
      }

      if (p.x < -20 || p.x > width + 20) {
        this.plane = null;
        this.idleTimer = IDLE_MIN_MS + Math.random() * IDLE_MAX_MS;
      } else {
        // White body dot + blinking red offset dot
        this.gfx.fillStyle(0xffffff, 0.9);
        this.gfx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
        if (p.blinkOn) {
          this.gfx.fillStyle(0xff2222, 0.85);
          this.gfx.fillRect(Math.round(p.x) + (p.vx > 0 ? -3 : 2), Math.round(p.y), 1, 1);
        }
      }
    } else {
      this.idleTimer -= delta;
      if (this.idleTimer <= 0) {
        const fromLeft = Math.random() < 0.5;
        const altY     = groundY * (0.08 + Math.random() * 0.17);
        const speed    = SPEED_MIN + Math.random() * SPEED_MAX;
        this.plane = {
          x:          fromLeft ? -10 : width + 10,
          y:          altY,
          vx:         fromLeft ? speed : -speed,
          blinkTimer: 400,
          blinkOn:    true,
        };
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
