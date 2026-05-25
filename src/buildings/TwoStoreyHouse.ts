import Phaser from 'phaser';
import { buildingHeight } from '../constants';

export class TwoStoreyHouse extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w   = plotWidth;
    const h   = buildingHeight(level);
    const top = groundY - h;

    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0xb8926a);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();

    // Roof
    gfx.fillStyle(0x5a3a28, 1);
    gfx.fillTriangle(x, top + 16, x + w / 2, top, x + w, top + 16);
    gfx.fillRect(x, top + 14, w, 4);

    // Floor divider
    gfx.fillStyle(0xa07850, 1);
    gfx.fillRect(x, top + Math.round(h / 2), w, 3);

    // Windows — 2 per floor, 2 floors
    const winW = Math.round(w * 0.22);
    const winH = Math.round(winW * 1.1);
    const gap  = Math.round(w * 0.28);
    const floorH = Math.round(h / 2);
    gfx.fillStyle(0x88c4e8, 1);
    for (let floor = 0; floor < 2; floor++) {
      const wy = top + 20 + floor * floorH;
      if (wy + winH > groundY - 6) continue;
      gfx.fillRect(Math.round(x + gap * 0.6), Math.round(wy), winW, winH);
      gfx.fillRect(Math.round(x + w - gap * 0.6 - winW), Math.round(wy), winW, winH);
    }

    this.add(gfx);
  }
}
