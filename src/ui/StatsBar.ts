import Phaser from 'phaser';
import { STATS_BAR_H, fmt, fmtBalance, UI_FONT } from '../constants';

export class StatsBar {
  private gfx: Phaser.GameObjects.Graphics;
  private incomeLabel: Phaser.GameObjects.Text;
  private incomeValue: Phaser.GameObjects.Text;
  private balanceLabel: Phaser.GameObjects.Text;
  private balanceValue: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, panelTop: number, width: number) {
    const labelY = panelTop + 22;
    const valueY = panelTop + 39;
    const pillY  = panelTop + 8;
    const pillH  = STATS_BAR_H - 16;
    const pillW  = 190;
    const r      = 6;

    this.gfx = scene.add.graphics().setDepth(10).setLighting(false);
    const gfx = this.gfx;

    // Income pill (left)
    gfx.fillStyle(0x0a1018, 0.75);
    gfx.fillRoundedRect(8, pillY, pillW, pillH, r);
    gfx.fillStyle(0x3dba7a, 1);
    gfx.fillRoundedRect(8, pillY, 3, pillH, { tl: r, bl: r, tr: 0, br: 0 });

    // Balance pill (right)
    gfx.fillStyle(0x0a1018, 0.75);
    gfx.fillRoundedRect(width - pillW - 8, pillY, pillW, pillH, r);
    gfx.fillStyle(0xd4a820, 1);
    gfx.fillRoundedRect(width - 11, pillY, 3, pillH, { tl: 0, bl: 0, tr: r, br: r });

    // Income texts
    this.incomeLabel = scene.add
      .text(20, labelY, 'INCOME', { fontSize: '11px', color: '#4a8a68', fontFamily: UI_FONT })
      .setOrigin(0, 0.5)
      .setDepth(11);
    this.incomeValue = scene.add
      .text(20, valueY, '', { fontSize: '16px', color: '#88ddaa', fontFamily: UI_FONT, fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(11);

    // Balance texts
    this.balanceLabel = scene.add
      .text(width - 20, labelY, 'BALANCE', { fontSize: '11px', color: '#8a7030', fontFamily: UI_FONT })
      .setOrigin(1, 0.5)
      .setDepth(11);
    this.balanceValue = scene.add
      .text(width - 20, valueY, '', { fontSize: '16px', color: '#ffd966', fontFamily: UI_FONT, fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setDepth(11);
  }

  update(gold: number, taxRate: number): void {
    this.incomeValue.setText(`↑  ${fmt(taxRate * 3600)} / hr`);
    this.balanceValue.setText(`🪙  ${fmtBalance(gold)}`);
  }

  destroy(): void {
    this.gfx.destroy();
    this.incomeLabel.destroy();
    this.incomeValue.destroy();
    this.balanceLabel.destroy();
    this.balanceValue.destroy();
  }
}
