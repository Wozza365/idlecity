import Phaser from 'phaser';
import { PLOT_COUNT, STATS_BAR_H } from '../constants';

export class PanelChrome {
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(10).setLighting(false);
  }

  draw(width: number, height: number, panelTop: number, colTop: number, sectionW: number): void {
    const gfx = this.gfx;
    gfx.clear();
    gfx.lineStyle(1, 0x3a4a5a, 1);
    gfx.moveTo(0, panelTop).lineTo(width, panelTop).strokePath();
    gfx.moveTo(0, panelTop + STATS_BAR_H).lineTo(width, panelTop + STATS_BAR_H).strokePath();
    gfx.moveTo(0, colTop).lineTo(width, colTop).strokePath();
    for (let i = 1; i < PLOT_COUNT; i++) {
      const x = i * sectionW;
      gfx.moveTo(x, colTop).lineTo(x, height).strokePath();
    }
  }
}
