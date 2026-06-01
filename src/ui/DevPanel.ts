import Phaser from 'phaser';
import { UI_FONT } from '../constants';

export const DEV_PANEL_OFFSET = 14; // gap between canvas top and panel background
export const DEV_PANEL_H = 84;      // height of the panel background itself

export class DevPanel {
  readonly container: Phaser.GameObjects.Container;
  private clockText: Phaser.GameObjects.Text;
  private fpsText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    width: number,
    onAddGold: () => void,
    onAdvanceTime: () => void,
    onReset: () => void,
    onMidnight: () => void,
    onSkip: () => void,
  ) {
    const container = scene.add.container(0, DEV_PANEL_OFFSET).setDepth(90);

    const row1Y = 16;
    const row2Y = 42;
    const row3Y = 68;
    container.add(scene.add.rectangle(width / 2, DEV_PANEL_H / 2, width, DEV_PANEL_H, 0x000000, 0.6));

    const btnW = 120;
    const gap = 8;
    const leftX = (width - btnW * 2 - gap) / 2 + btnW / 2;
    const rightX = leftX + btnW + gap;

    // Row 1: +$1B and +1hr
    const btn1 = scene.add.rectangle(leftX, row1Y, btnW, 26, 0x1a4400).setInteractive({ useHandCursor: true });
    container.add(btn1);
    container.add(scene.add.text(leftX, row1Y, '+$1B', { fontSize: '13px', color: '#88ff88', fontFamily: UI_FONT }).setOrigin(0.5));
    btn1.on('pointerover', () => btn1.setFillStyle(0x285e00));
    btn1.on('pointerout', () => btn1.setFillStyle(0x1a4400));
    btn1.on('pointerdown', onAddGold);

    const btn2 = scene.add.rectangle(rightX, row1Y, btnW, 26, 0x001444).setInteractive({ useHandCursor: true });
    container.add(btn2);
    container.add(scene.add.text(rightX, row1Y, '+1 hr', { fontSize: '13px', color: '#88aaff', fontFamily: UI_FONT }).setOrigin(0.5));
    btn2.on('pointerover', () => btn2.setFillStyle(0x001e5e));
    btn2.on('pointerout', () => btn2.setFillStyle(0x001444));
    btn2.on('pointerdown', onAdvanceTime);

    // Row 2: Midnight and Skip
    const midBtn = scene.add.rectangle(leftX, row2Y, btnW, 26, 0x220033).setInteractive({ useHandCursor: true });
    container.add(midBtn);
    container.add(scene.add.text(leftX, row2Y, 'Midnight', { fontSize: '13px', color: '#cc88ff', fontFamily: UI_FONT }).setOrigin(0.5));
    midBtn.on('pointerover', () => midBtn.setFillStyle(0x330044));
    midBtn.on('pointerout', () => midBtn.setFillStyle(0x220033));
    midBtn.on('pointerdown', onMidnight);

    const skipBtn = scene.add.rectangle(rightX, row2Y, btnW, 26, 0x331400).setInteractive({ useHandCursor: true });
    container.add(skipBtn);
    container.add(scene.add.text(rightX, row2Y, 'Skip Lvls', { fontSize: '13px', color: '#ffaa44', fontFamily: UI_FONT }).setOrigin(0.5));
    skipBtn.on('pointerover', () => skipBtn.setFillStyle(0x4d1e00));
    skipBtn.on('pointerout', () => skipBtn.setFillStyle(0x331400));
    skipBtn.on('pointerdown', onSkip);

    // Row 3: version, clock, reset, fps
    container.add(
      scene.add.text(8, row3Y, `#${__GIT_HASH__}`, { fontSize: '11px', color: '#445566', fontFamily: UI_FONT }).setOrigin(0, 0.5)
    );

    this.clockText = scene.add
      .text(width / 2 - 70, row3Y, '', { fontSize: '13px', color: '#aaccff', fontFamily: UI_FONT })
      .setOrigin(0.5);
    container.add(this.clockText);

    const resetBtn = scene.add
      .rectangle(width / 2 + 60, row3Y, 110, 22, 0x440000)
      .setInteractive({ useHandCursor: true });
    container.add(resetBtn);
    container.add(
      scene.add.text(width / 2 + 60, row3Y, 'Reset All', { fontSize: '12px', color: '#ff8888', fontFamily: UI_FONT }).setOrigin(0.5)
    );
    resetBtn.on('pointerover', () => resetBtn.setFillStyle(0x661111));
    resetBtn.on('pointerout', () => resetBtn.setFillStyle(0x440000));
    resetBtn.on('pointerdown', onReset);

    this.fpsText = scene.add
      .text(width - 12, row3Y, '', { fontSize: '13px', color: '#ffdd88', fontFamily: UI_FONT })
      .setOrigin(1, 0.5);
    container.add(this.fpsText);

    this.container = container;
  }

  updateClock(timeString: string): void {
    this.clockText.setText(timeString);
  }

  updateFps(fps: number): void {
    this.fpsText.setText(`${Math.round(fps)} fps`);
  }

  destroy(): void {
    this.container.destroy();
  }
}
