import Phaser from 'phaser';
import { UI_FONT } from '../constants';

const DEPTH = 400; // above MenuUI's dialog (D_DEPTH=300)

/** Full-screen dim overlay + "Loading…" text, shown while a theme is applied. */
export class LoadingScreen {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.bg = scene.add.rectangle(width / 2, height / 2, width, height, 0x05080c, 0.85)
      .setDepth(DEPTH)
      .setVisible(false);

    this.label = scene.add.text(width / 2, height / 2, 'Loading…', {
      fontSize: '16px', color: '#ffe8a0', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH + 1).setVisible(false);
  }

  show(): void {
    this.bg.setVisible(true);
    this.label.setVisible(true);
  }

  hide(): void {
    this.bg.setVisible(false);
    this.label.setVisible(false);
  }

  resize(width: number, height: number): void {
    this.bg.setPosition(width / 2, height / 2).setSize(width, height);
    this.label.setPosition(width / 2, height / 2);
  }

  destroy(): void {
    this.bg.destroy();
    this.label.destroy();
  }
}
