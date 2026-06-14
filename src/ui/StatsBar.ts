import Phaser from 'phaser';
import { STATS_BAR_H, fmtBalance, fmtPopulation, fmtRate, UI_FONT, MONO_FONT, GAME_HOUR_FACTOR } from '../constants';

export class StatsBar {
  private gfx: Phaser.GameObjects.Graphics;
  private chevronGfx: Phaser.GameObjects.Graphics;
  private hitZone: Phaser.GameObjects.Rectangle;
  private incomeLabel: Phaser.GameObjects.Text;
  private incomeValue: Phaser.GameObjects.Text;
  private incomeIcon: Phaser.GameObjects.Text;
  private balanceLabel: Phaser.GameObjects.Text;
  private balanceValue: Phaser.GameObjects.Text;
  private balanceIcon: Phaser.GameObjects.Text;
  private populationLabel: Phaser.GameObjects.Text;
  private populationValue: Phaser.GameObjects.Text;
  private populationIcon: Phaser.GameObjects.Text;
  private readonly width: number;
  private readonly panelTop: number;

  constructor(scene: Phaser.Scene, panelTop: number, width: number, onToggle: () => void) {
    this.width = width;
    this.panelTop = panelTop;
    const labelY = panelTop + 24;
    const valueY = panelTop + 41;
    const pillY  = panelTop + 8;
    const pillH  = STATS_BAR_H - 16;
    const pillCY = pillY + pillH / 2;
    const r      = 6;

    const margin = 8;
    const gap = 6;
    const popPillW  = Math.max(80, Math.min(150, width * 0.22));
    const pillW     = Math.max(110, Math.min(190, (width - 2 * margin - 2 * gap - popPillW) / 2));
    const popPillX  = (width - popPillW) / 2;

    this.gfx = scene.add.graphics().setDepth(10).setLighting(false);
    const gfx = this.gfx;

    // Income pill (left) — green accent on left edge
    gfx.fillStyle(0x0a1018, 0.75);
    gfx.fillRoundedRect(8, pillY, pillW, pillH, r);
    gfx.fillStyle(0x3dba7a, 1);
    gfx.fillRoundedRect(8, pillY, 3, pillH, { tl: r, bl: r, tr: 0, br: 0 });

    // Balance pill (right) — gold accent on right edge
    gfx.fillStyle(0x0a1018, 0.75);
    gfx.fillRoundedRect(width - pillW - 8, pillY, pillW, pillH, r);
    gfx.fillStyle(0xd4a820, 1);
    gfx.fillRoundedRect(width - 11, pillY, 3, pillH, { tl: 0, bl: 0, tr: r, br: r });

    // Population pill (center) — cyan accent on top edge
    gfx.fillStyle(0x0a1018, 0.75);
    gfx.fillRoundedRect(popPillX, pillY, popPillW, pillH, r);
    gfx.fillStyle(0x4aa8d8, 1);
    gfx.fillRoundedRect(popPillX, pillY, popPillW, 3, { tl: r, tr: r, bl: 0, br: 0 });

    // Income label + value
    this.incomeLabel = scene.add
      .text(20, labelY, 'INCOME', { fontSize: '11px', color: '#4a8a68', fontFamily: UI_FONT })
      .setOrigin(0, 0.5).setDepth(11);
    this.incomeValue = scene.add
      .text(20, valueY, '', { fontSize: '16px', color: '#88ddaa', fontFamily: MONO_FONT, fontStyle: 'bold' })
      .setOrigin(0, 0.5).setDepth(11);

    // ↑ icon — 16 px from the right edge of the income pill
    this.incomeIcon = scene.add
      .text(8 + pillW - 16, pillCY, '↑', { fontSize: '38px', color: '#3dba7a', fontFamily: UI_FONT })
      .setOrigin(0.5, 0.5).setAlpha(0.5).setDepth(11);

    // Balance label + value
    this.balanceLabel = scene.add
      .text(width - 20, labelY, 'BALANCE', { fontSize: '11px', color: '#8a7030', fontFamily: UI_FONT })
      .setOrigin(1, 0.5).setDepth(11);
    this.balanceValue = scene.add
      .text(width - 20, valueY, '', { fontSize: '16px', color: '#ffd966', fontFamily: MONO_FONT, fontStyle: 'bold' })
      .setOrigin(1, 0.5).setDepth(11);

    // ◆ icon — 16 px from the left edge of the balance pill, colored gold
    this.balanceIcon = scene.add
      .text(width - pillW - 8 + 16, pillCY, '◆', { fontSize: '30px', color: '#d4a820', fontFamily: UI_FONT })
      .setOrigin(0.5, 0.5).setAlpha(0.5).setDepth(11);

    // Population label + value — centered pill
    const popValueFontSize = popPillW < 100 ? '14px' : '16px';
    this.populationLabel = scene.add
      .text(popPillX + popPillW / 2, labelY, 'POP', { fontSize: '11px', color: '#5a9ac0', fontFamily: UI_FONT })
      .setOrigin(0.5, 0.5).setDepth(11);
    this.populationValue = scene.add
      .text(popPillX + popPillW / 2, valueY, '', { fontSize: popValueFontSize, color: '#7ec8f0', fontFamily: MONO_FONT, fontStyle: 'bold' })
      .setOrigin(0.5, 0.5).setDepth(11);

    // ⌂ icon — faint, behind the population value
    this.populationIcon = scene.add
      .text(popPillX + popPillW / 2, pillCY, '⌂', { fontSize: '34px', color: '#4aa8d8', fontFamily: UI_FONT })
      .setOrigin(0.5, 0.5).setAlpha(0.25).setDepth(11);

    // Chevron — hints that the bar can be tapped to expand/collapse the panel
    this.chevronGfx = scene.add.graphics().setDepth(11).setLighting(false);
    this.drawChevron(false);

    // Full-width hit zone over the bar — tap to toggle the panel
    this.hitZone = scene.add
      .rectangle(width / 2, panelTop + STATS_BAR_H / 2, width, STATS_BAR_H, 0, 0)
      .setDepth(12)
      .setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerdown', onToggle);
  }

  private drawChevron(expanded: boolean): void {
    const cx = this.width / 2;
    const cy = this.panelTop + STATS_BAR_H - 6;
    const g = this.chevronGfx;
    g.clear();
    g.fillStyle(0x5a7088, 1);
    if (expanded) {
      g.fillTriangle(cx - 6, cy - 2, cx + 6, cy - 2, cx, cy + 3); // pointing down — tap to collapse
    } else {
      g.fillTriangle(cx - 6, cy + 3, cx + 6, cy + 3, cx, cy - 2); // pointing up — tap to expand
    }
  }

  setExpanded(expanded: boolean): void {
    this.drawChevron(expanded);
  }

  update(gold: number, taxRate: number, population: number): void {
    this.incomeValue.setText(`${fmtRate(taxRate * GAME_HOUR_FACTOR)} / hr`);
    this.balanceValue.setText(fmtBalance(gold));
    this.populationValue.setText(fmtPopulation(population));
  }

  destroy(): void {
    this.gfx.destroy();
    this.chevronGfx.destroy();
    this.hitZone.destroy();
    this.incomeLabel.destroy();
    this.incomeValue.destroy();
    this.incomeIcon.destroy();
    this.balanceLabel.destroy();
    this.balanceValue.destroy();
    this.balanceIcon.destroy();
    this.populationLabel.destroy();
    this.populationValue.destroy();
    this.populationIcon.destroy();
  }
}
