import Phaser from 'phaser';

type Cloud = {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  sprite: Phaser.GameObjects.Image;
  textureKey: string;
  // 0 = an ambient cloud present in normal weather; higher values only
  // join the sky once heavy storm cover has built up past this threshold.
  coverThreshold: number;
};

const PAD = 50;

// Three puff layouts for visual variety — [xOffFrac, yOffFrac, fullWidthFrac, fullHeightFrac]
const LAYOUTS: ReadonlyArray<ReadonlyArray<[number, number, number, number]>> = [
  [
    [-0.32,  0.05, 0.52, 0.56],
    [-0.13, -0.09, 0.68, 0.76],
    [ 0.03, -0.20, 0.80, 0.90],
    [ 0.20, -0.08, 0.66, 0.74],
    [ 0.37,  0.07, 0.50, 0.52],
  ],
  [
    [-0.28,  0.08, 0.48, 0.52],
    [-0.11, -0.06, 0.64, 0.70],
    [ 0.05, -0.18, 0.78, 0.86],
    [ 0.22, -0.05, 0.60, 0.68],
    [ 0.38,  0.10, 0.46, 0.48],
  ],
  [
    [-0.30,  0.02, 0.50, 0.58],
    [-0.14, -0.12, 0.70, 0.78],
    [ 0.01, -0.22, 0.76, 0.88],
    [ 0.17, -0.10, 0.62, 0.72],
    [ 0.34,  0.05, 0.48, 0.54],
  ],
];

function makeCloudCanvas(w: number, h: number, variant: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = w + PAD * 2;
  canvas.height = h + PAD * 2;
  const ctx = canvas.getContext('2d')!;

  const puffs = LAYOUTS[variant % LAYOUTS.length].map(([ox, oy, fw, fh]) => ({
    x:  PAD + w * (0.5 + ox),
    y:  PAD + h * (0.5 + oy),
    rx: (w * fw) / 2,
    ry: (h * fh) / 2,
  }));

  // Shadow underside — drawn first so the cloud body covers its centre,
  // leaving a blue-grey fringe only at the base
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = 'rgba(130, 150, 195, 0.55)';
  ctx.beginPath();
  ctx.ellipse(PAD + w * 0.50, PAD + h * 0.70, w * 0.46, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  // Broad outer haze — blurred glow that gives feathery soft edges around each puff
  ctx.filter = 'blur(12px)';
  ctx.fillStyle = 'rgba(215, 228, 255, 0.45)';
  for (const p of puffs) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx * 1.4, p.ry * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Main body — tight blur keeps puff silhouettes readable while edges stay soft
  ctx.filter = 'blur(4px)';
  ctx.fillStyle = 'rgba(242, 248, 255, 0.86)';
  for (const p of puffs) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bright cores — near-sharp top-lit highlights on the crown of each puff
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  for (const p of puffs) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - p.ry * 0.18, p.rx * 0.65, p.ry * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.filter = 'none';
  return canvas;
}

export class Clouds {
  private readonly scene: Phaser.Scene;
  private clouds: Cloud[] = [];
  private sceneWidth = 800;
  // Heavy cloud cover during rain — rises quickly once rain starts, then
  // lingers and clears gradually after it ends.
  private stormCover = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  rebuild(width: number, groundY: number): void {
    this.sceneWidth = width;
    if (this.clouds.length === 0) {
      this.initClouds(width, groundY);
    } else {
      const oldWidth = this.sceneWidth;
      const scale = width / oldWidth;
      for (const c of this.clouds) c.x *= scale;
    }
  }

  private initClouds(width: number, groundY: number): void {
    const skyH = groundY;
    const TOTAL_CLOUDS = 9;

    const addCloud = (x: number, y: number, w: number, h: number, speed: number, variant: number) => {
      const textureKey = `__cloud_${this.clouds.length}`;
      const canvas = makeCloudCanvas(Math.round(w), Math.round(h), variant);
      if (this.scene.textures.exists(textureKey)) this.scene.textures.remove(textureKey);
      this.scene.textures.addCanvas(textureKey, canvas);
      const sprite = this.scene.add.image(x, y, textureKey).setDepth(1).setAlpha(0);
      // Spread thresholds across the pool so storm clouds join the sky
      // progressively as cover builds, and leave one-by-one as it clears.
      const coverThreshold = (this.clouds.length / TOTAL_CLOUDS) * 0.85;
      this.clouds.push({ x, y, w, h, speed, sprite, textureKey, coverThreshold });
    };

    for (let i = 0; i < 5; i++) {
      addCloud(
        Math.random() * width * 1.4,
        skyH * (0.08 + Math.random() * 0.22),
        100 + Math.random() * 90,
        46  + Math.random() * 28,
        0.010 + Math.random() * 0.006,
        i % 3,
      );
    }
    for (let i = 0; i < 4; i++) {
      addCloud(
        Math.random() * width * 1.4,
        skyH * (0.32 + Math.random() * 0.22),
        70  + Math.random() * 60,
        34  + Math.random() * 22,
        0.022 + Math.random() * 0.010,
        (i + 1) % 3,
      );
    }
  }

  update(delta: number, elevation: number, summerWeight = 1, weatherIntensity = 0): void {
    const dt = delta / 1000;
    // Storm cover rises quickly once it starts raining, then lingers and
    // clears gradually afterwards rather than snapping back to normal.
    if (weatherIntensity > this.stormCover) {
      this.stormCover = Math.min(1, this.stormCover + dt / 6);
    } else {
      this.stormCover = Math.max(weatherIntensity, this.stormCover - dt / 40);
    }

    const seasonBase = 0.07 + 0.13 * (1 - summerWeight);
    const dayAlpha   = Math.max(0, Math.min(seasonBase, elevation * seasonBase / 0.07));

    const grey = Math.round(255 - this.stormCover * 95);
    const tint  = (grey << 16) | (grey << 8) | grey;

    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed * delta;
      if (cloud.x < -(cloud.w + PAD) * 1.5) cloud.x += this.sceneWidth + (cloud.w + PAD) * 3;
      cloud.sprite.x = cloud.x;

      // Storm clouds fade in once cover builds past their threshold, and
      // stay visible day or night for a heavy, overcast look.
      const stormVisibility = Math.max(0, (this.stormCover - cloud.coverThreshold) / Math.max(0.05, 1 - cloud.coverThreshold));
      cloud.sprite.setAlpha(Math.max(dayAlpha, stormVisibility * 0.8));

      if (this.stormCover > 0.02) {
        cloud.sprite.setTint(tint);
      } else {
        cloud.sprite.clearTint();
      }
    }
  }

  destroy(): void {
    for (const c of this.clouds) {
      c.sprite.destroy();
      if (this.scene.textures.exists(c.textureKey)) this.scene.textures.remove(c.textureKey);
    }
    this.clouds = [];
  }
}
