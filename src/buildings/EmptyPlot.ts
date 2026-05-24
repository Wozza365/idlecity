import Phaser from 'phaser';
import { YARD_H } from '../constants';

export class EmptyPlot extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number) {
    super(scene, 0, 0);

    const gfx     = scene.add.graphics();
    gfx.setLighting(true);
    const gy      = groundY;
    const w       = plotWidth;
    const dirtTop = gy - YARD_H;

    // ── Dirt plot ─────────────────────────────────────────────────────────────
    gfx.fillStyle(0x7a5228, 1);
    gfx.fillRect(x, dirtTop, w, YARD_H);
    gfx.fillStyle(0x5c3c18, 1);
    gfx.fillRect(x, dirtTop, w, 2);
    gfx.fillStyle(0x5c3c18, 1);
    for (let i = 0; i < 5; i++) {
      const px = x + Math.round(((i + 0.5) / 5) * w);
      gfx.fillRect(px - 2, dirtTop + 5, 5, 2);
      gfx.fillRect(px + 4, dirtTop + 13, 4, 2);
    }

    // ── Wooden post ───────────────────────────────────────────────────────────
    const cx      = x + Math.round(w * 0.5);
    const postTop = dirtTop - 24;
    gfx.fillStyle(0xb08040, 1);
    gfx.fillRect(cx - 1, postTop, 3, 24 + 10);
    gfx.fillStyle(0x806028, 1);
    gfx.fillRect(cx + 1, postTop, 1, 24 + 10);

    // ── Sign board ────────────────────────────────────────────────────────────
    const bW = 48, bH = 26;
    const bX = cx - Math.round(bW / 2);
    const bY = postTop - bH + 4;

    gfx.fillStyle(0x909090, 1);
    gfx.fillRect(bX - 1, bY - 1, bW + 2, bH + 2);
    gfx.fillStyle(0xcc2020, 1);
    gfx.fillRect(bX, bY, bW, 9);
    gfx.fillStyle(0xf8f4ee, 1);
    gfx.fillRect(bX, bY + 9, bW, bH - 9);

    gfx.fillStyle(0xffcccc, 1);
    for (const ox of [3, 11, 20, 30, 39]) {
      gfx.fillRect(bX + ox, bY + 3, 5, 3);
    }

    gfx.fillStyle(0xcc2020, 1);
    gfx.fillRect(bX + 3,  bY + 13, 8, 2);
    gfx.fillRect(bX + 14, bY + 13, 6, 2);
    gfx.fillRect(bX + 23, bY + 13, 8, 2);
    gfx.fillRect(bX + 34, bY + 13, 8, 2);
    gfx.fillStyle(0xaaaaaa, 1);
    gfx.fillRect(bX + 3,  bY + 19, 11, 1);
    gfx.fillRect(bX + 17, bY + 19, 9,  1);
    gfx.fillRect(bX + 29, bY + 19, 12, 1);

    this.add(gfx);
  }
}
