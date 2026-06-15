import Phaser from 'phaser';
import { buildingHeight, YARD_H, MONO_FONT } from '../constants';

const TIER_NAMES = ['', 'Starter Home', 'Two-Storey House', 'Townhouse', 'Apartment Block', 'High-Rise', 'Office Block', 'Skyscraper'];

const PARTICLE_KEY = '__particle';

// Upgrade-celebration FX: tier-up banner + particle burst, a brief
// white-flash on the upgraded plot, and fading scaffolding overlay shown on
// every upgrade. Extracted from GameScene — stateless aside from the shared
// particle texture, with geometry passed in per call.
export class TierCelebrationFx {
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    if (!scene.textures.exists(PARTICLE_KEY)) {
      const dotG = scene.add.graphics();
      dotG.fillStyle(0xffffff, 1);
      dotG.fillCircle(4, 4, 4);
      dotG.generateTexture(PARTICLE_KEY, 8, 8);
      dotG.destroy();
    }
  }

  /** Tier-up banner + particle burst above the upgraded plot. */
  celebrateTier(plotIndex: number, tier: number, level: number, plotWidth: number, groundY: number): void {
    const scene = this.scene;
    const cx = (plotIndex + 0.5) * plotWidth;
    const topY = groundY - buildingHeight(level) - YARD_H - 12;

    // Banner
    const banner = scene.add
      .text(cx, topY, `✦ ${TIER_NAMES[tier].toUpperCase()} ✦`, {
        fontSize: '13px',
        color: '#ffe066',
        fontFamily: MONO_FONT,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: '#0a1828cc',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(201)
      .setAlpha(0)
      .setScale(0.6);

    scene.tweens.add({
      targets: banner,
      scale: 1,
      alpha: 1,
      duration: 280,
      ease: 'Back.Out',
      onComplete: () => {
        scene.tweens.add({
          targets: banner,
          alpha: 0,
          y: topY - 55,
          duration: 700,
          delay: 1200,
          ease: 'Quad.In',
          onComplete: () => banner.destroy(),
        });
      },
    });

    // Particle burst
    const emitter = scene.add.particles(cx, topY, PARTICLE_KEY, {
      speed: { min: 55, max: 140 },
      angle: { min: 210, max: 330 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 550, max: 950 },
      tint: [0xffe066, 0xff8844, 0x44ddff, 0xff44cc, 0xaaffaa],
      blendMode: 'ADD',
    });
    emitter.setDepth(202);
    emitter.explode(22, cx, topY);
    scene.time.delayedCall(1100, () => emitter.destroy());
  }

  /** Brief white flash over the upgraded plot. */
  flashPlot(index: number, level: number, plotWidth: number, groundY: number): void {
    const scene = this.scene;
    const cx = (index + 0.5) * plotWidth;
    const bh = buildingHeight(level) + YARD_H;
    const flash = scene.add
      .rectangle(cx, groundY - bh / 2, plotWidth - 4, bh, 0xffffff, 0.28)
      .setDepth(20);
    scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.Out',
      onComplete: () => flash.destroy(),
    });
  }

  /** Fading scaffolding overlay drawn over the upgraded plot. */
  showScaffolding(index: number, level: number, plotWidth: number, groundY: number): void {
    const scene = this.scene;
    const x0 = index * plotWidth + 2;
    const bh = buildingHeight(level) + YARD_H;
    const y0 = groundY - bh;
    const w  = plotWidth - 4;

    const gfx = scene.add.graphics().setDepth(9.05).setAlpha(0.65);
    gfx.lineStyle(1, 0x888888, 1);
    // Vertical scaffold poles
    for (let x = 0; x <= w; x += 12) {
      gfx.lineBetween(x0 + x, y0, x0 + x, y0 + bh);
    }
    // Horizontal scaffold boards
    for (let y = 0; y <= bh; y += 8) {
      gfx.lineBetween(x0, y0 + y, x0 + w, y0 + y);
    }

    scene.tweens.add({
      targets: gfx,
      alpha:   0,
      duration: 1500,
      ease: 'Cubic.Out',
      onComplete: () => gfx.destroy(),
    });
  }
}
