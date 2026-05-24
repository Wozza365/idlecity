import Phaser from 'phaser';
import {
  lerpColor, sunColorAtElevation,
} from '../constants';

export class SunMoon {
  private sunCircle:    Phaser.GameObjects.Arc;
  private moonCircle:   Phaser.GameObjects.Arc;
  private sunGlowSprite: Phaser.GameObjects.Image;
  private sunGroundGlow: Phaser.GameObjects.Ellipse;
  readonly sunLight:    Phaser.GameObjects.Light;

  constructor(private scene: Phaser.Scene, groundY: number) {
    const { width } = scene.scale;
    const cx = width / 2;

    // Glow texture: opaque Gaussian from white (centre) → black (edge).
    // Black pixels add nothing in ADD blend mode, bypassing premultiplied-alpha
    // banding. 30 stops trace a smooth Gaussian so there are no visible kinks.
    const texSize    = 512;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width  = texSize;
    glowCanvas.height = texSize;
    const ctx2d = glowCanvas.getContext('2d')!;
    const half  = texSize / 2;
    const grad  = ctx2d.createRadialGradient(half, half, 0, half, half, half);
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const v = Math.round(Math.exp(-t * t * 7) * 255);
      grad.addColorStop(t, `rgb(${v},${v},${v})`);
    }
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(0, 0, texSize, texSize);
    scene.textures.addCanvas('sun-glow', glowCanvas);

    this.moonCircle   = scene.add.arc(cx, groundY, 16, 0, 360, false, 0xd0d0e8, 1).setDepth(2);
    this.sunGlowSprite = scene.add.image(cx, 80, 'sun-glow')
      .setDisplaySize(300, 300)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(3);
    this.sunCircle    = scene.add.arc(cx, 80, 20, 0, 360, false, 0xfff8aa, 1).setDepth(5);
    this.sunGroundGlow = scene.add
      .ellipse(cx, groundY + 6, Math.round(width * 0.5), 22, 0xfffae0, 0)
      .setDepth(6);
    this.sunLight = scene.lights.addLight(cx, 80, Math.max(800, width * 2), 0xffeeaa, 3.2);
    this.sunLight.height = 400;
  }

  update(
    sunAngle: number,
    width: number,
    groundY: number,
  ): void {
    const a      = sunAngle;
    const cx     = width / 2;
    const orbitX = width * 0.95;
    const orbitY = Math.round(groundY * 0.90);

    const elevation = Math.sin(a);
    const sunX      = cx - Math.cos(a) * orbitX;
    const sunY      = groundY - elevation * orbitY;
    const sunAbove  = elevation > 0.02;

    const moonElev = Math.sin(a + Math.PI);
    const moonX    = cx - Math.cos(a + Math.PI) * orbitX;
    const moonY    = groundY - moonElev * orbitY;

    this.sunCircle.setPosition(sunX, sunY).setVisible(sunAbove);
    this.moonCircle.setPosition(moonX, moonY).setVisible(moonElev > 0.02);
    this.sunGlowSprite.setPosition(sunX, sunY).setVisible(sunAbove);

    this.sunGroundGlow
      .setPosition(sunX, groundY + 6)
      .setVisible(sunAbove)
      .setAlpha(Math.max(0, elevation * 0.22));

    this.sunLight.x         = sunX;
    this.sunLight.y         = sunY;
    this.sunLight.height = Math.max(100, 500 * Math.max(0, elevation));
    this.sunLight.intensity = Math.max(0, elevation * 3.2);

    const sunColor = sunColorAtElevation(elevation);
    this.sunCircle.setFillStyle(sunColor);
    this.sunGlowSprite.setTint(sunColor);
    this.sunLight.setColor(sunColor);

    const ambMin  = elevation >= 0 ? Math.max(0.08, 0.28 - elevation) : 0.08;
    const amb     = Math.max(ambMin, elevation * 0.55 + 0.14);
    const ambTint = lerpColor(0xff8833, 0xffffff, Math.min(1, elevation * 3));
    const ar = Math.round(((ambTint >> 16) & 0xff) * amb);
    const ag = Math.round(((ambTint >> 8)  & 0xff) * amb);
    const ab = Math.round( (ambTint        & 0xff) * amb);
    this.scene.lights.setAmbientColor((ar << 16) | (ag << 8) | ab);

    // Phaser 4 handles shadows automatically - no manual shadow drawing needed
  }

  resize(width: number): void {
    this.sunGroundGlow.setDisplaySize(Math.round(width * 0.5), 22);
    this.sunLight.radius = Math.max(800, width * 2);
  }

}
