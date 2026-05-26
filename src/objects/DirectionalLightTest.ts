import Phaser from 'phaser';

export class DirectionalLightTest {
  private readonly light:        Phaser.GameObjects.Light;
  private readonly blockerGfx:   Phaser.GameObjects.Graphics;
  private readonly maskGfx:      Phaser.GameObjects.Graphics;
  private readonly indicatorGfx: Phaser.GameObjects.Graphics;
  private coneAngle              = -Math.PI / 2; // start pointing upward
  private readonly coneHalf      = Math.PI / 4;  // 45° each side → 90° total
  private readonly cx:    number;
  private readonly cy:    number;
  private readonly w:     number;
  private readonly h:     number;

  constructor(scene: Phaser.Scene, screenW: number, groundY: number) {
    this.cx = screenW / 2;
    this.cy = groundY / 2;
    this.w  = screenW;
    this.h  = groundY;

    // Bright point light at the cone apex
    this.light = scene.lights.addLight(this.cx, this.cy, 600, 0xffffff, 3.5);

    // Small glowing dot to mark the light source
    this.indicatorGfx = scene.add.graphics();
    this.indicatorGfx.setBlendMode(Phaser.BlendModes.ADD);
    this.indicatorGfx.fillStyle(0xffffff, 0.9);
    this.indicatorGfx.fillCircle(this.cx, this.cy, 5);
    this.indicatorGfx.setDepth(50);

    // Dark blocker that covers everything outside the cone
    this.blockerGfx = scene.add.graphics();
    this.blockerGfx.setDepth(11);

    // Stencil shape — rendered to stencil buffer, not visually present
    this.maskGfx = scene.add.graphics();

    const mask = this.maskGfx.createGeometryMask();
    // invertAlpha exists at runtime but is absent from the bundled Phaser types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mask as any).invertAlpha = true;
    this.blockerGfx.setMask(mask);

    this.drawCone();
  }

  update(): void {
    this.coneAngle += 0.003;
    this.drawCone();
  }

  destroy(scene: Phaser.Scene): void {
    scene.lights.removeLight(this.light);
    this.blockerGfx.destroy();
    this.maskGfx.destroy();
    this.indicatorGfx.destroy();
  }

  private drawCone(): void {
    const r     = Math.sqrt(this.w * this.w + this.h * this.h);
    const start = this.coneAngle - this.coneHalf;
    const end   = this.coneAngle + this.coneHalf;

    this.maskGfx.clear();
    this.maskGfx.fillStyle(0xffffff, 1);
    this.maskGfx.beginPath();
    this.maskGfx.moveTo(this.cx, this.cy);
    this.maskGfx.arc(this.cx, this.cy, r, start, end, false);
    this.maskGfx.closePath();
    this.maskGfx.fillPath();

    this.blockerGfx.clear();
    this.blockerGfx.fillStyle(0x000000, 0.75);
    this.blockerGfx.fillRect(0, 0, this.w, this.h);
  }
}
