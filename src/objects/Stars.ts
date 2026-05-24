import Phaser from 'phaser';

interface Star {
  x: number;
  y: number;
  radius: number;
  brightness: number;
  light: Phaser.GameObjects.Light;
}

export class Stars {
  private stars: Star[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private readonly STAR_COUNT = 40;

  constructor(scene: Phaser.Scene, groundY: number) {
    this.gfx = scene.add.graphics().setDepth(2);

    const { width } = scene.scale;
    const skyTop = 0;
    const skyHeight = groundY;

    // Generate random stars across the sky
    for (let i = 0; i < this.STAR_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * Math.min(width, skyHeight) * 0.6 + Math.min(width, skyHeight) * 0.2;
      const cx = width / 2;
      const cy = skyHeight / 2;

      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;

      // Clamp to sky bounds
      const clampedX = Math.max(0, Math.min(width, x));
      const clampedY = Math.max(skyTop, Math.min(skyHeight, y));

      const radius = Math.random() * 1.5 + 0.5;
      const brightness = Math.random() * 0.6 + 0.4;

      const light = scene.lights.addLight(clampedX, clampedY, 80, 0xffeedd, 0.8);
      light.intensity = 0;

      this.stars.push({
        x: clampedX,
        y: clampedY,
        radius,
        brightness,
        light,
      });
    }
  }

  update(elevation: number, sunAngle: number, width: number, groundY: number): void {
    const skyHeight = groundY;
    const cx = width / 2;
    const cy = skyHeight / 2;

    // Star visibility fades in smoothly at night (elevation < 0) and fades out at sunrise
    const starAlpha = Math.max(0, Math.min(1, -elevation * 3));

    this.gfx.clear();

    for (const star of this.stars) {
      // Rotate star position based on sun angle (parallax effect)
      const angleFromCenter = Math.atan2(star.y - cy, star.x - cx);
      const distFromCenter = Math.hypot(star.x - cx, star.y - cy);
      const rotatedAngle = angleFromCenter + sunAngle * 0.5;

      const rotatedX = cx + Math.cos(rotatedAngle) * distFromCenter;
      const rotatedY = cy + Math.sin(rotatedAngle) * distFromCenter;

      // Draw star
      this.gfx.fillStyle(0xffeedd, starAlpha * star.brightness);
      this.gfx.fillCircle(rotatedX, rotatedY, star.radius);

      // Update light
      star.light.setPosition(rotatedX, rotatedY);
      star.light.intensity = Math.max(0, starAlpha * 0.6);
    }
  }

  resize(): void {
    // Stars are repositioned each frame during update via parallax
  }
}
