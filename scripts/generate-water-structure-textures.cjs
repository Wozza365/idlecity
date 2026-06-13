// Generates pixel-art textures (assets/water-structures/*.png) to replace the
// procedurally-drawn (Graphics fillRect) pier, beach café and lifeguard hut
// in src/objects/WaterArea.ts.
//
// Drawn in full baked colours (single-theme project — pierWood mirrors
// src/theme/themes/ClassicTheme.ts), with subtle lighten/darken edge
// highlights added for a more finished pixel-art look. Each texture's
// origin is documented relative to the structure's logical anchor point
// in the original Graphics code (px/cx/hx, wy) so WaterArea.ts can position
// the replacement Image with the same anchor.
//
// Run: node scripts/generate-water-structure-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas, lighten, darken } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'water-structures');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Pier (26x35, origin 0.5, -37/35) ────────────────────────────────────
// Mirrors WaterArea.drawPier: deck top at (wy + BEACH_SHORE_H - 10), i.e.
// texture-y 1 == game-y (wy + 38). Anchor (px, wy) -> texture (13, -37).
function drawPier() {
  const W = 26, H = 35;
  const cv = new Canvas(W, H);
  const PIER_WOOD = 0xB8884E;
  const RAIL      = 0x8A6030;
  const POST      = 0x9A7040;
  const MOORING   = 0x6A4818;

  // Deck
  cv.rect(4, 1, 18, 30, PIER_WOOD);
  cv.rect(4, 1, 18, 1, lighten(PIER_WOOD, 0.2));

  // Plank lines
  for (const y of [7, 13, 19, 25, 31]) cv.rect(4, y, 18, 1, 0x000000, 33);

  // Side railings
  cv.rect(2,  1, 3, 30, RAIL);
  cv.rect(21, 1, 3, 30, RAIL);
  cv.rect(2,  1, 1, 30, lighten(RAIL, 0.2), 160);
  cv.rect(23, 1, 1, 30, lighten(RAIL, 0.2), 160);

  // Railing posts
  for (const y0 of [0, 8, 15, 23, 30]) {
    cv.rect(2,  y0, 3, 2, POST);
    cv.rect(21, y0, 3, 2, POST);
  }

  // End platform + mooring posts
  cv.rect(0, 26, 26, 8, PIER_WOOD);
  cv.rect(0, 26, 26, 1, lighten(PIER_WOOD, 0.2));
  cv.rect(1,  29, 3, 6, MOORING);
  cv.rect(23, 29, 3, 6, MOORING);
  cv.rect(1,  29, 1, 6, lighten(MOORING, 0.2), 160);
  cv.rect(23, 29, 1, 6, lighten(MOORING, 0.2), 160);

  return cv;
}

// ── Beach café (80x31, origin 2/80, 3/31) ───────────────────────────────
// Mirrors WaterArea.drawBeachCafe: cafeY = wy + 2, roof starts at
// (cx - 2, cafeY - 5). Anchor (cx, wy) -> texture (2, 3).
function drawCafe() {
  const W = 80, H = 31;
  const cv = new Canvas(W, H);
  const cafeW = 60, cafeH = 26;
  const X = (dx) => dx + 2;
  const Y = (dy) => dy + 5;

  const ROOF = 0xB06030;
  const WALL = 0xF5E6CC;

  // Body
  cv.rect(X(0), Y(0), cafeW, cafeH, WALL);
  cv.rect(X(0), Y(cafeH - 1), cafeW, 1, darken(WALL, 0.12));

  // Roof
  cv.rect(X(-2), Y(-5), cafeW + 4, 7, ROOF);
  cv.rect(X(-2), Y(-5), cafeW + 4, 1, lighten(ROOF, 0.25));
  cv.rect(X(-2), Y(1),  cafeW + 4, 1, darken(ROOF, 0.3));

  // Awning stripes
  const stripeW = 6;
  for (let s = 0; s < Math.ceil(cafeW / stripeW); s++) {
    const w = Math.min(stripeW, cafeW - s * stripeW);
    cv.rect(X(s * stripeW), Y(9), w, 5, s % 2 === 0 ? 0x00CED1 : 0xFF8C00);
  }
  cv.rect(X(0), Y(13), cafeW, 1, 0x000000, 28);

  // Windows (with simple frame)
  for (const wx of [4, 22]) {
    cv.rect(X(wx - 1), Y(8), 14, 12, darken(WALL, 0.35));
    cv.rect(X(wx), Y(9), 12, 10, 0x88CCFF, 178);
  }

  // Door
  cv.rect(X(cafeW - 16), Y(11), 10, cafeH - 11, 0x7A4010);
  cv.rect(X(cafeW - 16), Y(11), 10, 1, lighten(0x7A4010, 0.25));

  // Sign
  cv.rect(X(35), Y(4), 18, 7, 0x4A2C0A);
  cv.rect(X(37), Y(5), 14, 5, 0xFFEE88);

  // Outdoor table
  cv.rect(X(cafeW + 4), Y(13), 14, 2, 0x888888);
  cv.rect(X(cafeW + 4), Y(13), 14, 1, lighten(0x888888, 0.25));
  cv.rect(X(cafeW + 9), Y(15), 4, 8, 0x888888);

  return cv;
}

