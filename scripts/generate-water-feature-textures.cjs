// Generates additional pixel-art textures (assets/water-structures/*.png) for
// WaterArea.ts's lighthouse, dock and buoys — replacing the baked-cone
// lighthouse tower, the flat Graphics-fillRect dock deck/posts/bollards, and
// the Graphics-drawn buoy bodies with proper detailed sprites in the same
// hand-pixelled style as generate-water-structure-textures.cjs.
//
// Run: node scripts/generate-water-feature-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas, lighten, darken } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'water-structures');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Lighthouse tower (24x74) ────────────────────────────────────────────────
// Replaces the baked tapered-cone (bakeLighthouseTower). Anchor (lx, topY) ->
// texture (12, 25): tex-y 25 is the tower-body top (where the gallery sits),
// tex-y 69 is the tower-body base (matches old LH_TOWER_H=44 below topY), and
// tex-y 69-74 is the foundation slab (matches the old base-platform rect).
// origin = (12/24, 25/74) = (0.5, 0.33784).
function drawLighthouse() {
  const W = 24, H = 74;
  const cv = new Canvas(W, H);
  const cx = 12;

  const BODY    = 0xEEEEEE;
  const BAND    = 0xCC3333;
  const ROOF    = 0xAA2222;
  const DARK    = 0x333333;
  const GLASS   = 0xFFEE99;
  const GALLERY = 0x444444;
  const STONE   = 0x999999;

  const TOWER_TOP = 25, TOWER_H = 44, TOP_W = 12, BASE_W = 16;
  const halfWAt = (row) => (TOP_W + (BASE_W - TOP_W) * row / (TOWER_H - 1)) / 2;

  // Tower body — tapered cylinder with left highlight / right shadow columns
  for (let row = 0; row < TOWER_H; row++) {
    const y = TOWER_TOP + row;
    const halfW = halfWAt(row);
    const x0 = Math.round(cx - halfW), x1 = Math.round(cx + halfW);
    for (let x = x0; x < x1; x++) {
      let col = BODY;
      if (x === x0) col = lighten(BODY, 0.15);
      else if (x === x1 - 1) col = darken(BODY, 0.12);
      cv.set(x, y, col);
    }
  }

  // Red bands, following the same taper
  for (const bandStart of [10, 30]) {
    for (let row = bandStart; row < bandStart + 6; row++) {
      const y = TOWER_TOP + row;
      const halfW = halfWAt(row);
      const x0 = Math.round(cx - halfW), x1 = Math.round(cx + halfW);
      for (let x = x0; x < x1; x++) {
        let col = BAND;
        if (x === x0) col = lighten(BAND, 0.15);
        else if (x === x1 - 1) col = darken(BAND, 0.15);
        cv.set(x, y, col);
      }
    }
  }

  // Windows running up the front face
  for (const wRow of [5, 22, 39]) {
    cv.rect(cx - 1, TOWER_TOP + wRow, 2, 2, DARK);
  }

  // Gallery / balcony — walkway ring wider than the tower top
  cv.rect(cx - 10, 22, 20, 3, GALLERY);
  cv.rect(cx - 10, 22, 20, 1, lighten(GALLERY, 0.25));
  cv.rect(cx - 10, 24, 20, 1, darken(GALLERY, 0.3));

  // Lantern room — dark frame with three glass panes
  cv.rect(cx - 8, 10, 16, 12, DARK);
  cv.rect(cx - 8, 10, 16, 1, lighten(DARK, 0.25));
  cv.rect(cx - 6, 11, 12, 10, GLASS, 230);
  cv.rect(cx - 2, 11, 1, 10, DARK);
  cv.rect(cx + 1, 11, 1, 10, DARK);

  // Dome roof — tapers from the lantern width down to a narrow apex
  for (let row = 0; row < 7; row++) {
    const y = 3 + row;
    const halfW = 1 + (8 - 1) * row / 6;
    const x0 = Math.round(cx - halfW), x1 = Math.round(cx + halfW);
    for (let x = x0; x < x1; x++) {
      cv.set(x, y, x < cx ? lighten(ROOF, 0.18) : ROOF);
    }
  }

  // Spike + finial ball
  cv.rect(cx, 2, 1, 1, 0x888888);
  cv.circle(cx, 1, 1, 0xDDDDDD);

  // Foundation slab
  cv.rect(cx - 10, 69, 20, 5, STONE);
  cv.rect(cx - 10, 69, 20, 1, lighten(STONE, 0.2));
  cv.rect(cx - 10, 73, 20, 1, darken(STONE, 0.3));
  for (const x of [cx - 6, cx, cx + 6]) cv.rect(x, 70, 1, 3, darken(STONE, 0.25), 140);

  return cv;
}

// ── Dock deck plank tile (16x48, tileable horizontally) ─────────────────────
// Mirrors WaterArea.drawDock's deck rect (height = BEACH_SHORE_H = 48).
// Tiled via TileSprite across the dock width; replaces the flat fillRect +
// plank-line overlay with a textured wood-plank pattern.
function drawDockPlankTile() {
  const W = 16, H = 48;
  const cv = new Canvas(W, H);
  const WOOD = 0xA0784A;

  cv.rect(0, 0, W, H, WOOD);

  // 6 horizontal plank boards, each 8px tall
  for (let b = 0; b < 6; b++) {
    const y0 = b * 8;
    cv.rect(0, y0, W, 1, lighten(WOOD, 0.16));
    // wood-grain speckles
    for (let y = y0; y < y0 + 8; y++) {
      for (let x = 0; x < W; x++) {
        if ((x * 7 + y * 5) % 11 === 0) cv.set(x, y, darken(WOOD, 0.14), 140);
        if ((x * 3 + y * 9) % 17 === 0) cv.set(x, y, lighten(WOOD, 0.12), 110);
      }
    }
    cv.rect(0, y0 + 7, W, 1, darken(WOOD, 0.32), 160);
  }

  // Board seam at the left edge of the tile
  cv.rect(0, 0, 1, H, darken(WOOD, 0.28), 130);

  // A couple of knots for character
  cv.rect(4, 10, 2, 2, darken(WOOD, 0.4), 200);
  cv.rect(10, 34, 2, 2, darken(WOOD, 0.35), 200);

  return cv;
}

