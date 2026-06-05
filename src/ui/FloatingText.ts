import Phaser from 'phaser';
import { MONO_FONT } from '../constants';

export function spawnFloatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color = '#ffdd44',
): void {
  const obj = scene.add
    .text(x, y, text, {
      fontSize: '12px',
      color,
      fontFamily: MONO_FONT,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    })
    .setOrigin(0.5, 1)
    .setDepth(200)
    .setAlpha(1);

  scene.tweens.add({
    targets: obj,
    y: y - 48,
    alpha: 0,
    duration: 1200,
    ease: 'Cubic.Out',
    onComplete: () => obj.destroy(),
  });
}
