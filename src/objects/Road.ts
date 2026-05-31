import Phaser from 'phaser';
import { ROAD_H, ROAD_DIVIDER_H } from '../constants';

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
      // Earthy brown base with scattered clods and pebbles — no ruts
      gfx.fillStyle(0x6b4c2a, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      const dc = [0x9a7050, 0xb48860, 0x7a5530, 0xc89060, 0x4a3018, 0x8a6040];
      for (let row = 0; row < 9; row++) {
        const py = gy + 4 + row * 8;
        for (let px = (row & 1) * 10; px < width; px += 20) {
          const h = ((px * 73) ^ (row * 137)) % 32;
          gfx.fillStyle(dc[h % dc.length], 1);
          const size = 1 + (h >> 1) % 2;
          if (h & 1) gfx.fillCircle(px, py, size);
          else gfx.fillRect(px - 1, py, size + 1, size);
        }
      }
      return;
    }
    if (level <= 4) {
      // Warm grey base
      gfx.fillStyle(0x7c7260, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      // Tyre-compacted tracks
      gfx.fillStyle(0x585048, 1);
      gfx.fillRect(0, gy + 20, width, 14);
      gfx.fillRect(0, gy + 54, width, 14);
      // Angular crushed-stone chips
      const gc = [0xa89880, 0xc4b8a8, 0x666058, 0xd8ccbc, 0x484440, 0x908070];
      for (let row = 0; row < 9; row++) {
        const py = gy + 4 + row * 8;
        for (let px = (row & 1) * 6; px < width; px += 12) {
          const h = ((px * 41) ^ (row * 97)) % 48;
          gfx.fillStyle(gc[h % gc.length], 1);
          if (h % 5 === 0) gfx.fillCircle(px, py, 2);
          else gfx.fillRect(px - (1 + h % 2), py, 2 + h % 3, 1 + (h >> 2) % 2);
        }
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
    if (level === 7) {
      const midY = gy + ROAD_H / 2;
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(0, gy + 2, width, 2);
      gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, midY - 1, 20, 2);
      return;
    }
    if (level <= 9) {
      // Level 8–9: two lanes with solid grey centre divider
      const midY = gy + ROAD_H / 2;
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(0, gy + 2, width, 2);
      gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
      gfx.fillStyle(0x888888, 1);
      gfx.fillRect(0, midY - ROAD_DIVIDER_H / 2, width, ROAD_DIVIDER_H);
      return;
    }
    // Level 10: highway — 2 lanes each direction, grey centre divider
    const midY = gy + ROAD_H / 2;
    gfx.fillStyle(0x222222, 1);
    gfx.fillRect(0, gy, width, ROAD_H);
    gfx.fillStyle(0xffd700, 1);
    gfx.fillRect(0, gy + 2, width, 2);
    gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
    // Lane dividers at 25% and 75% (50% is replaced by the grey divider)
    gfx.fillStyle(0xffffff, 1);
    for (const frac of [0.25, 0.75]) {
      const dy = Math.round(gy + ROAD_H * frac) - 1;
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, dy, 20, 2);
    }
    gfx.fillStyle(0x888888, 1);
    gfx.fillRect(0, midY - ROAD_DIVIDER_H / 2, width, ROAD_DIVIDER_H);
  }
}
