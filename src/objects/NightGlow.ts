import Phaser from 'phaser';
import { buildingHeight, YARD_H } from '../constants';
import { type PlotState } from '../game/GameState';

export class NightGlow {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add
      .graphics()
      .setDepth(10)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  update(elevation: number, plots: PlotState[], plotWidth: number, groundY: number): void {
    this.gfx.clear();
    // Visible from dusk (elev < 0.15) through full night; peaks at elev <= 0
    const nightFactor = Math.max(0, Math.min(1, (0.15 - elevation) / 0.2));
    if (nightFactor <= 0) return;

    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i];
      if (!plot.unlocked) continue;

      const cx = (i + 0.5) * plotWidth;
      const bh = buildingHeight(plot.level) + YARD_H;
      const cy = groundY - bh * 0.55;
      const maxR = Math.max(48, bh * 0.75);

      // Three concentric ADD-blended circles: outer faint, inner brighter
      this.gfx.fillStyle(0xffaa44, nightFactor * 0.04);
      this.gfx.fillCircle(cx, cy, maxR);
      this.gfx.fillStyle(0xffbb55, nightFactor * 0.055);
      this.gfx.fillCircle(cx, cy, maxR * 0.58);
      this.gfx.fillStyle(0xffcc77, nightFactor * 0.07);
      this.gfx.fillCircle(cx, cy, maxR * 0.32);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
