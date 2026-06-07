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

  update(delta: number, elevation: number, summerWeight = 1, weatherIntensity = 0): void {
    // Base cloud density: sparse in summer (α≈0.07), heavier in winter (α≈0.20)
    const seasonBase = 0.07 + 0.13 * (1 - summerWeight);
    const maxAlpha   = seasonBase + 0.10 * weatherIntensity;
    const alpha      = Math.max(0, Math.min(maxAlpha, elevation * maxAlpha / 0.07));
    if (alpha <= 0) {
      this.gfx.clear();
      return;
    }

    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed * delta;
      if (cloud.x < -cloud.w * 1.5) cloud.x += this.sceneWidth + cloud.w * 3;
    }

    // Clouds grey slightly during weather events
    const grey = Math.round(255 - weatherIntensity * 40);
    const cloudColor = (grey << 16) | (grey << 8) | grey;
    this.draw(alpha, cloudColor);
  }

  private draw(alpha: number, color = 0xffffff): void {
    this.gfx.clear();

    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const shadowColor =
      (Math.max(0, r - 32) << 16) | (Math.max(0, g - 28) << 8) | Math.min(255, b + 8);

    for (const c of this.clouds) {
      const { x, y, w, h } = c;

      // Soft underside shadow — visible beneath the puffs
      this.gfx.fillStyle(shadowColor, alpha * 0.85);
      this.gfx.fillEllipse(x, y + h * 0.54, w * 0.82, h * 0.36);

      this.gfx.fillStyle(color, alpha);

      // Wide flat base
      this.gfx.fillEllipse(x, y + h * 0.22, w * 0.90, h * 0.50);

      // Five puffs arching highest in the centre
      this.gfx.fillEllipse(x - w * 0.34, y + h * 0.06, w * 0.38, h * 0.70);
      this.gfx.fillEllipse(x - w * 0.15, y - h * 0.08, w * 0.44, h * 0.88);
      this.gfx.fillEllipse(x + w * 0.04, y - h * 0.17, w * 0.48, h * 1.00);
      this.gfx.fillEllipse(x + w * 0.23, y - h * 0.07, w * 0.42, h * 0.83);
      this.gfx.fillEllipse(x + w * 0.40, y + h * 0.09, w * 0.36, h * 0.66);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
