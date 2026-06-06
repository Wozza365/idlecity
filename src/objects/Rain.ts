import Phaser from 'phaser';

interface Streak {
  x: number;
  y: number;
}

export class Rain {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private streaks: Streak[] = [];
  private sceneWidth = 800;
  private sceneHeight = 600;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(9.8);
  }

  rebuild(width: number, height: number): void {
    this.sceneWidth  = width;
    this.sceneHeight = height;
    this.streaks = [];
    for (let i = 0; i < 220; i++) {
      this.streaks.push({
        x: Math.random() * width,
        y: Math.random() * height,
      });
    }
  }

  update(delta: number, intensity: number): void {
    if (intensity <= 0) {
      this.gfx.clear();
      return;
    }

    const speed   = 400;   // px/s downward
    const drift   = 40;    // px/s rightward (light angle)
    const dy      = speed * delta / 1000;
    const dx      = drift * delta / 1000;

    for (const s of this.streaks) {
      s.y += dy;
      s.x += dx;
      if (s.y > this.sceneHeight) {
        s.y -= this.sceneHeight + 20;
        s.x = Math.random() * this.sceneWidth;
      }
      if (s.x > this.sceneWidth + 10) s.x -= this.sceneWidth + 20;
    }

    const activeCount  = Math.round(60 + 160 * intensity);
    const streakLen    = 6 + 8  * intensity;
    const baseAlpha    = 0.06 + 0.12 * intensity;
    const angleRad     = Math.atan2(drift, speed); // ~6° from vertical

    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    this.gfx.clear();
    this.gfx.lineStyle(1, 0xaaccdd, baseAlpha);

    for (let i = 0; i < activeCount && i < this.streaks.length; i++) {
      const s = this.streaks[i];
      // Line from top of streak to bottom, along the rain angle
      const x1 = s.x - sinA * streakLen / 2;
      const y1 = s.y - cosA * streakLen / 2;
      const x2 = s.x + sinA * streakLen / 2;
      const y2 = s.y + cosA * streakLen / 2;
      this.gfx.lineBetween(x1, y1, x2, y2);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
