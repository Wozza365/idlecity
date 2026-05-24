import Phaser from 'phaser';
import { buildingHeight } from '../constants';

export class Tier4Skyscraper extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w   = plotWidth;
    const h   = buildingHeight(level);
    const top = groundY - h;

    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0x1a2a3a);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (body as any).setLighting(true);
    this.add(body);

    const gfx      = scene.add.graphics();
    const antennaW = 4;
    const antennaH = 24;
    gfx.fillStyle(0x8899aa, 1);
    gfx.fillRect(x + Math.round((w - antennaW) / 2), top - antennaH, antennaW, antennaH);

    const floorH    = 16;
    const numFloors = Math.floor(h / floorH);
    const cols      = 5;
    const winW      = Math.round(w * 0.1);
    const winH      = Math.round(floorH * 0.6);
    const hGap      = Math.round(w / (cols + 1));
    for (let f = 0; f < numFloors; f++) {
      const wy          = top + f * floorH + Math.round((floorH - winH) / 2);
      if (wy + winH > groundY - 4) continue;
      const isAccentRow = f % 3 === 0;
      gfx.fillStyle(0x88ccff, isAccentRow ? 0.55 : 0.25);
      for (let c = 0; c < cols; c++) {
        const wx = x + hGap * (c + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }
    gfx.fillStyle(0x446688, 1);
    gfx.fillRect(x, top, w, 4);
    this.add(gfx);
  }
}
