import Phaser from 'phaser';
import { STATS_BAR_H, fmt } from '../constants';

export class StatsBar {
  readonly goldText: Phaser.GameObjects.Text;
  readonly taxRateText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, panelTop: number, width: number) {
    const midY = panelTop + STATS_BAR_H / 2;
    this.taxRateText = scene.add
      .text(8, midY, '', { fontSize: '15px', color: '#88ccff' })
      .setOrigin(0, 0.5)
      .setDepth(11);
    this.goldText = scene.add
      .text(width - 8, midY, '', { fontSize: '15px', color: '#ffd966' })
      .setOrigin(1, 0.5)
      .setDepth(11);
  }

  update(gold: number, taxRate: number): void {
    this.goldText.setText(`Balance: ${fmt(gold)}`);
    this.taxRateText.setText(`Income: ${fmt(taxRate)}/s`);
  }

  destroy(): void {
    this.goldText.destroy();
    this.taxRateText.destroy();
  }
}
