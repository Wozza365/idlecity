import Phaser from 'phaser';

type Cloud = {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  sprite: Phaser.GameObjects.Image;
  textureKey: string;
};

const PAD = 50;

// Five distinct puff layouts — [xOffFrac, yOffFrac, fullWidthFrac, fullHeightFrac]
// Each layout has a different silhouette: classic bell, wispy flat, double-peak,
// compact round, and asymmetric lean.
const LAYOUTS: ReadonlyArray<ReadonlyArray<[number, number, number, number]>> = [
  // Classic 5-puff bell curve
  [
    [-0.34,  0.05, 0.50, 0.55],
    [-0.15, -0.09, 0.66, 0.74],
    [ 0.00, -0.22, 0.82, 0.92],
    [ 0.17, -0.07, 0.64, 0.72],
    [ 0.36,  0.07, 0.48, 0.52],
  ],
  // Wide wispy 3-puff — low profile, stretched horizontally
  [
    [-0.38,  0.08, 0.52, 0.48],
    [ 0.00, -0.05, 0.76, 0.62],
    [ 0.40,  0.10, 0.50, 0.44],
  ],
  // Double-peak 4-puff — two prominent towers
  [
    [-0.22, -0.18, 0.62, 0.72],
    [-0.05,  0.10, 0.48, 0.54],
    [ 0.13, -0.26, 0.70, 0.82],
    [ 0.32,  0.06, 0.54, 0.58],
  ],
  // Compact round 4-puff — tight cluster, nearly circular silhouette
  [
    [-0.16, -0.14, 0.60, 0.70],
    [ 0.13, -0.20, 0.66, 0.76],
    [-0.10,  0.12, 0.54, 0.54],
    [ 0.20,  0.08, 0.58, 0.60],
  ],
  // Asymmetric lean — 5-puff with off-centre peak toward the trailing edge
  [
    [-0.34,  0.14, 0.44, 0.46],
    [-0.14,  0.00, 0.60, 0.62],
    [ 0.04, -0.14, 0.72, 0.78],
    [ 0.24, -0.22, 0.68, 0.80],
    [ 0.41,  0.02, 0.50, 0.54],
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

    const addCloud = (x: number, y: number, w: number, h: number, speed: number, variant: number) => {
      const textureKey = `__cloud_${this.clouds.length}`;
      const canvas = makeCloudCanvas(Math.round(w), Math.round(h), variant);
      if (this.scene.textures.exists(textureKey)) this.scene.textures.remove(textureKey);
      this.scene.textures.addCanvas(textureKey, canvas);
      const sprite = this.scene.add.image(x, y, textureKey).setDepth(1).setAlpha(0);
      this.clouds.push({ x, y, w, h, speed, sprite, textureKey });
    };

    for (let i = 0; i < 5; i++) {
      addCloud(
        Math.random() * width * 1.4,
        skyH * (0.08 + Math.random() * 0.22),
        100 + Math.random() * 90,
        46  + Math.random() * 28,
        0.010 + Math.random() * 0.006,
        i % LAYOUTS.length,
      );
    }
    for (let i = 0; i < 4; i++) {
      addCloud(
        Math.random() * width * 1.4,
        skyH * (0.32 + Math.random() * 0.22),
        70  + Math.random() * 60,
        34  + Math.random() * 22,
        0.022 + Math.random() * 0.010,
        (i + 2) % LAYOUTS.length,
      );
    }
  }

  update(delta: number, elevation: number, summerWeight = 1, weatherIntensity = 0): void {
    const seasonBase = 0.07 + 0.13 * (1 - summerWeight);
    const maxAlpha   = seasonBase + 0.10 * weatherIntensity;
    const alpha      = Math.max(0, Math.min(maxAlpha, elevation * maxAlpha / 0.07));

    const grey = Math.round(255 - weatherIntensity * 40);
    const tint  = (grey << 16) | (grey << 8) | grey;

    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed * delta;
      if (cloud.x < -(cloud.w + PAD) * 1.5) cloud.x += this.sceneWidth + (cloud.w + PAD) * 3;
      cloud.sprite.x = cloud.x;
      cloud.sprite.setAlpha(alpha);
      if (weatherIntensity > 0) {
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
