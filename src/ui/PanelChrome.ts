import Phaser from 'phaser';
import { PLOT_COUNT } from '../constants';

export class PanelChrome {
  // Fixed chrome — top border of the always-visible stats bar.
  readonly fixedGfx: Phaser.GameObjects.Graphics;
  // Sliding chrome — borders for the expandable upgrade panel; GameScene
  // animates this object's `y` together with the panel content.
  readonly slidingGfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.fixedGfx = scene.add.graphics().setDepth(10).setLighting(false);
    this.slidingGfx = scene.add.graphics().setDepth(10).setLighting(false);
  }

  draw(width: number, panelTop: number, collapsedPanelTop: number, colTop: number, sectionW: number): void {
    this.fixedGfx.clear();
    this.fixedGfx.lineStyle(1, 0x3a4a5a, 1);
    this.fixedGfx.moveTo(0, collapsedPanelTop).lineTo(width, collapsedPanelTop).strokePath();

    const gfx = this.slidingGfx;
    gfx.clear();
    gfx.setPosition(0, 0);
    gfx.lineStyle(1, 0x3a4a5a, 1);
    gfx.moveTo(0, panelTop).lineTo(width, panelTop).strokePath();
    gfx.moveTo(0, colTop).lineTo(width, colTop).strokePath();
    for (let i = 1; i < PLOT_COUNT; i++) {
      const x = i * sectionW;
      gfx.moveTo(x, colTop).lineTo(x, collapsedPanelTop).strokePath();
    }
  }
}