// ── Dock post / piling (4x24) ────────────────────────────────────────────────
// Visible wood (rows 0-13) above the waterline, darker submerged wood (rows
// 14-23, lower alpha) below. origin = (0.5, 0): anchor at the deck underside.
function drawDockPost() {
  const W = 4, H = 24;
  const cv = new Canvas(W, H);
  const WOOD = 0x5A3810;
  const WET  = 0x2A1806;

  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < W; x++) {
      let col = WOOD;
      if (x === 0) col = lighten(WOOD, 0.25);
      else if (x === W - 1) col = darken(WOOD, 0.3);
      cv.set(x, y, col);
    }
    if (y % 4 === 3) cv.rect(0, y, W, 1, darken(WOOD, 0.2), 120);
  }
  for (let y = 14; y < H; y++) cv.rect(0, y, W, 1, WET, 110);

  return cv;
}

// ── Dock bollard (8x8) ────────────────────────────────────────────────────────
// Mooring post sitting on the deck. origin = (0.5, 1): anchor at the deck top.
function drawDockBollard() {
  const W = 8, H = 8;
  const cv = new Canvas(W, H);
  const METAL = 0x666666;

  // Post
  cv.rect(2, 2, 4, 6, METAL);
  cv.rect(2, 2, 1, 6, lighten(METAL, 0.25));
  cv.rect(5, 2, 1, 6, darken(METAL, 0.25));
  cv.rect(2, 7, 4, 1, darken(METAL, 0.3));
  // Domed cap
  cv.ellipse(4, 2, 3, 2, lighten(METAL, 0.12));
  cv.rect(1, 1, 6, 1, lighten(METAL, 0.3));

  return cv;
}

// ── Buoy (12x20) ──────────────────────────────────────────────────────────────
// Conical channel marker — topmark/lantern, mast, body, white collar, lower
// hull and a softly-submerged tip. origin = (0.5, 0.45): tex-y 0 (lantern)
// lands at world (by - 9), matching the old night-glow position.
function drawBuoy(bodyColor) {
  const W = 12, H = 20;
  const cv = new Canvas(W, H);
  const cx = 6;

  // Lantern / topmark
  cv.circle(cx, 1, 1, 0xFFEEAA);
  // Mast
  for (let y = 2; y < 6; y++) cv.set(cx, y, 0x999999);

  // Conical body, tapering outward
  for (let row = 0; row < 6; row++) {
    const y = 6 + row;
    const halfW = 2 + (5 - 2) * row / 5;
    const x0 = Math.round(cx - halfW), x1 = Math.round(cx + halfW);
    for (let x = x0; x < x1; x++) {
      let col = bodyColor;
      if (x === x0) col = lighten(bodyColor, 0.2);
      else if (x === x1 - 1) col = darken(bodyColor, 0.2);
      cv.set(x, y, col);
    }
  }

  // White collar band with rivets
  cv.rect(cx - 5, 12, 10, 2, 0xF0F0F0);
  cv.set(cx - 3, 12, darken(0xF0F0F0, 0.3));
  cv.set(cx + 2, 13, darken(0xF0F0F0, 0.3));

  // Lower hull
  const hullColor = darken(bodyColor, 0.35);
  for (let row = 0; row < 3; row++) {
    const y = 14 + row;
    const halfW = 4 - row * 0.5;
    const x0 = Math.round(cx - halfW), x1 = Math.round(cx + halfW);
    cv.rect(x0, y, x1 - x0, 1, hullColor);
  }

  // Softly-submerged tip
  for (let row = 0; row < 3; row++) {
    const y = 17 + row;
    const halfW = 3 - row;
    if (halfW <= 0) continue;
    const x0 = Math.round(cx - halfW), x1 = Math.round(cx + halfW);
    cv.rect(x0, y, x1 - x0, 1, darken(bodyColor, 0.5), 120 - row * 30);
  }

  return cv;
}

fs.writeFileSync(path.join(OUT_DIR, 'lighthouse.png'),   drawLighthouse().toBuffer());
fs.writeFileSync(path.join(OUT_DIR, 'dock-plank.png'),   drawDockPlankTile().toBuffer());
fs.writeFileSync(path.join(OUT_DIR, 'dock-post.png'),    drawDockPost().toBuffer());
fs.writeFileSync(path.join(OUT_DIR, 'dock-bollard.png'), drawDockBollard().toBuffer());
fs.writeFileSync(path.join(OUT_DIR, 'buoy-red.png'),     drawBuoy(0xFF3333).toBuffer());
fs.writeFileSync(path.join(OUT_DIR, 'buoy-orange.png'),  drawBuoy(0xFF7700).toBuffer());

console.log('wrote lighthouse.png      24x74  origin (0.5, 0.33784)');
console.log('wrote dock-plank.png      16x48  tiled via TileSprite');
console.log('wrote dock-post.png        4x24  origin (0.5, 0)');
console.log('wrote dock-bollard.png    10x8   origin (0.5, 1)');
console.log('wrote buoy-red.png        12x20  origin (0.5, 0.45)');
console.log('wrote buoy-orange.png     12x20  origin (0.5, 0.45)');
