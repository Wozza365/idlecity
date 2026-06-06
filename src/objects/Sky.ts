import Phaser from 'phaser';
import { lerpColor } from '../constants';

export class Sky {
  private skyGfx!: Phaser.GameObjects.Graphics;
  readonly nightOverlay: Phaser.GameObjects.Rectangle;
  /** Current horizon colour — exposed for water reflection */
  horizonColor: number = 0x6aaad0;

  constructor(private scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.nightOverlay = scene.add
      .rectangle(width / 2, height / 2, width, height, 0x000022)
      .setAlpha(0)
      .setDepth(50);
    this.createSkyGfx();
  }

  private createSkyGfx(): void {
    this.skyGfx = this.scene.add.graphics().setDepth(0).setLighting(true);
  }

  /** Destroy old skyGfx and create a fresh one — call at the top of buildLayout. */
  rebuild(): void {
    this.skyGfx.destroy();
    this.createSkyGfx();
  }

  updateGradient(
    elev: number, width: number, groundY: number,
    winterWeight = 0, springWeight = 0, weatherIntensity = 0,
  ): void {
    if (!this.skyGfx) return;

    let zenith: number;
    let horizon: number;

    if (elev <= -0.15) {
      zenith = 0x04040f; horizon = 0x08082a;
    } else if (elev <= -0.02) {
      const t = (elev + 0.15) / 0.13;
      zenith  = lerpColor(0x04040f, 0x160c2a, t);
      horizon = lerpColor(0x08082a, 0x3a100a, t);
    } else if (elev <= 0.05) {
      const t = (elev + 0.02) / 0.07;
      zenith  = lerpColor(0x160c2a, 0x1e3878, t);
      horizon = lerpColor(0x3a100a, 0xc85c14, t);
    } else if (elev <= 0.20) {
      const t = (elev - 0.05) / 0.15;
      zenith  = lerpColor(0x1e3878, 0x2255aa, t);
      horizon = lerpColor(0xc85c14, 0x78aac8, t);
    } else if (elev <= 0.45) {
      const t = (elev - 0.20) / 0.25;
      zenith  = lerpColor(0x2255aa, 0x2a6aa0, t);
      horizon = lerpColor(0x78aac8, 0x6aaad0, t);
    } else {
      zenith = 0x2a6aa0; horizon = 0x6aaad0;
    }

    // Seasonal tints — applied via continuous weights, no branches
    if (winterWeight > 0) {
      zenith  = lerpColor(zenith,  0x6677aa, winterWeight * 0.22);
      horizon = lerpColor(horizon, 0x8899aa, winterWeight * 0.25);
    }
    if (springWeight > 0) {
      horizon = lerpColor(horizon, 0xffaacc, springWeight * 0.10);
    }
    // Overcast tint during rain/snow — blends toward grey-blue
    if (weatherIntensity > 0) {
      zenith  = lerpColor(zenith,  0x506070, weatherIntensity * 0.30);
      horizon = lerpColor(horizon, 0x607888, weatherIntensity * 0.30);
    }

    this.horizonColor = horizon;

    this.skyGfx.clear();
    this.skyGfx.fillGradientStyle(zenith, zenith, horizon, horizon, 1);
    this.skyGfx.fillRect(0, 0, width, groundY);
  }

  updateOverlay(elev: number): void {
    this.nightOverlay.setFillStyle(0x000022);
    if (elev > 0.05) {
      this.nightOverlay.setAlpha(0);
    } else if (elev > 0) {
      this.nightOverlay.setAlpha(0.22 * (1 - elev / 0.05));
    } else if (elev > -0.15) {
      const t = -elev / 0.15;
      this.nightOverlay.setAlpha(0.22 + t * 0.13);
    } else {
      this.nightOverlay.setAlpha(0.35);
    }
  }

  resize(width: number, height: number): void {
    this.nightOverlay.setPosition(width / 2, height / 2).setSize(width, height);
  }
}
