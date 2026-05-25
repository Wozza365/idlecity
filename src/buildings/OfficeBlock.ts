import Phaser from 'phaser';
import { buildingHeight } from '../constants';

export class OfficeBlock extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w   = plotWidth;
    const h   = buildingHeight(level);
    const top = groundY - h;

    // Dark glass curtain-wall body
    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0x2a3a4a);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();

    // Structural frame verticals
    gfx.fillStyle(0x445566, 1);
    gfx.fillRect(x,                    top, 4, h);
    gfx.fillRect(x + Math.round(w / 2) - 2, top, 4, h);
    gfx.fillRect(x + w - 4,            top, 4, h);

    // Floor bands and curtain glazing
    const floorH    = 14;
    const numFloors = Math.floor(h / floorH);
    const winW      = Math.round(w * 0.18);
    const winH      = Math.round(floorH * 0.65);
    const cols      = 4;
    const hPad      = Math.round(w / (cols + 1));

    for (let f = 0; f < numFloors; f++) {
      const fy = top + f * floorH;
      if (fy > groundY - 4) continue;
      // Horizontal spandrel
      gfx.fillStyle(0x3a4a5a, 1);
      gfx.fillRect(x, fy, w, 2);
      // Glazing
      const wy = fy + Math.round((floorH - winH) / 2);
      if (wy + winH > groundY - 4) continue;
      gfx.fillStyle(0x6699bb, f % 4 === 0 ? 0.5 : 0.2);
      for (let c = 0; c < cols; c++) {
        gfx.fillRect(Math.round(x + hPad * (c + 1) - winW / 2), Math.round(wy), winW, winH);
      }
    }

    // Rooftop plant room
    const plantW = Math.round(w * 0.4);
    const plantH = 10;
    gfx.fillStyle(0x344454, 1);
    gfx.fillRect(Math.round(x + (w - plantW) / 2), top - plantH, plantW, plantH);

    this.add(gfx);
  }
}
