import Phaser from 'phaser';
import { ROAD_H, ROAD_DIVIDER_H } from '../constants';
import type { RoadPalette } from '../theme/ThemeTypes';

export class Road {
  private gfx:        Phaser.GameObjects.Graphics;
  private weatherGfx: Phaser.GameObjects.Graphics;
  private _level  = 0;
  private _width  = 0;
  private _groundY = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx        = scene.add.graphics().setDepth(7).setLighting(true);
    this.weatherGfx = scene.add.graphics().setDepth(7.05);
  }

  /** Draw wet-road effects driven by weatherIntensity (0–1). */
  updateWeather(intensity: number): void {
    const gfx = this.weatherGfx;
    gfx.clear();
    if (intensity <= 0 || this._level === 0) return;

    // Glossy wet sheen over the road surface
    gfx.fillStyle(0xaaccee, 0.045 * intensity);
    gfx.fillRect(0, this._groundY, this._width, ROAD_H);
  }

  render(level: number, width: number, groundY: number, palette: RoadPalette): void {
    this._level   = level;
    this._width   = width;
    this._groundY = groundY;
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
      gfx.fillStyle(palette.dirtBase, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      const dc = palette.dirtSpecks;
      for (let row = 0; row < 10; row++) {
        const baseY = gy + 4 + row * 7;
        let px = Math.imul(row, 127) % 23;
        while (px < width) {
          const h = (Math.imul(px, 374761393) ^ Math.imul(row, 668265261)) >>> 0;
          const a = h & 0xff;
          const b = (h >> 8) & 0xff;
          gfx.fillStyle(dc[a % dc.length], 1);
          const size = 1 + a % 3;
          if (b & 1) gfx.fillCircle(px, baseY + (b % 5) - 2, size);
          else gfx.fillRect(px - 1, baseY + (b % 5) - 2, size + 1, size);
          px += 14 + (b >> 2) % 16;
        }
      }
      return;
    }
    if (level <= 4) {
      // Warm grey base
      gfx.fillStyle(palette.cobbleBase, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      // Tyre-compacted tracks
      gfx.fillStyle(palette.cobbleTracks, 1);
      gfx.fillRect(0, gy + 12, width, 14);
      gfx.fillRect(0, gy + 46, width, 14);
      // Angular crushed-stone chips
      const gc = palette.cobbleChips;
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
      gfx.fillStyle(palette.asphalt, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(palette.asphaltLines, 1);
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, midY - 1, 20, 2);
      return;
    }
    if (level === 7) {
      const midY = gy + ROAD_H / 2;
      gfx.fillStyle(palette.asphalt, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(palette.asphaltLines, 1);
      gfx.fillRect(0, gy + 2, width, 2);
      gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, midY - 1, 20, 2);
      return;
    }
    if (level <= 9) {
      // Level 8–9: two lanes with solid grey centre divider
      const midY = gy + ROAD_H / 2;
      gfx.fillStyle(palette.asphalt, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(palette.asphaltLines, 1);
      gfx.fillRect(0, gy + 2, width, 2);
      gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
      gfx.fillStyle(palette.divider, 1);
      gfx.fillRect(0, midY - ROAD_DIVIDER_H / 2, width, ROAD_DIVIDER_H);
      return;
    }
    // Level 10: highway — 2 lanes each direction, grey centre divider
    const midY = gy + ROAD_H / 2;
    gfx.fillStyle(palette.highway, 1);
    gfx.fillRect(0, gy, width, ROAD_H);
    gfx.fillStyle(palette.highwayLines, 1);
    gfx.fillRect(0, gy + 2, width, 2);
    gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
    // Lane dividers at 25% and 75% (50% is replaced by the grey divider)
    gfx.fillStyle(palette.asphaltLines, 1);
    for (const frac of [0.25, 0.75]) {
      const dy = Math.round(gy + ROAD_H * frac) - 1;
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, dy, 20, 2);
    }
    gfx.fillStyle(palette.divider, 1);
    gfx.fillRect(0, midY - ROAD_DIVIDER_H / 2, width, ROAD_DIVIDER_H);
  }
}