// ── Lifeguard hut (40x42, origin 1/40, 9/42) ────────────────────────────
// Mirrors WaterArea.drawLifeguardHut: hutY = wy + 5, hut body at (hx, hutY).
// Anchor (hx, wy) -> texture (1, 9).
function drawHut() {
  const W = 40, H = 42;
  const cv = new Canvas(W, H);
  const hutW = 26, hutH = 20;
  const X = (dx) => dx + 1;
  const Y = (dy) => dy + 14;

  const STILT = 0x8B6914;
  const BODY  = 0xF0F0F0;
  const DOOR  = 0xBB5500;
  const POLE  = 0x888888;

  // Stilts
  cv.rect(X(3), Y(hutH), 4, 8, STILT);
  cv.rect(X(hutW - 7), Y(hutH), 4, 8, STILT);
  cv.rect(X(3), Y(hutH + 7), 4, 1, darken(STILT, 0.3));
  cv.rect(X(hutW - 7), Y(hutH + 7), 4, 1, darken(STILT, 0.3));

  // Body
  cv.rect(X(0), Y(0), hutW, hutH, BODY);
  cv.rect(X(0), Y(hutH - 1), hutW, 1, darken(BODY, 0.12));

  // Roof stripes + roofline cap
  for (let i = 0; i < 4; i++) {
    cv.rect(X(-1 + i * 7), Y(-4), 7, 6, i % 2 === 0 ? 0xDD2222 : 0xFFFFFF);
  }
  cv.rect(X(-1), Y(-4), hutW + 2, 1, 0xDD2222);

  // Window (with frame)
  cv.rect(X(2), Y(2), 11, 10, darken(BODY, 0.35));
  cv.rect(X(3), Y(3), 9, 8, 0x88CCFF, 178);

  // Door
  cv.rect(X(hutW - 12), Y(8), 8, hutH - 8, DOOR);
  cv.rect(X(hutW - 12), Y(8), 8, 1, lighten(DOOR, 0.25));

  // Flag + pole
  cv.rect(X(hutW + 1), Y(-14), 2, hutH + 14, POLE);
  cv.rect(X(hutW + 1), Y(-10), 12, 8, 0xFF2222);
  cv.rect(X(hutW + 4), Y(-8), 5, 4, 0xFFFFFF);

  return cv;
}

fs.writeFileSync(path.join(OUT_DIR, 'pier.png'), drawPier().toBuffer());
fs.writeFileSync(path.join(OUT_DIR, 'cafe.png'), drawCafe().toBuffer());
fs.writeFileSync(path.join(OUT_DIR, 'lifeguard-hut.png'), drawHut().toBuffer());

console.log('wrote pier.png            26x35  origin (0.5, -1.057)');
console.log('wrote cafe.png            80x31  origin (0.025, 0.0968)');
console.log('wrote lifeguard-hut.png   40x42  origin (0.025, 0.214)');
