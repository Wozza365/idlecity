import Phaser from 'phaser';
import { buildingHeight } from '../constants';

export class LargeApartment extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w   = plotWidth;
    const h   = buildingHeight(level);
    const top = groundY - h;

    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0xb4a888);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();

    // Roof details
    gfx.fillStyle(0x706050, 1);
    gfx.fillRect(x, top, w, 10);
    gfx.fillStyle(0xd08840, 1);
    gfx.fillRect(x, top + 10, w, 3);

    // Balcony rails every other floor
    const floorH = 20;
    const numFloors = Math.floor((h - 16) / floorH);
    gfx.fillStyle(0x907060, 0.7);
    for (let f = 0; f < numFloors; f++) {
      if (f % 2 !== 0) continue;
      const fy = top + 14 + f * floorH + floorH - 3;
      if (fy > groundY - 4) continue;
      gfx.fillRect(x + 4, fy, w - 8, 2);
    }

    // Windows — 3 cols
    const cols  = 3;
    const winW  = Math.round(w * 0.16);
    const winH  = Math.round(floorH * 0.55);
    const hPad  = Math.round(w / (cols + 1));
    gfx.fillStyle(0xbbddee, 1);
    for (let f = 0; f < numFloors; f++) {
      const wy = top + 14 + f * floorH + Math.round((floorH - winH) / 2);
      if (wy + winH > groundY - 6) continue;
      for (let col = 0; col < cols; col++) {
        gfx.fillRect(Math.round(x + hPad * (col + 1) - winW / 2), Math.round(wy), winW, winH);
      }
    }

    this.add(gfx);
  }
}
