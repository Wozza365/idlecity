import Phaser from 'phaser';

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;  // sine phase for horizontal wobble
  alpha: number;
}

export class Snow {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private flakes: Flake[] = [];
  private sceneWidth  = 800;
  private sceneHeight = 600;
  private clipY = Infinity;
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(9.82);
  }

  rebuild(width: number, height: number, clipY?: number): void {
    this.sceneWidth  = width;
    this.sceneHeight = height;
    this.clipY       = clipY ?? Infinity;
    this.flakes = [];
    for (let i = 0; i < 200; i++) {
      this.flakes.push(this.makeFlake(Math.random() * width, Math.random() * height));
    }
  }

  private makeFlake(x: number, y: number): Flake {
    return {
      x,
      y,
      r:     1.5 + Math.random() * 1.5,
      speed: 25 + Math.random() * 45,  // px/s downward
      drift: (Math.random() - 0.5) * 20,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.5 + Math.random() * 0.4,
    };
  }

  update(delta: number, intensity: number): void {
    if (intensity <= 0) {
      this.gfx.clear();
      return;
    }

    this.time += delta / 1000;
    const activeCount = Math.round(200 * intensity);

    for (let i = 0; i < activeCount; i++) {
      const f = this.flakes[i];
      const wobble = Math.sin(this.time * 1.2 + f.phase) * 8; // ±8px horizontal
      f.y += f.speed * delta / 1000;
      f.x += (f.drift + wobble * 0.016) * delta / 1000;

      if (f.y > this.sceneHeight + 4) {
        Object.assign(f, this.makeFlake(Math.random() * this.sceneWidth, -4));
      }
      if (f.x < -4) f.x += this.sceneWidth + 8;
      if (f.x > this.sceneWidth + 4) f.x -= this.sceneWidth + 8;
    }

    this.gfx.clear();
    for (let i = 0; i < activeCount; i++) {
      const f = this.flakes[i];
      if (f.y + f.r > this.clipY) continue; // don't draw into UI panel
      this.gfx.fillStyle(0xeeeeff, f.alpha * intensity);
      this.gfx.fillCircle(Math.round(f.x), Math.round(f.y), Math.round(f.r));
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
