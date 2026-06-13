// Shared tiny pixel-art canvas + color helpers used by the asset generator
// scripts under scripts/generate-*.cjs.
'use strict';

const { PNG } = require('pngjs');

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function rgbOf(hex) { return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]; }
function toHex(r, g, b) { return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b); }
function lighten(hex, t) {
  const [r, g, b] = rgbOf(hex);
  return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
function darken(hex, t) {
  const [r, g, b] = rgbOf(hex);
  return toHex(r * (1 - t), g * (1 - t), b * (1 - t));
}

class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x, y, hex, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b] = rgbOf(hex);
    if (a >= 255) {
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
      return;
    }
    if (a <= 0) return;
    const t = a / 255, it = 1 - t;
    this.data[i]     = clamp(r * t + this.data[i] * it);
    this.data[i + 1] = clamp(g * t + this.data[i + 1] * it);
    this.data[i + 2] = clamp(b * t + this.data[i + 2] * it);
    this.data[i + 3] = Math.max(this.data[i + 3], a);
  }
  rect(x0, y0, rw, rh, hex, a = 255) {
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) this.set(x, y, hex, a);
  }
  circle(cx, cy, r, hex, a = 255) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + 0.2) this.set(cx + x, cy + y, hex, a);
    }
  }
  line(x0, y0, x1, y1, hex, a = 255) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      this.set(x0 + dx * t, y0 + dy * t, hex, a);
    }
  }
  triRight(x0, x1, cy, halfH, hex, a = 255) {
    const span = Math.max(1, x1 - x0);
    for (let i = 0; i <= span; i++) {
      const half = Math.round(halfH * (1 - i / span));
      for (let yy = -half; yy <= half; yy++) {
        let col = hex;
        if (yy === -half && half === halfH) col = lighten(hex, 0.22);
        else if (yy === half && half === halfH) col = darken(hex, 0.5);
        this.set(x0 + i, cy + yy, col, a);
      }
    }
  }
  triangle(x1, y1, x2, y2, x3, y3, hex, a = 255) {
    const minX = Math.floor(Math.min(x1, x2, x3)), maxX = Math.ceil(Math.max(x1, x2, x3));
    const minY = Math.floor(Math.min(y1, y2, y3)), maxY = Math.ceil(Math.max(y1, y2, y3));
    const sign = (px, py, ax, ay, bx, by) => (px - bx) * (ay - by) - (ax - bx) * (py - by);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d1 = sign(x, y, x1, y1, x2, y2);
        const d2 = sign(x, y, x2, y2, x3, y3);
        const d3 = sign(x, y, x3, y3, x1, y1);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) this.set(x, y, hex, a);
      }
    }
  }
  toBuffer() {
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data);
    return PNG.sync.write(png);
  }
}

module.exports = { Canvas, clamp, rgbOf, toHex, lighten, darken };
