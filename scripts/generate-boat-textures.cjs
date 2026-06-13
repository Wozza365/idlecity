// Generates small pixel-art boat textures (assets/boats/*.png) to replace the
// procedurally-drawn (Graphics-primitive) boats in src/objects/Boat.ts.
//
// Run: node scripts/generate-boat-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'boats');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Color helpers ────────────────────────────────────────────────────────
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

// ── Tiny canvas ──────────────────────────────────────────────────────────
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

// ── Shared hull/deck rendering ──────────────────────────────────────────
function drawHull(cv, y0, w, h, rectW, hull) {
  const hi  = lighten(hull, 0.22);
  const lo  = darken(hull, 0.5);
  const mid = lighten(hull, 0.07);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rectW; x++) {
      let col = hull;
      if (y === 0) col = hi;
      else if (y === h - 1) col = lo;
      else if ((x * 13 + y * 7) % 5 === 0) col = mid;
      cv.set(x, y0 + y, col);
    }
  }
  // bow taper
  const cy = y0 + Math.floor((h - 1) / 2);
  cv.triRight(rectW, w - 1, cy, Math.floor(h / 2), hull);
}

function drawDeck(cv, y0, rectW, h, hull, opts = {}) {
  const deckColor = opts.color ?? lighten(hull, 0.35);
  const alpha = opts.alpha ?? 170;
  for (let y = y0 + 1; y < y0 + h - 1; y++) {
    for (let x = 2; x < rectW - 1; x++) cv.set(x, y, deckColor, alpha);
  }
}

function drawNavLights(cv, y0, h, rectW, w) {
  const sy = y0 + Math.floor(rectW / 2);
  cv.set(sy, y0, 0xff3333, 150);
  cv.set(sy, y0 + h - 1, 0x33ff55, 150);
  if (w >= 36) cv.set(0, y0 + Math.floor((h - 1) / 2), 0xffffff, 160);
}

// ── Boat definitions (mirrors src/objects/BoatAssets.ts) ──────────────────
const BOATS = [
  { key: 'rowboat',        w: 20, h:  7, bowW: 3, hull: 0x8B5E3C, accent: 0xA0724E },
  { key: 'motorboat',      w: 36, h: 10, bowW: 5, hull: 0xEEEEDD, accent: 0x4488CC },
  { key: 'fishing_boat',   w: 30, h: 11, bowW: 4, hull: 0x3A5C7A, accent: 0xCC3333, extraTop: 4 },
  { key: 'sailboat',       w: 28, h:  9, bowW: 4, hull: 0xF5F5E8, accent: 0xCC8844, extraTop: 18 },
  { key: 'kayak',          w: 22, h:  5, bowW: 3, hull: 0xFF7744, accent: 0xFFAA22 },
  { key: 'speedboat',      w: 38, h:  8, bowW: 6, hull: 0xCC2222, accent: 0xFFFFFF },
  { key: 'tugboat',        w: 40, h: 14, bowW: 5, hull: 0x222233, accent: 0xFF4400, extraTop: 10 },
  { key: 'yacht',          w: 54, h: 13, bowW: 7, hull: 0xF8F8F2, accent: 0x888899, extraTop: 22 },
  { key: 'pedalo',         w: 22, h: 10, bowW: 3, hull: 0xFFDD22, accent: 0xFF9900 },
  { key: 'houseboat',      w: 60, h: 18, bowW: 4, hull: 0x9B7A4A, accent: 0xC89A60 },
  { key: 'ferry',          w: 68, h: 16, bowW: 6, hull: 0xE2E2E2, accent: 0x3366AA },
  { key: 'container_ship', w: 88, h: 20, bowW: 5, hull: 0x182838, accent: 0x3A88AA },
];

