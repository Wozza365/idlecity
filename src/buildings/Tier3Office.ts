import Phaser from 'phaser';
import { buildingHeight } from '../constants';

export class Tier3Office extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w   = plotWidth;
    const h   = buildingHeight(level);
    const top = groundY - h;

    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0x5a7a8a);
    (body as any).setLighting(true);
    this.add(body);

    const gfx      = scene.add.graphics();
    const floorH   = 22;
    const numFloors = Math.floor(h / floorH);
    gfx.lineStyle(1, 0x3d5a66, 1);
    for (let f = 1; f < numFloors; f++) {
      const ly = top + f * floorH;
      gfx.moveTo(x, ly).lineTo(x + w, ly).strokePath();
    }

    const cols = 4;
    const winW = Math.round(w * 0.12);
    const winH = Math.round(floorH * 0.55);
    const hGap = Math.round(w / (cols + 1));
    gfx.fillStyle(0xaad4e8, 0.85);
    for (let f = 0; f < numFloors; f++) {
      const wy = top + f * floorH + Math.round((floorH - winH) / 2);
      if (wy + winH > groundY - 4) continue;
      for (let c = 0; c < cols; c++) {
        const wx = x + hGap * (c + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }
    this.add(gfx);
  }
}
