import Phaser from 'phaser';

type Cloud = { x: number; y: number; w: number; h: number; speed: number };

export class Clouds {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private clouds: Cloud[] = [];
  private sceneWidth = 800;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(1);
  }

  rebuild(width: number, groundY: number): void {
    this.sceneWidth = width;
    if (this.clouds.length === 0) {
      this.initClouds(width, groundY);
    } else {
      // Rescale y positions proportionally when window resizes
      const oldWidth = this.sceneWidth;
      const scale = width / oldWidth;
      for (const c of this.clouds) c.x *= scale;
    }
  }

  private initClouds(width: number, groundY: number): void {
    const skyH = groundY;
    // Slow high layer (5 clouds)
    for (let i = 0; i < 5; i++) {
      this.clouds.push({
        x: Math.random() * width * 1.4,
        y: skyH * (0.08 + Math.random() * 0.22),
        w: 100 + Math.random() * 90,
        h: 22 + Math.random() * 14,
        speed: 0.010 + Math.random() * 0.006,
      });
    }
    // Faster low layer (4 clouds)
    for (let i = 0; i < 4; i++) {
      this.clouds.push({
        x: Math.random() * width * 1.4,
        y: skyH * (0.32 + Math.random() * 0.22),
        w: 70 + Math.random() * 60,
        h: 16 + Math.random() * 10,
        speed: 0.022 + Math.random() * 0.010,
      });
    }
  }

  update(delta: number, elevation: number): void {
    // Fade in at dawn (elev > 0), max alpha at full day, invisible at night
    const alpha = Math.max(0, Math.min(0.13, elevation * 0.6));
    if (alpha <= 0) {
      this.gfx.clear();
      return;
    }

    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed * delta;
      if (cloud.x < -cloud.w * 1.5) cloud.x += this.sceneWidth + cloud.w * 3;
    }

    this.draw(alpha);
  }

  private draw(alpha: number): void {
    this.gfx.clear();
    this.gfx.fillStyle(0xffffff, alpha);
    for (const c of this.clouds) {
      // Three overlapping ellipses per cloud for a natural shape
      this.gfx.fillEllipse(c.x,               c.y,           c.w,       c.h);
      this.gfx.fillEllipse(c.x - c.w * 0.30,  c.y + c.h * 0.18, c.w * 0.62, c.h * 0.80);
      this.gfx.fillEllipse(c.x + c.w * 0.28,  c.y + c.h * 0.14, c.w * 0.66, c.h * 0.78);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