// ── Type-specific details ──────────────────────────────────────────────
const DETAILS = {
  rowboat(cv, c) {
    const { y0, h, rectW, hull } = c;
    for (let y = y0 + 2; y < y0 + h - 1; y += 2) {
      for (let x = 2; x < rectW - 1; x++) cv.set(x, y, darken(hull, 0.18), 110);
    }
    const sx = Math.floor(rectW * 0.55);
    for (let y = y0 + 1; y < y0 + h - 1; y++) cv.set(sx, y, lighten(hull, 0.3), 220);
    cv.set(Math.floor(rectW * 0.22), y0, 0x5A3A1A);
    cv.set(Math.floor(rectW * 0.78), y0, 0x5A3A1A);
  },

  motorboat(cv, c) {
    const { y0, h, rectW, accent } = c;
    const sy = y0 + Math.floor(h / 2);
    for (let x = 2; x < rectW - 1; x++) { cv.set(x, sy, accent); cv.set(x, sy + 1, accent); }
    for (let y = y0 + 1; y < y0 + 3; y++) for (let x = rectW - 8; x < rectW - 1; x++) cv.set(x, y, 0x88CCFF, 170);
    for (let y = y0; y < y0 + h; y++) for (let x = 0; x < 3; x++) cv.set(x, y, 0x555555);
  },

  fishing_boat(cv, c) {
    const { y0, h, rectW, accent, extraTop } = c;
    const cx0 = Math.floor(rectW * 0.25), cw = Math.floor(rectW * 0.4);
    cv.rect(cx0, y0 + 1, cw, h - 3, accent, 230);
    for (let x = cx0 + 1; x < cx0 + cw - 1; x += 3) cv.set(x, y0 + 2, 0x222222, 160);
    // antenna poking above the cabin
    cv.line(cx0 + Math.floor(cw / 2), y0, cx0 + Math.floor(cw / 2), y0 - extraTop + 1, 0x333333);
    // coiled rope on stern
    cv.circle(3, y0 + h - 3, 1, 0x886644, 200);
  },

  sailboat(cv, c) {
    const { y0, h, rectW, accent, extraTop } = c;
    const mastX = rectW - 6;
    const topY = y0 - extraTop + 1;
    cv.line(mastX, topY, mastX, y0 + h - 2, 0x8B6914);
    cv.triangle(mastX, topY, mastX, y0 + Math.floor(h / 2), rectW - 2, topY + 2, 0xFFFFF0, 230);
    for (let x = 1; x < rectW - 1; x++) cv.set(x, y0 + h - 2, accent, 220);
  },

  kayak(cv, c) {
    const { y0, h, rectW, accent } = c;
    for (let x = 1; x < rectW - 1; x++) cv.set(x, y0 + Math.floor((h - 1) / 2), accent, 200);
    cv.circle(Math.floor(rectW / 2), y0 + Math.floor((h - 1) / 2), 1, 0x222222, 220);
  },

  speedboat(cv, c) {
    const { y0, h, rectW, accent } = c;
    for (let x = 2; x < rectW - 1; x++) { cv.set(x, y0, accent, 230); cv.set(x, y0 + h - 1, accent, 230); }
    for (let y = y0 + 1; y < y0 + 3; y++) for (let x = rectW - 9; x < rectW - 2; x++) cv.set(x, y, 0x88CCFF, 170);
  },

  tugboat(cv, c) {
    const { y0, h, rectW, accent, extraTop } = c;
    const cx0 = Math.floor(rectW * 0.18), cw = Math.floor(rectW * 0.45);
    cv.rect(cx0, y0 + 1, cw, h - 2, accent, 235);
    for (let wy = y0 + 2; wy < y0 + h - 3; wy += 3) {
      for (let wx = cx0 + 2; wx < cx0 + cw - 2; wx += 4) cv.set(wx, wy, 0xCCEEFF, 255);
    }
    // funnel
    const fx = cx0 + Math.floor(cw / 2);
    cv.rect(fx - 1, y0 - extraTop + 2, 3, extraTop - 1, 0x333333);
    cv.rect(fx - 1, y0 - extraTop + 2, 3, 2, accent);
  },

  yacht(cv, c) {
    const { y0, h, rectW, extraTop } = c;
    cv.rect(Math.floor(rectW * 0.15), y0 + 1, Math.floor(rectW * 0.45), h - 4, 0xF0F0EE, 235);
    const mastX = rectW - 9;
    const topY = y0 - extraTop + 1;
    cv.line(mastX, topY, mastX, y0 + h - 2, 0xAA9966);
    cv.triangle(mastX, topY, mastX, y0 + Math.floor(h / 2), rectW - 2, topY + 2, 0xFFFFF8, 230);
  },

  pedalo(cv, c) {
    const { y0, h, rectW, accent } = c;
    cv.circle(3, y0, 2, accent, 230);
    cv.circle(3, y0 + h - 1, 2, accent, 230);
    cv.circle(3, y0, 1, 0xDD8800, 230);
    cv.circle(3, y0 + h - 1, 1, 0xDD8800, 230);
    for (let x = 4; x < rectW - 2; x++) cv.set(x, y0, accent, 180);
  },

  houseboat(cv, c) {
    const { y0, h, rectW, accent } = c;
    const hx0 = 4, hw = rectW - 9;
    cv.rect(hx0, y0 + 1, hw, h - 3, accent, 240);
    for (let x = hx0; x < hx0 + hw; x++) cv.set(x, y0 + 1, darken(accent, 0.3), 240);
    for (let wx = hx0 + 2; wx < hx0 + hw - 2; wx += 6) cv.rect(wx, y0 + 3, 3, h - 7, 0xFFEE99, 200);
  },

  ferry(cv, c) {
    const { y0, h, rectW, accent } = c;
    cv.rect(2, y0 + 1, rectW - 4, 4, accent, 220);
    for (let wx = 4; wx < rectW - 4; wx += 5) cv.rect(wx, y0 + 2, 3, 2, 0x88BBDD, 210);
    for (let wx = 4; wx < rectW - 4; wx += 5) cv.rect(wx, y0 + h - 4, 3, 2, 0xFFEECC, 200);
  },

  container_ship(cv, c) {
    const { y0, h, rectW } = c;
    const colors = [0xFF4444, 0x44AA44, 0x4444FF, 0xFFAA22, 0xFF44AA, 0x44FFAA];
    const cw = 9, gap = 1, rowH = Math.floor((h - 4) / 2);
    let ci = 0;
    for (let cx = 3; cx + cw < rectW - 13; cx += cw + gap) {
      cv.rect(cx, y0 + 2, cw, rowH, colors[ci % colors.length], 235);
      cv.rect(cx, y0 + 2 + rowH + 1, cw, rowH, colors[(ci + 3) % colors.length], 235);
      ci++;
    }
    cv.rect(rectW - 13, y0 + 1, 11, h - 2, 0xCCCCCC, 235);
  },
};

// ── Generate ────────────────────────────────────────────────────────────
for (const def of BOATS) {
  const extraTop = def.extraTop ?? 0;
  const texH = def.h + extraTop;
  const cv = new Canvas(def.w, texH);
  const y0 = extraTop;
  const rectW = def.w - def.bowW;

  drawHull(cv, y0, def.w, def.h, rectW, def.hull);
  drawDeck(cv, y0, rectW, def.h, def.hull);
  DETAILS[def.key](cv, { ...def, y0, rectW });
  drawNavLights(cv, y0, def.h, rectW, def.w);

  const outPath = path.join(OUT_DIR, `${def.key}.png`);
  fs.writeFileSync(outPath, cv.toBuffer());
  console.log(`  wrote ${def.key}.png  ${def.w}x${texH}`);
}
console.log(`Done. ${BOATS.length} boat textures written to ${OUT_DIR}`);
