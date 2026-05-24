import Phaser from 'phaser';
import { buildingHeight } from '../constants';

export class Tier2Apartment extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w   = plotWidth;
    const h   = buildingHeight(level);
    const top = groundY - h;

    const body = scene.add.rectangle(x + w / 2, top + h / 2, w, h, 0xd4a96a);
    body.setPipeline('Light2D');
    this.add(body);

    const gfx      = scene.add.graphics();
    const parapetH = 10;
    gfx.fillStyle(0xbf8c50, 1);
    gfx.fillRect(x, top, w, parapetH);

    const winW     = Math.round(w * 0.18);
    const winH     = Math.round(winW * 1.5);
    const cols     = 3;
    const hPad     = Math.round(w / (cols + 1));
    const vSpacing = Math.round(h / 4);
    const rows     = Math.max(2, Math.floor((h - parapetH - 20) / vSpacing));

    gfx.fillStyle(0x88aacc, 1);
    for (let row = 0; row < rows; row++) {
      const wy = top + parapetH + 16 + row * vSpacing;
      if (wy + winH > groundY - 8) continue;
      for (let col = 0; col < cols; col++) {
        const wx = x + hPad * (col + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }
    this.add(gfx);
  }
}
