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
        h: 46 + Math.random() * 28,
        speed: 0.010 + Math.random() * 0.006,
      });
    }
    // Faster low layer (4 clouds)
    for (let i = 0; i < 4; i++) {
      this.clouds.push({
        x: Math.random() * width * 1.4,
        y: skyH * (0.32 + Math.random() * 0.22),
        w: 70 + Math.random() * 60,
        h: 34 + Math.random() * 22,
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

  // Puff layout: [xFrac, yFrac, wFrac, hFrac] — offsets and full diameters relative to cloud w/h
  private static readonly PUFFS: ReadonlyArray<[number, number, number, number]> = [
    [-0.32,  0.05, 0.52, 0.56],
    [-0.13, -0.09, 0.68, 0.76],
    [ 0.03, -0.20, 0.80, 0.90],
    [ 0.20, -0.08, 0.66, 0.74],
    [ 0.37,  0.07, 0.50, 0.52],
  ];

  private draw(alpha: number, color = 0xffffff): void {
    this.gfx.clear();

    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    // Blue-grey underside — cooler and slightly darker than the main body
    const shadowColor =
      (Math.round(r * 0.72) << 16) |
      (Math.round(g * 0.76) << 8) |
      Math.min(255, Math.round(b * 0.94 + 24));

    for (const c of this.clouds) {
      const { x, y, w, h } = c;

      // 1. Shadow band along the base
      this.gfx.fillStyle(shadowColor, alpha * 0.58);
      this.gfx.fillEllipse(x, y + h * 0.52, w * 0.84, h * 0.38);

      // 2. Each puff drawn with feathered soft edges (3 concentric passes)
      for (const [ox, oy, fw, fh] of Clouds.PUFFS) {
        const px = x + w * ox;
        const py = y + h * oy;
        const pw = w * fw;
        const ph = h * fh;

        this.gfx.fillStyle(color, alpha * 0.14);
        this.gfx.fillEllipse(px, py, pw * 1.65, ph * 1.65);
        this.gfx.fillStyle(color, alpha * 0.42);
        this.gfx.fillEllipse(px, py, pw * 1.25, ph * 1.25);
        this.gfx.fillStyle(color, alpha);
        this.gfx.fillEllipse(px, py, pw, ph);
      }

      // 3. Top-lit highlight on the three central puffs
      for (const [ox, oy, fw, fh] of Clouds.PUFFS.slice(1, 4)) {
        const px = x + w * ox;
        const py = y + h * oy;
        const ph = h * fh;
        this.gfx.fillStyle(0xffffff, alpha * 0.38);
        this.gfx.fillEllipse(px, py - ph * 0.22, w * fw * 0.62, ph * 0.48);
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
