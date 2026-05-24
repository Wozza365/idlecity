import Phaser from 'phaser';
import { ROAD_H, VERGE_H, RIVER_H } from '../constants';

export class VergeRiver {
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(6);
  }

  render(width: number, groundY: number): void {
    const gfx    = this.gfx;
    const vergeY = groundY + ROAD_H;
    const riverY = vergeY + VERGE_H;
    gfx.clear();

    gfx.fillStyle(0x4a8c3a, 1);
    gfx.fillRect(0, vergeY, width, VERGE_H);

    gfx.fillStyle(0x2a6ab5, 1);
    gfx.fillRect(0, riverY, width, RIVER_H);
  }
}
