import Phaser from 'phaser';
import { buildingHeight } from '../constants';

export class Townhouse extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w   = plotWidth;
    const h   = buildingHeight(level);
    const top = groundY - h;

    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0x9a8870);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();

    // Parapet
    gfx.fillStyle(0x7a6850, 1);
    gfx.fillRect(x, top, w, 6);

    // Floor dividers — 3 floors
    const floors = 3;
    const floorH = Math.round(h / floors);
    gfx.fillStyle(0x6a5840, 0.6);
    for (let i = 1; i < floors; i++) {
      gfx.fillRect(x, top + i * floorH, w, 2);
    }

    // Windows — 1 wide per floor
    const winW = Math.round(w * 0.32);
    const winH = Math.round(floorH * 0.45);
    gfx.fillStyle(0x99bbd4, 1);
    for (let f = 0; f < floors; f++) {
      const wy = top + 8 + f * floorH + Math.round((floorH - winH) / 2);
      if (wy + winH > groundY - 6) continue;
      gfx.fillRect(Math.round(x + (w - winW) / 2), Math.round(wy), winW, winH);
    }

    // Door
    const doorW = Math.round(w * 0.2);
    const doorH = Math.round(floorH * 0.5);
    gfx.fillStyle(0x4a3020, 1);
    gfx.fillRect(Math.round(x + (w - doorW) / 2), groundY - doorH, doorW, doorH);

    this.add(gfx);
  }
}
