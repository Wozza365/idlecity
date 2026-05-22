import Phaser from 'phaser';

export class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload(): void {
    // Load assets here
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 40, 'IdleCity', {
        fontSize: '72px',
        color: '#e8e8f0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 60, 'Build your city', {
        fontSize: '28px',
        color: '#888899',
      })
      .setOrigin(0.5);
  }

  update(): void {
    // Game loop
  }
}
