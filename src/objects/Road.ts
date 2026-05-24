import Phaser from 'phaser';
import { ROAD_H } from '../constants';

export class Road {
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(7).setLighting(true);
  }

  render(level: number, width: number, groundY: number): void {
    const gfx = this.gfx;
    const gy  = groundY;
    gfx.clear();

    if (level === 0) {
      gfx.fillStyle(0x555e6b, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      return;
    }
    if (level <= 2) {
      gfx.fillStyle(0x6b4c2a, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0x8a6040, 1);
      for (let px = 10; px < width; px += 28) {
        gfx.fillCircle(px, gy + 8, 2);
        gfx.fillCircle(px + 14, gy + 16, 2);
      }
      return;
    }
    if (level <= 4) {
      gfx.fillStyle(0x555555, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0x6e6e6e, 1);
      for (let px = 5; px < width; px += 18) {
        gfx.fillRect(px, gy + 5, 3, 2);
        gfx.fillRect(px + 9, gy + 14, 3, 2);
      }
      return;
    }
    if (level <= 6) {
      const midY = gy + ROAD_H / 2;
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0xffffff, 1);
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, midY - 1, 20, 2);
      return;
    }
    if (level <= 8) {
      const midY = gy + ROAD_H / 2;
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(0, gy + 2, width, 2);
      gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, midY - 1, 20, 2);
      return;
    }
    // Level 9–10: Highway
    gfx.fillStyle(0x222222, 1);
    gfx.fillRect(0, gy, width, ROAD_H);
    gfx.fillStyle(0xffd700, 1);
    gfx.fillRect(0, gy + 2, width, 2);
    gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
    gfx.fillStyle(0xffffff, 1);
    for (const frac of [0.25, 0.5, 0.75]) {
      const dy = Math.round(gy + ROAD_H * frac) - 1;
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, dy, 20, 2);
    }
  }
}
