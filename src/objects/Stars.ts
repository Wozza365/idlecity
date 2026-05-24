import Phaser from 'phaser';

interface Star {
  baseX: number;
  y: number;
  radius: number;
  brightness: number;
}

export class Stars {
  private stars: Star[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private readonly STAR_COUNT = 50;
  private groundY: number;

  constructor(scene: Phaser.Scene, groundY: number) {
    this.gfx = scene.add.graphics().setDepth(2);
    this.groundY = groundY;

    const { width } = scene.scale;
    const skyTop = 0;
    const skyHeight = groundY * 0.65;

    // Generate stars across the sky (higher up, only in upper portion)
    for (let i = 0; i < this.STAR_COUNT; i++) {
      const baseX = Math.random() * width * 1.5 - width * 0.25;
      const y = Math.random() * skyHeight + skyTop;

      const radius = Math.random() * 1.2 + 0.4;
      const brightness = Math.random() * 0.7 + 0.3;

      this.stars.push({
        baseX,
        y,
        radius,
        brightness,
      });
    }
  }

  update(elevation: number, sunAngle: number, width: number): void {
    // Star visibility fades in smoothly at night (elevation < 0) and fades out at sunrise
    const starAlpha = Math.max(0, Math.min(1, -elevation * 3));

    this.gfx.clear();

    // Parallax scroll: stars move across screen based on time (sun angle)
    const scrollOffset = (sunAngle / (Math.PI * 2)) * width * 0.5;

    for (const star of this.stars) {
      // Simple horizontal parallax: stars move left-right as time progresses
      const x = star.baseX + scrollOffset;

      // Wrap stars around screen for continuous scrolling
      const wrappedX = ((x % (width * 1.5)) + (width * 1.5)) % (width * 1.5) - width * 0.25;

      const isInBottomHalf = star.y > this.groundY * 0.5;

      // Draw glow only for stars in upper half (prevents light spillage on lower buildings)
      if (!isInBottomHalf) {
        // Soft gradient glow with multiple concentric circles
        const glowAlpha = starAlpha * 0.08;

        // Outer glow (largest, faintest)
        this.gfx.fillStyle(0xffeedd, glowAlpha * 0.3);
        this.gfx.fillCircle(wrappedX, star.y, star.radius * 2.5);

        // Mid glow
        this.gfx.fillStyle(0xffeedd, glowAlpha * 0.6);
        this.gfx.fillCircle(wrappedX, star.y, star.radius * 1.6);

        // Inner glow
        this.gfx.fillStyle(0xffeedd, glowAlpha);
        this.gfx.fillCircle(wrappedX, star.y, star.radius * 0.8);
      }

      // Draw star core
      this.gfx.fillStyle(0xffeedd, starAlpha * star.brightness);
      this.gfx.fillCircle(wrappedX, star.y, star.radius);
    }
  }

  resize(): void {
    // Stars are repositioned each frame during update via parallax
  }
}
