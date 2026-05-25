import Phaser from 'phaser';
import { buildingHeight } from '../constants';

export class SmallApartment extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w   = plotWidth;
    const h   = buildingHeight(level);
    const top = groundY - h;

    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0xc8b898);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();

    // Parapet with accent band
    gfx.fillStyle(0x8a7860, 1);
    gfx.fillRect(x, top, w, 8);
    gfx.fillStyle(0xc07840, 1);
    gfx.fillRect(x, top + 8, w, 3);

    // Grid windows — 2 cols, multiple rows
    const cols    = 2;
    const winW    = Math.round(w * 0.22);
    const winH    = Math.round(winW * 1.2);
    const floorH  = Math.round(winH * 1.8);
    const hPad    = Math.round(w / (cols + 1));
    const rows    = Math.max(2, Math.floor((h - 18) / floorH));

    gfx.fillStyle(0xaaccdd, 1);
    for (let row = 0; row < rows; row++) {
      const wy = top + 18 + row * floorH;
      if (wy + winH > groundY - 6) continue;
      for (let col = 0; col < cols; col++) {
        gfx.fillRect(Math.round(x + hPad * (col + 1) - winW / 2), Math.round(wy), winW, winH);
      }
    }

    // Entrance canopy
    gfx.fillStyle(0x8a7860, 1);
    gfx.fillRect(Math.round(x + w * 0.2), groundY - 14, Math.round(w * 0.6), 4);

    this.add(gfx);
  }
}
